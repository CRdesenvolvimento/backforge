import { FastifyReply, FastifyRequest } from 'fastify';
import { logger, serializeError } from './logger.js';
import { recordCacheOperation } from './metrics.js';
import { safeRedis } from './redis.js';

type CacheKeyResolver = (request: FastifyRequest) => string | null;

interface RouteCacheOptions {
  namespace: string;
  ttlSeconds?: number;
  key: CacheKeyResolver;
}

function getAuthenticatedUserId(request: FastifyRequest) {
  return request.userId ?? (request.user as { sub?: string } | undefined)?.sub ?? null;
}

function isJsonResponse(reply: FastifyReply) {
  const contentType = reply.getHeader('content-type');
  return typeof contentType !== 'string' || contentType.includes('application/json');
}

export function buildUserScopedCacheKey(request: FastifyRequest, namespace: string) {
  const userId = getAuthenticatedUserId(request);

  if (!userId) {
    return null;
  }

  return `${getUserScopedCachePrefix(userId, namespace)}${request.url}`;
}

export function buildProjectScopedCacheKey(request: FastifyRequest, namespace: string, projectId?: string | null) {
  const scopedProjectId = projectId ?? request.projectId ?? request.project?.id ?? null;

  if (!scopedProjectId) {
    return null;
  }

  return `${getProjectScopedCachePrefix(scopedProjectId, namespace)}${request.url}`;
}

export function buildPublicCacheKey(namespace: string, resource = 'default') {
  return `cache:${namespace}:public:${resource}`;
}

export function getUserScopedCachePrefix(userId: string, namespace: string) {
  return `cache:${namespace}:user:${userId}:`;
}

export function getProjectScopedCachePrefix(projectId: string, namespace: string) {
  return `cache:${namespace}:project:${projectId}:`;
}

export async function getJsonCache<T>(key: string, namespace: string): Promise<T | null> {
  try {
    const cached = await safeRedis.get(key);

    if (!cached) {
      recordCacheOperation(namespace, 'miss');
      return null;
    }

    recordCacheOperation(namespace, 'hit');
    return JSON.parse(cached) as T;
  } catch (error) {
    recordCacheOperation(namespace, 'error');
    logger.warn('Cache read failed', {
      namespace,
      key,
      error: serializeError(error),
    });
    return null;
  }
}

export async function setJsonCache(key: string, namespace: string, payload: unknown, ttlSeconds = 60) {
  try {
    await safeRedis.set(key, JSON.stringify(payload), 'EX', ttlSeconds);
    recordCacheOperation(namespace, 'store');
  } catch (error) {
    recordCacheOperation(namespace, 'error');
    logger.warn('Cache write failed', {
      namespace,
      key,
      error: serializeError(error),
    });
  }
}

export async function invalidateCachePrefix(prefix: string, namespace: string) {
  try {
    const keys = await safeRedis.keys(`${prefix}*`);

    if (!keys.length) {
      return 0;
    }

    await safeRedis.del(...keys);
    recordCacheOperation(namespace, 'invalidate');
    return keys.length;
  } catch (error) {
    recordCacheOperation(namespace, 'error');
    logger.warn('Cache invalidation failed', {
      namespace,
      prefix,
      error: serializeError(error),
    });
    return 0;
  }
}

export function createRouteCacheHooks(options: RouteCacheOptions) {
  const ttlSeconds = options.ttlSeconds ?? 60;

  return {
    preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
      if (request.method !== 'GET') {
        return;
      }

      const cacheKey = options.key(request);

      if (!cacheKey) {
        return;
      }

      request.cacheKey = cacheKey;
      const cached = await getJsonCache<unknown>(cacheKey, options.namespace);

      if (!cached) {
        reply.header('x-cache', 'MISS');
        return;
      }

      reply.header('x-cache', 'HIT');
      return reply.send(cached);
    },
    onSend: async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
      if (!request.cacheKey || request.method !== 'GET' || reply.statusCode >= 400 || !isJsonResponse(reply)) {
        return payload;
      }

      if (reply.getHeader('x-cache') === 'HIT') {
        return payload;
      }

      try {
        let body: unknown = payload;

        if (Buffer.isBuffer(payload)) {
          body = JSON.parse(payload.toString('utf8'));
        } else if (typeof payload === 'string') {
          body = JSON.parse(payload);
        }

        await setJsonCache(request.cacheKey, options.namespace, body, ttlSeconds);
      } catch (error) {
        recordCacheOperation(options.namespace, 'error');
        logger.warn('Route cache serialization failed', {
          namespace: options.namespace,
          key: request.cacheKey,
          error: serializeError(error),
        });
      }
      return payload;
    },
  };
}
