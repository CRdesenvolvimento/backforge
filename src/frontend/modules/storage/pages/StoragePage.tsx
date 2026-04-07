import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Copy,
  File,
  FileImage,
  FileText,
  Film,
  Globe,
  LoaderCircle,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { api } from '../../../lib/api';
import { useAuthStore } from '../../auth/auth.store';

interface ProjectOption {
  id: string;
  name: string;
  slug: string;
  role: 'OWNER' | 'ADMIN' | 'DEVELOPER';
}

interface StorageFileRecord {
  id: string;
  projectId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  createdAt: string;
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function getAssetIcon(type: string) {
  if (type.startsWith('image/')) {
    return FileImage;
  }

  if (type.startsWith('video/')) {
    return Film;
  }

  if (type.includes('pdf') || type.includes('text')) {
    return FileText;
  }

  return File;
}

function formatBytes(bytes: number) {
  if (bytes === 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatCreatedAt(value: string) {
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

function buildPublicUrl(relativeUrl: string) {
  if (typeof window === 'undefined') {
    return relativeUrl;
  }

  return new URL(relativeUrl, window.location.origin).toString();
}

export function StoragePage() {
  const queryClient = useQueryClient();
  const onboardingProjectId = useAuthStore((state) => state.onboarding?.project.id ?? null);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [feedback, setFeedback] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const filesQuery = useQuery<StorageFileRecord[]>({
    queryKey: ['files', selectedProjectId],
    enabled: Boolean(selectedProjectId),
    queryFn: async () => {
      const response = await api.get('/files', {
        headers: {
          'x-project-id': selectedProjectId,
        },
      });
      return response.data;
    },
  });

  useEffect(() => {
    const files = filesQuery.data ?? [];

    if (!files.length) {
      setSelectedAssetId('');
      return;
    }

    if (!files.some((file) => file.id === selectedAssetId)) {
      setSelectedAssetId(files[0].id);
    }
  }, [filesQuery.data, selectedAssetId]);

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeout = window.setTimeout(() => setFeedback(''), 3200);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const selectedAsset = (filesQuery.data ?? []).find((asset) => asset.id === selectedAssetId) ?? null;
  const totalStoredBytes = useMemo(
    () => (filesQuery.data ?? []).reduce((sum, asset) => sum + asset.size, 0),
    [filesQuery.data]
  );
  const imageCount = (filesQuery.data ?? []).filter((asset) => asset.mimeType.startsWith('image/')).length;

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const uploadedFiles: StorageFileRecord[] = [];

      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        const response = await api.post('/upload', formData, {
          headers: {
            'x-project-id': selectedProjectId,
          },
        });
        uploadedFiles.push(response.data);
      }

      return uploadedFiles;
    },
    onSuccess: async (uploadedFiles) => {
      await queryClient.invalidateQueries({ queryKey: ['files', selectedProjectId] });
      setSelectedAssetId(uploadedFiles[0]?.id ?? '');
      setFeedback(`${uploadedFiles.length} asset(s) uploaded and ready to share.`);
    },
    onError: (error) => setFeedback(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (fileId: string) => {
      await api.delete(`/files/${fileId}`, {
        headers: {
          'x-project-id': selectedProjectId,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['files', selectedProjectId] });
      setFeedback('Asset removed from storage.');
    },
    onError: (error) => setFeedback(getErrorMessage(error)),
  });

  const handleCopy = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(successMessage);
    } catch {
      setFeedback('Clipboard access was blocked. The URL is still visible here.');
    }
  };

  const processFiles = async (files: FileList | File[]) => {
    const acceptedFiles = Array.from(files).filter((file) => file.size <= MAX_UPLOAD_BYTES);
    const skippedFiles = Array.from(files).length - acceptedFiles.length;

    if (!acceptedFiles.length) {
      setFeedback('Files above 10 MB were skipped. Upload smaller assets to continue.');
      return;
    }

    await uploadMutation.mutateAsync(acceptedFiles);

    if (skippedFiles) {
      setFeedback(`${acceptedFiles.length} asset(s) uploaded. ${skippedFiles} file(s) were skipped because they exceeded 10 MB.`);
    }
  };

