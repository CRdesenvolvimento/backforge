import { FastifyReply, FastifyRequest } from 'fastify';
import { StorageService } from './storage.service.js';

const storageService = new StorageService();

export class StorageController {
  async upload(request: FastifyRequest, reply: FastifyReply) {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    const { projectId } = (request as any).tenant;
    const result = await storageService.uploadFile(projectId, data);
    
    return reply.status(201).send(result);
  }

  async getUrl(request: FastifyRequest, reply: FastifyReply) {
    const { filename } = request.params as { filename: string };
    const { projectId } = (request as any).tenant;
    const key = `${projectId}/uploads/${filename}`;

    const url = await storageService.getFileUrl(key);
    return reply.send({ url });
  }

  async delete(request: FastifyRequest, reply: FastifyReply) {
    const { filename } = request.params as { filename: string };
    const { projectId } = (request as any).tenant;
    const key = `${projectId}/uploads/${filename}`;

    await storageService.deleteFile(key);
    return reply.status(204).send();
  }

  async list(request: FastifyRequest, reply: FastifyReply) {
    const { projectId } = (request as any).tenant;
    const files = await storageService.listFiles(projectId);
    return reply.send(files);
  }
}
