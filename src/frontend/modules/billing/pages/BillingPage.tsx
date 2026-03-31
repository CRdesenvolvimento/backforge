import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CreditCard, Gauge, LoaderCircle, ReceiptText } from 'lucide-react';
import { api } from '../../../lib/api';
import { captureGrowthEvent } from '../../../lib/growth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';

interface ProjectOption {
  id: string;
  name: string;
  slug: string;
}

interface BillingPlan {
  key: 'free' | 'basic' | 'pro';
  label: string;
  requests: number;
  rateLimitPerMinute: number;
  monthlyPrice: number;
  hasCheckout: boolean;
}

interface BillingSummary {
  id: string;
  name: string;
  slug: string;
  subscription: {
    id: string;
    plan: string;
    status: string;
    requestsLimit: number;
    requestsUsed: number;
    rateLimitPerMinute: number;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    stripePriceId?: string | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    createdAt: string;
    updatedAt: string;
    billingUser: {
      id: string;
      email: string;
      name: string | null;
    } | null;
  } | null;
}

const selectClassName =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

function formatApiError(error: any) {
  return error?.response?.data?.message || error?.response?.data?.error || 'Something went wrong.';
}

function formatPlanLabel(plan?: string | null) {
  if (!plan) {
    return 'Free';
  }

  return plan.charAt(0).toUpperCase() + plan.slice(1).toLowerCase();
}

function showUpgradeComingSoon() {
  window.alert('Upgrade coming soon');
}

