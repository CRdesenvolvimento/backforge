import Stripe from 'stripe';
import { platformEvents } from '../../events/catalog.js';
import { emitEvent } from '../../events/eventBus.js';
import { growthEventNames, trackGrowthEvent } from '../../shared/growth.js';
import { prisma } from '../../shared/prisma.js';
import { getNextBillingPeriodEnd, getNextBillingPeriodStart, getPaidPlanPriceId, getPlanConfig, normalizePlanKey, findPlanKeyByPriceId } from '../../config/plans.js';

const BILLING_WRITE_ROLES = ['OWNER', 'ADMIN'] as const;

let stripeClient: Stripe | null = null;

function hasCheckoutConfigured(planKey: 'basic' | 'pro') {
  const plan = getPlanConfig(planKey);
  return Boolean(process.env.STRIPE_SECRET_KEY && plan.priceEnv && process.env[plan.priceEnv]);
}

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error('Stripe is not configured');
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }

  return stripeClient;
}

function getAppUrl() {
  return process.env.APP_URL || 'http://localhost:3000';
}

function subscriptionPeriodFromUnix(start?: number | null, end?: number | null) {
  return {
    currentPeriodStart: start ? new Date(start * 1000) : getNextBillingPeriodStart(),
    currentPeriodEnd: end ? new Date(end * 1000) : getNextBillingPeriodEnd(),
  };
}

async function getManagedProject(userId: string, projectId: string) {
  return prisma.project.findFirst({
    where: {
      id: projectId,
      memberships: {
        some: {
          userId,
          role: {
            in: [...BILLING_WRITE_ROLES],
          },
        },
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      subscription: true,
      memberships: {
        where: {
          userId,
        },
        select: {
          role: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
        take: 1,
      },
    },
  });
}

async function ensureStripeCustomer(project: NonNullable<Awaited<ReturnType<typeof getManagedProject>>>) {
  if (project.subscription?.stripeCustomerId) {
    return project.subscription.stripeCustomerId;
  }

  const owner = project.memberships[0]?.user;

  if (!owner) {
    throw new Error('Billing user not found for this project');
  }

  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    email: owner.email,
    name: owner.name ?? project.name,
    metadata: {
      projectId: project.id,
      billingUserId: owner.id,
    },
  });

  await prisma.subscription.upsert({
    where: { projectId: project.id },
    create: {
      projectId: project.id,
      billingUserId: owner.id,
      stripeCustomerId: customer.id,
      plan: 'free',
      status: 'active',
      requestsLimit: getPlanConfig('free').requests,
      rateLimitPerMinute: getPlanConfig('free').rateLimitPerMinute,
      currentPeriodStart: getNextBillingPeriodStart(),
      currentPeriodEnd: getNextBillingPeriodEnd(),
    },
    update: {
      billingUserId: owner.id,
      stripeCustomerId: customer.id,
    },
  });

  return customer.id;
}

async function updateSubscriptionFromStripeSubscription(projectId: string, stripeSubscription: Stripe.Subscription, billingUserId?: string | null) {
  const priceId = stripeSubscription.items.data[0]?.price?.id ?? null;
  const planKey = normalizePlanKey(stripeSubscription.metadata?.plan ?? findPlanKeyByPriceId(priceId));
  const planConfig = getPlanConfig(planKey);
  const period = subscriptionPeriodFromUnix(
    (stripeSubscription as any).current_period_start ?? null,
    (stripeSubscription as any).current_period_end ?? null
  );

  const existingSubscription = await prisma.subscription.findUnique({
    where: { projectId },
    select: {
      id: true,
      currentPeriodStart: true,
    },
  });

  const shouldResetUsage = !existingSubscription?.currentPeriodStart
    || existingSubscription.currentPeriodStart.getTime() !== period.currentPeriodStart.getTime();

  await prisma.subscription.upsert({
    where: { projectId },
    create: {
      projectId,
      billingUserId: billingUserId ?? undefined,
      stripeCustomerId: typeof stripeSubscription.customer === 'string' ? stripeSubscription.customer : stripeSubscription.customer?.id,
      stripeSubscriptionId: stripeSubscription.id,
      stripePriceId: priceId,
      plan: planKey,
      status: stripeSubscription.status,
      requestsLimit: planConfig.requests,
      rateLimitPerMinute: planConfig.rateLimitPerMinute,
      requestsUsed: 0,
      currentPeriodStart: period.currentPeriodStart,
      currentPeriodEnd: period.currentPeriodEnd,
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
    },
    update: {
      billingUserId: billingUserId ?? undefined,
      stripeCustomerId: typeof stripeSubscription.customer === 'string' ? stripeSubscription.customer : stripeSubscription.customer?.id,
      stripeSubscriptionId: stripeSubscription.id,
      stripePriceId: priceId,
      plan: planKey,
      status: stripeSubscription.status,
      requestsLimit: planConfig.requests,
      rateLimitPerMinute: planConfig.rateLimitPerMinute,
      currentPeriodStart: period.currentPeriodStart,
      currentPeriodEnd: period.currentPeriodEnd,
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      ...(shouldResetUsage ? { requestsUsed: 0 } : {}),
    },
  });
}

