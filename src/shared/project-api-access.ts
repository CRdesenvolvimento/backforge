import { FastifyReply, FastifyRequest } from 'fastify';
import { resolveProjectAccessFromApiKey } from './api-key.js';
import { growthEventNames, trackGrowthEvent } from './growth.js';
import { logger, serializeError } from './logger.js';
import { prisma } from './prisma.js';
import { safeRedis } from './redis.js';
import { enforceProjectQuota } from './quota.js';

const memoryRateLimits = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;

async function takeTenantRateLimitSlot(projectId: string, limit: number, windowMs = RATE_LIMIT_WINDOW_MS) {
  const windowSeconds = Math.ceil(windowMs / 1000);
  const redisBucketKey = `ratelimit:${projectId}:${Math.floor(Date.now() / windowMs)}`;
  const redisCount = await safeRedis.incr(redisBucketKey);

  if (redisCount !== null) {
    if (redisCount === 1) {
      await safeRedis.expire(redisBucketKey, windowSeconds);
    }

    return redisCount <= limit;
  }

  const now = Date.now();
  const timestamps = (memoryRateLimits.get(projectId) ?? []).filter((timestamp) => now - timestamp < windowMs);
  timestamps.push(now);
  memoryRateLimits.set(projectId, timestamps);

  return timestamps.length <= limit;
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
  const allowed = await takeTenantRateLimitSlot(request.projectId, limit);

  if (!allowed) {
    return reply.status(429).send({ error: 'Rate limit exceeded' });
  }
}

export { enforceProjectQuota };

export async function recordProjectRequest(request: FastifyRequest, reply: FastifyReply) {
  if (!request.projectId) {
    return;
  }

  const path = request.url.split('?')[0];

  try {
    await prisma.requestLog.create({
      data: {
        projectId: request.projectId,
        path,
        method: request.method,
        status: reply.statusCode,
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
