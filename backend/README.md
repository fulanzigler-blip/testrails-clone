# TestRails Clone - Backend API

Backend API for the TestRails clone test management system.

## Tech Stack

- **Runtime**: Node.js 20+ LTS
- **Framework**: Fastify 4+
- **Language**: TypeScript 5+
- **ORM**: Prisma 5+
- **Database**: PostgreSQL 15+
- **Cache**: Redis 7+
- **Authentication**: JWT + Refresh Tokens (Argon2 for password hashing)

## Features

- **Authentication**: JWT with refresh tokens, secure password hashing with Argon2
- **User Management**: CRUD operations, role-based access control (RBAC)
- **Organization Management**: Multi-tenant support
- **Project Management**: Organize test cases by project
- **Test Suite Management**: Hierarchical test suites
- **Test Case Management**: Full CRUD with versioning, tags, custom fields
- **Test Run Management**: Execute test runs, track progress in real-time
- **Test Result Tracking**: Record test results, add attachments
- **Bug Tracking**: Create bugs from failed tests, integrate with external trackers
- **Reports & Analytics**: Summary reports, trend analysis, export to CSV/JSON
- **Integrations**: Jira, GitHub, GitLab, Linear, Slack, Email, Webhooks
- **Real-time Updates**: WebSocket support for live test execution updates
- **Rate Limiting**: Token bucket algorithm with Redis
- **Comprehensive Logging**: Winston structured logging

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user and organization
- `POST /api/v1/auth/login` - Login user
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/logout` - Logout user
- `GET /api/v1/auth/me` - Get current user info

### Organizations
- `GET /api/v1/organizations/:id` - Get organization details
- `PUT /api/v1/organizations/:id` - Update organization

### Users
- `GET /api/v1/users` - List users in organization
- `GET /api/v1/users/:id` - Get user details
- `PUT /api/v1/users/:id` - Update user
- `DELETE /api/v1/users/:id` - Delete user

### Projects
- `GET /api/v1/projects` - List projects
- `POST /api/v1/projects` - Create project
- `GET /api/v1/projects/:id` - Get project details
- `PUT /api/v1/projects/:id` - Update project
- `DELETE /api/v1/projects/:id` - Delete project

### Test Suites
- `GET /api/v1/test-suites` - List test suites
- `POST /api/v1/test-suites` - Create test suite
- `GET /api/v1/test-suites/:id` - Get test suite details
- `PUT /api/v1/test-suites/:id` - Update test suite
- `DELETE /api/v1/test-suites/:id` - Delete test suite

### Test Cases
- `GET /api/v1/test-cases` - List test cases
- `POST /api/v1/test-cases` - Create test case
- `GET /api/v1/test-cases/:id` - Get test case details
- `PUT /api/v1/test-cases/:id` - Update test case
- `POST /api/v1/test-cases/:id/clone` - Clone test case
- `DELETE /api/v1/test-cases/:id` - Delete test case
- `POST /api/v1/test-cases/bulk-delete` - Bulk delete test cases

### Test Runs
- `GET /api/v1/test-runs` - List test runs
- `POST /api/v1/test-runs` - Create test run
- `GET /api/v1/test-runs/:id` - Get test run details
- `POST /api/v1/test-runs/:id/start` - Start test run
- `POST /api/v1/test-runs/:id/complete` - Complete test run
- `DELETE /api/v1/test-runs/:id` - Delete test run

### Test Results
- `GET /api/v1/test-runs/:runId/results` - Get results for test run
- `PUT /api/v1/results/:id` - Update test result
- `POST /api/v1/results/:id/bug` - Create bug from failed test

### Reports
- `GET /api/v1/reports/summary` - Get summary report
- `GET /api/v1/reports/test-run/:id` - Get test run report
- `GET /api/v1/reports/export/:type` - Export report (csv, json)

### Integrations
- `GET /api/v1/integrations` - List integrations
- `POST /api/v1/integrations` - Create integration
- `PUT /api/v1/integrations/:id` - Update integration
- `DELETE /api/v1/integrations/:id` - Delete integration
- `POST /api/v1/integrations/:id/test` - Test integration

### Notifications
- `GET /api/v1/notifications` - Get user notifications
- `PUT /api/v1/notifications/:id/read` - Mark as read
- `PUT /api/v1/notifications/read-all` - Mark all as read
- `DELETE /api/v1/notifications/:id` - Delete notification

## Setup

### Prerequisites
- Node.js 20+ LTS
- PostgreSQL 15+
- Redis 7+

### Installation

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Run database migrations:
```bash
npm run prisma:migrate
```

4. Generate Prisma client:
```bash
npm run prisma:generate
```

5. Start development server:
```bash
npm run dev
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | - |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | JWT secret key | - |
| `JWT_EXPIRES_IN` | Access token expiry | `15m` |
| `REFRESH_TOKEN_EXPIRES_IN` | Refresh token expiry | `7d` |
| `PORT` | Server port | `3000` |
| `HOST` | Server host | `0.0.0.0` |
| `NODE_ENV` | Environment | `development` |
| `CORS_ORIGIN` | CORS allowed origin | `http://localhost:3000` |
| `RATE_LIMIT_MAX` | Max requests per window | `1000` |
| `RATE_LIMIT_TIME_WINDOW` | Rate limit window | `1 hour` |
| `LOG_LEVEL` | Logging level | `info` |

