import fastify from 'fastify';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Prisma } from './generated/prisma-client/index.js';
import jwt from '@fastify/jwt';
import cors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyExpress from '@fastify/express';
import helmet from 'helmet';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { analyticsRoutes } from './modules/analytics/analytics.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { billingRoutes } from './modules/billing/billing.routes.js';
import { createStripeWebhookRouter } from './modules/billing/stripe-webhook.router.js';
import { databaseRoutes } from './modules/database/database.routes.js';
import { databaseService } from './modules/database/database.service.js';
import { growthRoutes } from './modules/growth/growth.routes.js';
import { projectRoutes } from './modules/projects/project.routes.js';
import { requestRoutes } from './modules/requests/request.routes.js';
import { storageRoutes } from './modules/storage/storage.routes.js';
import { apiEngineRoutes } from './modules/api-engine/api-engine.routes.js';
import { publicRoutes } from './modules/public/public.routes.js';
import { setupGraphQL } from './modules/api-engine/graphql-engine.js';
import { backfillLegacyApiKeys } from './shared/api-key.js';
import { getJwtSecret, isProductionEnvironment, validateRuntimeEnvironment } from './shared/env.js';
import { getHealthSnapshot } from './shared/health.js';
import { logger, serializeError } from './shared/logger.js';
import { authenticate } from './shared/middlewares.js';
import { getMetricsContentType, getMetricsSnapshot, observeHttpRequest } from './shared/metrics.js';
import { redis } from './shared/redis.js';
import { sanitizeInput } from './shared/sanitize.js';

const JSON_BODY_LIMIT_BYTES = Number(process.env.JSON_BODY_LIMIT_BYTES ?? 1_048_576);
const FILE_UPLOAD_LIMIT_BYTES = Number(process.env.FILE_UPLOAD_LIMIT_BYTES ?? 5 * 1024 * 1024);

function getCspDirectiveValues(envKey: string, defaults: string[]) {
  const extraValues = process.env[envKey]
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean) ?? [];

  return [...new Set([...defaults, ...extraValues])];
}

function getCorsOrigins() {
  const configuredOrigins = process.env.CORS_ORIGIN
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (configuredOrigins && configuredOrigins.length > 0) {
    return configuredOrigins;
  }

  return isProductionEnvironment() ? false : true;
}

