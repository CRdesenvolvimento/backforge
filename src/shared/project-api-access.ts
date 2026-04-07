import { Prisma } from '../generated/prisma-client/index.js';
import { FastifyReply, FastifyRequest } from 'fastify';
import { hashApiKey, resolveProjectAccessFromApiKey } from './api-key.js';
import { growthEventNames, trackGrowthEvent } from './growth.js';
import { logger, serializeError } from './logger.js';
import { prisma } from './prisma.js';
import { safeRedis } from './redis.js';
import { parsePayloadForLogging, sanitizeForLogging, sanitizeHeadersForLogging } from './sanitize.js';
import { enforceProjectQuota } from './quota.js';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

const memoryRateLimits = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 60_000;

function toNullableJsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }

  return value as Prisma.InputJsonValue;
}

function getRateLimitWindow(windowMs: number) {
  const now = Date.now();
  const bucketStart = Math.floor(now / windowMs) * windowMs;

  return {
    now,
    bucketStart,
    resetAt: bucketStart + windowMs,
  };
}

function pruneExpiredMemoryRateLimits(now: number) {
  if (memoryRateLimits.size < 500) {
    return;
  }

  for (const [key, entry] of memoryRateLimits.entries()) {
    if (entry.resetAt <= now) {
      memoryRateLimits.delete(key);
    }
  }
}

async function takeTenantRateLimitSlot(projectId: string, limit: number, windowMs = RATE_LIMIT_WINDOW_MS): Promise<RateLimitResult> {
  const { now, bucketStart, resetAt } = getRateLimitWindow(windowMs);
  const windowSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
  const redisBucketKey = `ratelimit:${projectId}:${bucketStart}`;
  const redisCount = await safeRedis.incr(redisBucketKey);

  if (redisCount !== null) {
    if (redisCount === 1) {
      await safeRedis.expire(redisBucketKey, windowSeconds);
    }

    return {
      allowed: redisCount <= limit,
      limit,
      remaining: Math.max(0, limit - redisCount),
      resetAt,
    };
  }

  pruneExpiredMemoryRateLimits(now);

  const memoryBucketKey = `${projectId}:${bucketStart}`;
  const existingEntry = memoryRateLimits.get(memoryBucketKey);
  const nextCount = existingEntry && existingEntry.resetAt > now ? existingEntry.count + 1 : 1;

  memoryRateLimits.set(memoryBucketKey, {
    count: nextCount,
    resetAt,
  });

  return {
    allowed: nextCount <= limit,
    limit,
    remaining: Math.max(0, limit - nextCount),
    resetAt,
  };
}

export async function requireProjectApiKey(request: FastifyRequest, reply: FastifyReply) {
  const apiKeyHeader = request.headers['x-api-key'];
  const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;

  if (!apiKey) {
    return reply.status(401).send({ error: 'API key required' });
  }

  const project = await resolveProjectAccessFromApiKey(apiKey);

  if (!project) {
    return reply.status(401).send({ error: 'Invalid API key' });
  }

  request.apiKey = apiKey;
  request.projectId = project.id;
  request.project = project;
}

export async function optionallyAuthenticateProjectUser(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    return;
  }

  try {
    await request.jwtVerify();
    request.userId = (request.user as { sub: string }).sub;
  } catch {
    return reply.status(401).send({ error: 'Invalid authorization token' });
  }
}

export async function enforceProjectRateLimit(request: FastifyRequest, reply: FastifyReply) {
  if (!request.projectId) {
    return;
  }

  const limit = request.project?.subscription?.rateLimitPerMinute ?? 100;
  const rateLimitKey = request.apiKey ? hashApiKey(request.apiKey) : request.projectId;
  const rateLimit = await takeTenantRateLimitSlot(rateLimitKey, limit);

  reply.header('x-ratelimit-limit', String(rateLimit.limit));
  reply.header('x-ratelimit-remaining', String(rateLimit.remaining));
  reply.header('x-ratelimit-reset', new Date(rateLimit.resetAt).toISOString());

  if (!rateLimit.allowed) {
    const retryAfterSeconds = Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000));
    reply.header('retry-after', String(retryAfterSeconds));
    return reply.status(429).send({
      error: 'Rate limit exceeded',
      retryAfter: retryAfterSeconds,
    });
  }
}

export { enforceProjectQuota };

export async function captureProjectRequestLogContext(request: FastifyRequest) {
  if (!request.projectId) {
    return;
  }

  request.requestLogContext = {
    headers: sanitizeHeadersForLogging(request.headers as Record<string, unknown>),
    requestBody: sanitizeForLogging(request.body),
  };
}

export async function captureProjectResponsePayload(request: FastifyRequest, _reply: FastifyReply, payload: unknown) {
  if (!request.projectId) {
    return payload;
  }

  request.requestLogContext = {
    ...request.requestLogContext,
    responseBody: parsePayloadForLogging(payload),
  };

  return payload;
}

export async function recordProjectRequest(request: FastifyRequest, reply: FastifyReply) {
  if (!request.projectId) {
    return;
  }

  const path = request.url.split('?')[0];
  const latency = request.requestStartTime
    ? Math.max(0, Math.round(Number(process.hrtime.bigint() - request.requestStartTime) / 1_000_000))
    : 0;

  try {
    await prisma.requestLog.create({
      data: {
        projectId: request.projectId,
        path,
        method: request.method,
        status: reply.statusCode,
        latency,
        requestBody: toNullableJsonValue(request.requestLogContext?.requestBody),
        responseBody: toNullableJsonValue(request.requestLogContext?.responseBody),
        headers: toNullableJsonValue(request.requestLogContext?.headers),
      },
    });

    await trackGrowthEvent({
      name: growthEventNames.apiCalled,
      userId: request.userId ?? null,
      projectId: request.projectId,
      path,
      metadata: {
        method: request.method,
        status: reply.statusCode,
        latency,
      },
    });

    if (reply.statusCode !== 429) {
      await prisma.subscription.updateMany({
        where: { projectId: request.projectId },
        data: {
          requestsUsed: {
            increment: 1,
          },
        },
      });
    }

    if (reply.statusCode < 400) {
      const requestCount = await prisma.requestLog.count({
        where: { projectId: request.projectId },
      });

      if (requestCount === 1) {
        await trackGrowthEvent({
          name: growthEventNames.activationCompleted,
          userId: request.userId ?? null,
          projectId: request.projectId,
          path,
          metadata: {
            method: request.method,
            status: reply.statusCode,
            latency,
          },
        });
      }
    }
  } catch (error) {
    logger.warn('Failed to persist project request telemetry', {
      projectId: request.projectId,
      method: request.method,
      url: request.url,
      error: serializeError(error),
    });
  }
}