async function fallbackToFreePlan(projectId: string, billingUserId?: string | null, stripeCustomerId?: string | null) {
  const freePlan = getPlanConfig('free');

  await prisma.subscription.upsert({
    where: { projectId },
    create: {
      projectId,
      billingUserId: billingUserId ?? undefined,
      stripeCustomerId: stripeCustomerId ?? undefined,
      plan: 'free',
      status: 'canceled',
      requestsLimit: freePlan.requests,
      rateLimitPerMinute: freePlan.rateLimitPerMinute,
      requestsUsed: 0,
      currentPeriodStart: getNextBillingPeriodStart(),
      currentPeriodEnd: getNextBillingPeriodEnd(),
      cancelAtPeriodEnd: false,
    },
    update: {
      billingUserId: billingUserId ?? undefined,
      stripeCustomerId: stripeCustomerId ?? undefined,
      stripeSubscriptionId: null,
      stripePriceId: null,
      plan: 'free',
      status: 'canceled',
      requestsLimit: freePlan.requests,
      rateLimitPerMinute: freePlan.rateLimitPerMinute,
      requestsUsed: 0,
      currentPeriodStart: getNextBillingPeriodStart(),
      currentPeriodEnd: getNextBillingPeriodEnd(),
      cancelAtPeriodEnd: false,
    },
  });
}

async function processCheckoutCompleted(session: Stripe.Checkout.Session) {
  const projectId = session.metadata?.projectId;
  const billingUserId = session.metadata?.billingUserId ?? session.client_reference_id ?? null;
  const stripeSubscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;

  if (!projectId || !stripeSubscriptionId) {
    return;
  }

  const stripe = getStripeClient();
  const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  await updateSubscriptionFromStripeSubscription(projectId, stripeSubscription, billingUserId);
}

async function processStripeSubscriptionUpdated(stripeSubscription: Stripe.Subscription) {
  const projectId = stripeSubscription.metadata?.projectId
    ?? (await prisma.subscription.findFirst({
      where: {
        OR: [
          { stripeSubscriptionId: stripeSubscription.id },
          {
            stripeCustomerId: typeof stripeSubscription.customer === 'string'
              ? stripeSubscription.customer
              : stripeSubscription.customer?.id,
          },
        ],
      },
      select: {
        projectId: true,
        billingUserId: true,
      },
    }))?.projectId;

  if (!projectId) {
    return;
  }

  const billingUserId = stripeSubscription.metadata?.billingUserId
    ?? (await prisma.subscription.findUnique({
      where: { projectId },
      select: { billingUserId: true },
    }))?.billingUserId
    ?? null;

  await updateSubscriptionFromStripeSubscription(projectId, stripeSubscription, billingUserId);
}

async function processStripeSubscriptionDeleted(stripeSubscription: Stripe.Subscription) {
  const existingSubscription = await prisma.subscription.findFirst({
    where: {
      OR: [
        { stripeSubscriptionId: stripeSubscription.id },
        {
          stripeCustomerId: typeof stripeSubscription.customer === 'string'
            ? stripeSubscription.customer
            : stripeSubscription.customer?.id,
        },
      ],
    },
    select: {
      projectId: true,
      billingUserId: true,
      stripeCustomerId: true,
    },
  });

  if (!existingSubscription) {
    return;
  }

  await fallbackToFreePlan(
    existingSubscription.projectId,
    existingSubscription.billingUserId,
    existingSubscription.stripeCustomerId
  );
}

