import { prisma } from '../../shared/prisma.js';
import { logger, serializeError } from '../../shared/logger.js';
import { growthEventNames } from '../../shared/growth.js';
import { getPlanConfig, normalizePlanKey } from '../../config/plans.js';

function roundPercentage(value: number) {
  return Number(value.toFixed(1));
}

function formatDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function createRecentDayBuckets(totalDays: number) {
  const today = startOfDay(new Date());
  return Array.from({ length: totalDays }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (totalDays - index - 1));
    return formatDayKey(day);
  });
}

async function safeGrowthFindMany<T>(query: () => Promise<T>, fallback: T) {
  try {
    return await query();
  } catch (error) {
    logger.warn('Growth event query failed, using fallback', {
      error: serializeError(error),
    });
    return fallback;
  }
}

function buildDailySeries<T extends { createdAt: Date }>(records: T[], totalDays: number) {
  const buckets = createRecentDayBuckets(totalDays);
  const counts = new Map<string, number>(buckets.map((day) => [day, 0]));

  for (const record of records) {
    const dayKey = formatDayKey(record.createdAt);

    if (!counts.has(dayKey)) {
      continue;
    }

    counts.set(dayKey, (counts.get(dayKey) ?? 0) + 1);
  }

  return buckets.map((day) => ({
    day,
    count: counts.get(day) ?? 0,
  }));
}

