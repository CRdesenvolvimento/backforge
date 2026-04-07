import { FastifyInstance } from 'fastify';
import { requestController } from './request.controller.js';

export async function requestRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.get('/requests', requestController.list);
  app.get('/requests/:id', requestController.getById);
}
