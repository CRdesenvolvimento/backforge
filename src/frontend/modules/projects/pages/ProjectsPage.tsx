import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Database,
  FolderKanban,
  KeyRound,
  LoaderCircle,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { useState } from 'react';
import { api } from '../../../lib/api';

interface Project {
  id: string;
  name: string;
  slug: string;
  role: 'OWNER' | 'ADMIN' | 'DEVELOPER';
  createdAt: string;
  updatedAt: string;
  apiKeysCount: number;
  tablesCount: number;
  subscription: {
    plan: string;
    requestsLimit: number;
    requestsUsed: number;
  } | null;
}

function formatApiError(error: any) {
  return error?.response?.data?.message || error?.response?.data?.error || 'Something went wrong.';
}

function formatRole(role: Project['role']) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function canEditProject(role: Project['role']) {
  return role === 'OWNER' || role === 'ADMIN';
}

function canDeleteProject(role: Project['role']) {
  return role === 'OWNER';
}

export function ProjectsPage() {
  const [newProjectName, setNewProjectName] = useState('');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState('');
  const [feedback, setFeedback] = useState('');
  const queryClient = useQueryClient();

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      const response = await api.get('/projects');
      return response.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await api.post('/projects', { name: name.trim() });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setNewProjectName('');
      setFeedback('');
    },
    onError: (error) => {
      setFeedback(formatApiError(error));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const response = await api.patch(`/projects/${id}`, { name: name.trim() });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setEditingProjectId(null);
      setEditingProjectName('');
      setFeedback('');
    },
    onError: (error) => {
      setFeedback(formatApiError(error));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setFeedback('');
    },
    onError: (error) => {
      setFeedback(formatApiError(error));
    },
  });

  if (isLoading) return <div>Loading projects...</div>;

  const totalTables = projects.reduce((sum, project) => sum + project.tablesCount, 0);
  const totalApiKeys = projects.reduce((sum, project) => sum + project.apiKeysCount, 0);

  const handleCreateProject = () => {
    const trimmedName = newProjectName.trim();

    if (!trimmedName) {
      setFeedback('Type a project name before creating it.');
      return;
    }

    createMutation.mutate(trimmedName);
  };

  const handleStartEditing = (project: Project) => {
    setEditingProjectId(project.id);
    setEditingProjectName(project.name);
    setFeedback('');
  };

  const handleCancelEditing = () => {
    setEditingProjectId(null);
    setEditingProjectName('');
    setFeedback('');
  };

  const handleSaveProject = (projectId: string) => {
    const trimmedName = editingProjectName.trim();

    if (!trimmedName) {
      setFeedback('Project name cannot be empty.');
      return;
    }

    updateMutation.mutate({ id: projectId, name: trimmedName });
  };

  const handleDeleteProject = (project: Project) => {
    const confirmed = window.confirm(`Delete "${project.name}"? This will remove its data, API keys, and tables.`);

    if (!confirmed) {
      return;
    }

    deleteMutation.mutate(project.id);
  };

  return (
    <div className="space-y-8">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">Create, organize, rename, and remove projects scoped to your authenticated account.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">New project</CardTitle>
            <CardDescription>Every project is created under your tenant and protected by the current JWT session.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Project name"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateProject();
                }
              }}
            />
            {feedback ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {feedback}
              </div>
            ) : null}
          </CardContent>
          <CardFooter>
            <Button className="w-full gap-2" onClick={handleCreateProject} disabled={createMutation.isPending}>
              {createMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create project
            </Button>
          </CardFooter>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Total projects</CardDescription>
            <CardTitle>{projects.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Database tables</CardDescription>
            <CardTitle>{totalTables}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>API keys</CardDescription>
            <CardTitle>{totalApiKeys}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {projects.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>No projects yet</CardTitle>
            <CardDescription>Your tenant is ready. Create the first project to start using the database, storage, and API modules.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const isEditing = editingProjectId === project.id;
            const isUpdatingThisProject = updateMutation.isPending && updateMutation.variables?.id === project.id;
            const isDeletingThisProject = deleteMutation.isPending && deleteMutation.variables === project.id;
            const usagePercentage = project.subscription
              ? Math.min(100, Math.round((project.subscription.requestsUsed / project.subscription.requestsLimit) * 100))
              : 0;

            return (
              <Card key={project.id} className="border-border/60 bg-card/80">
                <CardHeader className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl border bg-accent/60 p-3">
                        <FolderKanban className="h-6 w-6 text-primary" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700">
                            {formatRole(project.role)}
                          </span>
                          <span className="rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground">
                            {project.subscription?.plan ?? 'FREE'}
                          </span>
                        </div>
                        <CardDescription>{project.slug}</CardDescription>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleStartEditing(project)}
                        disabled={!canEditProject(project.role) || isDeletingThisProject}
                        title={canEditProject(project.role) ? 'Rename project' : 'Only owners and admins can rename projects'}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteProject(project)}
                        disabled={!canDeleteProject(project.role) || isDeletingThisProject}
                        title={canDeleteProject(project.role) ? 'Delete project' : 'Only owners can delete projects'}
                      >
                        {isDeletingThisProject ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="space-y-3">
                      <Input value={editingProjectName} onChange={(e) => setEditingProjectName(e.target.value)} maxLength={80} />
                      <div className="flex gap-2">
                        <Button type="button" size="sm" onClick={() => handleSaveProject(project.id)} disabled={isUpdatingThisProject}>
                          {isUpdatingThisProject ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Save
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={handleCancelEditing} disabled={isUpdatingThisProject}>
                          <X className="mr-2 h-4 w-4" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <CardTitle className="text-xl">{project.name}</CardTitle>
                  )}
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border bg-background/70 p-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Database className="h-4 w-4" />
                        Tables
                      </div>
                      <div className="mt-2 text-2xl font-semibold">{project.tablesCount}</div>
                    </div>
                    <div className="rounded-lg border bg-background/70 p-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <KeyRound className="h-4 w-4" />
                        API Keys
                      </div>
                      <div className="mt-2 text-2xl font-semibold">{project.apiKeysCount}</div>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-lg border bg-background/70 p-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <ShieldCheck className="h-4 w-4" />
                      Usage
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-accent">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${usagePercentage}%` }} />
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {project.subscription
                        ? `${project.subscription.requestsUsed.toLocaleString()} / ${project.subscription.requestsLimit.toLocaleString()} requests`
                        : 'No usage plan attached yet'}
                    </div>
                  </div>
                </CardContent>

                <CardFooter className="justify-between border-t pt-4 text-sm text-muted-foreground">
                  <span>Created {new Date(project.createdAt).toLocaleDateString()}</span>
                  <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
