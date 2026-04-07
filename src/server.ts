import 'dotenv/config';
import cluster from 'node:cluster';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import { buildApp } from './app.js';
import { validateRuntimeEnvironment } from './shared/env.js';
import { logger, serializeError } from './shared/logger.js';
import { getClusterMetricsSnapshot, getMetricsContentType, registerWorkerMetricsRegistry } from './shared/metrics.js';
import { isProductionRuntime } from './shared/runtime.js';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);

const API_PREFIXES = ['/api', '/auth', '/growth', '/graphql', '/health', '/readyz', '/livez', '/metrics', '/billing-api', '/webhooks', '/projects', '/tables', '/rows', '/upload', '/files', '/requests', '/analytics', '/public'];
validateRuntimeEnvironment();

function isClusterEnabled() {
  return isProductionRuntime && process.env.ENABLE_CLUSTER === 'true';
}

function getClusterWorkerCount() {
  const configuredWorkers = Number(process.env.CLUSTER_WORKERS ?? 0);

  if (configuredWorkers > 0) {
    return configuredWorkers;
  }

  return typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
}

async function startMetricsServer() {
  if (process.env.METRICS_ENABLED === 'false') {
    return;
  }

  const metricsPort = Number(process.env.METRICS_PORT ?? 9090);
  const contentType = getMetricsContentType();

  const metricsServer = http.createServer(async (request, response) => {
    if (request.url !== '/metrics') {
      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end('Not found');
      return;
    }

    try {
      const metrics = await getClusterMetricsSnapshot();
      response.writeHead(200, { 'Content-Type': contentType });
      response.end(metrics);
    } catch (error) {
      logger.error('Failed to collect cluster metrics', { error: serializeError(error) });
      response.writeHead(500, { 'Content-Type': 'text/plain' });
      response.end('metrics unavailable');
    }
  });

  metricsServer.listen(metricsPort, '0.0.0.0', () => {
    logger.info('Cluster metrics server running', {
      address: `http://0.0.0.0:${metricsPort}/metrics`,
    });
  });
}

async function startHttpServer() {
  registerWorkerMetricsRegistry();

  const app = await buildApp();
  const port = Number(process.env.PORT ?? 3000);

  if (!isProductionRuntime) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          server: app.server,
        },
      },
      appType: 'spa',
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(currentDir, '..', 'client');
    await app.register(fastifyStatic, {
      root: distPath,
      prefix: '/',
      decorateReply: false,
    });

    app.setNotFoundHandler((request, reply) => {
      const acceptsHtml = request.headers.accept?.includes('text/html');
      const isSpaRoute = request.method === 'GET'
        && acceptsHtml
        && !API_PREFIXES.some((prefix) => request.url.startsWith(prefix));

      if (isSpaRoute) {
        return reply.sendFile('index.html');
      }

      return reply.code(404).send({ error: 'Route not found' });
    });
  }

  app.listen({ port, host: '0.0.0.0' }, (error, address) => {
    if (error) {
      logger.error('Failed to start HTTP server', { error: serializeError(error) });
      process.exit(1);
    }

    logger.info('BACKFORGE API running', {
      address,
      pid: process.pid,
      clusterWorker: cluster.isWorker ? cluster.worker?.id ?? null : null,
    });
  });
}

async function startClusterPrimary() {
  const workerCount = getClusterWorkerCount();

  await startMetricsServer();
  logger.info('Starting cluster primary', { workerCount, pid: process.pid });

  for (let index = 0; index < workerCount; index += 1) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    logger.warn('Cluster worker exited, respawning', {
      workerId: worker.id,
      pid: worker.process.pid,
      code,
      signal,
    });
    cluster.fork();
  });
}

if (isClusterEnabled() && cluster.isPrimary) {
  startClusterPrimary().catch((error) => {
    logger.error('Cluster primary failed', { error: serializeError(error) });
    process.exit(1);
  });
} else {
  startHttpServer().catch((error) => {
    logger.error('Server bootstrap failed', { error: serializeError(error) });
    process.exit(1);
  });
}
