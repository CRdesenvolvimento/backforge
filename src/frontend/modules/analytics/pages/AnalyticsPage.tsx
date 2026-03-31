import { useQuery } from '@tanstack/react-query';
import { Activity, BarChart3, TrendingUp, UsersRound, Wallet } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { api } from '../../../lib/api';

interface DailySeriesPoint {
  day: string;
  count: number;
}

interface GrowthSummary {
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
    totalApiCalls: number;
    apiCalls7d: number;
    requestsPerUser: number;
    dau: number;
    wau: number;
    churnRiskProjects: number;
  };
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
    <div className="rounded-2xl border bg-background/70 p-4">
      <div className="text-sm font-medium">{label}</div>
      <div className="mt-4 flex h-32 items-end gap-2">
        {series.map((point) => (
          <div key={point.day} className="flex flex-1 flex-col items-center gap-2">
            <div
              className={`w-full rounded-t-lg ${toneClassName}`}
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
    queryKey: ['growth-summary'],
    queryFn: async () => {
      const response = await api.get('/growth/summary');
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

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.12),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.16),_transparent_36%),linear-gradient(135deg,_rgba(255,255,255,1),_rgba(248,250,252,0.96))] p-8 shadow-sm">
        <div className="max-w-3xl space-y-4">
          <div className="inline-flex items-center rounded-full border border-border/80 bg-background/85 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Growth Dashboard
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-balance">Growth stops being opinion when the funnel is visible every day.</h1>
          <p className="text-base leading-7 text-muted-foreground">
            This view now tracks the core SaaS loop for BACKFORGE: visits, signups, activation, paid conversion, revenue signal, and product usage.
          </p>
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
        <Card>
          <CardHeader>
            <CardDescription>MRR</CardDescription>
            <CardTitle>{formatCurrency(summary.funnel.mrr)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Funnel health
            </CardTitle>
            <CardDescription>The base SaaS journey from visitor to paid is now visible in-product.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border bg-background/70 p-4">
                <div className="text-sm text-muted-foreground">Tracked visitors</div>
                <div className="mt-2 text-3xl font-semibold">{summary.funnel.visitors.toLocaleString()}</div>
              </div>
              <div className="rounded-2xl border bg-background/70 p-4">
                <div className="text-sm text-muted-foreground">Activated users</div>
                <div className="mt-2 text-3xl font-semibold">{summary.funnel.activatedUsers.toLocaleString()}</div>
              </div>
              <div className="rounded-2xl border bg-background/70 p-4">
                <div className="text-sm text-muted-foreground">Paid users</div>
                <div className="mt-2 text-3xl font-semibold">{summary.funnel.paidUsers.toLocaleString()}</div>
              </div>
              <div className="rounded-2xl border bg-background/70 p-4">
                <div className="text-sm text-muted-foreground">Requests per user</div>
                <div className="mt-2 text-3xl font-semibold">{summary.product.requestsPerUser}</div>
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
            <div className="rounded-2xl border bg-background/70 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <UsersRound className="h-4 w-4 text-primary" />
                Active users
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border bg-background p-4">
                  <div className="text-sm text-muted-foreground">DAU</div>
                  <div className="mt-2 text-3xl font-semibold">{summary.product.dau}</div>
                </div>
                <div className="rounded-xl border bg-background p-4">
                  <div className="text-sm text-muted-foreground">WAU</div>
                  <div className="mt-2 text-3xl font-semibold">{summary.product.wau}</div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-background/70 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Activity className="h-4 w-4 text-primary" />
                Product usage
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border bg-background p-4">
                  <div className="text-sm text-muted-foreground">Total API calls</div>
                  <div className="mt-2 text-3xl font-semibold">{summary.product.totalApiCalls.toLocaleString()}</div>
                </div>
                <div className="rounded-xl border bg-background p-4">
                  <div className="text-sm text-muted-foreground">Last 7 days</div>
                  <div className="mt-2 text-3xl font-semibold">{summary.product.apiCalls7d.toLocaleString()}</div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-background/70 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Wallet className="h-4 w-4 text-primary" />
                Revenue risk
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border bg-background p-4">
                  <div className="text-sm text-muted-foreground">Total projects</div>
                  <div className="mt-2 text-3xl font-semibold">{summary.product.totalProjects.toLocaleString()}</div>
                </div>
                <div className="rounded-xl border bg-background p-4">
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
