import { FastifyInstance } from 'fastify';
import { databaseController } from './database.controller.js';

export async function databaseRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.post('/tables', databaseController.createTable);
  app.get('/tables', databaseController.listTables);
  app.post('/tables/:id/rows', databaseController.insertRow);
  app.get('/tables/:id/rows', databaseController.listRows);
  app.delete('/rows/:id', databaseController.deleteRow);
}
