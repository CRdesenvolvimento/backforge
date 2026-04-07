import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  CreditCard,
  KeyRound,
  LoaderCircle,
  PlayCircle,
  Sparkles,
  TerminalSquare,
  Zap,
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { JsonPreview } from '../../../components/ui/json-preview';
import { api } from '../../../lib/api';
import { captureGrowthEvent } from '../../../lib/growth';
import { useAuthStore } from '../../auth/auth.store';

interface OnboardingResponse {
  user: {
    id: string;
    email: string;
    name: string | null;
    createdAt: string;
  };
  activation: {
    accountCreated: boolean;
    projectCreated: boolean;
    apiKeyReady: boolean;
    apiCalled: boolean;
    activated: boolean;
  };
  quickstart: {
    endpointPath: string;
    apiKeyHeader: string;
    valuePromise: string;
  };
  primaryProject: {
    id: string;
    name: string;
    slug: string;
    createdAt: string;
    requestUsage: number;
    apiKeysCount: number;
    requestCount: number;
    recentApiKeys: Array<{
      id: string;
      name: string;
      maskedKey: string;
      createdAt: string;
    }>;
    recentRequests: Array<{
      id: string;
      path: string;
      method: string;
      status: number;
      latency: number;
      createdAt: string;
    }>;
    subscription: {
      plan: string;
      status: string;
      requestsLimit: number;
      requestsUsed: number;
      rateLimitPerMinute: number;
    } | null;
  } | null;
}

interface CreatedApiKey {
  id: string;
  name: string;
  key: string;
  maskedKey: string;
  createdAt: string;
}

interface RequestLogRecord {
  id: string;
  path: string;
  method: string;
  status: number;
  latency: number;
  createdAt: string;
}

