import { Role } from '../../generated/prisma/index.js';
import { getNextBillingPeriodEnd, getNextBillingPeriodStart, getPlanConfig, normalizePlanKey } from '../../config/plans.js';
import { platformEvents } from '../../events/catalog.js';
import { emitEvent } from '../../events/eventBus.js';
import { prisma } from '../../shared/prisma.js';
import { growthEventNames, trackGrowthEvent } from '../../shared/growth.js';
import { generateApiKey } from '../../utils/generateApiKey.js';

const PROJECT_WRITE_ROLES: Role[] = ['OWNER', 'ADMIN'];
const PROJECT_DELETE_ROLES: Role[] = ['OWNER'];

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

async function getAvailableSlug(baseValue: string) {
  const normalizedBase = slugify(baseValue) || 'project';
  let slug = normalizedBase;
  let suffix = 1;

  while (await prisma.project.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${normalizedBase}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

function projectMembershipFilter(userId: string, allowedRoles?: Role[]) {
  return {
    some: {
      userId,
      ...(allowedRoles ? { role: { in: allowedRoles } } : {}),
    },
  };
}

function maskApiKey(key: string) {
  if (key.length <= 12) {
    return key;
  }

  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

export const projectService = {
  async create(userId: string, name: string, slug?: string) {
    const freePlan = getPlanConfig('free');
    const availableSlug = await getAvailableSlug(slug ?? name);

    const project = await prisma.project.create({
      data: {
        name,
        slug: availableSlug,
        memberships: {
          create: {
            userId,
            role: 'OWNER',
          },
        },
        subscription: {
          create: {
            billingUserId: userId,
            plan: freePlan.key,
            status: 'active',
            requestsLimit: freePlan.requests,
            rateLimitPerMinute: freePlan.rateLimitPerMinute,
            currentPeriodStart: getNextBillingPeriodStart(),
            currentPeriodEnd: getNextBillingPeriodEnd(),
          },
        },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await emitEvent(platformEvents.projectCreated, {
      projectId: project.id,
      ownerUserId: userId,
      name: project.name,
      slug: project.slug,
    });

    await trackGrowthEvent({
      name: growthEventNames.projectCreated,
      userId,
      projectId: project.id,
      metadata: {
        name: project.name,
        slug: project.slug,
      },
    });

    return project;
  },

  async createStarterWorkspace(userId: string, projectName = 'My First Project') {
    const project = await this.create(userId, projectName);
    const apiKey = await this.createApiKey(userId, project.id, 'Getting Started Key');

    if (!apiKey) {
      throw new Error('Failed to create starter API key');
    }

    return {
      project,
      apiKey,
    };
  },

  async getOrCreateQuickstartWorkspace(userId: string) {
    const project = await prisma.project.findFirst({
      where: {
        memberships: projectMembershipFilter(userId, PROJECT_WRITE_ROLES),
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        updatedAt: true,
        apiKeys: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
          select: {
            id: true,
            name: true,
            key: true,
            createdAt: true,
          },
        },
      },
    });

    if (!project) {
      return this.createStarterWorkspace(userId);
    }

    if (project.apiKeys[0]) {
      return {
        project: {
          id: project.id,
          name: project.name,
          slug: project.slug,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        },
        apiKey: {
          ...project.apiKeys[0],
          maskedKey: maskApiKey(project.apiKeys[0].key),
        },
      };
    }

    const apiKey = await this.createApiKey(userId, project.id, 'Getting Started Key');

    if (!apiKey) {
      throw new Error('Failed to create starter API key');
    }

    return {
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      },
      apiKey,
    };
  },

  async list(userId: string) {
    const projects = await prisma.project.findMany({
      where: {
        memberships: projectMembershipFilter(userId),
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        updatedAt: true,
        memberships: {
          where: { userId },
          select: { role: true },
        },
        subscription: {
          select: {
            plan: true,
            status: true,
            requestsLimit: true,
            requestsUsed: true,
            rateLimitPerMinute: true,
          },
        },
        _count: {
          select: {
            apiKeys: true,
            tables: true,
          },
        },
      },
    });

    return projects.map(({ memberships, _count, ...project }) => ({
      ...project,
      subscription: project.subscription
        ? {
            ...project.subscription,
            plan: normalizePlanKey(project.subscription.plan),
            status: project.subscription.status.toLowerCase(),
          }
        : null,
      role: memberships[0]?.role ?? 'DEVELOPER',
      apiKeysCount: _count.apiKeys,
      tablesCount: _count.tables,
    }));
  },

  async get(userId: string, projectId: string) {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        memberships: projectMembershipFilter(userId),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        updatedAt: true,
        memberships: {
          where: { userId },
          select: { role: true },
        },
        subscription: {
          select: {
            id: true,
            plan: true,
            status: true,
            requestsLimit: true,
            requestsUsed: true,
            rateLimitPerMinute: true,
            stripeCustomerId: true,
            stripeSubscriptionId: true,
            stripePriceId: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            billingUser: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        },
        apiKeys: {
          select: {
            id: true,
            name: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
        tables: {
          select: {
            id: true,
            name: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!project) {
      return null;
    }

    const { memberships, ...projectData } = project;

    return {
      ...projectData,
      subscription: projectData.subscription
        ? {
            ...projectData.subscription,
            plan: normalizePlanKey(projectData.subscription.plan),
            status: projectData.subscription.status.toLowerCase(),
          }
        : null,
      role: memberships[0]?.role ?? 'DEVELOPER',
    };
  },

  async update(userId: string, projectId: string, name: string) {
    const membership = await prisma.membership.findFirst({
      where: {
        userId,
        projectId,
        role: { in: PROJECT_WRITE_ROLES },
      },
      select: {
        id: true,
      },
    });

    if (!membership) {
      return null;
    }

    return prisma.project.update({
      where: {
        id: projectId,
      },
      data: {
        name,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  },

  async delete(userId: string, projectId: string) {
    const membership = await prisma.membership.findFirst({
      where: {
        userId,
        projectId,
        role: { in: PROJECT_DELETE_ROLES },
      },
      select: {
        id: true,
      },
    });

    if (!membership) {
      return false;
    }

    await prisma.project.delete({
      where: {
        id: projectId,
      },
    });

    return true;
  },

  async createApiKey(userId: string, projectId: string, name: string) {
    const membership = await prisma.membership.findFirst({
      where: {
        userId,
        projectId,
        role: { in: PROJECT_WRITE_ROLES },
      },
      select: {
        id: true,
      },
    });

    if (!membership) {
      return null;
    }

    const currentKeyCount = await prisma.apiKey.count({
      where: { projectId },
    });
    const apiKeyName = name.trim() || `Key ${currentKeyCount + 1}`;
    const apiKeyRecord = await prisma.apiKey.create({
      data: {
        name: apiKeyName,
        key: generateApiKey(),
        projectId,
      },
      select: {
        id: true,
        name: true,
        key: true,
        createdAt: true,
      },
    });

    await trackGrowthEvent({
      name: growthEventNames.apiKeyCreated,
      userId,
      projectId,
      metadata: {
        name: apiKeyName,
      },
    });

    return {
      ...apiKeyRecord,
      maskedKey: maskApiKey(apiKeyRecord.key),
    };
  },

  async listApiKeys(userId: string, projectId: string) {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        memberships: projectMembershipFilter(userId),
      },
      select: {
        id: true,
      },
    });

    if (!project) {
      return null;
    }

    const apiKeys = await prisma.apiKey.findMany({
      where: { projectId },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        name: true,
        key: true,
        createdAt: true,
      },
    });

    return apiKeys.map(({ key, ...apiKey }) => ({
      ...apiKey,
      maskedKey: maskApiKey(key),
    }));
  },

  async listLogs(userId: string, projectId: string, limit = 50) {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        memberships: projectMembershipFilter(userId),
      },
      select: {
        id: true,
      },
    });

    if (!project) {
      return null;
    }

    return prisma.requestLog.findMany({
      where: { projectId },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      select: {
        id: true,
        path: true,
        method: true,
        status: true,
        createdAt: true,
      },
    });
  },

  async getBilling(userId: string, projectId: string) {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        memberships: projectMembershipFilter(userId),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        subscription: {
          select: {
            id: true,
            plan: true,
            status: true,
            requestsLimit: true,
            requestsUsed: true,
            rateLimitPerMinute: true,
            stripeCustomerId: true,
            stripeSubscriptionId: true,
            stripePriceId: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            createdAt: true,
            updatedAt: true,
            billingUser: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!project) {
      return null;
    }

    return {
      ...project,
      subscription: project.subscription
        ? {
            ...project.subscription,
            plan: normalizePlanKey(project.subscription.plan),
            status: project.subscription.status.toLowerCase(),
          }
        : null,
    };
  },
};
