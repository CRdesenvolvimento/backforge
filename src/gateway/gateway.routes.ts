import { FastifyInstance } from 'fastify';
import { GatewayController } from './gateway.controller.js';

export async function gatewayRoutes(app: FastifyInstance) {
  const controller = new GatewayController();

  // Middleware to validate API Key and check limits
  app.addHook('preHandler', controller.validateRequest);

  // Dynamic CRUD routes
  app.get('/:table', controller.handleGet);
  app.post('/:table', controller.handlePost);
  app.get('/:table/:id', controller.handleGetOne);
  app.put('/:table/:id', controller.handlePut);
  app.delete('/:table/:id', controller.handleDelete);
}