  const onFileInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length) {
      return;
    }

    await processFiles(event.target.files);
    event.target.value = '';
  };

  if (projectsQuery.isLoading) {
    return <div>Loading storage workspace...</div>;
  }

  if (!projectsQuery.data?.length) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Storage</h1>
          <p className="text-muted-foreground">Create a project first to upload files.</p>
        </div>

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>No projects available</CardTitle>
            <CardDescription>The storage manager becomes available as soon as your first project exists.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(34,197,94,0.16),_transparent_36%),linear-gradient(135deg,_rgba(15,23,42,0.92),_rgba(17,24,39,0.88))] p-8 shadow-[0_24px_80px_rgba(8,15,30,0.42)]">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
          <div className="space-y-4">
            <div className="inline-flex items-center rounded-full border border-white/12 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-200/80">
              Edge Storage
            </div>
            <div className="space-y-3">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white">
                Turn uploads into a real asset manager with previews, URLs, and fast actions.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-200/72">
                Assets now persist to the real backend, get a real public URL, and can be previewed, copied, and deleted without leaving the manager.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <select className="flex h-10 w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition focus:border-primary/40" value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
              {projectsQuery.data.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <Card className="border-white/10 bg-white/10 text-white shadow-none">
                <CardHeader className="space-y-0 pb-2">
                  <CardDescription className="text-slate-200/70">Assets stored</CardDescription>
                  <CardTitle className="text-3xl">{filesQuery.data?.length ?? 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="border-white/10 bg-white/10 text-white shadow-none">
                <CardHeader className="space-y-0 pb-2">
                  <CardDescription className="text-slate-200/70">Total footprint</CardDescription>
                  <CardTitle className="text-3xl">{formatBytes(totalStoredBytes)}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="border-white/10 bg-white/10 text-white shadow-none">
                <CardHeader className="space-y-0 pb-2">
                  <CardDescription className="text-slate-200/70">Image previews</CardDescription>
                  <CardTitle className="text-3xl">{imageCount}</CardTitle>
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card
            className={`overflow-hidden transition ${
              isDragging ? 'border-primary/35 bg-primary/10 shadow-[0_20px_50px_rgba(14,165,233,0.18)]' : ''
            }`}
            onDrop={async (event) => {
              event.preventDefault();
              setIsDragging(false);
              if (event.dataTransfer.files?.length) {
                await processFiles(event.dataTransfer.files);
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setIsDragging(false);
            }}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <UploadCloud className="h-5 w-5 text-primary" />
                Upload files
              </CardTitle>
              <CardDescription>Drag and drop or browse files. Uploads now persist to the filesystem and Prisma metadata store.</CardDescription>
            </CardHeader>
            <CardContent>
              <button
                type="button"
                className="flex min-h-[220px] w-full flex-col items-center justify-center gap-4 rounded-[1.6rem] border border-dashed border-white/14 bg-white/[0.04] px-6 py-10 text-center transition hover:bg-white/[0.06]"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={onFileInputChange}
                />

                {uploadMutation.isPending ? (
                  <>
                    <div className="rounded-full bg-primary/15 p-4">
                      <LoaderCircle className="h-7 w-7 animate-spin text-primary" />
                    </div>
                    <div>
                      <div className="text-lg font-semibold">Uploading to Backforge storage...</div>
                      <div className="mt-1 text-sm text-muted-foreground">Files are being persisted and indexed.</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-full bg-primary/12 p-4">
                      <UploadCloud className="h-7 w-7 text-primary" />
                    </div>
                    <div>
                      <div className="text-lg font-semibold text-foreground">Drop files here or click to upload</div>
                      <div className="mt-1 text-sm text-muted-foreground">Images get live previews. Other assets still receive metadata and public URLs. Max 10 MB per file.</div>
                    </div>
                  </>
                )}
              </button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Asset list</CardTitle>
              <CardDescription>Name, type, size, and creation date stay visible so storage feels trustworthy after upload.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {filesQuery.isLoading ? <div className="text-sm text-muted-foreground">Loading files...</div> : null}
              {filesQuery.data?.length ? (
                filesQuery.data.map((asset) => {
                  const isSelected = asset.id === selectedAsset?.id;
                  const AssetIcon = getAssetIcon(asset.mimeType);
                  const previewUrl = buildPublicUrl(asset.url);

                  return (
                    <button
                      key={asset.id}
                      type="button"
                      className={`w-full rounded-[1.35rem] border px-4 py-4 text-left transition ${
                        isSelected
                          ? 'border-primary/30 bg-primary/10 shadow-[0_16px_34px_rgba(14,165,233,0.16)]'
                          : 'border-white/8 bg-white/4 hover:border-white/14 hover:bg-white/8'
                      }`}
                      onClick={() => setSelectedAssetId(asset.id)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[1rem] border border-white/10 bg-black/20">
                          {asset.mimeType.startsWith('image/') ? (
                            <img src={previewUrl} alt={asset.originalName} className="h-full w-full object-cover" />
                          ) : (
                            <AssetIcon className="h-6 w-6 text-muted-foreground" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{asset.originalName}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            <span>{asset.mimeType}</span>
                            <span>{formatBytes(asset.size)}</span>
                            <span>{new Date(asset.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-2xl"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleCopy(previewUrl, 'Public URL copied to clipboard.');
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-2xl text-muted-foreground hover:text-destructive"
                            onClick={(event) => {
                              event.stopPropagation();
                              deleteMutation.mutate(asset.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </button>
                  );
                })
              ) : !filesQuery.isLoading ? (
                <div className="rounded-[1.4rem] border border-dashed border-white/12 bg-white/4 px-6 py-12 text-center text-sm text-muted-foreground">
                  No assets yet. Upload a file to populate the manager and generate a public URL.
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="text-xl">Preview</CardTitle>
              <CardDescription>Select an asset to inspect its public URL and metadata.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedAsset ? (
                <>
                  <div className="flex min-h-[240px] items-center justify-center overflow-hidden rounded-[1.6rem] border border-white/8 bg-black/20">
                    {selectedAsset.mimeType.startsWith('image/') ? (
                      <img src={buildPublicUrl(selectedAsset.url)} alt={selectedAsset.originalName} className="h-full w-full object-cover" />
                    ) : (
                      (() => {
                        const AssetIcon = getAssetIcon(selectedAsset.mimeType);
                        return (
                          <div className="space-y-3 text-center">
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/8">
                              <AssetIcon className="h-7 w-7 text-muted-foreground" />
                            </div>
                            <div className="text-sm text-muted-foreground">Preview not available for this file type</div>
                          </div>
                        );
                      })()
                    )}
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="text-lg font-semibold">{selectedAsset.originalName}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{selectedAsset.mimeType}</div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[1.2rem] border border-white/8 bg-white/5 px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Size</div>
                        <div className="mt-2 text-lg font-semibold">{formatBytes(selectedAsset.size)}</div>
                      </div>
                      <div className="rounded-[1.2rem] border border-white/8 bg-white/5 px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Uploaded</div>
                        <div className="mt-2 text-sm font-medium">{formatCreatedAt(selectedAsset.createdAt)}</div>
                      </div>
                    </div>

                    <div className="rounded-[1.2rem] border border-white/8 bg-white/5 p-4">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Globe className="h-4 w-4 text-primary" />
                        Public URL
                      </div>
                      <div className="mt-3 break-all rounded-[1rem] bg-black/20 px-3 py-3 font-mono text-xs text-slate-200">
                        {buildPublicUrl(selectedAsset.url)}
                      </div>
                      <div className="mt-3 flex gap-3">
                        <Button variant="secondary" className="gap-2" onClick={() => void handleCopy(buildPublicUrl(selectedAsset.url), 'Public URL copied to clipboard.')}>
                          <Copy className="h-4 w-4" />
                          Copy URL
                        </Button>
                        <Button variant="ghost" className="gap-2 text-muted-foreground hover:text-destructive" onClick={() => deleteMutation.mutate(selectedAsset.id)}>
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-[1.4rem] border border-dashed border-white/12 bg-white/4 px-6 py-12 text-center text-sm text-muted-foreground">
                  Select an asset to open its preview panel.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
