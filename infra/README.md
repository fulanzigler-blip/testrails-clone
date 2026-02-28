# TestRails Infrastructure

This directory contains all infrastructure and deployment configurations for TestRails.

## Directory Structure

```
infra/
├── k8s/                    # Kubernetes manifests
│   ├── staging/           # Staging environment configs
│   └── production/        # Production environment configs (blue-green)
├── monitoring/            # Monitoring and alerting configs
├── backups/              # Backup and restore scripts
└── terraform/            # Infrastructure as Code (AWS, etc.)
```

## Environments

### Staging
- **URL:** https://staging.testrails.example.com
- **Namespace:** `testrails-staging`
- **Replicas:** 2 (frontend + backend)
- **Deployment:** Rolling updates

### Production
- **URL:** https://app.testrails.example.com
- **Namespace:** `testrails-prod`
- **Replicas:** 3 (frontend + backend, auto-scaling)
- **Deployment:** Blue-green with zero downtime

## Quick Start

### Deploy to Staging
```bash
# Apply staging manifests
kubectl apply -f infra/k8s/staging/

# Check deployment status
kubectl get pods -n testrails-staging
kubectl get svc -n testrails-staging
```

### Deploy to Production
```bash
# Apply production manifests
kubectl apply -f infra/k8s/production/

# Check deployment status
kubectl get pods -n testrails-prod
kubectl get svc -n testrails-prod
```

### Blue-Green Deployment (Production)
```bash
# Deploy new version to green
kubectl set image deployment/backend-green backend=ghcr.io/fulanzigler-blip/pilot-openclaw/backend:v1.0.1 -n testrails-prod
kubectl set image deployment/frontend-green frontend=ghcr.io/fulanzigler-blip/pilot-openclaw/frontend:v1.0.1 -n testrails-prod

# Wait for rollout
kubectl rollout status deployment/backend-green -n testrails-prod
kubectl rollout status deployment/frontend-green -n testrails-prod

# Run smoke tests on green
kubectl port-forward -n testrails-prod svc/backend-green 8080:80 &
# Run tests...

# Switch traffic
kubectl patch service backend -n testrails-prod -p '{"spec":{"selector":{"version":"green"}}}'
kubectl patch service frontend -n testrails-prod -p '{"spec":{"selector":{"version":"green"}}}'
```

## Monitoring

### Access Grafana
```bash
kubectl port-forward -n testrails-prod svc/grafana 3000:80
# Open http://localhost:3000
```

### View Prometheus
```bash
kubectl port-forward -n testrails-prod svc/prometheus 9090:90
# Open http://localhost:9090
```

## Backups

### Manual Backup
```bash
chmod +x infra/backups/backup-script.sh
./infra/backups/backup-script.sh
```

### Manual Restore
```bash
chmod +x infra/backups/restore-script.sh
./infra/backups/restore-script.sh testrails-20260228-100000.sql.gz
```

### Automatic Backups
Backups run daily at 2 AM UTC via CronJob.

## Secrets Management

⚠️ **IMPORTANT:** The current secrets are placeholder values. Before deploying to production:

1. Use Sealed Secrets or External Secrets Operator
2. Generate strong passwords and keys
3. Store secrets securely
4. Never commit real secrets to Git

## Disaster Recovery

See [RUNBOOK.md](./RUNBOOK.md) for detailed procedures.

## Troubleshooting

### Check pod logs
```bash
kubectl logs -n testrails-staging deployment/backend
kubectl logs -n testrails-prod deployment/backend-blue
```

### Debug ingress
```bash
kubectl get ingress -n testrails-prod
kubectl describe ingress testrails-ingress -n testrails-prod
```

### Scale deployments
```bash
kubectl scale deployment/backend -n testrails-prod --replicas=5
```

## CI/CD

See [GitHub Actions workflows](../.github/workflows/) for automated deployment.
