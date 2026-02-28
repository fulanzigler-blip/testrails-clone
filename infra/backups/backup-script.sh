#!/bin/bash
# Database Backup Script for TestRails
# This script backs up PostgreSQL database to S3

set -e

# Configuration
NAMESPACE="${NAMESPACE:-testrails-prod}"
BACKUP_NAME="testrails-$(date +%Y%m%d-%H%M%S)"
S3_BUCKET="${S3_BUCKET:-s3://testrails-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

echo "Starting backup: ${BACKUP_NAME}"

# Get postgres pod
POSTGRES_POD=$(kubectl get pod -n ${NAMESPACE} -l app=postgres -o jsonpath='{.items[0].metadata.name}')

if [ -z "$POSTGRES_POD" ]; then
  echo "Error: Could not find postgres pod"
  exit 1
fi

echo "Found postgres pod: ${POSTGRES_POD}"

# Perform backup
echo "Running pg_dump..."
kubectl exec -n ${NAMESPACE} ${POSTGRES_POD} -- \
  pg_dump -U testrails testrails | \
  gzip > /tmp/${BACKUP_NAME}.sql.gz

# Upload to S3
echo "Uploading to S3..."
aws s3 cp /tmp/${BACKUP_NAME}.sql.gz ${S3_BUCKET}/${BACKUP_NAME}.sql.gz

# Clean up local file
rm /tmp/${BACKUP_NAME}.sql.gz

echo "Backup completed: ${S3_BUCKET}/${BACKUP_NAME}.sql.gz"

# Cleanup old backups
echo "Cleaning up backups older than ${RETENTION_DAYS} days..."
aws s3 ls ${S3_BUCKET}/ | \
  grep "testrails-" | \
  while read -r line; do
    FILE_DATE=$(echo $line | awk '{print $1}')
    FILE_NAME=$(echo $line | awk '{print $4}')
    if [ "$FILE_NAME" != "" ]; then
      FILE_TIME=$(date -d "$FILE_DATE" +%s)
      CURRENT_TIME=$(date +%s)
      DAYS_OLD=$(( (CURRENT_TIME - FILE_TIME) / 86400 ))
      if [ $DAYS_OLD -gt $RETENTION_DAYS ]; then
        echo "Deleting old backup: ${FILE_NAME}"
        aws s3 rm ${S3_BUCKET}/${FILE_NAME}
      fi
    fi
  done

echo "Backup process completed successfully"
