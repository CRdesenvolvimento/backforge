import crypto from 'node:crypto';
import { prisma } from './prisma.js';
import { safeRedis } from './redis.js';

interface ApiKeyPreviewSource {
  key?: string | null;
  keyPreview?: string | null;
}

interface LegacyApiKeyBackfillRow {
  id: string;
  key: string | null;
  keyHash: string | null;
  keyPreview: string | null;
}

export function hashApiKey(apiKey: string) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

export function maskApiKey(apiKey: string) {
  if (apiKey.length <= 12) {
    return apiKey;
  }

  return `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`;
}

export function getApiKeyPreview(source: ApiKeyPreviewSource) {
  if (source.keyPreview) {
    return source.keyPreview;
  }

  if (source.key) {
    return maskApiKey(source.key);
  }

  return 'Unavailable';
}

async function hydrateLegacyApiKey(record: LegacyApiKeyBackfillRow) {
  if (!record.key) {
    return;
  }

  const keyHash = record.keyHash ?? hashApiKey(record.key);
  const keyPreview = record.keyPreview ?? maskApiKey(record.key);

  await prisma.apiKey.update({
    where: { id: record.id },
    data: {
      key: null,
      keyHash,
      keyPreview,
    },
  }).catch(() => undefined);
}

export async function backfillLegacyApiKeys() {
  const legacyApiKeys = await prisma.apiKey.findMany({
    where: {
      key: {
        not: null,
      },
    },
    select: {
      id: true,
      key: true,
      keyHash: true,
      keyPreview: true,
    },
  });

  await Promise.all(
    legacyApiKeys
      .filter((apiKeyRecord) => Boolean(apiKeyRecord.key))
      .map((apiKeyRecord) => hydrateLegacyApiKey(apiKeyRecord))
  );

  return legacyApiKeys.length;
}

export async function resolveProjectIdFromApiKey(apiKey: string) {
  const keyHash = hashApiKey(apiKey);
  const cacheKey = `apikey:${keyHash}`;
  const cachedProjectId = await safeRedis.get(cacheKey);

  if (cachedProjectId) {
    return cachedProjectId;
  }

  const apiKeyRecord = await prisma.apiKey.findUnique({
    where: { keyHash },
    select: {
      projectId: true,
    },
  });

  if (apiKeyRecord) {
    await safeRedis.set(cacheKey, apiKeyRecord.projectId, 'EX', 3600);
    return apiKeyRecord.projectId;
  }
  return null;
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
