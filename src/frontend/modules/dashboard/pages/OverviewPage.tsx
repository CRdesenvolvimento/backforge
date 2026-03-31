import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Copy,
  CreditCard,
  KeyRound,
  LoaderCircle,
  PlayCircle,
  Sparkles,
  TerminalSquare,
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
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

interface ProjectLogRecord {
  id: string;
  path: string;
  method: string;
  status: number;
  createdAt: string;
}

function formatApiError(error: any) {
  return error?.response?.data?.message || error?.response?.data?.error || 'Something went wrong.';
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function getStatusClassName(status: number) {
  if (status >= 500) {
    return 'border-rose-500/30 bg-rose-500/10 text-rose-700';
  }

  if (status >= 400) {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-700';
  }

  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700';
}

export function OverviewPage() {
  const queryClient = useQueryClient();
  const storedOnboarding = useAuthStore((state) => state.onboarding);
  const setOnboarding = useAuthStore((state) => state.setOnboarding);
  const [feedback, setFeedback] = useState('');
  const [liveApiKey, setLiveApiKey] = useState<string | null>(storedOnboarding?.apiKey ?? null);

  const onboardingQuery = useQuery<OnboardingResponse>({
    queryKey: ['growth-onboarding'],
    queryFn: async () => {
      const response = await api.get('/growth/onboarding');
      return response.data;
    },
  });

  const primaryProject = onboardingQuery.data?.primaryProject;
  const endpointPath = onboardingQuery.data?.quickstart.endpointPath ?? '/public/data';
  const apiKeyHeader = onboardingQuery.data?.quickstart.apiKeyHeader ?? 'x-api-key';
  const endpointUrl = typeof window !== 'undefined' ? `${window.location.origin}${endpointPath}` : endpointPath;

  const logsQuery = useQuery<ProjectLogRecord[]>({
    queryKey: ['project-logs', primaryProject?.id],
    enabled: Boolean(primaryProject?.id),
    queryFn: async () => {
      const response = await api.get(`/projects/${primaryProject?.id}/logs?limit=10`);
      return response.data;
    },
  });

  useEffect(() => {
    if (!storedOnboarding?.apiKey || storedOnboarding.project.id !== primaryProject?.id) {
      return;
    }

    setLiveApiKey(storedOnboarding.apiKey);
  }, [storedOnboarding, primaryProject?.id]);

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
      setFeedback('Quickstart key generated. You can test the API now.');
      queryClient.invalidateQueries({ queryKey: ['growth-onboarding'] });
      queryClient.invalidateQueries({ queryKey: ['project-logs', primaryProject.id] });
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

      const response = await fetch(endpointUrl, {
        headers: {
          [apiKeyHeader]: liveApiKey,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'API test failed');
      }

      return {
        status: response.status,
        data,
      };
    },
    onSuccess: () => {
      setFeedback('API returned data successfully. Your activation flow is working.');
      queryClient.invalidateQueries({ queryKey: ['growth-onboarding'] });
      if (primaryProject) {
        queryClient.invalidateQueries({ queryKey: ['project-logs', primaryProject.id] });
      }
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
      { label: 'First API call completed', done: Boolean(activation?.apiCalled) },
    ];
  }, [liveApiKey, onboardingQuery.data?.activation]);

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
      <section className="rounded-[2rem] border bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.16),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(249,115,22,0.14),_transparent_34%),linear-gradient(135deg,_rgba(255,255,255,1),_rgba(248,250,252,0.96))] p-8 shadow-sm">
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
                BACKFORGE already prepared your starter workspace. Copy the key, hit the endpoint, and watch the first request land without any setup ceremony.
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
              <Button variant="outline" className="gap-2" onClick={() => handleCopy(curlCommand, 'curl command copied.')}>
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
              <div className="rounded-xl border border-border/70 bg-background/85 px-4 py-3 text-sm text-foreground">{feedback}</div>
            ) : null}
          </div>

          <Card className="border-border/70 bg-background/80">
            <CardHeader className="space-y-2">
              <CardTitle className="text-xl">Activation progress</CardTitle>
              <CardDescription>{completedSteps}/4 milestones completed for your first aha moment.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {activationSteps.map((step) => (
                <div key={step.label} className="flex items-center justify-between rounded-xl border border-border/70 bg-accent/20 px-4 py-3 text-sm">
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
              <div className="rounded-xl border bg-background/70 p-4">
                <div className="text-sm font-medium text-muted-foreground">Project</div>
                <div className="mt-2 text-lg font-semibold">{primaryProject?.name ?? 'Starter workspace pending'}</div>
                <div className="text-sm text-muted-foreground">{primaryProject?.slug ?? 'No slug yet'}</div>
              </div>
              <div className="rounded-xl border bg-background/70 p-4">
                <div className="text-sm font-medium text-muted-foreground">Endpoint</div>
                <div className="mt-2 break-all font-mono text-sm">{endpointUrl}</div>
                <div className="mt-2 text-sm text-muted-foreground">Header: {apiKeyHeader}</div>
              </div>
            </div>

            <div className="rounded-xl border bg-slate-950 p-4 text-sm text-slate-100">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">API key</div>
              <div className="break-all font-mono">{liveApiKey ?? storedOnboarding?.apiKeyMasked ?? 'Generate a key to reveal it here once.'}</div>
              <div className="mt-3 flex flex-wrap gap-3">
                {liveApiKey ? (
                  <Button
                    variant="outline"
                    className="gap-2 border-white/15 bg-white/5 text-slate-100 hover:bg-white/10"
                    onClick={() => handleCopy(liveApiKey, 'API key copied.')}
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

            <div className="rounded-xl border bg-background/70 p-4">
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
              <div className="rounded-xl border bg-background/70 p-4">
                <div className="text-sm text-muted-foreground">Requests sent</div>
                <div className="mt-2 text-3xl font-semibold">{primaryProject?.requestCount ?? 0}</div>
              </div>
              <div className="rounded-xl border bg-background/70 p-4">
                <div className="text-sm text-muted-foreground">API keys</div>
                <div className="mt-2 text-3xl font-semibold">{primaryProject?.apiKeysCount ?? 0}</div>
              </div>
            </div>

            <div className="rounded-xl border bg-background/70 p-4">
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

            <div className="rounded-xl border bg-background/70 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <Activity className="h-4 w-4 text-primary" />
                Recent requests
              </div>
              <div className="space-y-3">
                {logsQuery.data?.length ? (
                  logsQuery.data.map((request) => (
                    <div key={request.id} className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-sm">
                      <div>
                        <div className="font-medium">{request.method} {request.path}</div>
                        <div className="text-xs text-muted-foreground">{new Date(request.createdAt).toLocaleString()}</div>
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${getStatusClassName(request.status)}`}>{request.status}</span>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    No API calls yet. Hit "Test API" above to create the first live event.
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {testApiMutation.data ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-xl">Live response</CardTitle>
            <CardDescription>Your API already returned a real payload. This is the first value moment we want every signup to hit.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700">
              HTTP {testApiMutation.data.status}
            </div>
            <pre className="overflow-x-auto rounded-xl border bg-background p-4 text-sm text-muted-foreground">
              {formatJson(testApiMutation.data.data)}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Recent keys</CardTitle>
            <CardDescription>Secrets are shown in full only once, but masked history still helps users stay oriented.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {primaryProject?.recentApiKeys.length ? (
              primaryProject.recentApiKeys.map((apiKey) => (
                <div key={apiKey.id} className="rounded-xl border bg-background/70 p-4">
                  <div className="font-medium">{apiKey.name}</div>
                  <div className="mt-1 font-mono text-sm text-muted-foreground">{apiKey.maskedKey}</div>
                  <div className="mt-2 text-xs text-muted-foreground">{new Date(apiKey.createdAt).toLocaleString()}</div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No keys issued yet.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Next growth levers</CardTitle>
            <CardDescription>The quickest wins now are activation, telemetry, and upgrade timing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-xl border bg-accent/20 p-4">Keep this onboarding path under 2 minutes by default for every new signup.</div>
            <div className="rounded-xl border bg-accent/20 p-4">Drive users from first successful request to quota visibility, not to a blank dashboard.</div>
            <div className="rounded-xl border bg-accent/20 p-4">
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
    </div>
  );
}