export const growthService = {
  async getSummary() {
    const now = new Date();
    const lastDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      signups,
      totalProjects,
      totalApiCalls,
      apiCalls7d,
      subscriptions,
      ownerMembershipsWithActivation,
      ownerMembershipsWithPaidPlan,
      churnRiskProjects,
      recentUsers,
      recentProjects,
      recentApiCalls,
      visitorSessions,
      dauEvents,
      wauEvents,
      dauSessions,
      wauSessions,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.project.count(),
      prisma.requestLog.count(),
      prisma.requestLog.count({
        where: {
          createdAt: {
            gte: lastWeek,
          },
        },
      }),
      prisma.subscription.findMany({
        where: {
          status: 'active',
        },
        select: {
          plan: true,
          cancelAtPeriodEnd: true,
          projectId: true,
          project: {
            select: {
              requestLogs: {
                where: {
                  createdAt: {
                    gte: lastWeek,
                  },
                },
                take: 1,
                select: {
                  id: true,
                },
              },
            },
          },
        },
      }),
      prisma.membership.findMany({
        where: {
          role: 'OWNER',
          project: {
            apiKeys: {
              some: {},
            },
            requestLogs: {
              some: {},
            },
          },
        },
        distinct: ['userId'],
        select: {
          userId: true,
        },
      }),
      prisma.membership.findMany({
        where: {
          role: 'OWNER',
          project: {
            subscription: {
              is: {
                status: 'active',
                plan: {
                  in: ['basic', 'pro'],
                },
              },
            },
          },
        },
        distinct: ['userId'],
        select: {
          userId: true,
        },
      }),
      prisma.subscription.count({
        where: {
          OR: [
            {
              cancelAtPeriodEnd: true,
            },
            {
              status: 'active',
              plan: {
                in: ['basic', 'pro'],
              },
              project: {
                requestLogs: {
                  none: {
                    createdAt: {
                      gte: lastWeek,
                    },
                  },
                },
              },
            },
          ],
        },
      }),
      prisma.user.findMany({
        where: {
          createdAt: {
            gte: new Date(lastWeek.getTime() - 24 * 60 * 60 * 1000),
          },
        },
        select: {
          createdAt: true,
        },
      }),
      prisma.project.findMany({
        where: {
          createdAt: {
            gte: new Date(lastWeek.getTime() - 24 * 60 * 60 * 1000),
          },
        },
        select: {
          createdAt: true,
        },
      }),
      prisma.requestLog.findMany({
        where: {
          createdAt: {
            gte: new Date(lastWeek.getTime() - 24 * 60 * 60 * 1000),
          },
        },
        select: {
          createdAt: true,
        },
      }),
      safeGrowthFindMany(
        () =>
          prisma.growthEvent.findMany({
            where: {
              name: growthEventNames.pageView,
              sessionId: {
                not: null,
              },
            },
            distinct: ['sessionId'],
            select: {
              sessionId: true,
            },
          }),
        []
      ),
      safeGrowthFindMany(
        () =>
          prisma.growthEvent.findMany({
            where: {
              occurredAt: {
                gte: lastDay,
              },
              userId: {
                not: null,
              },
            },
            distinct: ['userId'],
            select: {
              userId: true,
            },
          }),
        []
      ),
      safeGrowthFindMany(
        () =>
          prisma.growthEvent.findMany({
            where: {
              occurredAt: {
                gte: lastWeek,
              },
              userId: {
                not: null,
              },
            },
            distinct: ['userId'],
            select: {
              userId: true,
            },
          }),
        []
      ),
      prisma.session.findMany({
        where: {
          createdAt: {
            gte: lastDay,
          },
        },
        distinct: ['userId'],
        select: {
          userId: true,
        },
      }),
      prisma.session.findMany({
        where: {
          createdAt: {
            gte: lastWeek,
          },
        },
        distinct: ['userId'],
        select: {
          userId: true,
        },
      }),
    ]);

    const paidSubscriptions = subscriptions.filter((subscription) => normalizePlanKey(subscription.plan) !== 'free');
    const mrr = paidSubscriptions.reduce((total, subscription) => {
      return total + getPlanConfig(subscription.plan).monthlyPrice;
    }, 0);
    const activatedUsers = ownerMembershipsWithActivation.length;
    const paidUsers = ownerMembershipsWithPaidPlan.length;
    const visitors = visitorSessions.length;
    const dau = Math.max(dauEvents.length, dauSessions.length);
    const wau = Math.max(wauEvents.length, wauSessions.length);

    return {
      funnel: {
        visitors,
        signups,
        activatedUsers,
        activationRate: signups ? roundPercentage((activatedUsers / signups) * 100) : 0,
        paidUsers,
        conversionRate: signups ? roundPercentage((paidUsers / signups) * 100) : 0,
        mrr,
      },
      product: {
        totalProjects,
        totalApiCalls,
        apiCalls7d,
        requestsPerUser: signups ? roundPercentage(totalApiCalls / signups) : 0,
        dau,
        wau,
        churnRiskProjects,
      },
      timeline: {
        signups: buildDailySeries(recentUsers, 8),
        projects: buildDailySeries(recentProjects, 8),
        apiCalls: buildDailySeries(recentApiCalls, 8),
      },
    };
  },

  async getOnboarding(userId: string) {
    const [user, primaryProject] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
        },
      }),
      prisma.project.findFirst({
        where: {
          memberships: {
            some: {
              userId,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          subscription: {
            select: {
              plan: true,
              status: true,
              requestsLimit: true,
              requestsUsed: true,
              rateLimitPerMinute: true,
            },
          },
          apiKeys: {
            select: {
              id: true,
              name: true,
              key: true,
              createdAt: true,
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: 3,
          },
          requestLogs: {
            select: {
              id: true,
              path: true,
              status: true,
              createdAt: true,
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: 3,
          },
          _count: {
            select: {
              apiKeys: true,
              requestLogs: true,
            },
          },
        },
      }),
    ]);

    if (!user) {
      return null;
    }

    const requestUsage = primaryProject?.subscription
      ? roundPercentage((primaryProject.subscription.requestsUsed / Math.max(primaryProject.subscription.requestsLimit, 1)) * 100)
      : 0;

    return {
      user,
      activation: {
        accountCreated: true,
        projectCreated: Boolean(primaryProject),
        apiKeyReady: (primaryProject?._count.apiKeys ?? 0) > 0,
        apiCalled: (primaryProject?._count.requestLogs ?? 0) > 0,
        activated: (primaryProject?._count.apiKeys ?? 0) > 0 && (primaryProject?._count.requestLogs ?? 0) > 0,
      },
      quickstart: {
        endpointPath: '/public/data',
        apiKeyHeader: 'x-api-key',
        valuePromise: 'You are 30 seconds away from your first API.',
      },
      primaryProject: primaryProject
        ? {
            id: primaryProject.id,
            name: primaryProject.name,
            slug: primaryProject.slug,
            createdAt: primaryProject.createdAt,
            requestUsage,
            apiKeysCount: primaryProject._count.apiKeys,
            requestCount: primaryProject._count.requestLogs,
            recentApiKeys: primaryProject.apiKeys.map(({ key, ...apiKey }) => ({
              ...apiKey,
              maskedKey: key.length > 12 ? `${key.slice(0, 8)}...${key.slice(-4)}` : key,
            })),
            recentRequests: primaryProject.requestLogs,
            subscription: primaryProject.subscription
              ? {
                  ...primaryProject.subscription,
                  plan: normalizePlanKey(primaryProject.subscription.plan),
                }
              : null,
          }
        : null,
    };
  },
};
