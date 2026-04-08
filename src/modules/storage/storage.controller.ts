import { FastifyReply, FastifyRequest } from 'fastify';
import { storageService } from './storage.service.js';

function getTenantProjectId(request: FastifyRequest) {
  return request.tenant?.projectId;
}

export const storageController = {
  async upload(request: FastifyRequest, reply: FastifyReply) {
    const data = await request.file();

    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    const projectId = getTenantProjectId(request);

    if (!projectId) {
      return reply.status(400).send({ error: 'Project context missing' });
    }

    const result = await storageService.uploadFile(projectId, data);
    return reply.status(201).send(result);
  },

  async list(request: FastifyRequest, reply: FastifyReply) {
    const projectId = getTenantProjectId(request);

    if (!projectId) {
      return reply.status(400).send({ error: 'Project context missing' });
    }

    const files = await storageService.listFiles(projectId);
    return reply.send(files);
  },

  async delete(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const projectId = getTenantProjectId(request);

    if (!projectId) {
      return reply.status(400).send({ error: 'Project context missing' });
    }

    const deleted = await storageService.deleteFile(projectId, id);

    if (!deleted) {
      return reply.status(404).send({ error: 'File not found' });
    }

    return reply.status(204).send();
  },
};
