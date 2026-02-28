#!/bin/bash

# Setup Test Database Script
# This script creates a separate test database for running tests

set -e

# Database configuration
DB_NAME="testrails_test"
DB_USER="test"
DB_PASS="test"
DB_HOST="localhost"
DB_PORT="5432"

echo "Setting up test database..."

# Check if PostgreSQL is running
if ! pg_isready -h $DB_HOST -p $DB_PORT > /dev/null 2>&1; then
    echo "Error: PostgreSQL is not running at $DB_HOST:$DB_PORT"
    exit 1
fi

# Check if user exists, if not create it
echo "Checking if database user '$DB_USER' exists..."
USER_EXISTS=$(psql -h $DB_HOST -p $DB_PORT -U postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" || echo "")

if [ -z "$USER_EXISTS" ]; then
    echo "Creating database user '$DB_USER'..."
    psql -h $DB_HOST -p $DB_PORT -U postgres -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
    psql -h $DB_HOST -p $DB_PORT -U postgres -c "ALTER USER $DB_USER CREATEDB;"
else
    echo "User '$DB_USER' already exists."
fi

# Drop existing test database if it exists
echo "Dropping existing test database (if exists)..."
psql -h $DB_HOST -p $DB_PORT -U postgres -c "DROP DATABASE IF EXISTS $DB_NAME;" || true

# Create test database
echo "Creating test database '$DB_NAME'..."
psql -h $DB_HOST -p $DB_PORT -U postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

# Grant privileges
echo "Granting privileges..."
psql -h $DB_HOST -p $DB_PORT -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

echo "✓ Test database setup complete!"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
echo "  Host: $DB_HOST:$DB_PORT"
