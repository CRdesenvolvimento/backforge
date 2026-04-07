import { FastifyReply, FastifyRequest } from 'fastify';
import { Prisma } from '../../generated/prisma-client/index.js';
import { AuthService } from './auth.service.js';
import { loginSchema, refreshSchema, registerSchema } from './auth.schema.js';

const authService = new AuthService();

export class AuthController {
  async register(request: FastifyRequest, reply: FastifyReply) {
    try {
      const data = registerSchema.parse(request.body);
      const session = await authService.register(data);
      return reply.status(201).send(session);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return reply.status(409).send({ error: 'Email already registered' });
      }

      throw error;
    }
  }

  async login(request: FastifyRequest, reply: FastifyReply) {
    try {
      const data = loginSchema.parse(request.body);
      const session = await authService.login(data);
      return reply.send(session);
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid credentials') {
        return reply.status(401).send({ error: error.message });
      }

      throw error;
    }
  }

  async refresh(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { refreshToken } = refreshSchema.parse(request.body);
      const tokens = await authService.refresh(refreshToken);
      return reply.send(tokens);
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid refresh token') {
        return reply.status(401).send({ error: error.message });
      }

      throw error;
    }
  }

  async logout(request: FastifyRequest, reply: FastifyReply) {
    const { refreshToken } = refreshSchema.parse(request.body);
    const userId = (request.user as any).sub;
    await authService.logout(refreshToken, userId);
    return reply.status(204).send();
  }

  async me(request: FastifyRequest, reply: FastifyReply) {
    const userId = (request.user as any).sub;
    const user = await authService.getMe(userId);
    return reply.send(user);
  }
}
