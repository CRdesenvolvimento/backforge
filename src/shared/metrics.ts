import cluster from 'node:cluster';
import path from 'node:path';
import client from 'prom-client';

const METRIC_PREFIX = 'backforge_';
const entryPoint = process.argv[1] ?? '';
const processType = process.env.PROCESS_TYPE
  ?? (entryPoint.includes(`${path.sep}queues${path.sep}worker`) ? 'queue-worker' : (cluster.isPrimary ? 'api-primary' : 'api-worker'));
const defaultLabels = {
  service: 'backforge',
  process_type: processType,
};

export const metricsRegistry = new client.Registry();

metricsRegistry.setDefaultLabels(defaultLabels);
client.collectDefaultMetrics({
  prefix: METRIC_PREFIX,
  register: metricsRegistry,
});

export const httpRequestsTotal = new client.Counter({
  name: `${METRIC_PREFIX}http_requests_total`,
  help: 'Total HTTP requests handled by BACKFORGE.',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [metricsRegistry],
});

export const httpRequestDurationSeconds = new client.Histogram({
  name: `${METRIC_PREFIX}http_request_duration_seconds`,
  help: 'HTTP request duration in seconds.',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});

export const cacheOperationsTotal = new client.Counter({
  name: `${METRIC_PREFIX}cache_operations_total`,
  help: 'Cache operations grouped by namespace and result.',
  labelNames: ['namespace', 'result'] as const,
  registers: [metricsRegistry],
});

export const queueJobsTotal = new client.Counter({
  name: `${METRIC_PREFIX}queue_jobs_total`,
  help: 'BullMQ jobs grouped by name and status.',
  labelNames: ['job_name', 'status'] as const,
  registers: [metricsRegistry],
});

export const redisConnectivityState = new client.Gauge({
  name: `${METRIC_PREFIX}redis_connectivity_state`,
  help: 'Whether the shared Redis connection is healthy.',
  registers: [metricsRegistry],
});

export function registerWorkerMetricsRegistry() {
  if (cluster.isWorker) {
    client.AggregatorRegistry.setRegistries(metricsRegistry);
  }
}

export function observeHttpRequest(method: string, route: string, statusCode: number, durationSeconds: number) {
  const labels = {
    method: method.toUpperCase(),
    route,
    status_code: String(statusCode),
  };

  httpRequestsTotal.inc(labels);
  httpRequestDurationSeconds.observe(labels, durationSeconds);
}

export function recordCacheOperation(namespace: string, result: 'hit' | 'miss' | 'store' | 'invalidate' | 'error') {
  cacheOperationsTotal.inc({ namespace, result });
}

export function recordQueueJob(jobName: string, status: 'enqueued' | 'completed' | 'failed' | 'skipped') {
  queueJobsTotal.inc({ job_name: jobName, status });
}

export function setRedisConnectivity(isConnected: boolean) {
  redisConnectivityState.set(isConnected ? 1 : 0);
}

export function getMetricsContentType() {
  return metricsRegistry.contentType;
}

export async function getMetricsSnapshot() {
  return metricsRegistry.metrics();
}

export async function getClusterMetricsSnapshot() {
  const aggregator = new client.AggregatorRegistry();
  return aggregator.clusterMetrics();
}
