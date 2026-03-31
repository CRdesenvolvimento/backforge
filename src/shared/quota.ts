import { FastifyReply, FastifyRequest } from 'fastify';
import { getPlanConfig, normalizePlanKey } from '../config/plans.js';
import { prisma } from './prisma.js';
import { growthEventNames, trackGrowthEvent } from './growth.js';

function getUsageWindow(request: FastifyRequest) {
  const currentPeriodStart = request.project?.subscription?.currentPeriodStart;
  const currentPeriodEnd = request.project?.subscription?.currentPeriodEnd;

  return {
    start: currentPeriodStart ? new Date(currentPeriodStart) : new Date(Date.now() - 24 * 60 * 60 * 1000),
    end: currentPeriodEnd ? new Date(currentPeriodEnd) : undefined,
  };
}

export async function enforceProjectQuota(request: FastifyRequest, reply: FastifyReply) {
  if (!request.projectId) {
    return;
  }

  const plan = getPlanConfig(normalizePlanKey(request.project?.subscription?.plan));
  const limit = request.project?.subscription?.requestsLimit ?? plan.requests;
  const { start, end } = getUsageWindow(request);
  const count = await prisma.requestLog.count({
    where: {
      projectId: request.projectId,
      createdAt: {
        gte: start,
        ...(end ? { lte: end } : {}),
      },
    },
  });

  if (count >= limit) {
    await trackGrowthEvent({
      name: growthEventNames.upgradeRequired,
      userId: request.userId ?? null,
      projectId: request.projectId,
      path: request.url.split('?')[0],
      metadata: {
        currentPlan: normalizePlanKey(request.project?.subscription?.plan),
        requestsLimit: limit,
        requestsUsed: count,
      },
    });

    return reply.status(403).send({
      error: 'Upgrade required',
      code: 'UPGRADE_REQUIRED',
      message: "You've reached your limit. Upgrade to PRO to continue.",
      currentPlan: normalizePlanKey(request.project?.subscription?.plan),
      requestsLimit: limit,
      requestsUsed: count,
    });
  }
}
