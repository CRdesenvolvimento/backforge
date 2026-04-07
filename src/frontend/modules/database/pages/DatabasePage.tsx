import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Braces,
  Database,
  LoaderCircle,
  Plus,
  Rows3,
  Table2,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { JsonPreview } from '../../../components/ui/json-preview';
import { api } from '../../../lib/api';
import { useAuthStore } from '../../auth/auth.store';

type DatabaseFieldType = 'string' | 'number' | 'boolean' | 'date';

interface ProjectOption {
  id: string;
  name: string;
  slug: string;
  role: 'OWNER' | 'ADMIN' | 'DEVELOPER';
}

interface TableSchemaColumn {
  name: string;
  type: DatabaseFieldType;
}

interface DatabaseTableRecord {
  id: string;
  name: string;
  projectId: string;
  schema: TableSchemaColumn[];
  rowsCount: number;
  createdAt: string;
  updatedAt: string;
}

interface DatabaseRowRecord {
  id: string;
  createdAt: string;
  data: Record<string, unknown>;
  preview: Record<string, unknown>;
}

interface TableRowsResponse {
  table: {
    id: string;
    name: string;
    schema: TableSchemaColumn[];
  };
  items: DatabaseRowRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface ColumnDraft {
  name: string;
  type: DatabaseFieldType;
}

const fieldTypeOptions: Array<{ label: string; value: DatabaseFieldType }> = [
  { label: 'String', value: 'string' },
  { label: 'Number', value: 'number' },
  { label: 'Boolean', value: 'boolean' },
  { label: 'Date', value: 'date' },
];

const selectClassName =
  'flex h-10 w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/40 focus:bg-white/8';

function createColumnDraft(): ColumnDraft {
  return {
    name: '',
    type: 'string',
  };
}

function buildEmptyRowDraft(columns: TableSchemaColumn[]) {
  return columns.reduce<Record<string, string>>((accumulator, column) => {
    accumulator[column.name] = column.type === 'boolean' ? 'false' : '';
    return accumulator;
  }, {});
}

function formatTableValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground/70">null</span>;
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  return String(value);
}

function formatUpdatedAt(value: string) {
  return new Date(value).toLocaleString();
}

function getDefaultProjectId(projects: ProjectOption[], onboardingProjectId?: string | null) {
  if (onboardingProjectId && projects.some((project) => project.id === onboardingProjectId)) {
    return onboardingProjectId;
  }

  return projects[0]?.id ?? '';
}

function getErrorMessage(error: any) {
  return error?.response?.data?.message || error?.response?.data?.error || 'Something went wrong.';
}

