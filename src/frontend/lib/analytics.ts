export interface GrowthSummaryInput {
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
    activeProjects?: number;
    totalApiCalls: number;
    apiCalls7d: number;
    requestsPerUser: number;
    requestsPerProject?: number;
    dau: number;
    wau: number;
    churnRiskProjects: number;
  };
}

export interface GrowthInsight {
  id: string;
  status: 'good' | 'warning' | 'critical';
  title: string;
  message: string;
  metricLabel: string;
  metricValue: string;
  action: string;
}

export interface HighlightMetric {
  label: string;
  value: string;
  tone: 'good' | 'warning' | 'critical';
  description: string;
}

export function buildGrowthInsights(summary: GrowthSummaryInput): GrowthInsight[] {
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
      message: 'Activation rate is high but conversion is 0%. Users are reaching value, then running into an unclear billing step.',
      metricLabel: 'Conversion rate',
      metricValue: `${summary.funnel.conversionRate}%`,
      action: 'Add an upgrade CTA right after the first successful API request and again near quota usage.',
    });
  }

  if (summary.product.dau >= Math.max(6, Math.round(summary.funnel.signups * 0.15)) && projectCoverage < 0.8) {
    insights.push({
      id: 'project-creation-gap',
      status: 'warning',
      title: 'Users are returning without building',
      message: 'Users are active but not creating projects at the same rate. The workspace probably needs a stronger project-first CTA or starter template.',
      metricLabel: 'Projects per activated user',
      metricValue: projectCoverage.toFixed(1),
      action: 'Promote starter project creation in onboarding and shorten the blank-state path.',
    });
  }

  if (summary.product.requestsPerUser >= 30) {
    insights.push({
      id: 'engagement-signal',
      status: 'good',
      title: 'Request volume shows real engagement',
      message: 'High requests per user usually means teams have integrated the API into a working loop instead of just exploring.',
      metricLabel: 'Requests per user',
      metricValue: summary.product.requestsPerUser.toLocaleString(),
      action: 'Lean into this with usage-based upgrade messaging and customer proof points.',
    });
  }

  if (churnRiskRatio >= 0.35) {
    insights.push({
      id: 'retention-risk',
      status: 'critical',
      title: 'Retention risk needs attention',
      message: 'A large share of projects are trending toward churn. That often signals weak habit loops after initial setup.',
      metricLabel: 'Churn-risk projects',
      metricValue: `${summary.product.churnRiskProjects}/${summary.product.totalProjects}`,
      action: 'Trigger lifecycle nudges when request volume drops or when no project changes happen after signup.',
    });
  }

  if (!insights.length) {
    insights.push({
      id: 'healthy-momentum',
      status: 'good',
      title: 'The funnel has healthy momentum',
      message: 'Activation, project creation, and request usage are moving together, which usually means the core product loop is understandable.',
      metricLabel: 'Activated users',
      metricValue: summary.funnel.activatedUsers.toLocaleString(),
      action: 'Keep the same onboarding path and focus on monetization copy experiments next.',
    });
  }

  return insights;
}

export function buildHighlightedMetric(summary: GrowthSummaryInput, insights: GrowthInsight[]): HighlightMetric {
  const topInsight = insights[0];

  if (topInsight?.id === 'billing-cta-gap') {
    return {
      label: 'Conversion needs attention',
      value: `${summary.funnel.conversionRate}%`,
      tone: 'critical',
      description: 'Users are activating, but the monetization moment is not landing yet.',
    };
  }

  if (topInsight?.id === 'project-creation-gap') {
    return {
      label: 'Project creation leverage',
      value: summary.product.totalProjects.toLocaleString(),
      tone: 'warning',
      description: 'This is the clearest next step to improve product stickiness.',
    };
  }

  if (summary.product.requestsPerUser >= 30) {
    return {
      label: 'North-star engagement',
      value: summary.product.requestsPerUser.toLocaleString(),
      tone: 'good',
      description: 'Request frequency is strong and is the best proof users are integrating Backforge.',
    };
  }

  return {
    label: 'Activation rate',
    value: `${summary.funnel.activationRate}%`,
    tone: topInsight?.status ?? 'good',
    description: 'This is the first metric to improve when signups are not reaching product value fast enough.',
  };
}