interface PaginatedRequestLogs {
  data: RequestLogRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

interface ApiTestResult {
  status: number;
  data: unknown;
  latencyMs: number;
  sourceTable: string | null;
}

function formatApiError(error: any) {
  return error?.response?.data?.message || error?.response?.data?.error || 'Something went wrong.';
}

function getStatusClassName(status: number) {
  if (status >= 500) {
    return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
  }

  if (status >= 400) {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-100';
  }

  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100';
}

function maskSecret(value: string) {
  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

export function OverviewPage() {
  const queryClient = useQueryClient();
  const storedOnboarding = useAuthStore((state) => state.onboarding);
  const setOnboarding = useAuthStore((state) => state.setOnboarding);
  const [feedback, setFeedback] = useState('');
  const [liveApiKey, setLiveApiKey] = useState<string | null>(storedOnboarding?.apiKey ?? null);
  const [showSuccessPulse, setShowSuccessPulse] = useState(false);

  const onboardingQuery = useQuery<OnboardingResponse>({
    queryKey: ['growth-onboarding'],
    queryFn: async () => {
      const response = await api.get('/growth/onboarding');
      return response.data;
    },
  });

  const primaryProject = onboardingQuery.data?.primaryProject;
  const endpointPath = onboardingQuery.data?.quickstart.endpointPath ?? '/public/sample_items';
  const apiKeyHeader = onboardingQuery.data?.quickstart.apiKeyHeader ?? 'x-api-key';
  const endpointUrl = typeof window !== 'undefined' ? `${window.location.origin}${endpointPath}` : endpointPath;

  const logsQuery = useQuery<RequestLogRecord[]>({
    queryKey: ['requests', primaryProject?.id],
    enabled: Boolean(primaryProject?.id),
    queryFn: async () => {
      const response = await api.get<PaginatedRequestLogs>('/requests', {
        params: {
          projectId: primaryProject?.id,
          limit: 10,
        },
      });
      return response.data.data;
    },
  });

  useEffect(() => {
    if (!storedOnboarding?.apiKey || storedOnboarding.project.id !== primaryProject?.id) {
      return;
    }

    setLiveApiKey(storedOnboarding.apiKey);
  }, [storedOnboarding, primaryProject?.id]);

  useEffect(() => {
    if (!showSuccessPulse) {
      return;
    }

    const timeout = window.setTimeout(() => setShowSuccessPulse(false), 1800);
    return () => window.clearTimeout(timeout);
  }, [showSuccessPulse]);

  const createStarterKeyMutation = useMutation({
    mutationFn: async () => {
      if (!primaryProject) {
        throw new Error('No project available yet.');
      }

      const response = await api.post(`/projects/${primaryProject.id}/keys`, {
        name: 'Quickstart Key',
      });

      return response.data as CreatedApiKey;
    },
    onSuccess: (createdKey) => {
      if (!primaryProject) {
        return;
      }

      setLiveApiKey(createdKey.key);
      setOnboarding({
        project: {
          id: primaryProject.id,
          name: primaryProject.name,
          slug: primaryProject.slug,
        },
        apiKey: createdKey.key,
        apiKeyMasked: createdKey.maskedKey,
        endpointPath,
        apiKeyHeader,
      });
      setFeedback('Quickstart key generated. The API console is ready.');
      queryClient.invalidateQueries({ queryKey: ['growth-onboarding'] });
      void captureGrowthEvent('api_key_created', {
        projectId: primaryProject.id,
        metadata: { source: 'overview_quickstart' },
      });
    },
    onError: (error) => {
      setFeedback(formatApiError(error));
    },
  });

  const testApiMutation = useMutation({
    mutationFn: async () => {
      if (!liveApiKey) {
        throw new Error('Create or use an available API key first.');
      }

      if (!primaryProject) {
        throw new Error('No project available yet.');
      }

      await captureGrowthEvent('test_api_clicked', {
        projectId: primaryProject.id,
        metadata: {
          source: 'overview',
        },
      });

      const startedAt = performance.now();
      const response = await fetch(endpointUrl, {
        headers: {
          [apiKeyHeader]: liveApiKey,
        },
      });
      const payload = await response.json();
      const latencyMs = Math.max(1, Math.round(performance.now() - startedAt));

      if (!response.ok) {
        throw new Error((payload as { error?: string; message?: string }).message || (payload as { error?: string }).error || 'API test failed');
      }

      return {
        status: response.status,
        data: payload,
        latencyMs,
        sourceTable: typeof payload === 'object' && payload && 'meta' in payload
          ? ((payload as any).meta?.sourceTable ?? null)
          : null,
      } satisfies ApiTestResult;
    },
    onSuccess: async (result) => {
      setFeedback(`API returned ${result.status} in ${result.latencyMs}ms.`);
      setShowSuccessPulse(true);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['growth-onboarding'] }),
        queryClient.invalidateQueries({ queryKey: ['requests', primaryProject?.id] }),
      ]);
    },
    onError: (error) => {
      setFeedback(error instanceof Error ? error.message : 'API test failed');
    },
  });

  const activationSteps = useMemo(() => {
    const activation = onboardingQuery.data?.activation;

    return [
      { label: 'Account created', done: Boolean(activation?.accountCreated) },
      { label: 'Starter project ready', done: Boolean(activation?.projectCreated) },
      { label: 'API key available', done: Boolean(activation?.apiKeyReady || liveApiKey) },
      { label: 'First API call completed', done: Boolean(activation?.apiCalled || logsQuery.data?.length) },
    ];
  }, [liveApiKey, logsQuery.data?.length, onboardingQuery.data?.activation]);

  const completedSteps = activationSteps.filter((step) => step.done).length;
  const usagePercentage = primaryProject?.subscription
    ? Math.min(
        100,
        Math.round((primaryProject.subscription.requestsUsed / Math.max(primaryProject.subscription.requestsLimit, 1)) * 100)
      )
    : 0;
  const usageWarning =
    usagePercentage >= 100
      ? "You've reached your limit. Upgrade to PRO to continue."
      : usagePercentage >= 80
        ? `You're at ${usagePercentage}% of your request quota. Upgrade before you hit the wall.`
        : '';

  const curlCommand = `curl -H "${apiKeyHeader}: ${liveApiKey ?? 'YOUR_KEY'}" ${endpointUrl}`;
  const latestRequest = testApiMutation.data;
  const requestPreviewHeaders = {
    [apiKeyHeader]: maskSecret(liveApiKey ?? storedOnboarding?.apiKeyMasked ?? 'YOUR_KEY'),
    'x-backforge-project': primaryProject?.slug ?? 'starter',
  };

  const handleCopy = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(successMessage);
    } catch {
      setFeedback('Clipboard copy failed. You can copy it manually.');
    }
  };

  if (onboardingQuery.isLoading) {
    return <div>Loading onboarding...</div>;
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(249,115,22,0.16),_transparent_36%),linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.94))] p-8 shadow-[0_28px_70px_rgba(15,23,42,0.14)]">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_360px]">
          <div className="space-y-5">
            <div className="inline-flex items-center rounded-full border border-border/80 bg-background/85 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Activation Engine
            </div>
            <div className="space-y-3">
              <h1 className="text-4xl font-semibold tracking-tight text-balance">
                {onboardingQuery.data?.quickstart.valuePromise ?? 'You are 30 seconds away from your first API.'}
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground">
                BACKFORGE now shows the real request, real response, and real persisted request history right after the first test, so the onboarding moment feels like a working platform instead of a hidden mock call.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button className="gap-2" onClick={() => testApiMutation.mutate()} disabled={testApiMutation.isPending || !liveApiKey}>
                {testApiMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                Test API
              </Button>
              <Button asChild variant="outline">
                <Link to="/projects">+ New Project</Link>
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => void handleCopy(curlCommand, 'curl command copied.')}>
                <Copy className="h-4 w-4" />
                Copy curl
              </Button>
              {!liveApiKey ? (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => createStarterKeyMutation.mutate()}
                  disabled={createStarterKeyMutation.isPending || !primaryProject}
                >
                  {createStarterKeyMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  Generate quickstart key
                </Button>
              ) : null}
            </div>
            {feedback ? (
              <div className="rounded-[1.15rem] border border-border/70 bg-background/85 px-4 py-3 text-sm text-foreground">{feedback}</div>
            ) : null}
          </div>

          <Card className="border-border/70 bg-background/80">
            <CardHeader className="space-y-2">
              <CardTitle className="text-xl">Activation progress</CardTitle>
              <CardDescription>{completedSteps}/4 milestones completed for your first aha moment.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {activationSteps.map((step) => (
                <div key={step.label} className="flex items-center justify-between rounded-[1.15rem] border border-border/60 bg-white/50 px-4 py-3 text-sm">
                  <span className="font-medium">{step.label}</span>
                  <span className={step.done ? 'text-emerald-600' : 'text-muted-foreground'}>
                    {step.done ? <CheckCircle2 className="h-4 w-4" /> : 'Pending'}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      {usageWarning ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-xl">Quota checkpoint</CardTitle>
              <CardDescription>{usageWarning}</CardDescription>
            </div>
            <Button asChild>
              <Link to="/billing">Upgrade to PRO</Link>
            </Button>
          </CardHeader>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Quickstart credentials</CardTitle>
            <CardDescription>Your starter project, endpoint, and first request template are ready to use.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[1.25rem] border border-white/8 bg-white/5 p-4">
                <div className="text-sm font-medium text-muted-foreground">Project</div>
                <div className="mt-2 text-lg font-semibold">{primaryProject?.name ?? 'Starter workspace pending'}</div>
                <div className="text-sm text-muted-foreground">{primaryProject?.slug ?? 'No slug yet'}</div>
              </div>
              <div className="rounded-[1.25rem] border border-white/8 bg-white/5 p-4">
                <div className="text-sm font-medium text-muted-foreground">Endpoint</div>
                <div className="mt-2 break-all font-mono text-sm">{endpointUrl}</div>
                <div className="mt-2 text-sm text-muted-foreground">Header: {apiKeyHeader}</div>
              </div>
            </div>

            <div className="rounded-[1.4rem] border border-slate-900/70 bg-slate-950 p-4 text-sm text-slate-100 shadow-[0_18px_40px_rgba(2,6,23,0.45)]">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">API key</div>
              <div className="break-all font-mono">{liveApiKey ?? storedOnboarding?.apiKeyMasked ?? 'Generate a key to reveal it here once.'}</div>
              <div className="mt-3 flex flex-wrap gap-3">
                {liveApiKey ? (
                  <Button
                    variant="outline"
                    className="gap-2 border-white/15 bg-white/5 text-slate-100 hover:bg-white/10"
                    onClick={() => void handleCopy(liveApiKey, 'API key copied.')}
                  >
                    <Copy className="h-4 w-4" />
                    Copy API key
                  </Button>
                ) : null}
                {!liveApiKey ? (
                  <Button
                    variant="outline"
                    className="gap-2 border-white/15 bg-white/5 text-slate-100 hover:bg-white/10"
                    onClick={() => createStarterKeyMutation.mutate()}
                    disabled={createStarterKeyMutation.isPending || !primaryProject}
                  >
                    {createStarterKeyMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Reveal quickstart key
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="rounded-[1.25rem] border border-white/8 bg-white/5 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <TerminalSquare className="h-4 w-4 text-primary" />
                curl example
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all text-sm text-muted-foreground">{curlCommand}</pre>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Usage snapshot</CardTitle>
            <CardDescription>Retention improves when users see momentum, limits, and the next upgrade step early.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-[1.25rem] border border-white/8 bg-white/5 p-4">
                <div className="text-sm text-muted-foreground">Requests sent</div>
                <div className="mt-2 text-3xl font-semibold">{primaryProject?.requestCount ?? 0}</div>
              </div>
              <div className="rounded-[1.25rem] border border-white/8 bg-white/5 p-4">
                <div className="text-sm text-muted-foreground">API keys</div>
                <div className="mt-2 text-3xl font-semibold">{primaryProject?.apiKeysCount ?? 0}</div>
              </div>
            </div>

            <div className="rounded-[1.25rem] border border-white/8 bg-white/5 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CreditCard className="h-4 w-4 text-primary" />
                Plan and quota
              </div>
              <div className="mt-3 flex items-end justify-between gap-4">
                <div>
                  <div className="text-2xl font-semibold uppercase">{primaryProject?.subscription?.plan ?? 'free'}</div>
                  <div className="text-sm text-muted-foreground">
                    {primaryProject?.subscription
                      ? `${primaryProject.subscription.requestsUsed.toLocaleString()} / ${primaryProject.subscription.requestsLimit.toLocaleString()} requests`
                      : 'Starter quota will appear here.'}
                  </div>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  <div>{primaryProject?.subscription?.rateLimitPerMinute ?? 60}/min</div>
                  <div>{usagePercentage}% used</div>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-accent">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${usagePercentage}%` }} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-xl">Request preview</CardTitle>
            <CardDescription>The console shows exactly what Backforge is about to send when the test runs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-[1.35rem] border border-white/8 bg-slate-950 px-4 py-4 text-sm text-slate-100">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                <Zap className="h-4 w-4 text-primary" />
                Request
              </div>
              <div className="mt-4 flex items-center gap-2">
                <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">GET</span>
                <span className="break-all font-mono text-xs text-slate-200">{endpointUrl}</span>
              </div>
              <div className="mt-5 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Headers</div>
                {Object.entries(requestPreviewHeaders).map(([headerName, value]) => (
                  <div key={headerName} className="flex items-center justify-between gap-3 rounded-[1rem] bg-white/5 px-3 py-2">
                    <span className="font-mono text-xs text-slate-400">{headerName}</span>
                    <span className="break-all font-mono text-xs text-slate-100">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[1.25rem] border border-white/8 bg-white/5 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <TerminalSquare className="h-4 w-4 text-primary" />
                curl example
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all text-sm text-muted-foreground">{curlCommand}</pre>
            </div>
          </CardContent>
        </Card>

        <Card className={`overflow-hidden transition ${showSuccessPulse ? 'border-emerald-500/35 shadow-[0_24px_64px_rgba(16,185,129,0.18)]' : ''}`}>
          <CardHeader>
            <CardTitle className="text-xl">Response preview</CardTitle>
            <CardDescription>The response body is now returned by the real public endpoint and mirrored into request logs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {testApiMutation.isPending ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center gap-4 rounded-[1.5rem] border border-dashed border-primary/25 bg-primary/5 text-center">
                <div className="rounded-full bg-primary/12 p-4">
                  <LoaderCircle className="h-7 w-7 animate-spin text-primary" />
                </div>
                <div>
                  <div className="text-lg font-semibold">Dispatching real request...</div>
                  <div className="mt-1 text-sm text-muted-foreground">Latency, payload, and request history will update as soon as the response returns.</div>
                </div>
              </div>
            ) : latestRequest ? (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`rounded-full border px-3 py-1 text-xs font-medium ${getStatusClassName(latestRequest.status)}`}>
                    HTTP {latestRequest.status}
                  </span>
                  <span className={`rounded-full border px-3 py-1 text-xs font-medium ${showSuccessPulse ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 animate-pulse' : 'border-border/70 bg-background/80 text-muted-foreground'}`}>
                    {latestRequest.latencyMs}ms latency
                  </span>
                  {latestRequest.sourceTable ? (
                    <span className="rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
                      Source: {latestRequest.sourceTable}
                    </span>
                  ) : null}
                </div>

                <JsonPreview value={latestRequest.data} />
              </>
            ) : (
              <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-[1.5rem] border border-dashed border-white/12 bg-white/4 text-center">
                <div className="rounded-full bg-primary/10 p-4">
                  <PlayCircle className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <div className="text-lg font-semibold">Run the first test request</div>
                  <div className="mt-1 text-sm text-muted-foreground">The response body, latency, and persisted request history will appear here after the click.</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Recent requests</CardTitle>
            <CardDescription>Each request now comes from the persisted request log with real latency data.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {logsQuery.data?.length ? (
              logsQuery.data.map((request) => (
                <div key={request.id} className="flex items-center justify-between gap-3 rounded-[1.25rem] border border-white/8 bg-white/5 px-4 py-3 text-sm">
                  <div>
                    <div className="font-medium">{request.method} {request.path}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{new Date(request.createdAt).toLocaleString()}</span>
                      <span>{request.latency}ms</span>
                    </div>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-xs ${getStatusClassName(request.status)}`}>{request.status}</span>
                </div>
              ))
            ) : (
              <div className="rounded-[1.25rem] border border-dashed border-white/12 p-4 text-sm text-muted-foreground">
                No requests yet. Hit "Test API" above to create the first saved request.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Next growth levers</CardTitle>
            <CardDescription>The quickest wins now are activation, telemetry, and upgrade timing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-[1.25rem] border border-white/8 bg-white/5 p-4">Keep this onboarding path under 2 minutes by default for every new signup.</div>
            <div className="rounded-[1.25rem] border border-white/8 bg-white/5 p-4">Drive users from first successful request to quota visibility, not to a blank dashboard.</div>
            <div className="rounded-[1.25rem] border border-white/8 bg-white/5 p-4">
              Use the <Link to="/analytics" className="font-medium text-primary hover:underline">growth dashboard</Link> to watch activation, conversion, DAU/WAU, and request volume move together.
            </div>
            <Button asChild className="w-full gap-2">
              <Link to="/billing">
                Open billing and upgrade flow
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Recent keys</CardTitle>
          <CardDescription>Secrets are shown in full only once, but masked history still helps users stay oriented.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {primaryProject?.recentApiKeys.length ? (
            primaryProject.recentApiKeys.map((apiKey) => (
              <div key={apiKey.id} className="rounded-[1.25rem] border border-white/8 bg-white/5 p-4">
                <div className="font-medium">{apiKey.name}</div>
                <div className="mt-1 font-mono text-sm text-muted-foreground">{apiKey.maskedKey}</div>
                <div className="mt-2 text-xs text-muted-foreground">{new Date(apiKey.createdAt).toLocaleString()}</div>
              </div>
            ))
          ) : (
            <div className="rounded-[1.25rem] border border-dashed border-white/12 p-4 text-sm text-muted-foreground">No keys issued yet.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