export function DatabasePage() {
  const queryClient = useQueryClient();
  const onboardingProjectId = useAuthStore((state) => state.onboarding?.project.id ?? null);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [activeTableId, setActiveTableId] = useState('');
  const [tableName, setTableName] = useState('');
  const [columnDrafts, setColumnDrafts] = useState<ColumnDraft[]>([
    { name: 'name', type: 'string' },
    { name: 'created_at', type: 'date' },
  ]);
  const [rowDraft, setRowDraft] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState('');

  const projectsQuery = useQuery<ProjectOption[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      const response = await api.get('/projects');
      return response.data;
    },
  });

  useEffect(() => {
    if (!projectsQuery.data?.length || selectedProjectId) {
      return;
    }

    setSelectedProjectId(getDefaultProjectId(projectsQuery.data, onboardingProjectId));
  }, [onboardingProjectId, projectsQuery.data, selectedProjectId]);

  const tablesQuery = useQuery<DatabaseTableRecord[]>({
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

  useEffect(() => {
    const tables = tablesQuery.data ?? [];

    if (!tables.length) {
      setActiveTableId('');
      return;
    }

    if (!tables.some((table) => table.id === activeTableId)) {
      setActiveTableId(tables[0].id);
    }
  }, [activeTableId, tablesQuery.data]);

  const activeTable = useMemo(
    () => (tablesQuery.data ?? []).find((table) => table.id === activeTableId) ?? null,
    [activeTableId, tablesQuery.data]
  );

  useEffect(() => {
    if (!activeTable) {
      setRowDraft({});
      return;
    }

    setRowDraft(buildEmptyRowDraft(activeTable.schema));
  }, [activeTable]);

  const rowsQuery = useQuery<TableRowsResponse>({
    queryKey: ['table-rows', activeTableId],
    enabled: Boolean(activeTableId),
    queryFn: async () => {
      const response = await api.get(`/tables/${activeTableId}/rows`);
      return response.data;
    },
  });

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeout = window.setTimeout(() => setFeedback(''), 3200);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const createTableMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/tables', {
        projectId: selectedProjectId,
        name: tableName,
        columns: columnDrafts,
      });
      return response.data as DatabaseTableRecord;
    },
    onSuccess: async (table) => {
      await queryClient.invalidateQueries({ queryKey: ['tables', selectedProjectId] });
      setActiveTableId(table.id);
      setTableName('');
      setColumnDrafts([
        { name: 'name', type: 'string' },
        { name: 'created_at', type: 'date' },
      ]);
      setFeedback(`Table "${table.name}" created with ${table.schema.length} fields.`);
    },
    onError: (error) => setFeedback(getErrorMessage(error)),
  });

  const insertRowMutation = useMutation({
    mutationFn: async () => {
      if (!activeTable) {
        throw new Error('Choose a table first.');
      }

      const response = await api.post(`/tables/${activeTable.id}/rows`, {
        data: rowDraft,
      });
      return response.data as DatabaseRowRecord;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tables', selectedProjectId] }),
        queryClient.invalidateQueries({ queryKey: ['table-rows', activeTableId] }),
      ]);

      if (activeTable) {
        setRowDraft(buildEmptyRowDraft(activeTable.schema));
        setFeedback(`Row inserted into "${activeTable.name}".`);
      }
    },
    onError: (error) => setFeedback(getErrorMessage(error)),
  });

  const deleteRowMutation = useMutation({
    mutationFn: async (rowId: string) => {
      await api.delete(`/rows/${rowId}`);
      return rowId;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tables', selectedProjectId] }),
        queryClient.invalidateQueries({ queryKey: ['table-rows', activeTableId] }),
      ]);
      setFeedback('Row deleted.');
    },
    onError: (error) => setFeedback(getErrorMessage(error)),
  });

  if (projectsQuery.isLoading) {
    return <div>Loading database workspace...</div>;
  }

  if (!projectsQuery.data?.length) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Database</h1>
          <p className="text-muted-foreground">Create a project first to start building tables.</p>
        </div>
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>No projects available</CardTitle>
            <CardDescription>The database engine becomes available as soon as your first project exists.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const totalRows = (tablesQuery.data ?? []).reduce((sum, table) => sum + table.rowsCount, 0);
  const totalFields = (tablesQuery.data ?? []).reduce((sum, table) => sum + table.schema.length, 0);
  const jsonPreview = rowsQuery.data?.items.map((row) => row.preview) ?? [];

  const handleCreateTable = () => {
    if (!selectedProjectId) {
      setFeedback('Choose a project first.');
      return;
    }

    if (!tableName.trim()) {
      setFeedback('Give the table a name first.');
      return;
    }

    if (!columnDrafts.some((column) => column.name.trim())) {
      setFeedback('Add at least one field so the schema feels real.');
      return;
    }

    createTableMutation.mutate();
  };

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.18),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.16),_transparent_36%),linear-gradient(135deg,_rgba(17,24,39,0.92),_rgba(15,23,42,0.88))] p-8 shadow-[0_24px_80px_rgba(8,15,30,0.42)]">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
          <div className="space-y-4">
            <div className="inline-flex items-center rounded-full border border-white/12 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-200/80">
              Database Studio
            </div>
            <div className="space-y-3">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white">
                Replace the blank promise with a schema editor users can believe.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-200/72">
                Tables, rows, and JSON previews now come from the real backend, so the database surface feels like the beginning of a real platform, not a placeholder.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <select className={selectClassName} value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
              {projectsQuery.data.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <Card className="border-white/10 bg-white/10 text-white shadow-none">
                <CardHeader className="space-y-0 pb-2">
                  <CardDescription className="text-slate-200/70">Tables created</CardDescription>
                  <CardTitle className="text-3xl">{tablesQuery.data?.length ?? 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="border-white/10 bg-white/10 text-white shadow-none">
                <CardHeader className="space-y-0 pb-2">
                  <CardDescription className="text-slate-200/70">Rows stored</CardDescription>
                  <CardTitle className="text-3xl">{totalRows}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="border-white/10 bg-white/10 text-white shadow-none">
                <CardHeader className="space-y-0 pb-2">
                  <CardDescription className="text-slate-200/70">Schema fields</CardDescription>
                  <CardTitle className="text-3xl">{totalFields}</CardTitle>
                </CardHeader>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {feedback ? (
        <div className="rounded-[1.25rem] border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {feedback}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <WandSparkles className="h-5 w-5 text-primary" />
                Create table
              </CardTitle>
              <CardDescription>Define a schema in seconds, then start inserting rows immediately.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Table name</label>
                <Input
                  placeholder="e.g. subscriptions"
                  value={tableName}
                  onChange={(event) => setTableName(event.target.value)}
                  className="rounded-2xl border-white/10 bg-white/5"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Fields</div>
                  <Button variant="ghost" size="sm" className="gap-2" onClick={() => setColumnDrafts((current) => [...current, createColumnDraft()])}>
                    <Plus className="h-4 w-4" />
                    Add field
                  </Button>
                </div>

                <div className="space-y-3">
                  {columnDrafts.map((column, index) => (
                    <div key={`${index}-${column.name}`} className="rounded-[1.25rem] border border-white/8 bg-white/5 p-3">
                      <div className="grid gap-3">
                        <Input
                          placeholder="field_name"
                          value={column.name}
                          onChange={(event) => {
                            const nextDrafts = [...columnDrafts];
                            nextDrafts[index] = { ...column, name: event.target.value };
                            setColumnDrafts(nextDrafts);
                          }}
                          className="rounded-2xl border-white/10 bg-transparent"
                        />
                        <div className="flex gap-3">
                          <select
                            value={column.type}
                            onChange={(event) => {
                              const nextDrafts = [...columnDrafts];
                              nextDrafts[index] = { ...column, type: event.target.value as DatabaseFieldType };
                              setColumnDrafts(nextDrafts);
                            }}
                            className={selectClassName}
                          >
                            {fieldTypeOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="shrink-0 rounded-2xl"
                            disabled={columnDrafts.length === 1}
                            onClick={() => setColumnDrafts((current) => current.filter((_, currentIndex) => currentIndex !== index))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Button className="w-full gap-2" onClick={handleCreateTable} disabled={createTableMutation.isPending}>
                {createTableMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Create table
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Database className="h-5 w-5 text-primary" />
                Table registry
              </CardTitle>
              <CardDescription>Every created table stays visible with row counts and update timestamps.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {tablesQuery.isLoading ? <div className="text-sm text-muted-foreground">Loading tables...</div> : null}
              {(tablesQuery.data ?? []).map((table) => {
                const isActive = table.id === activeTable?.id;

                return (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => setActiveTableId(table.id)}
                    className={`w-full rounded-[1.3rem] border px-4 py-4 text-left transition ${
                      isActive
                        ? 'border-primary/30 bg-primary/10 shadow-[0_18px_36px_rgba(249,115,22,0.18)]'
                        : 'border-white/8 bg-white/4 hover:border-white/14 hover:bg-white/8'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-base font-semibold">
                          <Table2 className="h-4 w-4 text-primary" />
                          {table.name}
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {table.schema.length} fields
                        </div>
                      </div>
                      <div className="rounded-full bg-white/8 px-2.5 py-1 text-xs text-muted-foreground">
                        {table.rowsCount} rows
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground">
                      Updated {formatUpdatedAt(table.updatedAt)}
                    </div>
                  </button>
                );
              })}
              {!tablesQuery.isLoading && !(tablesQuery.data ?? []).length ? (
                <div className="rounded-[1.2rem] border border-dashed border-white/12 bg-white/4 px-4 py-8 text-center text-sm text-muted-foreground">
                  No tables yet. Create the first one for this project.
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {activeTable ? (
          <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.08fr)_360px]">
            <div className="space-y-6">
              <Card className="overflow-hidden">
                <CardHeader className="border-b border-white/8 bg-white/[0.03]">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                      <CardTitle className="text-2xl">{activeTable.name}</CardTitle>
                      <CardDescription className="mt-2">
                        Insert rows inline, inspect the live table, and delete records without leaving the view.
                      </CardDescription>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-[1.15rem] bg-white/5 px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Rows</div>
                        <div className="mt-2 text-2xl font-semibold">{activeTable.rowsCount}</div>
                      </div>
                      <div className="rounded-[1.15rem] bg-white/5 px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Fields</div>
                        <div className="mt-2 text-2xl font-semibold">{activeTable.schema.length}</div>
                      </div>
                      <div className="rounded-[1.15rem] bg-white/5 px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Payload</div>
                        <div className="mt-2 text-2xl font-semibold">{JSON.stringify(jsonPreview).length} B</div>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                  <div className="rounded-[1.5rem] border border-white/8 bg-white/4 p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">Insert row</div>
                        <div className="text-sm text-muted-foreground">The form adapts to your current schema.</div>
                      </div>
                      <Button variant="secondary" className="gap-2" onClick={() => insertRowMutation.mutate()} disabled={insertRowMutation.isPending}>
                        {insertRowMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Rows3 className="h-4 w-4" />}
                        Insert row
                      </Button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      {activeTable.schema.map((column) => (
                        <div key={column.name} className="space-y-2">
                          <label className="flex items-center gap-2 text-sm font-medium">
                            {column.name}
                            <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                              {column.type}
                            </span>
                          </label>

                          {column.type === 'boolean' ? (
                            <select
                              value={rowDraft[column.name] ?? 'false'}
                              onChange={(event) => setRowDraft((current) => ({ ...current, [column.name]: event.target.value }))}
                              className={selectClassName}
                            >
                              <option value="true">true</option>
                              <option value="false">false</option>
                            </select>
                          ) : (
                            <Input
                              type={column.type === 'date' ? 'date' : column.type === 'number' ? 'number' : 'text'}
                              placeholder={`Enter ${column.name}`}
                              value={rowDraft[column.name] ?? ''}
                              onChange={(event) => setRowDraft((current) => ({ ...current, [column.name]: event.target.value }))}
                              className="rounded-2xl border-white/10 bg-white/5"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-[1.5rem] border border-white/8 bg-black/10">
                    <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
                      <div>
                        <div className="text-sm font-medium">Rows in table</div>
                        <div className="text-sm text-muted-foreground">Newest rows appear first so the table always feels live.</div>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-white/[0.04] text-muted-foreground">
                          <tr>
                            {activeTable.schema.map((column) => (
                              <th key={column.name} className="px-5 py-3 font-medium">
                                {column.name}
                              </th>
                            ))}
                            <th className="px-5 py-3 text-right font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/8">
                          {rowsQuery.isLoading ? (
                            <tr>
                              <td colSpan={activeTable.schema.length + 1} className="px-5 py-14 text-center text-sm text-muted-foreground">
                                Loading rows...
                              </td>
                            </tr>
                          ) : rowsQuery.data?.items.length ? (
                            rowsQuery.data.items.map((row) => (
                              <tr key={row.id} className="transition hover:bg-white/[0.03]">
                                {activeTable.schema.map((column) => (
                                  <td key={column.name} className="px-5 py-4 font-mono text-xs text-slate-200">
                                    {formatTableValue(row.data[column.name])}
                                  </td>
                                ))}
                                <td className="px-5 py-4 text-right">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="rounded-2xl text-muted-foreground hover:text-destructive"
                                    onClick={() => deleteRowMutation.mutate(row.id)}
                                    disabled={deleteRowMutation.isPending}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={activeTable.schema.length + 1} className="px-5 py-14 text-center text-sm text-muted-foreground">
                                No rows yet. Insert your first record and the JSON preview will update instantly.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">Schema</CardTitle>
                  <CardDescription>Field names are normalized to feel like a real database surface.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {activeTable.schema.map((column) => (
                    <div key={column.name} className="flex items-center justify-between rounded-[1.2rem] border border-white/8 bg-white/5 px-4 py-3">
                      <div>
                        <div className="font-medium">{column.name}</div>
                        <div className="text-xs text-muted-foreground">Editable input maps to this field.</div>
                      </div>
                      <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        {column.type}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Braces className="h-5 w-5 text-primary" />
                    JSON preview
                  </CardTitle>
                  <CardDescription>Copy-ready output is now backed by persisted row data.</CardDescription>
                </CardHeader>
                <CardContent>
                  <JsonPreview value={jsonPreview} />
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <Card className="flex min-h-[420px] items-center justify-center border-dashed">
            <CardContent className="pt-6 text-center text-muted-foreground">
              Create your first table to open the live data grid.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
