export const platformEvents = {
  billingWebhookProcessed: 'billing.webhook.processed',
  projectCreated: 'project.created',
  userCreated: 'user.created',
} as const;

export type PlatformEventName = (typeof platformEvents)[keyof typeof platformEvents];
