import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    apiKey?: string;
    cacheKey?: string;
    projectId?: string;
    requestStartTime?: bigint;
    userId?: string;
    project?: {
      id: string;
      name: string;
      slug: string;
      subscription?: {
        id: string;
        plan: string;
        status: string;
        requestsLimit: number;
        requestsUsed: number;
        rateLimitPerMinute: number;
        stripeCustomerId: string | null;
        stripeSubscriptionId: string | null;
        stripePriceId: string | null;
        currentPeriodStart: Date | null;
        currentPeriodEnd: Date | null;
        cancelAtPeriodEnd: boolean;
      } | null;
    };
    tenant?: {
      userId: string;
      projectId: string;
      role: string;
    };
  }
}
