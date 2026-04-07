import { prisma } from '../../shared/prisma.js';
import { logger, serializeError } from '../../shared/logger.js';
import { growthEventNames } from '../../shared/growth.js';
import { getPlanConfig, normalizePlanKey } from '../../config/plans.js';
import { getApiKeyPreview } from '../../shared/api-key.js';

type InsightStatus = 'good' | 'warning' | 'critical';

interface GrowthInsight {
  id: string;
  status: InsightStatus;
  title: string;
  message: string;
  metricLabel: string;
  metricValue: string;
  action: string;
}

interface GrowthSummarySnapshot {
  funnel: {
    visitors: number;
    signups: number;
    activatedUsers: number;
    activationRate: number;
    paidUsers: number;
    conversionRate: number;
    mrr: number;
  };
  product: {
    totalProjects: number;
    activeProjects: number;
    totalApiCalls: number;
    apiCalls7d: number;
    requestsPerUser: number;
    requestsPerProject: number;
    dau: number;
    wau: number;
    churnRiskProjects: number;
  };
  timeline: {
    signups: Array<{ day: string; count: number }>;
    projects: Array<{ day: string; count: number }>;
    apiCalls: Array<{ day: string; count: number }>;
  };
}

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

function buildPlatformInsights(summary: GrowthSummarySnapshot): GrowthInsight[] {
  const insights: GrowthInsight[] = [];
  const projectCoverage = summary.funnel.activatedUsers > 0
    ? summary.product.totalProjects / summary.funnel.activatedUsers
    : 0;
  const churnRiskRatio = summary.product.totalProjects > 0
    ? summary.product.churnRiskProjects / summary.product.totalProjects
    : 0;

  if (summary.funnel.activationRate >= 35 && summary.funnel.conversionRate === 0) {
    insights.push({
      id: 'billing-cta-gap',
      status: 'critical',
      title: 'Activation is strong, but revenue is stalled',
      message: 'Teams are getting to value, but they are not seeing a compelling monetization step after activation.',
      metricLabel: 'Conversion rate',
      metricValue: `${summary.funnel.conversionRate}%`,
      action: 'Place upgrade prompts near the first successful API request and near quota usage.',
    });
  }

  if (summary.product.dau >= Math.max(6, Math.round(summary.funnel.signups * 0.15)) && projectCoverage < 0.8) {
    insights.push({
      id: 'project-creation-gap',
      status: 'warning',
      title: 'Users are active but not building enough',
      message: 'Daily activity is healthy, but project creation is lagging behind activation and likely slowing retention.',
      metricLabel: 'Projects per activated user',
      metricValue: projectCoverage.toFixed(1),
      action: 'Tighten the project creation CTA and pre-seed more starter templates in onboarding.',
    });
  }

  if (summary.product.requestsPerUser >= 30) {
    insights.push({
      id: 'engagement-signal',
      status: 'good',
      title: 'Request volume shows strong product pull',
      message: 'High requests per user usually means customers have moved beyond testing and into repeat usage.',
      metricLabel: 'Requests per user',
      metricValue: summary.product.requestsPerUser.toLocaleString(),
      action: 'Use this as a monetization lever with usage-based pricing copy and case studies.',
    });
  }

  if (churnRiskRatio >= 0.35) {
    insights.push({
      id: 'retention-risk',
      status: 'critical',
      title: 'A large share of projects look at risk',
      message: 'Too many projects have dropped below a healthy request rhythm, which usually points to weak habit loops.',
      metricLabel: 'Churn-risk projects',
      metricValue: `${summary.product.churnRiskProjects}/${summary.product.totalProjects}`,
      action: 'Trigger lifecycle nudges when request volume drops or after a quiet period following setup.',
    });
  }

  if (!insights.length) {
    insights.push({
      id: 'healthy-momentum',
      status: 'good',
      title: 'The platform-level funnel looks healthy',
      message: 'Activation, project creation, and API activity are moving together in a way that suggests the core loop is clear.',
      metricLabel: 'Activated users',
      metricValue: summary.funnel.activatedUsers.toLocaleString(),
      action: 'Keep onboarding stable and experiment with pricing and upgrade timing next.',
    });
  }

  return insights;
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
      activeProjects,
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
      prisma.project.count({
        where: {
          requestLogs: {
            some: {
              createdAt: {
                gte: lastWeek,
              },
            },
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

    const summary: GrowthSummarySnapshot = {
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
        activeProjects,
        totalApiCalls,
        apiCalls7d,
        requestsPerUser: signups ? roundPercentage(totalApiCalls / signups) : 0,
        requestsPerProject: totalProjects ? roundPercentage(totalApiCalls / totalProjects) : 0,
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

    return {
      ...summary,
      insights: buildPlatformInsights(summary),
    };
  },

  async buildInsights(projectId: string): Promise<GrowthInsight[]> {
    const now = new Date();
    const lastDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [project, totalRows, requests24h, requests7d, rateLimited7d, serverErrors7d] = await Promise.all([
      prisma.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          name: true,
          subscription: {
            select: {
              plan: true,
              requestsLimit: true,
              requestsUsed: true,
              rateLimitPerMinute: true,
            },
          },
          _count: {
            select: {
              apiKeys: true,
              tables: true,
              requestLogs: true,
            },
          },
          tables: {
            select: {
              id: true,
              name: true,
              _count: {
                select: {
                  rows: true,
                },
              },
            },
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
      }),
      prisma.databaseRow.count({
        where: {
          table: {
            projectId,
          },
        },
      }),
      prisma.requestLog.count({
        where: {
          projectId,
          createdAt: {
            gte: lastDay,
          },
        },
      }),
      prisma.requestLog.count({
        where: {
          projectId,
          createdAt: {
            gte: lastWeek,
          },
        },
      }),
      prisma.requestLog.count({
        where: {
          projectId,
          status: 429,
          createdAt: {
            gte: lastWeek,
          },
        },
      }),
      prisma.requestLog.count({
        where: {
          projectId,
          status: {
            gte: 500,
          },
          createdAt: {
            gte: lastWeek,
          },
        },
      }),
    ]);

    if (!project) {
      return [];
    }

    const emptyTables = project.tables.filter((table) => table._count.rows === 0).length;
    const quotaUsage = project.subscription
      ? roundPercentage((project.subscription.requestsUsed / Math.max(project.subscription.requestsLimit, 1)) * 100)
      : 0;
    const rateLimitedRatio = requests7d > 0 ? roundPercentage((rateLimited7d / requests7d) * 100) : 0;
    const insights: GrowthInsight[] = [];

    if (project._count.apiKeys > 0 && project._count.requestLogs === 0) {
      insights.push({
        id: 'activation-gap',
        status: 'critical',
        title: 'Keys exist, but the project has not seen live traffic',
        message: 'Developers have crossed the setup line, but they have not reached the first successful request yet.',
        metricLabel: 'Requests recorded',
        metricValue: project._count.requestLogs.toLocaleString(),
        action: 'Move the API test console and a copy-ready example closer to the key creation moment.',
      });
    }

    if (requests24h >= 25) {
      insights.push({
        id: 'strong-daily-usage',
        status: 'good',
        title: 'Daily traffic is showing strong engagement',
        message: 'The project is seeing enough daily request volume to suggest it is plugged into a real workflow.',
        metricLabel: 'Requests in 24h',
        metricValue: requests24h.toLocaleString(),
        action: 'Use this moment to surface upgrade messaging or collaboration features while intent is high.',
      });
    }

    if (emptyTables > 0) {
      insights.push({
        id: 'empty-data-models',
        status: emptyTables === project._count.tables ? 'critical' : 'warning',
        title: 'Part of the data model is still empty',
        message: 'Projects retain better when the first table receives data quickly after it is created.',
        metricLabel: 'Tables without rows',
        metricValue: `${emptyTables}/${project._count.tables}`,
        action: 'Offer starter inserts or import flows immediately after table creation.',
      });
    }

    if (rateLimitedRatio >= 5) {
      insights.push({
        id: 'rate-limit-pressure',
        status: rateLimitedRatio >= 15 ? 'critical' : 'warning',
        title: 'Rate limiting is starting to interfere with usage',
        message: 'A meaningful portion of recent requests are being rejected with 429s, which can block activation and create support load.',
        metricLabel: '429 rate (7d)',
        metricValue: `${rateLimitedRatio}%`,
        action: 'Review the current per-key limit, surface guidance in the dashboard, and consider an upgrade CTA near the threshold.',
      });
    }

    if (serverErrors7d > 0) {
      insights.push({
        id: 'server-errors',
        status: serverErrors7d >= 10 ? 'critical' : 'warning',
        title: 'Server-side errors need attention',
        message: 'Unexpected 5xx responses are appearing in the request stream and will undermine trust quickly.',
        metricLabel: '5xx responses (7d)',
        metricValue: serverErrors7d.toLocaleString(),
        action: 'Inspect recent request details, payloads, and affected tables to isolate the failing integration path.',
      });
    }

    if (quotaUsage >= 80) {
      insights.push({
        id: 'quota-pressure',
        status: quotaUsage >= 100 ? 'critical' : 'warning',
        title: 'This project is close to its quota boundary',
        message: 'Usage is approaching the current plan limit, which is a strong monetization signal when paired with healthy traffic.',
        metricLabel: 'Quota used',
        metricValue: `${quotaUsage}%`,
        action: 'Show a proactive upgrade CTA before requests start failing due to quota exhaustion.',
      });
    }

    if (!insights.length) {
      insights.push({
        id: 'stable-project',
        status: 'good',
        title: 'This project looks stable',
        message: 'Traffic, data volume, and plan usage are within a healthy range with no immediate risk signals.',
        metricLabel: 'Stored rows',
        metricValue: totalRows.toLocaleString(),
        action: 'Keep onboarding steady and focus on making billing prompts more contextual.',
      });
    }

    return insights;
  },

  async getAnalyticsForUser(userId: string, projectId?: string) {
    const summary = await this.getSummary();

    if (!projectId) {
      return summary;
    }

    const membership = await prisma.membership.findUnique({
      where: {
        userId_projectId: {
          userId,
          projectId,
        },
      },
      select: {
        id: true,
      },
    });

    if (!membership) {
      return null;
    }

    const projectInsights = await this.buildInsights(projectId);

    return {
      ...summary,
      projectInsights,
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
              keyPreview: true,
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
              method: true,
              status: true,
              latency: true,
              createdAt: true,
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: 3,
          },
          tables: {
            select: {
              name: true,
            },
            orderBy: {
              createdAt: 'asc',
            },
            take: 1,
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
    const quickstartTableName = primaryProject?.tables[0]?.name ?? 'sample_items';

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
        endpointPath: `/public/${quickstartTableName}`,
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
            recentApiKeys: primaryProject.apiKeys.map(({ keyPreview, ...apiKey }) => ({
              ...apiKey,
              maskedKey: getApiKeyPreview({ keyPreview }),
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
