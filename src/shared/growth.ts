import type { Prisma } from '../generated/prisma/index.js';
import { prisma } from './prisma.js';
import { logger, serializeError } from './logger.js';

export const growthEventNames = {
  activationCompleted: 'activation_completed',
  apiCalled: 'api_called',
  apiKeyCreated: 'api_key_created',
  checkoutStarted: 'checkout_started',
  pageView: 'page_view',
  projectCreated: 'project_created',
  signup: 'signup',
  upgradeRequired: 'upgrade_required',
} as const;

export type GrowthEventName = (typeof growthEventNames)[keyof typeof growthEventNames];

interface TrackGrowthEventInput {
  name: GrowthEventName | string;
  sessionId?: string | null;
  path?: string | null;
  userId?: string | null;
  projectId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}

export async function trackGrowthEvent(input: TrackGrowthEventInput) {
  try {
    await prisma.growthEvent.create({
      data: {
        name: input.name,
        sessionId: input.sessionId ?? null,
        path: input.path ?? null,
        userId: input.userId ?? null,
        projectId: input.projectId ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
  } catch (error) {
    logger.warn('Failed to persist growth event', {
      eventName: input.name,
      userId: input.userId ?? null,
      projectId: input.projectId ?? null,
      error: serializeError(error),
    });
  }
}
