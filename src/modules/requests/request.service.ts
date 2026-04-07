import { prisma } from '../../shared/prisma.js';

interface ListRequestLogsOptions {
  projectId?: string;
  status?: number;
  path?: string;
  fromDate?: Date;
  toDate?: Date;
  page?: number;
  limit?: number;
}

function getPagination(page = 1, limit = 20) {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));

  return {
    page: safePage,
    limit: safeLimit,
    skip: (safePage - 1) * safeLimit,
    take: safeLimit,
  };
}

function buildAccessibleRequestLogWhere(userId: string, filters: ListRequestLogsOptions) {
  return {
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(typeof filters.status === 'number' ? { status: filters.status } : {}),
    ...(filters.path
      ? {
          path: {
            contains: filters.path,
            mode: 'insensitive' as const,
          },
        }
      : {}),
    ...(filters.fromDate || filters.toDate
      ? {
          createdAt: {
            ...(filters.fromDate ? { gte: filters.fromDate } : {}),
            ...(filters.toDate ? { lte: filters.toDate } : {}),
          },
        }
      : {}),
    project: {
      memberships: {
        some: {
          userId,
        },
      },
    },
  };
}

export const requestService = {
  async listForUser(userId: string, filters: ListRequestLogsOptions = {}) {
    const pagination = getPagination(filters.page, filters.limit);
    const where = buildAccessibleRequestLogWhere(userId, filters);

    const [items, total] = await Promise.all([
      prisma.requestLog.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        skip: pagination.skip,
        take: pagination.take,
        select: {
          id: true,
          projectId: true,
          path: true,
          method: true,
          status: true,
          latency: true,
          createdAt: true,
          project: {
            select: {
              name: true,
              slug: true,
            },
          },
        },
      }),
      prisma.requestLog.count({ where }),
    ]);

    return {
      data: items,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / pagination.limit)),
      },
    };
  },

  async getByIdForUser(userId: string, requestId: string) {
    return prisma.requestLog.findFirst({
      where: {
        id: requestId,
        project: {
          memberships: {
            some: {
              userId,
            },
          },
        },
      },
      select: {
        id: true,
        projectId: true,
        method: true,
        path: true,
        status: true,
        latency: true,
        headers: true,
        requestBody: true,
        responseBody: true,
        createdAt: true,
        project: {
          select: {
            name: true,
            slug: true,
          },
        },
      },
    });
  },
};