export const billingService = {
  getPlans() {
    return [getPlanConfig('free'), getPlanConfig('basic'), getPlanConfig('pro')].map((plan) => ({
      key: plan.key,
      label: plan.label,
      requests: plan.requests,
      rateLimitPerMinute: plan.rateLimitPerMinute,
      monthlyPrice: plan.monthlyPrice,
      hasCheckout: plan.key === 'free' ? false : hasCheckoutConfigured(plan.key),
    }));
  },

  async createCheckoutSession(userId: string, projectId: string, requestedPlan: string) {
    const planKey = normalizePlanKey(requestedPlan);

    if (planKey === 'free') {
      throw new Error('Free plan does not require checkout');
    }

    const project = await getManagedProject(userId, projectId);

  if (!project) {
    throw new Error('Project not found');
  }

  const priceId = getPaidPlanPriceId(planKey);
  if (!priceId) {
    throw new Error('Stripe price is not configured for this plan');
  }

  const customerId = await ensureStripeCustomer(project);
  const user = project.memberships[0]?.user;

    if (!user) {
      throw new Error('Billing user not found');
    }

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId ?? undefined,
      customer_email: customerId ? undefined : user.email,
      client_reference_id: user.id,
      success_url: `${getAppUrl()}/billing/success?session_id={CHECKOUT_SESSION_ID}&project_id=${project.id}`,
      cancel_url: `${getAppUrl()}/billing/cancel?project_id=${project.id}`,
      allow_promotion_codes: true,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        projectId: project.id,
        plan: planKey,
        billingUserId: user.id,
      },
      subscription_data: {
        metadata: {
          projectId: project.id,
          plan: planKey,
          billingUserId: user.id,
        },
      },
    });

    await prisma.subscription.updateMany({
      where: { projectId: project.id },
      data: {
        billingUserId: user.id,
        stripeCustomerId: customerId,
        stripePriceId: priceId,
      },
    });

    await trackGrowthEvent({
      name: growthEventNames.checkoutStarted,
      userId,
      projectId: project.id,
      metadata: {
        plan: planKey,
        projectSlug: project.slug,
      },
    });

    return session;
  },

  async createPortalSession(userId: string, projectId: string) {
    const project = await getManagedProject(userId, projectId);

    if (!project) {
      throw new Error('Project not found');
    }

    if (!project.subscription?.stripeCustomerId) {
      throw new Error('Stripe customer not found for this project');
    }

    const stripe = getStripeClient();

    return stripe.billingPortal.sessions.create({
      customer: project.subscription.stripeCustomerId,
      return_url: `${getAppUrl()}/billing`,
    });
  },

  async handleWebhook(rawBody: Buffer, signature: string | string[] | undefined) {
    if (!signature || Array.isArray(signature)) {
      throw new Error('Missing Stripe signature');
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new Error('Stripe webhook secret is not configured');
    }

    const stripe = getStripeClient();
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    const payload = JSON.parse(JSON.stringify(event));

    const existingEvent = await prisma.stripeWebhookEvent.findUnique({
      where: {
        eventId: event.id,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (existingEvent?.status === 'processed') {
      return { received: true, duplicate: true };
    }

    await prisma.stripeWebhookEvent.upsert({
      where: {
        eventId: event.id,
      },
      create: {
        eventId: event.id,
        type: event.type,
        status: 'processing',
        payload,
      },
      update: {
        type: event.type,
        status: 'processing',
        payload,
        attempts: {
          increment: 1,
        },
        lastError: null,
      },
    });

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await processCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
          break;
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await processStripeSubscriptionUpdated(event.data.object as Stripe.Subscription);
          break;
        case 'customer.subscription.deleted':
          await processStripeSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;
        default:
          break;
      }

      await prisma.stripeWebhookEvent.update({
        where: {
          eventId: event.id,
        },
        data: {
          status: 'processed',
          processedAt: new Date(),
          lastError: null,
        },
      });

      await emitEvent(platformEvents.billingWebhookProcessed, {
        eventId: event.id,
        eventType: event.type,
      });

      return { received: true };
    } catch (error) {
      await prisma.stripeWebhookEvent.update({
        where: {
          eventId: event.id,
        },
        data: {
          status: 'failed',
          lastError: error instanceof Error ? error.message : 'Unknown webhook error',
        },
      });

      throw error;
    }
  },
};
