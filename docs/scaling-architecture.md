# Scaling Architecture

## Current production shape

BACKFORGE is now structured so the HTTP API, queue workers, Redis, and the database can scale independently.

```text
Cloudflare / CDN
  -> Load Balancer / NGINX
    -> BACKFORGE API instances (Fastify)
      -> Redis (cache, distributed rate limit, BullMQ)
      -> PostgreSQL / managed database
    -> BACKFORGE workers (BullMQ)
```

## What is already implemented

- Redis-backed cache and distributed rate limiting with in-memory fallback
- BullMQ queue producer plus standalone worker process
- Winston application logging
- Prometheus `/metrics` endpoint plus optional cluster metrics port
- Readiness and liveness probes: `/readyz`, `/livez`, `/health`
- Optional Node cluster mode via `ENABLE_CLUSTER=true`
- Docker image plus `docker-compose.yml` for local orchestration

## Multi-region guidance

- Put Cloudflare in front of every region for global caching and DDoS protection
- Run multiple BACKFORGE API nodes behind NGINX or a managed load balancer
- Keep Redis external to the app nodes; use a managed Redis service or sentinel/cluster setup
- Use a managed database with replica or multi-region strategy, such as Neon or Supabase for PostgreSQL
- Run workers close to Redis to reduce queue latency
- Scrape `/metrics` from every API instance and worker, then federate into Prometheus/Grafana

## Environment knobs

- `ENABLE_CLUSTER=true` enables Node cluster mode in production
- `CLUSTER_WORKERS` overrides CPU auto-detection
- `METRICS_PORT` exposes aggregated cluster metrics when clustering is enabled
- `QUEUE_CONCURRENCY` tunes BullMQ worker throughput
- `LOG_LEVEL` controls Winston verbosity
