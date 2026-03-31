# Oracle Cloud Deploy

## 1. Prepare the VPS

Use Ubuntu on Oracle Cloud and open inbound ports `22`, `80`, and `443` in the VCN security list or network security group before exposing the app.

```bash
sudo apt update
sudo apt install -y nodejs npm nginx
```

## 2. Configure the application

Copy `.env.example` to `.env`, then set production values for:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `REFRESH_SECRET`
- `APP_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_BASIC`
- `STRIPE_PRICE_PRO`

Build and start the app locally on the server:

```bash
npm install
npx prisma db push
npm run build
npm start
npm run start:worker
```

## 3. Keep the process alive with PM2

```bash
sudo npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

The app serves HTTP on `127.0.0.1:3000`.
If cluster mode is enabled, aggregated metrics can also be exposed on `127.0.0.1:${METRICS_PORT:-9090}`.

## 4. Configure Nginx

Copy the provided template:

```bash
sudo cp deploy/oracle-cloud/backforge.nginx.conf /etc/nginx/sites-available/backforge
sudo ln -s /etc/nginx/sites-available/backforge /etc/nginx/sites-enabled/backforge
sudo nginx -t
sudo systemctl reload nginx
```

Replace `server_name _;` with your real domain before enabling HTTPS.

## 5. Enable HTTPS with Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx
```

After HTTPS is active, point Stripe webhooks to:

```text
https://YOUR_DOMAIN/webhooks/stripe
```

## 6. Stripe live checklist

- Create live-mode prices in Stripe and set `STRIPE_PRICE_BASIC` and `STRIPE_PRICE_PRO`
- Configure the webhook endpoint secret in `STRIPE_WEBHOOK_SECRET`
- Subscribe the endpoint to:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- Verify webhook deliveries return `2xx`

## 7. Operational notes

- `Fastify` is configured with `trustProxy`, so `X-Forwarded-*` headers from Nginx are honored
- Global rate limiting is enabled in the app and tenant limits are enforced per project plan
- Redis is used for cache, distributed rate limiting, and BullMQ queues when `REDIS_URL` is configured
- Run at least one dedicated `npm run start:worker` process in production for async jobs
- Stripe webhooks are verified from the raw request body and stored idempotently in the database
