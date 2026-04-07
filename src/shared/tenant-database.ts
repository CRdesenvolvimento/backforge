import { PrismaClient } from '../generated/prisma-client/index.js';

export class TenantDatabaseService {
  private static clients: Map<string, PrismaClient> = new Map();

  static async getClient(projectId: string): Promise<PrismaClient> {
    // In a "schema per project" architecture, we would ideally have one client 
    // or use a middleware to set the search_path.
    // For this implementation, we'll use a single client and set the search_path 
    // before each transaction/query if we were using raw SQL.
    // However, for Prisma, the most reliable way is to use the 'schema' parameter 
    // in the connection string or use a client extension.
    
    // For simplicity and performance in this turn, we'll use the main client 
    // but simulate the isolation logic.
    const client = new PrismaClient({
      datasources: {
        db: {
          url: `${process.env.DATABASE_URL}&schema=project_${projectId.replace(/-/g, '_')}`,
        },
      },
    });
    
    return client;
  }

  // Helper to run raw queries in the correct schema
  static async runInSchema(projectId: string, callback: (prisma: PrismaClient) => Promise<any>) {
    const schemaName = `project_${projectId.replace(/-/g, '_')}`;
    const prisma = new PrismaClient();
    
    try {
      await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
      await prisma.$executeRawUnsafe(`SET search_path TO ${schemaName}`);
      return await callback(prisma);
    } finally {
      await prisma.$disconnect();
    }
  }
}
