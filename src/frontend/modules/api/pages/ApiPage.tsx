import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Copy, KeyRound, LoaderCircle, ShieldCheck, TerminalSquare } from 'lucide-react';
import { api } from '../../../lib/api';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';

interface ProjectOption {
  id: string;
  name: string;
  slug: string;
  role: 'OWNER' | 'ADMIN' | 'DEVELOPER';
  apiKeysCount: number;
}

interface ApiKeyRecord {
  id: string;
  name: string;
  maskedKey: string;
  createdAt: string;
}

interface CreatedApiKey extends ApiKeyRecord {
  key: string;
}

interface RequestLogRecord {
  id: string;
  projectId?: string;
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

interface TableRecord {
  id: string;
  name: string;
}

const selectClassName =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

function formatApiError(error: any) {
  return error?.response?.data?.message || error?.response?.data?.error || 'Something went wrong.';
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

export function ApiPage() {
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');

  const { data: projects = [], isLoading: projectsLoading } = useQuery<ProjectOption[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      const response = await api.get('/projects');
      return response.data;
    },
  });

  useEffect(() => {
    if (!selectedProjectId && projects[0]) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const keysQuery = useQuery<ApiKeyRecord[]>({
    queryKey: ['project-keys', selectedProjectId],
    enabled: Boolean(selectedProjectId),
    queryFn: async () => {
      const response = await api.get(`/projects/${selectedProjectId}/keys`);
      return response.data;
    },
  });

  const logsQuery = useQuery<RequestLogRecord[]>({
    queryKey: ['requests', selectedProjectId],
    enabled: Boolean(selectedProjectId),
    queryFn: async () => {
      const response = await api.get<PaginatedRequestLogs>('/requests', {
        params: {
          projectId: selectedProjectId,
          limit: 25,
        },
      });
      return response.data.data;
    },
  });

  const tablesQuery = useQuery<TableRecord[]>({
    queryKey: ['tables', selectedProjectId],
    enabled: Boolean(selectedProjectId),
    queryFn: async () => {
      const response = await api.get('/tables', {
        params: {
          projectId: selectedProjectId,
        },
      });
      return response.data;
    },
  });

  const createKeyMutation = useMutation({
    mutationFn: async () => {
      const payload = newKeyName.trim() ? { name: newKeyName.trim() } : undefined;
      const response = await api.post(`/projects/${selectedProjectId}/keys`, payload);
      return response.data as CreatedApiKey;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project-keys', selectedProjectId] });
      setCreatedKey(data.key);
      setNewKeyName('');
      setFeedback('');
    },
    onError: (error) => {
      setFeedback(formatApiError(error));
    },
  });

  if (projectsLoading) {
    return <div>Loading API access...</div>;
  }

  if (!projects.length) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">API Keys</h1>
          <p className="text-muted-foreground">Create a project first to issue external API keys.</p>
        </div>

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>No projects available</CardTitle>
            <CardDescription>The API layer becomes available as soon as your first project exists.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0];
  const canManageKeys = selectedProject.role === 'OWNER' || selectedProject.role === 'ADMIN';
  const publicTableName = tablesQuery.data?.[0]?.name ?? 'sample_items';
  const publicEndpointPreview = `curl http://localhost:3000/public/${publicTableName} \\`;

  const handleCreateKey = () => {
    if (!selectedProjectId) {
      setFeedback('Choose a project before creating a key.');
      return;
    }

    if (!canManageKeys) {
      setFeedback('Only owners and admins can create API keys for this project.');
      return;
    }

    createKeyMutation.mutate();
  };

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback('Copied to clipboard.');
    } catch {
      setFeedback('Clipboard copy failed. You can copy the key manually.');
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">API Keys</h1>
        <p className="text-muted-foreground">Issue project-scoped keys, inspect recent request logs, and test the public endpoint safely.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Generate API key</CardTitle>
            <CardDescription>Keys are tied to a single project tenant and the full secret is shown only once on creation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Project</label>
              <select
                className={selectClassName}
                value={selectedProjectId}
                onChange={(event) => {
                  setSelectedProjectId(event.target.value);
                  setCreatedKey(null);
                  setFeedback('');
                }}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name} ({project.role})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Key name</label>
              <Input
                placeholder="Optional label, e.g. Production App"
                value={newKeyName}
                onChange={(event) => setNewKeyName(event.target.value)}
              />
            </div>

