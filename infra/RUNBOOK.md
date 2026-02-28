# TestRails Runbook

This runbook contains procedures for common operational tasks and incident response.

## Table of Contents
- [Health Checks](#health-checks)
- [Deployments](#deployments)
- [Database Operations](#database-operations)
- [Incident Response](#incident-response)
- [Rollback Procedures](#rollback-procedures)
- [Scaling](#scaling)
- [Backup & Restore](#backup--restore)

---

## Health Checks

### Check Application Status

```bash
# Staging
kubectl get pods -n testrails-staging
kubectl get pods -n testrails-staging -o wide

# Production
kubectl get pods -n testrails-prod
kubectl get pods -n testrails-prod -o wide

# Check pod health
kubectl describe pod <pod-name> -n <namespace>

# Check recent logs
kubectl logs -n <namespace> deployment/backend --tail=100 --follow
```

### Check Services

```bash
# List all services
kubectl get svc -n testrails-staging
kubectl get svc -n testrails-prod

# Check service endpoints
kubectl get endpoints -n <namespace>
```

### Application Health Endpoints

```bash
# Backend health
curl https://app.testrails.example.com/api/health
curl https://staging.testrails.example.com/api/health

# Check response times
curl -w "@curl-format.txt" -o /dev/null -s https://app.testrails.example.com/api/health
```

---

## Deployments

### Deploy to Staging

Staging deployments are automatic on push to `develop` branch.

Manual deployment:
```bash
# Trigger workflow via GitHub CLI
gh workflow run deploy-staging.yml --repo fulanzigler-blip/pilot-openclaw -f image_tag=develop-abc123
```

### Deploy to Production

Production deployments require tagging:

```bash
# Tag and push
git tag v1.0.0
git push origin v1.0.0

# Or trigger manually with specific image
gh workflow run deploy-production.yml --repo fulanzigler-blip/pilot-openclaw -f image_tag=v1.0.0
```

### Blue-Green Deployment (Production)

See blue-green steps in [README.md](./README.md).

### Monitor Deployment Progress

```bash
# Watch rollout status
kubectl rollout status deployment/backend -n testrails-staging
kubectl rollout status deployment/backend-blue -n testrails-prod

# Check rollout history
kubectl rollout history deployment/backend -n testrails-prod

# View specific revision
kubectl rollout history deployment/backend -n testrails-prod --revision=3
```

---

## Database Operations

### Connect to Database

```bash
# Get postgres pod
POSTGRES_POD=$(kubectl get pod -n testrails-prod -l app=postgres -o jsonpath='{.items[0].metadata.name}')

# Connect to postgres
kubectl exec -it -n testrails-prod $POSTGRES_POD -- psql -U testrails testrails
```

### Run Database Migrations

```bash
# Staging
kubectl exec -n testrails-staging deployment/backend -- python manage.py migrate

# Production
kubectl exec -n testrails-prod deployment/backend-blue -- python manage.py migrate
```

### Create Database Backup

```bash
# Manual backup
./infra/backups/backup-script.sh

# Backup specific pod
kubectl exec -n testrails-prod $POSTGRES_POD -- pg_dump -U testrails testrails | gzip > backup.sql.gz
```

---

## Incident Response

### Severity Levels

- **P1 - Critical:** System down, major impact on all users
- **P2 - High:** Significant degradation, partial outage
- **P3 - Medium:** Minor issues, workaround available
- **P4 - Low:** Cosmetic issues, no functional impact

### P1 Incident Procedure

1. **Acknowledge (5 min):**
   ```bash
   # Create incident issue in Linear
   linearis issues create --title "P1 Incident: <description>" --team AGE --priority 1
   ```

2. **Assess (15 min):**
   - Check Grafana dashboards
   - Review application logs
   - Identify affected components
   - Determine user impact

3. **Mitigate (30-60 min):**
   - Apply temporary fixes
   - Scale resources if needed
   - Rollback if necessary

4. **Resolve:**
   - Implement permanent fix
   - Update documentation
   - Create post-mortem

### Common Issues

#### High Error Rate

```bash
# Check error rate in logs
kubectl logs -n testrails-prod deployment/backend --tail=1000 | grep -i error

# Check pod restarts
kubectl get pods -n testrails-prod --sort-by='.status.containerStatuses[0].restartCount'

# Scale up if needed
kubectl scale deployment/backend -n testrails-prod --replicas=10
```

#### Database Connection Issues

```bash
# Check database pod status
kubectl get pods -n testrails-prod -l app=postgres

# Check database connections
kubectl exec -n testrails-prod $POSTGRES_POD -- psql -U testrails -c "SELECT count(*) FROM pg_stat_activity;"

# Restart database if needed
kubectl delete pod -n testrails-prod -l app=postgres
```

#### High Memory/CPU Usage

```bash
# Check resource usage
kubectl top pods -n testrails-prod
kubectl top nodes

# Check HPA status
kubectl get hpa -n testrails-prod

# Describe HPA events
kubectl describe hpa backend-hpa -n testrails-prod
```

---

## Rollback Procedures

### Quick Rollback (Blue-Green)

```bash
# Determine current active version
ACTIVE=$(kubectl get service backend -n testrails-prod -o jsonpath='{.spec.selector.version}')
TARGET=$( [ "$ACTIVE" = "blue" ] && echo "green" || echo "blue" )

# Switch traffic back
kubectl patch service backend -n testrails-prod -p '{"spec":{"selector":{"version":"'${ACTIVE}'"}}}'
kubectl patch service frontend -n testrails-prod -p '{"spec":{"selector":{"version":"'${ACTIVE}'"}}}'
```

### Rollback to Previous Docker Image

```bash
# View rollout history
kubectl rollout history deployment/backend-blue -n testrails-prod

# Rollback to previous revision
kubectl rollout undo deployment/backend-blue -n testrails-prod
kubectl rollout undo deployment/frontend-blue -n testrails-prod

# Rollback to specific revision
kubectl rollout undo deployment/backend-blue -n testrails-prod --to-revision=2
```

### Emergency Rollback

```bash
# Scale down new version
kubectl scale deployment/backend-green -n testrails-prod --replicas=0
kubectl scale deployment/frontend-green -n testrails-prod --replicas=0

# Ensure traffic is on blue
kubectl patch service backend -n testrails-prod -p '{"spec":{"selector":{"version":"blue"}}}'
kubectl patch service frontend -n testrails-prod -p '{"spec":{"selector":{"version":"blue"}}}'
```

---

## Scaling

### Manual Scaling

```bash
# Scale deployments
kubectl scale deployment/backend-blue -n testrails-prod --replicas=5
kubectl scale deployment/frontend-blue -n testrails-prod --replicas=5

# Scale all deployments in namespace
kubectl scale deployment -n testrails-prod --all --replicas=3
```

### Auto-Scaling

Check HPA status:
```bash
kubectl get hpa -n testrails-prod
kubectl describe hpa backend-hpa -n testrails-prod
```

Update HPA:
```bash
kubectl autoscale deployment backend-blue -n testrails-prod --min=3 --max=15 --cpu-percent=70
```

---

## Backup & Restore

### List Available Backups

```bash
aws s3 ls s3://testrails-backups/
```

### Restore from Backup

```bash
./infra/backups/restore-script.sh testrails-20260228-100000.sql.gz
```

### Point-in-Time Recovery (PITR)

PostgreSQL WAL archives enable PITR:

```bash
# Check WAL archive location
kubectl exec -n testrails-prod $POSTGRES_POD -- psql -U testrails -c "SHOW archive_mode;"

# Restore to specific point (requires manual intervention with pg_restore)
# Contact DBA for complex PITR operations
```

---

## Monitoring & Alerts

### Set Up Alerts

Configure alerts in [Prometheus rules](../monitoring/prometheus-config.yaml).

### Check Alert Status

```bash
# Check prometheus alerts
kubectl exec -n testrails-prod prometheus-0 -- amtool alert query

# View firing alerts
kubectl exec -n testrails-prod prometheus-0 -- wget -qO- http://localhost:9090/api/v1/alerts | jq '.data.alerts[] | select(.state=="firing")'
```

### Access Dashboards

- Grafana: `kubectl port-forward svc/grafana 3000:80 -n testrails-prod`
- Prometheus: `kubectl port-forward svc/prometheus 9090:90 -n testrails-prod`

---

## Emergency Contacts

- On-call DevOps: [Contact info]
- Engineering Lead: [Contact info]
- Product Manager: [Contact info]

---

## Additional Resources

- [GitHub Issues](https://github.com/fulanzigler-blip/pilot-openclaw/issues)
- [Linear Board](https://linear.app/team/AGE/issues)
- [Slack #testrails-devops](https://testrails.slack.com/archives/devops)