export function BillingPage() {
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [feedback, setFeedback] = useState('');

  const { data: projects = [], isLoading: projectsLoading } = useQuery<ProjectOption[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      const response = await api.get('/projects');
      return response.data;
    },
  });

  const plansQuery = useQuery<BillingPlan[]>({
    queryKey: ['billing-plans'],
    queryFn: async () => {
      const response = await api.get('/billing-api/plans');
      return response.data;
    },
  });

  useEffect(() => {
    if (!selectedProjectId && projects[0]) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const billingQuery = useQuery<BillingSummary>({
    queryKey: ['project-billing', selectedProjectId],
    enabled: Boolean(selectedProjectId),
    queryFn: async () => {
      const response = await api.get(`/projects/${selectedProjectId}/billing`);
      return response.data;
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async (plan: 'basic' | 'pro') => {
      const response = await api.post(`/billing-api/projects/${selectedProjectId}/checkout`, { plan });
      return response.data as { url: string };
    },
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (error) => {
      setFeedback(formatApiError(error));
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/billing-api/projects/${selectedProjectId}/portal`);
      return response.data as { url: string };
    },
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (error) => {
      setFeedback(formatApiError(error));
    },
  });

  if (projectsLoading) {
    return <div>Loading billing...</div>;
  }

  if (!projects.length) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
          <p className="text-muted-foreground">Create a project to initialize billing and usage tracking.</p>
        </div>

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>No billable projects yet</CardTitle>
            <CardDescription>Subscriptions are provisioned automatically when a project is created.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const billing = billingQuery.data;
  const subscription = billing?.subscription;
  const currentPlan = subscription?.plan ?? 'free';
  const usagePercentage = subscription
    ? Math.min(100, Math.round((subscription.requestsUsed / subscription.requestsLimit) * 100))
    : 0;
  const quotaBanner =
    usagePercentage >= 100
      ? "You've reached your limit. Upgrade to PRO to continue."
      : usagePercentage >= 80
        ? `You're close to your limit at ${usagePercentage}% usage.`
        : '';

  const handleCheckout = (plan: 'basic' | 'pro') => {
    if (!selectedProjectId) {
      setFeedback('Choose a project before starting checkout.');
      return;
    }

    setFeedback('');
    void captureGrowthEvent('checkout_started', {
      projectId: selectedProjectId,
      metadata: {
        plan,
        source: 'billing_page',
      },
    });
    checkoutMutation.mutate(plan);
  };

  const handlePortal = () => {
    if (!selectedProjectId) {
      setFeedback('Choose a project before opening the billing portal.');
      return;
    }

    setFeedback('');
    portalMutation.mutate();
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
        <p className="text-muted-foreground">Launch Stripe Checkout for upgrades, manage active subscriptions, and track quota usage per project.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Project subscription</CardTitle>
          <CardDescription>Select which project billing profile you want to inspect.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <select className={selectClassName} value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name} ({project.slug})
              </option>
            ))}
          </select>

          {feedback ? (
            <div className="rounded-md border border-border bg-accent/40 px-3 py-2 text-sm text-foreground">
              {feedback}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {quotaBanner ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-xl">Upgrade trigger</CardTitle>
            <CardDescription>{quotaBanner}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {billingQuery.isLoading ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Loading subscription details...
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Plans</CardTitle>
            <CardDescription>Switch the selected project to a paid plan using hosted Stripe Checkout.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            {plansQuery.data?.map((plan) => {
              const isCurrentPlan = currentPlan === plan.key;
              const paidPlanKey = plan.key === 'free' ? null : plan.key;
              const isBusy = checkoutMutation.isPending && checkoutMutation.variables === plan.key;

              return (
                <div key={plan.key} className="rounded-xl border bg-background/70 p-4">
                  <div className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">{plan.label}</div>
                  <div className="mt-3 text-3xl font-semibold">{plan.monthlyPrice === 0 ? '$0' : `$${plan.monthlyPrice}`}</div>
                  <div className="text-sm text-muted-foreground">per month</div>
                  <div className="mt-4 text-2xl font-semibold">{plan.requests.toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground">requests per billing cycle</div>
                  <div className="mt-2 text-sm text-muted-foreground">{plan.rateLimitPerMinute}/minute rate limit</div>
                  <div className="mt-4">
                    {!paidPlanKey || !plan.hasCheckout ? (
                      <Button
                        className="w-full"
                        variant="outline"
                        disabled={plan.key === 'free' ? true : false}
                        onClick={plan.key === 'free' ? undefined : showUpgradeComingSoon}
                      >
                        {plan.key === 'free' ? (isCurrentPlan ? 'Current plan' : 'Included by default') : 'Upgrade coming soon'}
                      </Button>
                    ) : (
                      <Button
                        className="w-full"
                        onClick={() => handleCheckout(paidPlanKey)}
                        disabled={isCurrentPlan || isBusy}
                      >
                        {isBusy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {isCurrentPlan ? 'Current plan' : `Choose ${plan.label}`}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Stripe portal</CardTitle>
            <CardDescription>Once a customer exists, the project can jump into Stripe's billing portal.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-background/70 p-4">
              <div className="text-sm font-medium">Current plan</div>
              <div className="mt-2 text-2xl font-semibold">{formatPlanLabel(currentPlan)}</div>
              <div className="mt-1 text-sm text-muted-foreground">Status: {subscription?.status ?? 'active'}</div>
            </div>
            <div className="rounded-lg border bg-background/70 p-4">
              <div className="text-sm font-medium">Stripe customer</div>
              <div className="mt-2 font-mono text-sm text-muted-foreground">
                {subscription?.stripeCustomerId ?? 'Not created yet'}
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={handlePortal}
              disabled={!subscription?.stripeCustomerId || portalMutation.isPending}
            >
              {portalMutation.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
              Open Stripe billing portal
            </Button>
          </CardContent>
        </Card>
      </div>

      {subscription ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardDescription>Plan</CardDescription>
                <CardTitle>{formatPlanLabel(subscription.plan)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Status</CardDescription>
                <CardTitle>{subscription.status}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Rate limit</CardDescription>
                <CardTitle>{subscription.rateLimitPerMinute}/min</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Usage and quota</CardTitle>
                <CardDescription>Requests are tracked against the selected plan for this project.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border bg-background/70 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Gauge className="h-4 w-4 text-primary" />
                    Requests used
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-accent">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${usagePercentage}%` }} />
                  </div>
                  <div className="mt-3 text-sm text-muted-foreground">
                    {subscription.requestsUsed.toLocaleString()} / {subscription.requestsLimit.toLocaleString()} requests
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border bg-background/70 p-4">
                    <div className="text-sm font-medium">Billing owner</div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      {subscription.billingUser?.name || subscription.billingUser?.email || 'Not assigned yet'}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-background/70 p-4">
                    <div className="text-sm font-medium">Cancel at period end</div>
                    <div className="mt-2 text-sm text-muted-foreground">{subscription.cancelAtPeriodEnd ? 'Yes' : 'No'}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Stripe metadata</CardTitle>
                <CardDescription>Webhook sync keeps these identifiers and billing dates aligned with Stripe.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border bg-background/70 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <CreditCard className="h-4 w-4 text-primary" />
                    Stripe customer
                  </div>
                  <div className="mt-2 font-mono text-sm text-muted-foreground">
                    {subscription.stripeCustomerId ?? 'Not connected yet'}
                  </div>
                </div>
                <div className="rounded-lg border bg-background/70 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <ReceiptText className="h-4 w-4 text-primary" />
                    Stripe subscription
                  </div>
                  <div className="mt-2 font-mono text-sm text-muted-foreground">
                    {subscription.stripeSubscriptionId ?? 'Not connected yet'}
                  </div>
                </div>
                <div className="rounded-lg border bg-background/70 p-4 text-sm text-muted-foreground">
                  <div>Current period start: {subscription.currentPeriodStart ? new Date(subscription.currentPeriodStart).toLocaleString() : 'Pending'}</div>
                  <div className="mt-2">Current period end: {subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleString() : 'Pending'}</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
