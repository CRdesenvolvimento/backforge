import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { databaseService } from './database.service.js';

const schemaIdentifierRegex = /^[A-Za-z0-9_]+$/;

const columnSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Column name is required.')
    .max(64, 'Column name must be 64 characters or fewer.')
    .regex(schemaIdentifierRegex, 'Column names may only contain letters, numbers, and underscores.'),
  type: z.enum(['string', 'number', 'boolean', 'date']),
});

const createTableSchema = z.object({
  projectId: z.string().trim().min(1),
  name: z
    .string()
    .trim()
    .min(1, 'Table name is required.')
    .max(64, 'Table name must be 64 characters or fewer.')
    .regex(schemaIdentifierRegex, 'Table names may only contain letters, numbers, and underscores.'),
  columns: z.array(columnSchema).min(1),
}).superRefine((value, context) => {
  const seenColumnNames = new Set<string>();

  value.columns.forEach((column, index) => {
    const normalizedName = column.name.trim().toLowerCase();

    if (seenColumnNames.has(normalizedName)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate column name "${column.name}" is not allowed.`,
        path: ['columns', index, 'name'],
      });
      return;
    }

    seenColumnNames.add(normalizedName);
  });
});

const listTablesQuerySchema = z.object({
  projectId: z.string().trim().min(1),
});

const createRowSchema = z.object({
  data: z.record(z.string(), z.unknown()),
});

const listRowsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

function getAuthenticatedUserId(request: FastifyRequest) {
  return (request.user as { sub: string }).sub;
}

export const databaseController = {
  async createTable(request: FastifyRequest, reply: FastifyReply) {
    const { projectId, name, columns } = createTableSchema.parse(request.body ?? {});
    const userId = getAuthenticatedUserId(request);
    const table = await databaseService.createTable(userId, projectId, name, columns);

    if (!table) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    return reply.status(201).send(table);
  },

  async listTables(request: FastifyRequest, reply: FastifyReply) {
    const { projectId } = listTablesQuerySchema.parse(request.query ?? {});
    const userId = getAuthenticatedUserId(request);
    const tables = await databaseService.listTables(userId, projectId);

    if (!tables) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    return reply.send(tables);
  },

  async insertRow(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { data } = createRowSchema.parse(request.body ?? {});
    const userId = getAuthenticatedUserId(request);
    const row = await databaseService.insertRow(userId, id, data);

    if (!row) {
      return reply.status(404).send({ error: 'Table not found' });
    }

    return reply.status(201).send(row);
  },

  async listRows(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { page, limit, pageSize } = listRowsQuerySchema.parse(request.query ?? {});
    const userId = getAuthenticatedUserId(request);
    const rows = await databaseService.listRows(userId, id, { page, limit: limit ?? pageSize });

    if (!rows) {
      return reply.status(404).send({ error: 'Table not found' });
    }

    return reply.send(rows);
  },

  async deleteRow(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const userId = getAuthenticatedUserId(request);
    const deleted = await databaseService.deleteRow(userId, id);

    if (!deleted) {
      return reply.status(404).send({ error: 'Row not found' });
    }

    return reply.status(204).send();
  },
};
