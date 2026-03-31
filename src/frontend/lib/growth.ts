import { api } from './api';

const sessionStorageKey = 'backforge-growth-session-id';

function createSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getGrowthSessionId() {
  if (typeof window === 'undefined') {
    return 'server-render';
  }

  const currentId = window.localStorage.getItem(sessionStorageKey);

  if (currentId) {
    return currentId;
  }

  const nextId = createSessionId();
  window.localStorage.setItem(sessionStorageKey, nextId);
  return nextId;
}

interface CaptureGrowthEventOptions {
  path?: string;
  projectId?: string;
  metadata?: Record<string, unknown>;
}

export async function captureGrowthEvent(name: string, options: CaptureGrowthEventOptions = {}) {
  try {
    await api.post('/growth/events', {
      name,
      sessionId: getGrowthSessionId(),
      path: options.path ?? (typeof window !== 'undefined' ? window.location.pathname : undefined),
      projectId: options.projectId,
      metadata: options.metadata,
    });
  } catch {
    return;
  }
}
