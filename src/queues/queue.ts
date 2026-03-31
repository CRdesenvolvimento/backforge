import { JobsOptions, Queue } from 'bullmq';
import { logger, serializeError } from '../shared/logger.js';
import { recordQueueJob } from '../shared/metrics.js';
import { createBullMqConnection, hasRedisConfiguration } from '../shared/redis.js';

const queueName = process.env.QUEUE_NAME ?? 'jobs';
const queueConnection = hasRedisConfiguration ? createBullMqConnection('queue') : null;

export const queue = queueConnection
  ? new Queue(queueName, {
      connection: queueConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5_000,
        },
        removeOnComplete: {
          count: 500,
        },
        removeOnFail: {
          count: 500,
        },
      },
    })
  : null;

export async function enqueueBackgroundJob(name: string, data: Record<string, unknown>, options?: JobsOptions) {
  if (!queue) {
    recordQueueJob(name, 'skipped');
    logger.warn('Queue unavailable, background job skipped', { jobName: name });
    return null;
  }

  try {
    const job = await queue.add(name, data, options);
    recordQueueJob(name, 'enqueued');
    return job;
  } catch (error) {
    recordQueueJob(name, 'skipped');
    logger.warn('Failed to enqueue background job', {
      jobName: name,
      error: serializeError(error),
    });
    return null;
  }
}
