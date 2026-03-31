import { FastifyInstance } from 'fastify';
import { growthController } from './growth.controller.js';

export async function growthRoutes(app: FastifyInstance) {
  app.post('/events', growthController.captureEvent);

  app.register(async (instance) => {
    instance.addHook('preHandler', instance.authenticate);
    instance.get('/summary', growthController.summary);
    instance.get('/onboarding', growthController.onboarding);
  });
}
