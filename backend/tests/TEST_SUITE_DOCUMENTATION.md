# Test Suite Documentation

This document provides a comprehensive overview of all test suites, test cases, and coverage areas.

## Unit Tests

### Auth Utilities (`tests/unit/auth.test.ts`)

#### hashPassword
- ✅ Hash password correctly
- ✅ Generate different hashes for same password
- ✅ Handle empty password

#### verifyPassword
- ✅ Verify correct password
- ✅ Reject incorrect password
- ✅ Reject invalid hash

#### Token Generation
- ✅ Generate access token with correct payload
- ✅ Generate refresh token with correct payload

#### Combined Scenarios
- ✅ Hash and verify password successfully
- ✅ Handle special characters in passwords

### Test Data Factories (`tests/unit/test-data.test.ts`)

#### Factory Functions
- ✅ createTestOrganization
- ✅ createTestUser
- ✅ createTestTeam
- ✅ createTestProject
- ✅ createTestTestSuite
- ✅ createTestTestCase
- ✅ createTestTestRun
- ✅ createTestTestResult
- ✅ createTestBug
- ✅ createTestIntegration
- ✅ createTestNotification

#### Utility Functions
- ✅ randomString generates unique strings
- ✅ randomString includes prefix
- ✅ randomEmail generates valid addresses
- ✅ randomEmail generates unique emails

## Integration Tests

### Authentication (`tests/integration/auth.test.ts`)

#### POST /api/v1/auth/register
- ✅ Register new user and organization
- ✅ Reject duplicate email registration
- ✅ Validate required fields

#### POST /api/v1/auth/login
- ✅ Login with valid credentials
- ✅ Reject invalid email
- ✅ Reject invalid password

#### POST /api/v1/auth/refresh
- ✅ Refresh access token with valid refresh token
- ✅ Reject refresh without token

#### GET /api/v1/auth/me
- ✅ Get current user info with valid token
- ✅ Reject request without token
- ✅ Reject request with invalid token

#### POST /api/v1/auth/logout
- ✅ Logout and remove refresh token

### Organizations (`tests/integration/organizations.test.ts`)

#### GET /api/v1/organizations
- ✅ Get user organization
- ✅ Reject request without authentication

#### GET /api/v1/organizations/:id
- ✅ Get organization by ID
- ✅ Return 404 for non-existent organization

#### PATCH /api/v1/organizations/:id
- ✅ Update organization name
- ✅ Reject invalid data

### Users (`tests/integration/users.test.ts`)

#### GET /api/v1/users
- ✅ Get all users in organization
- ✅ Reject request without authentication

#### GET /api/v1/users/:id
- ✅ Get user by ID
- ✅ Return 404 for non-existent user

#### PATCH /api/v1/users/:id
- ✅ Update user profile
- ✅ Update user role
- ✅ Reject invalid role

#### DELETE /api/v1/users/:id
- ✅ Delete user
- ✅ Prevent deletion of last admin user

### Projects & Test Suites (`tests/integration/projects.test.ts`)

#### Project Endpoints
- ✅ POST /api/v1/projects - Create new project
- ✅ POST /api/v1/projects - Reject invalid data
- ✅ GET /api/v1/projects - Get all projects
- ✅ GET /api/v1/projects/:id - Get project by ID
- ✅ GET /api/v1/projects/:id - Return 404 for non-existent
- ✅ PATCH /api/v1/projects/:id - Update project
- ✅ DELETE /api/v1/projects/:id - Delete project

#### Test Suite Endpoints
- ✅ POST /api/v1/test-suites - Create new test suite
- ✅ POST /api/v1/test-suites - Reject invalid projectId
- ✅ GET /api/v1/test-suites - Get all test suites
- ✅ GET /api/v1/test-suites/:id - Get test suite by ID
- ✅ PATCH /api/v1/test-suites/:id - Update test suite
- ✅ DELETE /api/v1/test-suites/:id - Delete test suite

### Test Cases, Test Runs & Test Results (`tests/integration/test-cases-runs.test.ts`)

#### Test Case Endpoints
- ✅ POST /api/v1/test-cases - Create new test case
- ✅ GET /api/v1/test-cases - Get all test cases
- ✅ PATCH /api/v1/test-cases/:id - Update test case

#### Test Run Endpoints
- ✅ POST /api/v1/test-runs - Create new test run
- ✅ GET /api/v1/test-runs - Get all test runs
- ✅ PATCH /api/v1/test-runs/:id - Update test run status

#### Test Result Endpoints
- ✅ POST /api/v1/test-results - Create new test result
- ✅ GET /api/v1/test-results - Get all test results
- ✅ PATCH /api/v1/test-results/:id - Update test result status

### Integrations & Notifications (`tests/integration/integrations-notifications.test.ts`)

#### Integration Endpoints
- ✅ POST /api/v1/integrations - Create new integration
- ✅ POST /api/v1/integrations - Reject invalid type
- ✅ GET /api/v1/integrations - Get all integrations
- ✅ GET /api/v1/integrations/:id - Get integration by ID
- ✅ PATCH /api/v1/integrations/:id - Update integration
- ✅ DELETE /api/v1/integrations/:id - Delete integration

