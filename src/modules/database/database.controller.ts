import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/prisma.js';
import { z } from 'zod';

const createTableSchema = z.object({
  projectId: z.string(),
  name: z.string(),
  columns: z.array(z.object({
    name: z.string(),
    type: z.enum(['string', 'number', 'boolean', 'json', 'datetime']),
    required: z.boolean().default(false),
  })),
});

export class DatabaseController {
  async createTable(request: FastifyRequest, reply: FastifyReply) {
    const { projectId, name, columns } = createTableSchema.parse(request.body);
    const userId = (request.user as any).sub;

    const project = await prisma.project.findFirst({ 
      where: { 
        id: projectId, 
        memberships: {
          some: { userId }
        }
      } 
    });

    if (!project) return reply.status(404).send({ error: 'Project not found' });

    const table = await prisma.databaseTable.create({
      data: {
        projectId,
        name,
        columns: {
          create: columns,
        },
      },
      include: { columns: true },
    });

    return reply.status(201).send(table);
  }

  async listTables(request: FastifyRequest) {
    const { projectId } = request.params as { projectId: string };
    const userId = (request.user as any).sub;

    return prisma.databaseTable.findMany({
      where: { 
        projectId, 
        project: { 
          memberships: {
            some: { userId }
          }
        } 
      },
      include: { columns: true },
    });
  }
}
