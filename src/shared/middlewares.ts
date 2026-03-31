import { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../shared/prisma.js';

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
}

export function roleMiddleware(allowedRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request.user as any).sub;
    const projectId = request.headers['x-project-id'] as string;

    if (!projectId) {
      return reply.status(400).send({ error: 'Project ID header required' });
    }

    const membership = await prisma.membership.findUnique({
      where: {
        userId_projectId: { userId, projectId }
      }
    });

    if (!membership || !allowedRoles.includes(membership.role)) {
      return reply.status(403).send({ error: 'Forbidden: Insufficient permissions' });
    }

    // Inject context
    (request as any).tenant = {
      userId,
      projectId,
      role: membership.role
    };
  };
}
