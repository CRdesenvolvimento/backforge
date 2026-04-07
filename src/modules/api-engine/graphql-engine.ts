import { FastifyInstance } from 'fastify';
import mercurius from 'mercurius';
import { prisma } from '../../shared/prisma.js';
import { getNodeEnv } from '../../shared/env.js';
import {
  captureProjectRequestLogContext,
  captureProjectResponsePayload,
  enforceProjectQuota,
  enforceProjectRateLimit,
  optionallyAuthenticateProjectUser,
  recordProjectRequest,
  requireProjectApiKey,
} from '../../shared/project-api-access.js';
import { toProjectSchema, toSqlIdentifier, toSqlIdentifierList } from '../../shared/sql.js';

export async function setupGraphQL(app: FastifyInstance) {
  if (process.env.ENABLE_GRAPHQL !== 'true') {
    return;
  }

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

  await app.register(async (instance) => {
    instance.addHook('preHandler', requireProjectApiKey);
    instance.addHook('preHandler', optionallyAuthenticateProjectUser);
    instance.addHook('preHandler', captureProjectRequestLogContext);
    instance.addHook('preHandler', enforceProjectQuota);
    instance.addHook('preHandler', enforceProjectRateLimit);
    instance.addHook('onSend', captureProjectResponsePayload);
    instance.addHook('onResponse', recordProjectRequest);

    await instance.register(mercurius, {
      schema,
      resolvers,
      graphiql: getNodeEnv() !== 'production',
      context: async (request) => {
        if (!request.projectId) {
          throw new Error('Invalid API key');
        }

        return {
          projectId: request.projectId,
          userId: request.userId,
        };
      },
    });
  });
}
