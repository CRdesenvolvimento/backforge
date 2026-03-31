import { prisma } from './prisma.js';
import { hasRedisConfiguration, pingRedis } from './redis.js';

export async function getHealthSnapshot() {
  let databaseHealthy = false;
  let redisHealthy = !hasRedisConfiguration;

  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    databaseHealthy = true;
  } catch {
    databaseHealthy = false;
  }

  if (hasRedisConfiguration) {
    redisHealthy = await pingRedis();
  }

  return {
    status: databaseHealthy ? (redisHealthy ? 'ok' : 'degraded') : 'error',
    ready: databaseHealthy,
    checks: {
      database: databaseHealthy ? 'up' : 'down',
      redis: hasRedisConfiguration ? (redisHealthy ? 'up' : 'down') : 'disabled',
    },
    timestamp: new Date().toISOString(),
  };
}
