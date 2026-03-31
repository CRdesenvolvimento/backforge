# Event-Driven Architecture

BACKFORGE now has a simple event bus backed by BullMQ so product flows can fan out without blocking the HTTP request lifecycle.

## Event flow

```text
API request
  -> domain service
    -> emitEvent(...)
      -> BullMQ queue
        -> dedicated worker
          -> async follow-up job
```

## Current platform events

- `user.created`
- `project.created`
- `billing.webhook.processed`

The catalog lives in `src/events/catalog.ts`.

## Where events are emitted

- user registration
- project creation
- Stripe webhook processing

## Worker responsibilities

The worker entrypoint is `src/queues/worker.ts`. Today it handles onboarding, project bootstrap, and billing follow-up jobs. As the product grows, the recommended pattern is:

1. keep the event name in `src/events/catalog.ts`
2. emit the event from the domain service
3. handle the async effect inside the worker or a dedicated processor module

## Why this matters

- HTTP handlers stay fast
- retries and backoff are centralized in BullMQ
- rollout and billing flows can trigger follow-up work safely
- future integrations such as email, CRM sync, or audit pipelines can plug into the same bus
