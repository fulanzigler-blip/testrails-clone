# TestRails - Deployment Guide

Complete guide for deploying TestRails to staging and production environments.

## Prerequisites

- GitHub access to `fulanzigler-blip/pilot-openclaw`
- AWS CLI configured with appropriate credentials
- `kubectl` configured to access EKS clusters
- Docker installed (optional, for local builds)
- `gh` CLI for GitHub operations

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     AWS / EKS                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Frontend    │  │   Backend    │  │ PostgreSQL   │      │
│  │  (Nginx)     │  │  (Django)    │  │  Database    │      │
│  │  3 replicas  │  │  3 replicas  │  │  StatefulSet │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                 │                 │              │
│         └─────────────────┴─────────────────┘              │
│                           │                                 │
│                    ┌──────▼──────┐                         │
│                    │    Redis    │                         │
│                    │   Cache     │                         │
│                    └─────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

## Environments

| Environment | URL | Namespace | Replicas | Auto-scaling |
|-------------|-----|-----------|----------|--------------|
| Staging | https://staging.testrails.example.com | testrails-staging | 2 | No |
| Production | https://app.testrails.example.com | testrails-prod | 3 | Yes (3-10) |

## CI/CD Pipeline

### CI Workflow (`.github/workflows/ci.yml`)

Triggers on:
- Pull requests to `main` or `develop`
- Pushes to `main` or `develop`

Steps:
1. Lint (frontend + backend)
2. Test (frontend + backend)
3. Build and push Docker images

### Staging Deployment (`.github/workflows/deploy-staging.yml`)

Triggers on:
- Push to `develop` branch
- Manual workflow dispatch

Steps:
1. Deploy to Kubernetes
2. Wait for rollout
3. Run database migrations
4. Health checks
5. Notify on Slack

### Production Deployment (`.github/workflows/deploy-production.yml`)

Triggers on:
- Tags starting with `v*`
- Manual workflow dispatch

Steps:
1. Security scan
2. Create backup
3. Blue-green deployment
4. Database migrations
5. Smoke tests
6. Switch traffic
7. Health checks
8. Create GitHub release
9. Notify on Slack

## Initial Setup

### 1. Configure GitHub Secrets

Required secrets for staging:
```
AWS_ACCESS_KEY_ID_STAGING
AWS_SECRET_ACCESS_KEY_STAGING
SLACK_WEBHOOK_DEPLOYMENTS
```

Required secrets for production:
```
AWS_ACCESS_KEY_ID_PROD
AWS_SECRET_ACCESS_KEY_PROD
SLACK_WEBHOOK_DEPLOYMENTS
```

### 2. Set up EKS Clusters

```bash
# Create staging cluster
eksctl create cluster \
  --name staging-cluster \
  --region us-east-1 \
  --nodes 2 \
  --node-type t3.medium

# Create production cluster
eksctl create cluster \
  --name production-cluster \
  --region us-east-1 \
  --nodes 3 \
  --node-type t3.large \
  --asg-min 3 \
  --asg-max 10
```

### 3. Install Required Addons

```bash
# Install ingress controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/cloud/deploy.yaml

# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Install cluster issuer for Let's Encrypt
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ops@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

### 4. Create Namespaces

```bash
kubectl create namespace testrails-staging
kubectl create namespace testrails-prod
```

### 5. Configure Secrets

**Using Sealed Secrets (Recommended):**

```bash
# Install sealed-secrets
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.0/controller.yaml

# Create secret manifest
kubectl create secret generic database-secrets \
  --from-literal=username=testrails \
  --from-literal=password=strong-password \
  --from-literal=url=postgresql://... \
  --dry-run=client -o yaml > database-secrets.yaml

# Seal the secret
kubeseal --format yaml < database-secrets.yaml > sealed-database-secrets.yaml

# Apply sealed secret
kubectl apply -f sealed-database-secrets.yaml
```

### 6. Apply Infrastructure

```bash
# Apply monitoring stack
kubectl apply -f infra/monitoring/prometheus-config.yaml
kubectl apply -f infra/monitoring/grafana-dashboards.yaml

# Apply staging environment
kubectl apply -f infra/k8s/staging/

# Apply production environment
kubectl apply -f infra/k8s/production/
```

## Deployment Procedures

### Deploy to Staging

**Automatic (on push to develop):**
```bash
git checkout develop
git pull
# Make changes
git push origin develop
```

**Manual:**
```bash
gh workflow run deploy-staging.yml \
  --repo fulanzigler-blip/pilot-openclaw \
  -f image_tag=develop-$(git rev-parse --short HEAD)
```

### Deploy to Production

**Versioned release:**
```bash
# Create and push tag
git tag v1.0.0
git push origin v1.0.0
```

**Manual deployment:**
```bash
gh workflow run deploy-production.yml \
  --repo fulanzigler-blip/pilot-openclaw \
  -f image_tag=v1.0.0
```

### Manual Deployment (kubectl)

```bash
# Set new image
kubectl set image deployment/backend \
  backend=ghcr.io/fulanzigler-blip/pilot-openclaw/backend:v1.0.0 \
  -n testrails-prod

