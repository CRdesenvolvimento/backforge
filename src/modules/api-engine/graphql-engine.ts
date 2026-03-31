import { FastifyInstance } from 'fastify';
import mercurius from 'mercurius';
import { prisma } from '../../shared/prisma.js';
import { resolveProjectIdFromApiKey } from '../../shared/api-key.js';
import { toProjectSchema, toSqlIdentifier, toSqlIdentifierList } from '../../shared/sql.js';

export async function setupGraphQL(app: FastifyInstance) {
  const schema = `
    type Query {
      list(table: String!): [JSON]
    }

    type Mutation {
      create(table: String!, data: JSON!): JSON
    }

    scalar JSON
  `;

  const resolvers = {
    Query: {
      list: async (_: any, { table }: { table: string }, { projectId }: any) => {
        const schemaName = toProjectSchema(projectId);
        const safeTable = toSqlIdentifier(table, 'table name');
        return prisma.$queryRawUnsafe(`SELECT * FROM ${schemaName}.${safeTable}`);
      }
    },
    Mutation: {
      create: async (_: any, { table, data }: { table: string, data: any }, { projectId }: any) => {
        const schemaName = toProjectSchema(projectId);
        const safeTable = toSqlIdentifier(table, 'table name');
        const keys = Object.keys(data);
        const values = Object.values(data);

        if (!keys.length) {
          throw new Error('Insert data cannot be empty');
        }

        const safeColumns = toSqlIdentifierList(keys, 'column name');
        const sql = `INSERT INTO ${schemaName}.${safeTable} (${safeColumns.join(',')}) VALUES (${keys.map((_, i) => `$${i+1}`).join(',')}) RETURNING *`;
        return prisma.$queryRawUnsafe(sql, ...values);
      }
    }
  };

  await app.register(mercurius, {
    schema,
    resolvers,
    graphiql: true,
    context: async (request) => {
      const apiKey = request.headers['x-api-key'];
      if (typeof apiKey !== 'string' || !apiKey) {
        throw new Error('API Key required');
      }

      const projectId = await resolveProjectIdFromApiKey(apiKey);
      if (!projectId) {
        throw new Error('Invalid API Key');
      }

      let userId: string | undefined;
      if (request.headers.authorization) {
        try {
          await request.jwtVerify();
          userId = (request.user as any).sub;
        } catch (error) {
          throw new Error('Invalid authorization token');
        }
      }

      return {
        projectId,
        userId,
      };
    }
  });
}
