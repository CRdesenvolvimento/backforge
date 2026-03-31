import { FastifyInstance } from 'fastify';
import { ApiEngineController } from './api-engine.controller.js';
import {
  enforceProjectQuota,
  enforceProjectRateLimit,
  optionallyAuthenticateProjectUser,
  recordProjectRequest,
  requireProjectApiKey,
} from '../../shared/project-api-access.js';

export async function apiEngineRoutes(app: FastifyInstance) {
  const controller = new ApiEngineController();

  app.addHook('preHandler', requireProjectApiKey);
  app.addHook('preHandler', optionallyAuthenticateProjectUser);
  app.addHook('preHandler', enforceProjectQuota);
  app.addHook('preHandler', enforceProjectRateLimit);
  app.addHook('onResponse', recordProjectRequest);

  app.get('/:table', controller.handleGet);
  app.post('/:table', controller.handlePost);
}
