#!/bin/bash

# Database Migration Script for Tests
# This script sets up the test database schema

set -e

# Load environment variables
if [ -f .env.test ]; then
  export $(cat .env.test | grep -v '^#' | xargs)
elif [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

echo "Running database migrations for test environment..."

# Generate Prisma Client
echo "Generating Prisma Client..."
npx prisma generate

# Run migrations
echo "Running Prisma migrations..."
npx prisma migrate deploy

# Seed test data (optional - for manual testing)
# npx prisma db seed

echo "✓ Database migrations complete!"
