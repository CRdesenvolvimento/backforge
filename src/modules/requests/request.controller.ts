import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requestService } from './request.service.js';

const listRequestsQuerySchema = z.object({
  projectId: z.string().trim().optional(),
  status: z.coerce.number().int().min(100).max(599).optional(),
  path: z.string().trim().min(1).optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
}).refine((value) => {
  if (!value.fromDate || !value.toDate) {
    return true;
  }

  return value.fromDate <= value.toDate;
}, {
  message: 'fromDate must be earlier than or equal to toDate.',
  path: ['fromDate'],
});

export const requestController = {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const { projectId, status, path, fromDate, toDate, page, limit } = listRequestsQuerySchema.parse(request.query ?? {});
    const userId = (request.user as { sub: string }).sub;
    const requests = await requestService.listForUser(userId, {
      projectId,
      status,
      path,
      fromDate,
      toDate,
      page,
      limit,
    });

    return reply.send(requests);
  },

  async getById(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const userId = (request.user as { sub: string }).sub;
    const requestLog = await requestService.getByIdForUser(userId, id);

    if (!requestLog) {
      return reply.status(404).send({ error: 'Request log not found' });
    }

    return reply.send({
      id: requestLog.id,
      project: requestLog.project,
      request: {
        method: requestLog.method,
        path: requestLog.path,
        body: requestLog.requestBody,
        timestamp: requestLog.createdAt,
      },
      response: {
        status: requestLog.status,
        body: requestLog.responseBody,
      },
      headers: requestLog.headers,
      latency: requestLog.latency,
    });
  },
};
