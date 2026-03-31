import { FastifyInstance } from 'fastify';
import { buildProjectScopedCacheKey, createRouteCacheHooks } from '../../shared/cache.js';
import { enforceProjectQuota, enforceProjectRateLimit, recordProjectRequest, requireProjectApiKey } from '../../shared/project-api-access.js';

export async function publicRoutes(app: FastifyInstance) {
  const publicDataCache = createRouteCacheHooks({
    namespace: 'public',
    ttlSeconds: 30,
    key: (request) => buildProjectScopedCacheKey(request, 'public'),
  });

  app.addHook('preHandler', requireProjectApiKey);
  app.addHook('preHandler', enforceProjectQuota);
  app.addHook('preHandler', enforceProjectRateLimit);
  app.addHook('onResponse', recordProjectRequest);

  app.get(
    '/data',
    { preHandler: publicDataCache.preHandler, onSend: publicDataCache.onSend },
    async (request) => ({
      message: 'API working',
      projectId: request.projectId,
      projectName: request.project?.name,
      plan: request.project?.subscription?.plan ?? 'FREE',
    })
  );
}
