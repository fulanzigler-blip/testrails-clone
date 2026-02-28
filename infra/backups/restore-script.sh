#!/bin/bash
# Database Restore Script for TestRails
# This script restores PostgreSQL database from S3 backup

set -e

if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup-file-name>"
  echo "Example: $0 testrails-20260228-100000.sql.gz"
  exit 1
fi

BACKUP_FILE=$1
NAMESPACE="${NAMESPACE:-testrails-prod}"
S3_BUCKET="${S3_BUCKET:-s3://testrails-backups}"

echo "Starting restore from: ${S3_BUCKET}/${BACKUP_FILE}"

# Get postgres pod
POSTGRES_POD=$(kubectl get pod -n ${NAMESPACE} -l app=postgres -o jsonpath='{.items[0].metadata.name}')

if [ -z "$POSTGRES_POD" ]; then
  echo "Error: Could not find postgres pod"
  exit 1
fi

echo "Found postgres pod: ${POSTGRES_POD}"

# Download backup from S3
echo "Downloading backup from S3..."
aws s3 cp ${S3_BUCKET}/${BACKUP_FILE} /tmp/${BACKUP_FILE}

# Confirm restore
echo "WARNING: This will replace the current database!"
read -p "Are you sure you want to continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  echo "Restore cancelled"
  rm /tmp/${BACKUP_FILE}
  exit 0
fi

# Perform restore
echo "Restoring database..."
gunzip -c /tmp/${BACKUP_FILE} | \
  kubectl exec -i -n ${NAMESPACE} ${POSTGRES_POD} -- \
  psql -U testrails testrails

# Clean up
rm /tmp/${BACKUP_FILE}

echo "Restore completed successfully"
