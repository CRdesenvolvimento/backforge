import { platformEvents } from '../../events/catalog.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { emitEvent } from '../../events/eventBus.js';
import { projectService } from '../projects/project.service.js';
import { prisma } from '../../shared/prisma.js';
import { growthEventNames, trackGrowthEvent } from '../../shared/growth.js';
import { LoginInput, RegisterInput } from './auth.schema.js';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'refresh-secret';

export class AuthService {
  async register(data: RegisterInput) {
    const hashedPassword = await bcrypt.hash(data.password, 12);

    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        name: data.name,
      },
      select: { id: true, email: true, name: true }
    });

    const starterWorkspace = await projectService.createStarterWorkspace(user.id);
    const tokens = await this.generateTokens(user.id);

    await emitEvent(platformEvents.userCreated, {
      userId: user.id,
      email: user.email,
      name: user.name ?? '',
    });

    await trackGrowthEvent({
      name: growthEventNames.signup,
      userId: user.id,
      metadata: {
        email: user.email,
      },
    });

    return {
      user,
      ...tokens,
      project: starterWorkspace.project,
      apiKey: starterWorkspace.apiKey.key,
      onboarding: {
        project: starterWorkspace.project,
        apiKey: starterWorkspace.apiKey.key,
        apiKeyMasked: starterWorkspace.apiKey.maskedKey,
        endpointPath: '/public/data',
        apiKeyHeader: 'x-api-key',
      },
    };
  }

  async login(data: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
      },
    });

    if (!user || !(await bcrypt.compare(data.password, user.password))) {
      throw new Error('Invalid credentials');
    }

    const { password: _password, ...safeUser } = user;
    const tokens = await this.generateTokens(user.id);
    const quickstartWorkspace = await projectService.getOrCreateQuickstartWorkspace(user.id);

    return {
      user: safeUser,
      ...tokens,
      project: quickstartWorkspace.project,
      apiKey: quickstartWorkspace.apiKey.key,
      onboarding: {
        project: quickstartWorkspace.project,
        apiKey: quickstartWorkspace.apiKey.key,
        apiKeyMasked: quickstartWorkspace.apiKey.maskedKey,
        endpointPath: '/public/data',
        apiKeyHeader: 'x-api-key',
      },
    };
  }

  async generateTokens(userId: string) {
    const accessToken = jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = uuidv4();
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.session.create({
      data: {
        token: refreshToken,
        userId,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  async refresh(token: string) {
    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!session || session.isRevoked || session.expiresAt < new Date()) {
      // If token is reused or invalid, revoke all user sessions for safety
      if (session?.replacedBy) {
        await prisma.session.updateMany({
          where: { userId: session.userId },
          data: { isRevoked: true },
        });
      }
      throw new Error('Invalid refresh token');
    }

    // Mark current token as used and rotate
    const newTokens = await this.generateTokens(session.userId);
    
    await prisma.session.update({
      where: { id: session.id },
      data: { 
        isRevoked: true,
        replacedBy: newTokens.refreshToken
      },
    });

    return newTokens;
  }

  async logout(token: string, userId: string) {
    await prisma.session.updateMany({
      where: { userId, token },
      data: { isRevoked: true },
    });
    
    // Blacklist the access token if needed (optional, depends on security level)
    // await redis.set(`blacklist:${userId}`, 'true', 'EX', 900);
  }

  async getMe(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, memberships: { include: { project: true } } }
    });
  }
}
