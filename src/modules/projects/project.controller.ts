import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getUserScopedCachePrefix, invalidateCachePrefix } from '../../shared/cache.js';
import { projectService } from './project.service.js';

const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
});

const updateProjectSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

const createApiKeySchema = z.object({
  name: z.string().trim().min(2).max(80).optional().default(''),
});

const listLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

function getAuthenticatedUserId(request: FastifyRequest) {
  return (request.user as { sub: string }).sub;
}

async function invalidateUserProjectCaches(userId: string) {
  await invalidateCachePrefix(getUserScopedCachePrefix(userId, 'projects'), 'projects');
}

export const projectController = {
  async create(request: FastifyRequest, reply: FastifyReply) {
    const { name, slug } = createProjectSchema.parse(request.body);
    const userId = getAuthenticatedUserId(request);

    const project = await projectService.create(userId, name, slug);
    await invalidateUserProjectCaches(userId);

    return reply.status(201).send(project);
  },

  async list(request: FastifyRequest) {
    const userId = getAuthenticatedUserId(request);
    return projectService.list(userId);
  },

  async get(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const userId = getAuthenticatedUserId(request);

    const project = await projectService.get(userId, id);

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    return project;
  },

  async listApiKeys(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const userId = getAuthenticatedUserId(request);
    const apiKeys = await projectService.listApiKeys(userId, id);

    if (!apiKeys) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    return reply.send(apiKeys);
  },

  async update(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { name } = updateProjectSchema.parse(request.body);
    const userId = getAuthenticatedUserId(request);

    const project = await projectService.update(userId, id, name);

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    await invalidateUserProjectCaches(userId);
    return reply.send(project);
  },

  async remove(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const userId = getAuthenticatedUserId(request);

    const deleted = await projectService.delete(userId, id);

    if (!deleted) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    await invalidateUserProjectCaches(userId);
    return reply.status(204).send();
  },

  async createApiKey(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { name } = createApiKeySchema.parse(request.body ?? {});
    const userId = getAuthenticatedUserId(request);

    const apiKey = await projectService.createApiKey(userId, id, name);

    if (!apiKey) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    await invalidateUserProjectCaches(userId);
    return reply.status(201).send(apiKey);
  },

  async listLogs(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { limit } = listLogsQuerySchema.parse(request.query ?? {});
    const userId = getAuthenticatedUserId(request);
    const logs = await projectService.listLogs(userId, id, limit);

    if (!logs) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    return reply.send(logs);
  },

  async getBilling(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const userId = getAuthenticatedUserId(request);
    const billing = await projectService.getBilling(userId, id);

    if (!billing) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    return reply.send(billing);
  },
};
