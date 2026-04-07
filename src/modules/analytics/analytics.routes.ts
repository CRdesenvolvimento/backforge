import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { growthService } from '../growth/growth.service.js';

const analyticsQuerySchema = z.object({
  projectId: z.string().trim().optional(),
});

export async function analyticsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.get('/analytics', async (request, reply) => {
    const { projectId } = analyticsQuerySchema.parse(request.query ?? {});
    const userId = (request.user as { sub: string }).sub;
    const analytics = await growthService.getAnalyticsForUser(userId, projectId);

    if (!analytics) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    return reply.send(analytics);
  });
}
