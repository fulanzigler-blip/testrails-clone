# Testing Guide

## Overview

This backend has comprehensive test coverage including:
- **Unit tests** for individual functions and utilities
- **Integration tests** for API endpoints and workflows
- **Coverage goal**: >70% across all modules

## Prerequisites

Before running tests, ensure you have:

1. **PostgreSQL** running on `localhost:5432`
2. **Redis** running on `localhost:6379`
3. **Node.js** v24+ installed
4. **Test database** created (see setup below)

## Setup

### 1. Create Test Database

```bash
./scripts/setup-test-db.sh
```

This script creates:
- Database: `testrails_test`
- User: `test` (password: `test`)
- Grants necessary privileges

### 2. Run Migrations

```bash
# Load test environment variables
export $(cat .env.test | grep -v '^#' | xargs)

# Run migrations
npx prisma migrate deploy
```

Or use the convenience script:

```bash
./scripts/migrate-test-db.sh
```

### 3. Install Dependencies

```bash
npm install --legacy-peer-deps
```

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

This runs tests whenever files change - great for development.

### Run Tests Once

```bash
npm run test:run
```

### Generate Coverage Report

```bash
npm run test:coverage
```

Coverage reports are generated in:
- `coverage/index.html` - Interactive HTML report
- `coverage/lcov.info` - LCov format for CI tools
- Terminal output with summary

### Open Test UI

```bash
npm run test:ui
```

Opens a browser-based UI for running and viewing tests.

## Test Structure

```
tests/
├── setup.ts                 # Global test setup/teardown
├── helpers/
│   ├── test-data.ts          # Test data factories
│   └── api.ts                # API test helpers
├── unit/
│   └── *.test.ts            # Unit tests
└── integration/
    ├── auth.test.ts                 # Authentication endpoints
    ├── organizations.test.ts        # Organization endpoints
    ├── users.test.ts                # User endpoints
    ├── projects.test.ts             # Projects & test suites
    ├── test-cases-runs.test.ts      # Test cases, runs, results
    └── integrations-notifications.test.ts # Integrations & notifications
```

## Writing Tests

### Integration Test Example

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp } from '../helpers/api';
import { createTestUser, createTestOrganization } from '../helpers/test-data';

describe('Feature Name', () => {
  let app: any;
  let accessToken: string;

  beforeEach(async () => {
    // Setup test app
    app = await createTestApp();

    // Create test data
    const org = await createTestOrganization();
    const user = await createTestUser(org.id);
    accessToken = app.jwt.sign({ userId: user.id });
  });

  it('should do something', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/endpoint',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const result = JSON.parse(response.payload);
    expect(result.success).toBe(true);
  });
});
```

### Unit Test Example

```typescript
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/utils/auth';

describe('Password Utilities', () => {
  it('should hash password correctly', async () => {
    const password = 'MySecurePassword123!';
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    expect(hash.length).toBeGreaterThan(50);
  });

  it('should verify password correctly', async () => {
    const password = 'MySecurePassword123!';
    const hash = await hashPassword(password);

    const isValid = await verifyPassword(hash, password);
    expect(isValid).toBe(true);
  });
});
```

## Test Helpers

### Test Data Factories

Located in `tests/helpers/test-data.ts`:

```typescript
// Create test organization
const org = await createTestOrganization();

// Create test user
const user = await createTestUser(org.id);

// Create test project
const project = await createTestProject(org.id);

// Create test suite
const suite = await createTestTestSuite(project.id);

// Create test case
const testCase = await createTestTestCase(suite.id, userId);
```

### API Helpers

Located in `tests/helpers/api.ts`:

```typescript
// Create test Fastify app
const app = await createTestApp();

// Generate access token
const token = app.jwt.sign({ userId: user.id });
```

## Coverage Goals

Current targets (minimum):
- **Lines**: 70%
- **Functions**: 70%
- **Branches**: 70%
- **Statements**: 70%

View coverage:
```bash
npm run test:coverage
# Then open coverage/index.html in a browser
```

## CI/CD

Tests run automatically on GitHub Actions for:
- Push to `master`, `main`, or `develop` branches
- Pull requests targeting these branches

The CI workflow:
1. Sets up PostgreSQL and Redis services
2. Installs dependencies
3. Runs database migrations
4. Executes all tests with coverage
5. Uploads coverage to Codecov

## Troubleshooting

### Database Connection Error

```
Error: Can't reach database server
```

**Solution**: Ensure PostgreSQL is running:
```bash
# Check status
sudo service postgresql status

# Start if needed
sudo service postgresql start
```

### Redis Connection Error

```
Error: connect ECONNREFUSED 127.0.0.1:6379
```

**Solution**: Ensure Redis is running:
```bash
# Check status
redis-cli ping

# Start if needed
redis-server
```

### Test Database Not Found

```
Error: database "testrails_test" does not exist
```

**Solution**: Run the setup script:
```bash
./scripts/setup-test-db.sh
```

### Migration Errors

```
Error: P3006
Migration failed
```

**Solution**: Reset the test database:
```bash
# Drop and recreate
psql -U postgres -c "DROP DATABASE IF EXISTS testrails_test;"
./scripts/setup-test-db.sh
./scripts/migrate-test-db.sh
```

## Best Practices

1. **Isolation**: Each test should be independent - use `beforeEach` to clean up
2. **Descriptive names**: Test names should clearly describe what they test
3. **One assertion per test**: Focus on one behavior per test case
4. **Use helpers**: Leverage test data factories and API helpers
5. **Test both happy and error paths**: Don't just test success cases
6. **Keep tests fast**: Avoid unnecessary setup or teardown
7. **Clean up resources**: Always close connections in `afterAll`

## Contributing

When adding new features:
1. Write tests before or alongside implementation
2. Ensure coverage doesn't drop below 70%
3. Add integration tests for new API endpoints
4. Update this guide if adding new test utilities

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Prisma Testing Guide](https://www.prisma.io/docs/guides/testing)
- [Fastify Testing Guide](https://www.fastify.io/docs/latest/Guides/Testing/)
