import { prisma } from '../../shared/prisma.js';

export class PolicyService {
  async validateAccess(projectId: string, table: string, action: string, userId?: string) {
    if (!projectId) {
      throw new Error('Unauthorized');
    }

    const tableExists = await prisma.databaseTable.findFirst({
      where: { projectId, name: table },
      select: { id: true },
    });

    if (!tableExists) {
      throw new Error('Table not found');
    }

    if (userId) {
      const membership = await prisma.membership.findFirst({
        where: { projectId, userId },
        select: { id: true },
      });

      if (!membership) {
        throw new Error('Unauthorized');
      }
    }

    return true;
  }
}
