import { FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma } from '../../generated/prisma/index.js';
import { z } from 'zod';
import { growthService } from './growth.service.js';
import { trackGrowthEvent } from '../../shared/growth.js';

const growthEventSchema = z.object({
  name: z.string().trim().min(1).max(80),
  sessionId: z.string().trim().min(1).max(120).optional(),
  path: z.string().trim().max(280).optional(),
  projectId: z.string().trim().max(120).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

async function resolveOptionalUserId(request: FastifyRequest) {
  if (!request.headers.authorization) {
    return null;
  }

  try {
    await request.jwtVerify();
    return (request.user as { sub: string }).sub;
  } catch {
    return null;
  }
}

export const growthController = {
  async captureEvent(request: FastifyRequest, reply: FastifyReply) {
    const data = growthEventSchema.parse(request.body ?? {});
    const userId = await resolveOptionalUserId(request);

    await trackGrowthEvent({
      name: data.name,
      sessionId: data.sessionId ?? null,
      path: data.path ?? null,
      userId,
      projectId: data.projectId ?? null,
      metadata: data.metadata as Prisma.InputJsonValue | undefined,
    });

    return reply.status(202).send({ ok: true });
  },

  async summary() {
    return growthService.getSummary();
  },

  async onboarding(request: FastifyRequest, reply: FastifyReply) {
    const userId = (request.user as { sub: string }).sub;
    const onboarding = await growthService.getOnboarding(userId);

    if (!onboarding) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return reply.send(onboarding);
  },
};
