import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  TrendingUp,
  UsersRound,
  Wallet,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { api } from '../../../lib/api';
import {
  buildGrowthInsights,
  buildHighlightedMetric,
  type GrowthSummaryInput,
} from '../../../lib/analytics';

interface DailySeriesPoint {
  day: string;
  count: number;
}

interface GrowthSummary extends GrowthSummaryInput {
  timeline: {
    signups: DailySeriesPoint[];
    projects: DailySeriesPoint[];
    apiCalls: DailySeriesPoint[];
  };
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function renderSeriesMax(series: DailySeriesPoint[]) {
  return Math.max(...series.map((point) => point.count), 1);
}

function getStatusPresentation(status: 'good' | 'warning' | 'critical') {
  if (status === 'critical') {
    return {
      badge: 'border-rose-500/30 bg-rose-500/10 text-rose-100',
      card: 'border-rose-500/18 bg-rose-500/6',
      icon: AlertTriangle,
      label: 'Critical',
    };
  }

  if (status === 'warning') {
    return {
      badge: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
      card: 'border-amber-500/18 bg-amber-500/6',
      icon: AlertTriangle,
      label: 'Warning',
    };
  }

  return {
    badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
    card: 'border-emerald-500/18 bg-emerald-500/6',
    icon: CheckCircle2,
    label: 'Good',
  };
}

function MiniSeries({
  label,
  series,
  toneClassName,
}: {
  label: string;
  series: DailySeriesPoint[];
  toneClassName: string;
}) {
  const max = renderSeriesMax(series);

  return (
    <div className="rounded-[1.5rem] border border-white/8 bg-white/5 p-4">
      <div className="text-sm font-medium">{label}</div>
      <div className="mt-4 flex h-32 items-end gap-2">
        {series.map((point) => (
          <div key={point.day} className="flex flex-1 flex-col items-center gap-2">
            <div
              className={`w-full rounded-t-xl ${toneClassName}`}
              style={{ height: `${Math.max((point.count / max) * 100, point.count > 0 ? 8 : 0)}%` }}
            />
            <div className="text-[11px] text-muted-foreground">{point.day.slice(5)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AnalyticsPage() {
  const summaryQuery = useQuery<GrowthSummary>({
    queryKey: ['analytics'],
    queryFn: async () => {
      const response = await api.get('/analytics');
      return response.data;
    },
  });

  if (summaryQuery.isLoading) {
    return <div>Loading growth analytics...</div>;
  }

  const summary = summaryQuery.data;

  if (!summary) {
    return <div>Growth analytics unavailable.</div>;
  }

  const insights = buildGrowthInsights(summary);
  const highlightedMetric = buildHighlightedMetric(summary, insights);
  const highlightedMetricPresentation = getStatusPresentation(highlightedMetric.tone);

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.14),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.18),_transparent_36%),linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.94))] p-8 shadow-[0_28px_70px_rgba(15,23,42,0.14)]">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_360px]">
          <div className="space-y-4">
            <div className="inline-flex items-center rounded-full border border-border/80 bg-background/85 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Growth Intelligence
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance">
              The dashboard now tells you where growth is healthy, risky, and monetization-ready.
            </h1>
            <p className="text-base leading-7 text-muted-foreground">
              Metrics are still here, but they now resolve into product decisions: where onboarding leaks, where engagement is strong, and which lever is worth fixing first.
            </p>
          </div>

          <Card className={`${highlightedMetricPresentation.card} overflow-hidden`}>
            <CardHeader>
              <CardDescription>Most important metric right now</CardDescription>
              <CardTitle className="text-xl">{highlightedMetric.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-5xl font-semibold tracking-tight">{highlightedMetric.value}</div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{highlightedMetric.description}</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader>
            <CardDescription>Visitors tracked</CardDescription>
            <CardTitle>{summary.funnel.visitors.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Signups</CardDescription>
            <CardTitle>{summary.funnel.signups.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Activation rate</CardDescription>
            <CardTitle>{summary.funnel.activationRate}%</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Conversion rate</CardDescription>
            <CardTitle>{summary.funnel.conversionRate}%</CardTitle>
          </CardHeader>
        </Card>
        <Card className={`${highlightedMetricPresentation.card}`}>
          <CardHeader>
            <CardDescription>Highlighted metric</CardDescription>
            <CardTitle>{highlightedMetric.value}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {insights.map((insight) => {
          const presentation = getStatusPresentation(insight.status);
          const StatusIcon = presentation.icon;

          return (
            <Card key={insight.id} className={`${presentation.card}`}>
              <CardHeader className="space-y-3">
                <div className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${presentation.badge}`}>
                  <StatusIcon className="h-4 w-4" />
                  {presentation.label}
                </div>
                <div>
                  <CardTitle className="text-xl">{insight.title}</CardTitle>
                  <CardDescription className="mt-2">{insight.message}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-[1.25rem] border border-white/8 bg-white/5 px-4 py-4">
                  <div className="text-sm text-muted-foreground">{insight.metricLabel}</div>
                  <div className="mt-2 text-3xl font-semibold">{insight.metricValue}</div>
                </div>
                <div className="rounded-[1.25rem] border border-white/8 bg-white/5 px-4 py-4 text-sm text-muted-foreground">
                  {insight.action}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Funnel health
            </CardTitle>
            <CardDescription>The base SaaS journey from visitor to paid is visible, with enough context to act on it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[1.5rem] border border-white/8 bg-white/5 p-4">
                <div className="text-sm text-muted-foreground">Tracked visitors</div>
                <div className="mt-2 text-3xl font-semibold">{summary.funnel.visitors.toLocaleString()}</div>
              </div>
              <div className="rounded-[1.5rem] border border-white/8 bg-white/5 p-4">
                <div className="text-sm text-muted-foreground">Activated users</div>
                <div className="mt-2 text-3xl font-semibold">{summary.funnel.activatedUsers.toLocaleString()}</div>
              </div>
              <div className="rounded-[1.5rem] border border-white/8 bg-white/5 p-4">
                <div className="text-sm text-muted-foreground">Paid users</div>
                <div className="mt-2 text-3xl font-semibold">{summary.funnel.paidUsers.toLocaleString()}</div>
              </div>
              <div className="rounded-[1.5rem] border border-white/8 bg-white/5 p-4">
                <div className="text-sm text-muted-foreground">MRR</div>
                <div className="mt-2 text-3xl font-semibold">{formatCurrency(summary.funnel.mrr)}</div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <MiniSeries label="Signups" series={summary.timeline.signups} toneClassName="bg-emerald-500/80" />
              <MiniSeries label="Projects created" series={summary.timeline.projects} toneClassName="bg-sky-500/80" />
              <MiniSeries label="API calls" series={summary.timeline.apiCalls} toneClassName="bg-amber-500/80" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Operating metrics
            </CardTitle>
            <CardDescription>Signals that tell us whether retention and monetization are improving.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-[1.5rem] border border-white/8 bg-white/5 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <UsersRound className="h-4 w-4 text-primary" />
                Active users
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-[1.2rem] border border-white/8 bg-black/10 p-4">
                  <div className="text-sm text-muted-foreground">DAU</div>
                  <div className="mt-2 text-3xl font-semibold">{summary.product.dau}</div>
                </div>
                <div className="rounded-[1.2rem] border border-white/8 bg-black/10 p-4">
                  <div className="text-sm text-muted-foreground">WAU</div>
                  <div className="mt-2 text-3xl font-semibold">{summary.product.wau}</div>
                </div>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/8 bg-white/5 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Activity className="h-4 w-4 text-primary" />
                Product usage
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-[1.2rem] border border-white/8 bg-black/10 p-4">
                  <div className="text-sm text-muted-foreground">Total API calls</div>
                  <div className="mt-2 text-3xl font-semibold">{summary.product.totalApiCalls.toLocaleString()}</div>
                </div>
                <div className="rounded-[1.2rem] border border-white/8 bg-black/10 p-4">
                  <div className="text-sm text-muted-foreground">Last 7 days</div>
                  <div className="mt-2 text-3xl font-semibold">{summary.product.apiCalls7d.toLocaleString()}</div>
                </div>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/8 bg-white/5 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Wallet className="h-4 w-4 text-primary" />
                Revenue risk
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-[1.2rem] border border-white/8 bg-black/10 p-4">
                  <div className="text-sm text-muted-foreground">Total projects</div>
                  <div className="mt-2 text-3xl font-semibold">{summary.product.totalProjects.toLocaleString()}</div>
                </div>
                <div className="rounded-[1.2rem] border border-white/8 bg-black/10 p-4">
                  <div className="text-sm text-muted-foreground">Churn-risk projects</div>
                  <div className="mt-2 text-3xl font-semibold">{summary.product.churnRiskProjects.toLocaleString()}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