export async function buildApp() {
  validateRuntimeEnvironment();

  const app = fastify({
    trustProxy: true,
    logger: false,
    bodyLimit: JSON_BODY_LIMIT_BYTES,
  });
  const uploadsPath = path.resolve(process.cwd(), 'uploads');
  await fs.mkdir(uploadsPath, { recursive: true });

  try {
    const backfilledApiKeys = await backfillLegacyApiKeys();

    if (backfilledApiKeys > 0) {
      logger.info('Backfilled legacy API keys', {
        count: backfilledApiKeys,
      });
    }
  } catch (error) {
    logger.warn('Failed to backfill legacy API keys on startup', {
      error: serializeError(error),
    });
  }

  try {
    const backfilledSchemas = await databaseService.backfillLegacySchemas();

    if (backfilledSchemas > 0) {
      logger.info('Backfilled legacy table schemas', {
        count: backfilledSchemas,
      });
    }
  } catch (error) {
    logger.warn('Failed to backfill legacy table schemas on startup', {
      error: serializeError(error),
    });
  }

  // Plugins
  await app.register(fastifyExpress);
  app.use('/webhooks/stripe', createStripeWebhookRouter());

  if (isProductionEnvironment()) {
    app.use(
      helmet({
        contentSecurityPolicy: {
          useDefaults: false,
          directives: {
            defaultSrc: getCspDirectiveValues('CSP_EXTRA_DEFAULT_SRC', ["'self'"]),
            scriptSrc: getCspDirectiveValues('CSP_EXTRA_SCRIPT_SRC', ["'self'"]),
            styleSrc: getCspDirectiveValues('CSP_EXTRA_STYLE_SRC', ["'self'", 'https:']),
            imgSrc: getCspDirectiveValues('CSP_EXTRA_IMG_SRC', ["'self'", 'data:', 'https:']),
            connectSrc: getCspDirectiveValues('CSP_EXTRA_CONNECT_SRC', ["'self'", 'https://api.stripe.com']),
            fontSrc: getCspDirectiveValues('CSP_EXTRA_FONT_SRC', ["'self'", 'data:', 'https:']),
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            upgradeInsecureRequests: [],
          },
        },
      })
    );
  } else {
    app.use(
      helmet({
        contentSecurityPolicy: false,
      })
    );
  }

  await app.register(cors, {
    origin: getCorsOrigins(),
    credentials: false,
  });
  await app.register(fastifyRateLimit, {
    global: true,
    max: Number(process.env.GLOBAL_RATE_LIMIT_MAX ?? 100),
    timeWindow: `${Number(process.env.GLOBAL_RATE_LIMIT_WINDOW_MINUTES ?? 15)} minute`,
    skipOnError: true,
    redis: redis ?? undefined,
    errorResponseBuilder: (_request, context) => ({
      error: `Rate limit exceeded, retry in ${context.after}`,
    }),
  });
  await app.register(multipart, {
    limits: {
      fileSize: FILE_UPLOAD_LIMIT_BYTES,
    },
  });
  await app.register(jwt, {
    secret: getJwtSecret(),
  });

  // Decorators
  app.decorate('authenticate', authenticate);

  app.addHook('onRequest', async (request) => {
    request.requestStartTime = process.hrtime.bigint();
  });

  app.addHook('preValidation', async (request) => {
    if (request.body !== undefined) {
      request.body = sanitizeInput(request.body);
    }

    if (request.query !== undefined) {
      request.query = sanitizeInput(request.query);
    }

    if (request.params !== undefined) {
      request.params = sanitizeInput(request.params);
    }
  });

  app.addHook('onResponse', async (request, reply) => {
    const startedAt = request.requestStartTime;
    const durationSeconds = startedAt ? Number(process.hrtime.bigint() - startedAt) / 1_000_000_000 : 0;
    const route = request.routeOptions.url ?? request.url.split('?')[0];
    const userId = request.userId ?? (request.user as { sub?: string } | undefined)?.sub ?? null;

    observeHttpRequest(request.method, route, reply.statusCode, durationSeconds);
    logger.info('Request completed', {
      requestId: request.id,
      method: request.method,
      route,
      url: request.url,
      statusCode: reply.statusCode,
      durationMs: Number((durationSeconds * 1000).toFixed(2)),
      userId,
      projectId: request.projectId ?? request.project?.id ?? null,
      ip: request.ip,
    });
  });

  app.setErrorHandler((error, request, reply) => {
    if ((error as { code?: string }).code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.status(413).send({
        error: `JSON payload too large. Limit is ${Math.floor(JSON_BODY_LIMIT_BYTES / 1024)}KB.`,
      });
    }

    if ((error as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.status(413).send({
        error: `Uploaded file is too large. Limit is ${Math.floor(FILE_UPLOAD_LIMIT_BYTES / (1024 * 1024))}MB.`,
      });
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'Invalid request payload',
        issues: error.flatten(),
      });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return reply.status(409).send({
          error: 'A record with these values already exists',
        });
      }
    }

    if (error instanceof Prisma.PrismaClientInitializationError) {
      logger.error('Database initialization failed', {
        requestId: request.id,
        error: serializeError(error),
      });
      return reply.status(503).send({
        error: 'Database unavailable. Check DATABASE_URL, PostgreSQL credentials, and whether the database server is running.',
      });
    }

    logger.error('Unhandled application error', {
      requestId: request.id,
      method: request.method,
      url: request.url,
      error: serializeError(error),
    });
    return reply.status(500).send({
      error: 'Internal server error',
    });
  });

  // Routes
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(growthRoutes, { prefix: '/growth' });
  await app.register(analyticsRoutes);
  await app.register(projectRoutes, { prefix: '/projects' });
  await app.register(requestRoutes);
  await app.register(billingRoutes, { prefix: '/billing-api' });
  await app.register(databaseRoutes);
  await app.register(storageRoutes);
  await app.register(apiEngineRoutes, { prefix: '/api' });
  await app.register(publicRoutes, { prefix: '/public' });
  
  // GraphQL
  await setupGraphQL(app);

  app.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', getMetricsContentType());
    return reply.send(await getMetricsSnapshot());
  });

  app.get('/livez', async () => ({ status: 'ok' }));

  app.get('/readyz', async (_request, reply) => {
    const health = await getHealthSnapshot();

    if (!health.ready) {
      return reply.status(503).send(health);
    }

    return reply.send(health);
  });

  app.get('/health', async () => getHealthSnapshot());

  return app;
}
