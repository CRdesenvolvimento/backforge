import { FastifyInstance } from 'fastify';
import { roleMiddleware } from '../../shared/middlewares.js';
import { storageController } from './storage.controller.js';

export async function storageRoutes(app: FastifyInstance) {
  app.register(async (instance) => {
    instance.addHook('preHandler', instance.authenticate);
    instance.addHook('preHandler', roleMiddleware(['OWNER', 'ADMIN', 'DEVELOPER']));

    instance.post('/upload', storageController.upload);
    instance.get('/files', storageController.list);
    instance.delete('/files/:id', storageController.delete);
  });
}
