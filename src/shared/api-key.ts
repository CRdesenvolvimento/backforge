import { prisma } from './prisma.js';
import { safeRedis } from './redis.js';

export async function resolveProjectIdFromApiKey(apiKey: string) {
  const cacheKey = `apikey:${apiKey}`;
  const cachedProjectId = await safeRedis.get(cacheKey);

  if (cachedProjectId) {
    return cachedProjectId;
  }

  const apiKeyRecord = await prisma.apiKey.findUnique({
    where: { key: apiKey },
    select: { projectId: true },
  });

  if (!apiKeyRecord) {
    return null;
  }

  await safeRedis.set(cacheKey, apiKeyRecord.projectId, 'EX', 3600);
  return apiKeyRecord.projectId;
}

export async function resolveProjectAccessFromApiKey(apiKey: string) {
  const projectId = await resolveProjectIdFromApiKey(apiKey);

  if (!projectId) {
    return null;
  }

  return prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      slug: true,
      subscription: {
        select: {
          id: true,
          plan: true,
          status: true,
          requestsLimit: true,
          requestsUsed: true,
          rateLimitPerMinute: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
          stripePriceId: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
        },
      },
    },
  });
}