## Database Schema

See [DATABASE_SCHEMA.md](../DATABASE_SCHEMA.md) for complete schema documentation.

### Key Tables
- `organizations` - Multi-tenant organizations
- `users` - User accounts with roles (admin, manager, tester, viewer)
- `projects` - Test projects
- `test_suites` - Hierarchical test case collections
- `test_cases` - Individual test cases with versioning
- `test_runs` - Test execution runs
- `test_results` - Individual test results
- `bugs` - Bug records linked to test results
- `integrations` - External service integrations

## Authentication Flow

1. **Register**: User creates account → Organization created → User assigned as admin
2. **Login**: Email/password verified → JWT access token + refresh token issued
3. **Refresh**: Use refresh token to get new access token
4. **Logout**: Refresh token invalidated

All API endpoints (except `/auth/*`) require authentication via Bearer token:
```
Authorization: Bearer <access_token>
```

## Rate Limiting

- **Authenticated**: 1000 requests per hour
- **Unauthenticated**: 100 requests per hour

Rate limit headers included in responses:
```
x-ratelimit-limit: 1000
x-ratelimit-remaining: 995
x-ratelimit-reset: 1705317600
```

## Role-Based Access Control (RBAC)

| Role | Permissions |
|------|-------------|
| `admin` | Full access to all resources |
| `manager` | Create/edit projects, suites, test cases, test runs |
| `tester` | Execute tests, update results |
| `viewer` | Read-only access |

## Testing

The backend has comprehensive test coverage with both unit and integration tests.

### Coverage Goal
>70% coverage across lines, functions, branches, and statements.

### Test Structure
```
tests/
├── setup.ts                 # Global test setup/teardown
├── helpers/
│   ├── api.ts               # API testing utilities
│   └── test-data.ts         # Test data factories
├── unit/
│   ├── auth.test.ts         # Auth utilities tests
│   └── test-data.test.ts    # Test data factory tests
└── integration/
    ├── auth.test.ts         # Authentication endpoints
    ├── organizations.test.ts # Organization endpoints
    ├── users.test.ts        # User endpoints
    ├── projects.test.ts     # Projects & test suites
    ├── test-cases-runs.test.ts # Test cases, runs, results
    └── integrations-notifications.test.ts # Integrations & notifications
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run tests with UI
npm run test:ui

# Run tests once (CI mode)
npm run test:run
```

### Test Database Setup

Before running tests, set up the test database:

```bash
# Create test database
./scripts/setup-test-db.sh

# Run migrations
./scripts/migrate-test-db.sh
```

Or manually:
```bash
# Create database
createdb testrails_test

# Run migrations
DATABASE_URL=postgresql://test:test@localhost:5432/testrails_test npm run prisma:migrate
```

### Test Documentation

For detailed testing guide, see [tests/README.md](tests/README.md).

## Scripts

```bash
npm run dev              # Start development server with watch
npm run build            # Build TypeScript to JavaScript
npm run start            # Start production server

# Testing
npm run test             # Run tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Run tests with coverage
npm run test:ui          # Run tests with UI
npm run test:run         # Run tests once (CI mode)

# Database
npm run prisma:generate  # Generate Prisma client
npm run prisma:migrate   # Run database migrations
npm run prisma:studio    # Open Prisma Studio
npm run db:setup:test    # Setup test database

# Code quality
npm run lint             # Lint code
npm run format           # Format code
```

## WebSocket

Connect to WebSocket at `/ws` for real-time updates:

```javascript
const ws = new WebSocket('ws://localhost:3000/ws');
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Handle real-time updates
};
```

## Development

### Database Changes
1. Modify `prisma/schema.prisma`
2. Run `npm run prisma:migrate` to create migration
3. Run `npm run prisma:generate` to update types

### Adding New Routes
1. Create route file in `src/routes/`
2. Export async function that receives Fastify instance
3. Register in `src/index.ts`

### Testing
```bash
npm run test
```

## Production Deployment

1. Set `NODE_ENV=production`
2. Use strong `JWT_SECRET`
3. Configure CORS origin
4. Enable HTTPS
5. Set up PostgreSQL backups
6. Configure Redis persistence
7. Set up monitoring (Prometheus + Grafana)
8. Enable error tracking (Sentry)

## License

MIT
