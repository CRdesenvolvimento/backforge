import type { PlatformEventName } from './catalog.js';
import { enqueueBackgroundJob } from '../queues/queue.js';
import { isFeatureEnabled } from '../shared/flags.js';

export async function emitEvent(name: PlatformEventName, payload: Record<string, unknown>) {
  if (!isFeatureEnabled('eventBusV1')) {
    return null;
  }

  return enqueueBackgroundJob(name, {
    ...payload,
    emittedAt: new Date().toISOString(),
  });
}