            {feedback ? (
              <div className="rounded-md border border-border bg-accent/40 px-3 py-2 text-sm text-foreground">
                {feedback}
              </div>
            ) : null}
          </CardContent>
          <CardFooter className="flex items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              {selectedProject.name} has {selectedProject.apiKeysCount} key(s) registered.
            </div>
            <Button className="gap-2" onClick={handleCreateKey} disabled={createKeyMutation.isPending || !canManageKeys}>
              {createKeyMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Create key
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Public endpoint</CardTitle>
            <CardDescription>Use the generated key against the tenant-protected public route.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border bg-background/70 p-4 font-mono text-sm text-muted-foreground">
              <div>{publicEndpointPreview}</div>
              <div>-H "x-api-key: YOUR_KEY"</div>
            </div>
            <div className="rounded-lg border bg-background/70 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Project selected
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                <div>{selectedProject.name}</div>
                <div>{selectedProject.slug}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {createdKey ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-xl">New key created</CardTitle>
            <CardDescription>Store this secret now. Future listings only show a masked version for safety.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border bg-background px-4 py-3 font-mono text-sm break-all">{createdKey}</div>
            <Button type="button" variant="outline" className="gap-2" onClick={() => handleCopy(createdKey)}>
              <Copy className="h-4 w-4" />
              Copy key
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Issued keys</CardTitle>
            <CardDescription>Masked keys currently attached to the selected project.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {keysQuery.isLoading ? <div className="text-sm text-muted-foreground">Loading keys...</div> : null}
            {!keysQuery.isLoading && !keysQuery.data?.length ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No keys yet for this project.
              </div>
            ) : null}
            {keysQuery.data?.map((apiKey) => (
              <div key={apiKey.id} className="rounded-lg border bg-background/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{apiKey.name}</div>
                    <div className="font-mono text-sm text-muted-foreground">{apiKey.maskedKey}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(apiKey.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Recent request logs</CardTitle>
            <CardDescription>Logs collected for `/public` and `/api` traffic scoped to this tenant.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {logsQuery.isLoading ? <div className="text-sm text-muted-foreground">Loading request logs...</div> : null}
            {!logsQuery.isLoading && !logsQuery.data?.length ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No external requests have been recorded for this project yet.
              </div>
            ) : null}
            {logsQuery.data?.map((log) => (
              <div key={log.id} className="rounded-lg border bg-background/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Activity className="h-4 w-4 text-primary" />
                      <span>{log.method}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${getStatusClassName(log.status)}`}>
                        {log.status}
                      </span>
                    </div>
                    <div className="font-mono text-sm text-muted-foreground">{log.path}</div>
                    <div className="text-xs text-muted-foreground">{log.latency}ms latency</div>
                  </div>
                  <div className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Usage notes</CardTitle>
          <CardDescription>The same API key middleware now powers both `/public` and the dynamic `/api` engine.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border bg-background/70 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <TerminalSquare className="h-4 w-4 text-primary" />
              Tenant isolation
            </div>
            <p className="mt-2 text-sm text-muted-foreground">Every key resolves to a single project and never crosses tenant boundaries.</p>
          </div>
          <div className="rounded-lg border bg-background/70 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Rate limited
            </div>
            <p className="mt-2 text-sm text-muted-foreground">External traffic is throttled per project using the subscription rate-limit window.</p>
          </div>
          <div className="rounded-lg border bg-background/70 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Activity className="h-4 w-4 text-primary" />
              Request telemetry
            </div>
            <p className="mt-2 text-sm text-muted-foreground">Every response records method, path, status, and usage counters for billing-ready analytics.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
