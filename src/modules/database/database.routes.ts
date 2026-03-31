import { FastifyInstance } from 'fastify';
import { DatabaseController } from './database.controller.js';

export async function databaseRoutes(app: FastifyInstance) {
  const controller = new DatabaseController();

  app.addHook('preHandler', app.authenticate);

  app.post('/tables', controller.createTable);
  app.get('/tables/:projectId', controller.listTables);
}
