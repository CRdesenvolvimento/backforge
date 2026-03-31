# Kubernetes Platform Guide

## What is in the repo

The Kubernetes assets under `k8s/` are organized as a Kustomize base plus two production overlays:

- `k8s/base`: namespace, config map, secret template, API rollout, worker deployment, ingress, HPA, PDB, network policy, ServiceMonitor, PrometheusRule, and rollout analysis template
- `k8s/overlays/production-canary`: Argo Rollouts canary strategy with progressive traffic weights
- `k8s/overlays/production-bluegreen`: Argo Rollouts blue/green strategy with a preview service and manual promotion

## Prerequisites

Install these cluster components before applying the manifests:

- `ingress-nginx`
- `cert-manager`
- `metrics-server`
- `Argo Rollouts`
- `kube-prometheus-stack` or another Prometheus Operator-compatible stack

The `HorizontalPodAutoscaler` targets the `Rollout` resource, so the Argo Rollouts CRDs must exist before applying the overlay.

## Secrets and config

Edit `k8s/base/secret.template.yaml` with the real values, then apply it as `backforge-secrets`.

Required keys:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `REFRESH_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_BASIC`
- `STRIPE_PRICE_PRO`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`

The non-secret runtime defaults live in `k8s/base/configmap.yaml`. The production overlays patch `APP_URL` and backend feature flags.

## Applying an overlay

Canary:

```bash
kubectl apply -k k8s/overlays/production-canary
```

Blue/green:

```bash
kubectl apply -k k8s/overlays/production-bluegreen
```

After the resources exist, update the image with Argo Rollouts:

```bash
kubectl argo rollouts set image backforge-api api=ghcr.io/OWNER/REPO:sha-COMMIT -n backforge
kubectl -n backforge set image deployment/backforge-worker worker=ghcr.io/OWNER/REPO:sha-COMMIT
```

## Rollout behavior

### Canary

- Uses `backforge-api` as the stable service
- Uses `backforge-api-canary` as the canary service
- Integrates with the main `Ingress` for weighted traffic using `ingress-nginx`
- Pauses at progressive traffic weights and runs Prometheus analysis

### Blue/green

- Uses `backforge-api` as the active service
- Uses `backforge-api-preview` as the preview service
- Leaves promotion manual by default
- Exposes preview traffic on `preview.backforge.example.com`

Promote or abort:

```bash
kubectl argo rollouts promote backforge-api -n backforge
kubectl argo rollouts abort backforge-api -n backforge
kubectl argo rollouts get rollout backforge-api -n backforge
```

## Observability hooks

The base manifests include:

- `ServiceMonitor` for `/metrics`
- `PrometheusRule` with latency, 5xx, and Redis connectivity alerts
- `AnalysisTemplate` for rollout success-rate and p95 latency checks

Import the dashboard from `monitoring/grafana/backforge-platform-dashboard.json` into Grafana and point it at your Prometheus datasource.

## CI/CD wiring

The GitHub Actions workflows expect:

- repository secret `KUBE_CONFIG_B64`
- optional repository variable `K8S_NAMESPACE`
- optional repository variable `VITE_FEATURE_FLAGS`

`deploy.yml` automatically ships `main` to the canary overlay. Manual runs can switch to blue/green and choose whether to promote immediately.
