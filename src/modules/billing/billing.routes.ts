import { FastifyInstance } from 'fastify';
import { buildPublicCacheKey, createRouteCacheHooks } from '../../shared/cache.js';
import { billingController } from './billing.controller.js';

export async function billingRoutes(app: FastifyInstance) {
  const plansCache = createRouteCacheHooks({
    namespace: 'billing-plans',
    ttlSeconds: 300,
    key: () => buildPublicCacheKey('billing-plans'),
  });

  app.addHook('preHandler', app.authenticate);

  app.get('/plans', { preHandler: plansCache.preHandler, onSend: plansCache.onSend }, billingController.listPlans);
  app.post('/projects/:projectId/checkout', billingController.createCheckoutSession);
  app.post('/projects/:projectId/portal', billingController.createPortalSession);
}
