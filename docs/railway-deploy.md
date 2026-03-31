# Railway Deploy

BACKFORGE is ready for Railway GitHub auto-deploy with the repository `Dockerfile` plus `railway.json`.

## What Railway Uses

- Build: repository `Dockerfile`
- Pre-deploy: `npm run prisma:migrate:deploy`
- Start: `npm run start`
- Healthcheck: `GET /readyz`

The app already supports:

- `process.env.PORT` for the HTTP listener
- `DATABASE_URL` for Prisma/PostgreSQL
- graceful startup when `REDIS_URL` is missing
- structured API errors in the shape `{ "error": "message" }`
- `GET /livez` and `GET /readyz`

## Required Variables

- `DATABASE_URL`
- `JWT_SECRET`
- `REFRESH_SECRET`
- `APP_URL`
- `NODE_ENV=production`

## Optional Variables

- `REDIS_URL`
- `CORS_ORIGIN`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_BASIC`
- `STRIPE_PRICE_PRO`
- `LOG_LEVEL`

## Railway Setup

1. Push the repository to GitHub.
2. Create a new Railway project from the GitHub repo.
3. Provision a PostgreSQL service and map its connection string to `DATABASE_URL`.
4. Add the required environment variables above.
5. Deploy.

If you do not provision Redis, BACKFORGE still boots and serves traffic. Cache, queue processing, and Redis-backed rate limiting degrade gracefully.

## Deploy Behavior

- Prisma client is generated during `postinstall`.
- The build produces the API in `dist/server`, a small entrypoint in `dist/server.js`, and the frontend in `dist/client`.
- Railway runs `npm run prisma:migrate:deploy` before startup so schema migrations are applied automatically.

## Local Smoke Test

```bash
npm run build
NODE_ENV=production npm run start
```
