import Redis, { type RedisOptions } from 'ioredis';
import { logger, serializeError } from './logger.js';
import { setRedisConnectivity } from './metrics.js';

const redisUrl = process.env.REDIS_URL;
const RedisClient = (Redis as unknown as typeof Redis & { default?: typeof Redis }).default ?? Redis;

export const hasRedisConfiguration = Boolean(redisUrl);

function createBaseOptions(overrides: RedisOptions = {}): RedisOptions {
  return {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy(times: number) {
      if (times > 3) {
        return null;
      }

      return Math.min(times * 200, 1000);
    },
    reconnectOnError(err: Error) {
      return err.message.includes('READONLY');
    },
    ...overrides,
  };
}

export function createRedisClient(overrides: RedisOptions = {}) {
  if (!redisUrl) {
    return null;
  }

  return new RedisClient(redisUrl, createBaseOptions(overrides));
}

export function createBullMqConnection(role: 'queue' | 'worker') {
  return createRedisClient({
    lazyConnect: role === 'queue',
    enableOfflineQueue: role !== 'queue',
    maxRetriesPerRequest: role === 'worker' ? null : 1,
    connectionName: `backforge:${role}:${process.pid}`,
  });
}

export const redis = createRedisClient();

let isConnected = false;
let connectPromise: Promise<boolean> | null = null;
let lastConnectionError = '';

if (!redisUrl) {
  logger.warn('REDIS_URL not configured. Cache, distributed rate limiting, and queues will degrade gracefully.');
  setRedisConnectivity(false);
}

if (redis) {
  redis.on('error', (error: Error) => {
    isConnected = false;
    setRedisConnectivity(false);
    const message = error.message || 'unknown connection error';

    if (message !== lastConnectionError) {
      logger.warn('Redis unavailable', { message });
      lastConnectionError = message;
    }
  });

  redis.on('connect', () => {
    isConnected = true;
    lastConnectionError = '';
    setRedisConnectivity(true);
    logger.info('Redis connected successfully');
  });

  redis.on('close', () => {
    isConnected = false;
    setRedisConnectivity(false);
  });
}

export async function ensureRedisConnection() {
  if (!redis) {
    return false;
  }

  if (isConnected) {
    return true;
  }

  if (!connectPromise) {
    connectPromise = redis
      .connect()
      .then(() => {
        isConnected = true;
        setRedisConnectivity(true);
        return true;
      })
      .catch((error: Error) => {
        isConnected = false;
        setRedisConnectivity(false);
        const message = error.message || 'unknown connection error';

        if (message !== lastConnectionError) {
          logger.warn('Redis unavailable', { message });
          lastConnectionError = message;
        }

        return false;
      })
      .finally(() => {
        connectPromise = null;
      });
  }

  return connectPromise;
}

export async function pingRedis() {
  if (!(await ensureRedisConnection()) || !redis) {
    return false;
  }

  try {
    return (await redis.ping()) === 'PONG';
  } catch (error) {
    logger.warn('Redis health check failed', { error: serializeError(error) });
    return false;
  }
}

export const safeRedis = {
  async get(key: string): Promise<string | null> {
    if (!(await ensureRedisConnection()) || !redis) {
      return null;
    }

    try {
      return await redis.get(key);
    } catch (error) {
      logger.warn('safeRedis get failed', { key, error: serializeError(error) });
      return null;
    }
  },
  async set(key: string, value: string, mode?: string, duration?: number): Promise<void> {
    if (!(await ensureRedisConnection()) || !redis) {
      return;
    }

    try {
      if (mode === 'EX' && duration) {
        await redis.set(key, value, 'EX', duration);
      } else {
        await redis.set(key, value);
      }
    } catch (error) {
      logger.warn('safeRedis set failed', { key, error: serializeError(error) });
    }
  },
  async del(...keys: string[]): Promise<void> {
    if (!(await ensureRedisConnection()) || !redis) {
      return;
    }

    try {
      await redis.del(...keys);
    } catch (error) {
      logger.warn('safeRedis del failed', { keys, error: serializeError(error) });
    }
  },
  async keys(pattern: string): Promise<string[]> {
    if (!(await ensureRedisConnection()) || !redis) {
      return [];
    }

    try {
      return await redis.keys(pattern);
    } catch (error) {
      logger.warn('safeRedis keys failed', { pattern, error: serializeError(error) });
      return [];
    }
  },
  async incr(key: string): Promise<number | null> {
    if (!(await ensureRedisConnection()) || !redis) {
      return null;
    }

    try {
      return await redis.incr(key);
    } catch (error) {
      logger.warn('safeRedis incr failed', { key, error: serializeError(error) });
      return null;
    }
  },
  async expire(key: string, seconds: number): Promise<void> {
    if (!(await ensureRedisConnection()) || !redis) {
      return;
    }

    try {
      await redis.expire(key, seconds);
    } catch (error) {
      logger.warn('safeRedis expire failed', { key, seconds, error: serializeError(error) });
    }
  },
};
