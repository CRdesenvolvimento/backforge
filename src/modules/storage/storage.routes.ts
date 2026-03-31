import { FastifyInstance } from 'fastify';
import { StorageController } from './storage.controller.js';
import { roleMiddleware } from '../../shared/middlewares.js';

export async function storageRoutes(app: FastifyInstance) {
  const controller = new StorageController();

  app.register(async (instance) => {
    instance.addHook('preHandler', instance.authenticate);
    // Multi-tenant RBAC check: only owner, admin, developer can access storage
    instance.addHook('preHandler', roleMiddleware(['OWNER', 'ADMIN', 'DEVELOPER']));

    instance.post('/upload', controller.upload);
    instance.get('/file/:filename', controller.getUrl);
    instance.delete('/file/:filename', controller.delete);
    instance.get('/list', controller.list);
  });
}
