export const plans = {
  free: {
    key: 'free',
    label: 'Free',
    requests: 1000,
    rateLimitPerMinute: 60,
    monthlyPrice: 0,
    priceEnv: null,
  },
  basic: {
    key: 'basic',
    label: 'Basic',
    requests: 10000,
    rateLimitPerMinute: 180,
    monthlyPrice: 9,
    priceEnv: 'STRIPE_PRICE_BASIC',
  },
  pro: {
    key: 'pro',
    label: 'Pro',
    requests: 100000,
    rateLimitPerMinute: 600,
    monthlyPrice: 29,
    priceEnv: 'STRIPE_PRICE_PRO',
  },
} as const;

export type PlanKey = keyof typeof plans;

export function normalizePlanKey(value?: string | null): PlanKey {
  const normalizedValue = value?.toLowerCase() ?? 'free';
  return normalizedValue in plans ? (normalizedValue as PlanKey) : 'free';
}

export function getPlanConfig(plan?: string | null) {
  return plans[normalizePlanKey(plan)];
}

export function getPaidPlanPriceId(plan: PlanKey) {
  const planConfig = plans[plan];

  if (!planConfig.priceEnv) {
    return null;
  }

  const priceId = process.env[planConfig.priceEnv];

  if (!priceId) {
    throw new Error(`Missing ${planConfig.priceEnv} environment variable`);
  }

  return priceId;
}

export function findPlanKeyByPriceId(priceId?: string | null): PlanKey {
  if (!priceId) {
    return 'free';
  }

  const matchedPlan = Object.values(plans).find((plan) => {
    if (!plan.priceEnv) {
      return false;
    }

    return process.env[plan.priceEnv] === priceId;
  });

  return matchedPlan?.key ?? 'free';
}

export function getNextBillingPeriodStart(date = new Date()) {
  return new Date(date);
}

export function getNextBillingPeriodEnd(date = new Date()) {
  const endDate = new Date(date);
  endDate.setMonth(endDate.getMonth() + 1);
  return endDate;
}
