import 'dotenv/config';
import { Worker } from 'bullmq';
import { platformEvents } from '../events/catalog.js';
import { logger, serializeError } from '../shared/logger.js';
import { recordQueueJob, registerWorkerMetricsRegistry } from '../shared/metrics.js';
import { createBullMqConnection, hasRedisConfiguration } from '../shared/redis.js';

process.env.PROCESS_TYPE = process.env.PROCESS_TYPE ?? 'queue-worker';

const queueName = process.env.QUEUE_NAME ?? 'jobs';
const concurrency = Math.max(1, Number(process.env.QUEUE_CONCURRENCY ?? 4));

registerWorkerMetricsRegistry();

async function processJob(name: string, data: Record<string, unknown>) {
  switch (name) {
    case platformEvents.userCreated:
      logger.info('Processing onboarding job', data);
      return;
    case platformEvents.projectCreated:
      logger.info('Processing project bootstrap job', data);
      return;
    case platformEvents.billingWebhookProcessed:
      logger.info('Processing billing webhook follow-up job', data);
      return;
    default:
      logger.info('Processing generic background job', { jobName: name, ...data });
  }
}

async function startWorker() {
  if (!hasRedisConfiguration) {
    logger.warn('Redis is not configured, queue worker will not start.');
    return;
  }

  const connection = createBullMqConnection('worker');

  if (!connection) {
    logger.warn('Queue worker connection could not be created.');
    return;
  }

  const worker = new Worker(
    queueName,
    async (job) => {
      await processJob(job.name, (job.data ?? {}) as Record<string, unknown>);
    },
    {
      connection,
      concurrency,
    }
  );

  worker.on('completed', (job) => {
    recordQueueJob(job.name, 'completed');
    logger.info('Background job completed', {
      jobId: job.id,
      jobName: job.name,
    });
  });

  worker.on('failed', (job, error) => {
    const jobName = job?.name ?? 'unknown';
    recordQueueJob(jobName, 'failed');
    logger.error('Background job failed', {
      jobId: job?.id ?? null,
      jobName,
      error: serializeError(error),
    });
  });

  const shutdown = async () => {
    logger.info('Shutting down queue worker');
    await worker.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  logger.info('Queue worker started', {
    queueName,
    concurrency,
    pid: process.pid,
  });
}

startWorker().catch((error) => {
  logger.error('Queue worker failed to start', { error: serializeError(error) });
  process.exit(1);
});
