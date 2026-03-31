import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../shared/prisma.js';
import { safeRedis } from '../shared/redis.js';

export class GatewayController {
  async validateRequest(request: FastifyRequest, reply: FastifyReply) {
    const apiKey = request.headers['x-api-key'] as string;
    if (!apiKey) return reply.status(401).send({ error: 'API Key required' });

    // Cache lookup for API Key
    const cachedProject = await safeRedis.get(`apikey:${apiKey}`);
    let projectId: string;

    if (cachedProject) {
      projectId = cachedProject;
    } else {
      const keyData = await prisma.apiKey.findUnique({
        where: { key: apiKey },
        include: { project: { include: { subscription: true } } },
      });

      if (!keyData) return reply.status(401).send({ error: 'Invalid API Key' });
      projectId = keyData.projectId;
      await safeRedis.set(`apikey:${apiKey}`, projectId, 'EX', 3600);
    }

    // Attach project info to request
    (request as any).projectId = projectId;

    // Check usage limits (simplified)
    const sub = await prisma.subscription.findUnique({ where: { projectId } });
    if (sub && sub.requestsUsed >= sub.requestsLimit) {
      return reply.status(429).send({ error: 'Usage limit exceeded' });
    }

    // Increment usage asynchronously (could use BullMQ here)
    await prisma.subscription.update({
      where: { projectId },
      data: { requestsUsed: { increment: 1 } },
    });
  }

  async handleGet(request: FastifyRequest, reply: FastifyReply) {
    const { table } = request.params as { table: string };
    const projectId = (request as any).projectId;

    const tableMeta = await prisma.databaseTable.findFirst({
      where: { name: table, projectId },
    });

    if (!tableMeta) return reply.status(404).send({ error: `Table ${table} not found` });

    return { message: `Dynamic GET for ${table} in project ${projectId}`, data: [] };
  }

  async handlePost(request: FastifyRequest, reply: FastifyReply) {
    const { table } = request.params as { table: string };
    const projectId = (request as any).projectId;
    return reply.status(201).send({ message: `Created in ${table}`, data: request.body });
  }

  async handleGetOne(request: FastifyRequest, reply: FastifyReply) {
    const { table, id } = request.params as { table: string, id: string };
    return { table, id, data: {} };
  }

  async handlePut(request: FastifyRequest, reply: FastifyReply) {
    const { table, id } = request.params as { table: string, id: string };
    return { message: `Updated ${id} in ${table}`, data: request.body };
  }

  async handleDelete(request: FastifyRequest, reply: FastifyReply) {
    const { table, id } = request.params as { table: string, id: string };
    return { message: `Deleted ${id} from ${table}` };
  }
}