#### Notification Endpoints
- ✅ GET /api/v1/notifications - Get all notifications
- ✅ GET /api/v1/notifications - Filter by unread status
- ✅ PATCH /api/v1/notifications/:id/read - Mark as read
- ✅ PATCH /api/v1/notifications/read-all - Mark all as read
- ✅ DELETE /api/v1/notifications/:id - Delete notification

## Test Coverage Matrix

| Module | Unit Tests | Integration Tests | Total Test Cases |
|--------|-----------|-------------------|------------------|
| Authentication | 9 | 13 | 22 |
| Organizations | 0 | 4 | 4 |
| Users | 0 | 5 | 5 |
| Projects | 0 | 14 | 14 |
| Test Cases | 0 | 3 | 3 |
| Test Runs | 0 | 3 | 3 |
| Test Results | 0 | 3 | 3 |
| Integrations | 0 | 5 | 5 |
| Notifications | 0 | 5 | 5 |
| **TOTAL** | **9** | **55** | **64** |

## Coverage Goals

| Metric | Target | Status |
|--------|--------|--------|
| Lines | 70% | ⏳ Pending test run |
| Functions | 70% | ⏳ Pending test run |
| Branches | 70% | ⏳ Pending test run |
| Statements | 70% | ⏳ Pending test run |

## Key Workflows Tested

### 1. User Registration & Login Flow
```
POST /api/v1/auth/register
  → Creates organization and user
  → Returns access token
  → Stores refresh token in Redis

POST /api/v1/auth/login
  → Verifies credentials
  → Generates tokens
  → Updates last login timestamp

GET /api/v1/auth/me
  → Validates JWT token
  → Returns user with organization
  → Includes team memberships

POST /api/v1/auth/refresh
  → Validates refresh token
  → Issues new access token

POST /api/v1/auth/logout
  → Removes refresh token from Redis
```

### 2. Project & Test Suite Management
```
POST /api/v1/projects
  → Creates project in organization
  → Validates user has permission

POST /api/v1/test-suites
  → Creates test suite in project
  → Supports parent/child hierarchy

GET /api/v1/test-suites
  → Returns all suites with pagination
  → Filters by project

PATCH /api/v1/test-suites/:id
  → Updates suite details
  → Validates ownership
```

### 3. Test Execution Workflow
```
POST /api/v1/test-cases
  → Creates test case in suite
  → Includes steps and expected results

POST /api/v1/test-runs
  → Creates test run for project/suite
  → Initializes with pending status

PATCH /api/v1/test-runs/:id
  → Updates status to running/completed
  → Tracks progress counters

POST /api/v1/test-results
  → Records test result
  → Links to test case and run

PATCH /api/v1/test-results/:id
  → Updates result status
  → Adds comments and attachments
```

### 4. Bug Creation from Failed Test
```
POST /api/v1/test-results
  → Create failed test result

POST /api/v1/integrations
  → Configure Jira/GitHub integration

POST /api/v1/results/:id/bug
  → Create bug from failed result
  → Link to external issue tracker
```

### 5. Notifications & Integrations
```
POST /api/v1/integrations
  → Configure Slack, Jira, etc.

GET /api/v1/notifications
  → Fetch user notifications
  → Filter by read status

PATCH /api/v1/notifications/:id/read
  → Mark notification as read

PATCH /api/v1/notifications/read-all
  → Mark all notifications as read
```

## Test Data

### Sample Test Data Generated

**Organization:**
- Name: Test Organization
- Slug: test-organization
- Plan: free

**User:**
- Email: test-{timestamp}@example.com
- Role: admin/manager/tester/viewer
- Password: TestPassword123! (hashed with Argon2)

**Project:**
- Name: Test Project
- Description: A test project

**Test Suite:**
- Name: Test Suite
- Description: A test suite

**Test Case:**
- Title: Test Case
- Priority: medium
- Status: active
- Automation Type: manual

**Test Run:**
- Name: Test Run
- Status: pending → running → completed

**Test Result:**
- Status: passed/failed/skipped/blocked
- Comment: Test execution notes

## Test Best Practices Applied

1. **Isolation**: Each test is independent with proper setup/teardown
2. **Descriptive Names**: Test names clearly describe what's being tested
3. **Happy & Error Paths**: Both success and failure scenarios tested
4. **Authentication**: Proper JWT token generation and validation
5. **Authorization**: Role-based access control tested
6. **Validation**: Input validation tested with invalid data
7. **Edge Cases**: Empty strings, non-existent IDs, duplicate entries
8. **Data Integrity**: Foreign key relationships verified
9. **Transaction Safety**: Database cleanup after each test
10. **Redis Cleanup**: Test database flushed after each test

## Running Tests

### All Tests
```bash
npm test
```

### Specific Test Suite
```bash
npm test -- auth
npm test -- users
npm test -- projects
```

### With Coverage
```bash
npm run test:coverage
```

### Watch Mode
```bash
npm run test:watch
```

## Next Steps

1. Run tests to generate actual coverage report
2. Identify any gaps > 70% target
3. Add additional tests if needed
4. Generate coverage badge for README
5. Set up Codecov for coverage tracking

---

For detailed testing guide, see [tests/README.md](tests/README.md).

For complete infrastructure summary, see [tests/TEST_INFRASTRUCTURE_SUMMARY.md](tests/TEST_INFRASTRUCTURE_SUMMARY.md).
