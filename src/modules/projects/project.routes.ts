import { FastifyInstance } from 'fastify';
import { buildUserScopedCacheKey, createRouteCacheHooks } from '../../shared/cache.js';
import { projectController } from './project.controller.js';

export async function projectRoutes(app: FastifyInstance) {
  const projectsCache = createRouteCacheHooks({
    namespace: 'projects',
    ttlSeconds: 30,
    key: (request) => buildUserScopedCacheKey(request, 'projects'),
  });

  app.addHook('preHandler', app.authenticate);

  app.post('/', projectController.create);
  app.get('/', { preHandler: projectsCache.preHandler, onSend: projectsCache.onSend }, projectController.list);
  app.get('/:id/keys', { preHandler: projectsCache.preHandler, onSend: projectsCache.onSend }, projectController.listApiKeys);
  app.post('/:id/keys', projectController.createApiKey);
  app.get('/:id/logs', { preHandler: projectsCache.preHandler, onSend: projectsCache.onSend }, projectController.listLogs);
  app.get('/:id/billing', projectController.getBilling);
  app.get('/:id', { preHandler: projectsCache.preHandler, onSend: projectsCache.onSend }, projectController.get);
  app.patch('/:id', projectController.update);
  app.delete('/:id', projectController.remove);
}