# Watch rollout
kubectl rollout status deployment/backend -n testrails-prod

# Run migrations
kubectl exec -n testrails-prod deployment/backend -- python manage.py migrate
```

## Blue-Green Deployment (Production)

Blue-green deployment ensures zero-downtime updates:

```bash
# 1. Deploy to green
kubectl set image deployment/backend-green backend=ghcr.io/.../backend:v1.0.1 -n testrails-prod
kubectl set image deployment/frontend-green frontend=ghcr.io/.../frontend:v1.0.1 -n testrails-prod

# 2. Wait for green to be healthy
kubectl rollout status deployment/backend-green -n testrails-prod
kubectl rollout status deployment/frontend-green -n testrails-prod

# 3. Run smoke tests on green
kubectl port-forward -n testrails-prod svc/backend-green 8080:80 &
curl http://localhost:8080/health

# 4. Switch traffic to green
kubectl patch service backend -n testrails-prod -p '{"spec":{"selector":{"version":"green"}}}'
kubectl patch service frontend -n testrails-prod -p '{"spec":{"selector":{"version":"green"}}}'

# 5. Verify production health
kubectl get pods -n testrails-prod -l version=green
curl https://app.testrails.example.com/health
```

## Rollback

### Quick Rollback (Blue-Green)

```bash
# Switch back to previous version
kubectl patch service backend -n testrails-prod -p '{"spec":{"selector":{"version":"blue"}}}'
kubectl patch service frontend -n testrails-prod -p '{"spec":{"selector":{"version":"blue"}}}'
```

### Rollback to Previous Revision

```bash
# View history
kubectl rollout history deployment/backend-blue -n testrails-prod

# Rollback
kubectl rollout undo deployment/backend-blue -n testrails-prod
```

## Monitoring & Observability

### Access Grafana
```bash
kubectl port-forward svc/grafana 3000:80 -n testrails-prod
# Open http://localhost:3000
```

### Access Prometheus
```bash
kubectl port-forward svc/prometheus 9090:90 -n testrails-prod
# Open http://localhost:9090
```

### View Logs
```bash
# All pods
kubectl logs -n testrails-prod -l app=backend --tail=100 --follow

# Specific pod
kubectl logs -n testrails-prod deployment/backend-blue --tail=100 --follow

# Previous container (crash)
kubectl logs -n testrails-prod <pod> --previous
```

### Metrics
Key metrics to monitor:
- Request rate and error rate
- Response time (p50, p95, p99)
- Database connection pool usage
- Redis hit rate
- Pod CPU and memory usage
- Pod restart count

## Backup & Disaster Recovery

### Automated Backups
- Daily backups at 2 AM UTC
- Retained for 30 days
- Stored in S3: `s3://testrails-backups/`

### Manual Backup
```bash
./infra/backups/backup-script.sh
```

### Restore from Backup
```bash
./infra/backups/restore-script.sh testrails-20260228-100000.sql.gz
```

### Disaster Recovery Plan
1. Assess incident severity
2. Create Linear issue for tracking
3. Implement mitigation
4. Restore from backup if needed
5. Post-mortem and improvements

See [RUNBOOK.md](./infra/RUNBOOK.md) for detailed procedures.

## Troubleshooting

### Common Issues

**Pods not starting:**
```bash
kubectl describe pod <pod-name> -n testrails-prod
kubectl logs <pod-name> -n testrails-prod
```

**High error rate:**
```bash
kubectl logs -n testrails-prod deployment/backend --tail=1000 | grep -i error
kubectl top pods -n testrails-prod
```

**Database connection issues:**
```bash
kubectl get pods -n testrails-prod -l app=postgres
kubectl exec -n testrails-prod <postgres-pod> -- psql -U testrails -c "SELECT version();"
```

**Ingress not working:**
```bash
kubectl get ingress -n testrails-prod
kubectl describe ingress testrails-ingress -n testrails-prod
kubectl logs -n ingress-nginx deployment/ingress-nginx-controller
```

## Security Considerations

1. **Secrets:** Use Sealed Secrets or External Secrets Operator
2. **Network Policies:** Implement namespace isolation
3. **RBAC:** Principle of least privilege
4. **Image Scanning:** Trivy scans in CI pipeline
5. **TLS:** Enforce HTTPS everywhere
6. **Pod Security:** Run as non-root user
7. **Resource Limits:** Set requests and limits
8. **Audit Logging:** Enable Kubernetes audit logs

## Cost Optimization

1. **Right-sizing:** Monitor and adjust resource requests/limits
2. **Auto-scaling:** HPA scales down during low traffic
3. **Spot Instances:** Use for worker nodes (if applicable)
4. **S3 Lifecycle:** Move old backups to Glacier
5. **Reserved Instances:** Purchase for predictable workloads

## Additional Resources

- [Infrastructure README](./infra/README.md)
- [Operations Runbook](./infra/RUNBOOK.md)
- [GitHub Issues](https://github.com/fulanzigler-blip/pilot-openclaw/issues)
- [Linear Board](https://linear.app/team/AGE/issues)
