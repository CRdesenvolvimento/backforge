import { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { databaseService } from '../database/database.service.js';
import {
  captureProjectRequestLogContext,
  captureProjectResponsePayload,
  enforceProjectQuota,
  enforceProjectRateLimit,
  recordProjectRequest,
  requireProjectApiKey,
} from '../../shared/project-api-access.js';
import { prisma } from '../../shared/prisma.js';


const publicRowsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export async function publicRoutes(app: FastifyInstance) {
  const uploadsRoot = path.resolve(process.cwd(), 'uploads');

  app.get('/files/:filename', async (request, reply) => {
    const { filename } = request.params as { filename: string };
    const storedFile = await prisma.storedFile.findUnique({
      where: { filename },
      select: {
        filename: true,
        mimeType: true,
        originalName: true,
      },
    });

    if (!storedFile) {
      return reply.status(404).send({ error: 'File not found' });
    }

    const filePath = path.join(uploadsRoot, storedFile.filename);

    try {
      await fsPromises.access(filePath);
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header("Content-Type", "application/octet-stream");
      reply.header("Content-Disposition", "attachment");
      return reply.send(fs.createReadStream(filePath));
    } catch {
      return reply.status(404).send({ error: 'File not found' });
    }
  });

  app.register(async (instance) => {
    instance.addHook('preHandler', requireProjectApiKey);
    instance.addHook('preHandler', captureProjectRequestLogContext);
    instance.addHook('preHandler', enforceProjectQuota);
    instance.addHook('preHandler', enforceProjectRateLimit);
    instance.addHook('onSend', captureProjectResponsePayload);
    instance.addHook('onResponse', recordProjectRequest);

    instance.get('/:tableName', async (request, reply) => {
      const { tableName } = request.params as { tableName: string };
      const { page, limit, pageSize } = publicRowsQuerySchema.parse(request.query ?? {});
      const projectId = request.projectId;

      if (!projectId) {
        return reply.status(401).send({ error: 'Invalid API key' });
      }

      const rows = await databaseService.listPublicRows(projectId, tableName, { page, limit: limit ?? pageSize });

      if (!rows) {
        return reply.status(404).send({ error: 'Table not found' });
      }

      return reply.send({
        success: true,
        data: rows.data,
        pagination: rows.pagination,
      });
    });
  });
}
