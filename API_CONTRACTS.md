# TestRails Clone - API Contracts

## Base URL
```
https://api.testrails-clone.com/v1
```

## Authentication

All API requests (except auth endpoints) require a Bearer token in the Authorization header:

```
Authorization: Bearer <access_token>
```

### Tokens
- **Access Token**: JWT, expires in 15 minutes
- **Refresh Token**: HTTP-only cookie, expires in 7 days

## Response Format

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 100
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      {
        "field": "email",
        "message": "Email is required"
      }
    ]
  }
}
```

## Endpoints

### Authentication

#### POST /auth/register
Register a new user.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "first_name": "John",
  "last_name": "Doe",
  "organization_name": "Acme Corp"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "first_name": "John",
      "last_name": "Doe",
      "role": "admin"
    },
    "organization": {
      "id": "uuid",
      "name": "Acme Corp",
      "slug": "acme-corp"
    }
  }
}
```

#### POST /auth/login
Authenticate user and return tokens.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "first_name": "John",
      "last_name": "Doe",
      "role": "admin"
    }
  }
}
```

#### POST /auth/refresh
Refresh access token using refresh token cookie.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### POST /auth/logout
Invalidate refresh token.

**Response (204):** No content

---

### Organizations

#### GET /organizations/:id
Get organization details.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "plan": "pro",
    "max_users": 50,
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

#### PUT /organizations/:id
Update organization details.

**Request Body:**
```json
{
  "name": "New Name",
  "plan": "enterprise"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "New Name",
    "slug": "acme-corp",
    "plan": "enterprise"
  }
}
```

---

### Users

#### GET /users
List users in organization.

**Query Parameters:**
- `page`: Page number (default: 1)
- `per_page`: Items per page (default: 20, max: 100)
- `role`: Filter by role (admin, manager, tester, viewer)
- `search`: Search by name or email

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "first_name": "John",
      "last_name": "Doe",
      "role": "admin",
      "last_login_at": "2024-01-15T10:30:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 50
  }
}
```

#### GET /users/:id
Get user details.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "role": "admin",
    "teams": [
      {
        "id": "uuid",
        "name": "QA Team",
        "role": "lead"
      }
    ]
  }
}
```

#### PUT /users/:id
Update user.

**Request Body:**
```json
{
  "first_name": "Jane",
  "last_name": "Smith",
  "role": "manager"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "first_name": "Jane",
    "last_name": "Smith",
    "role": "manager"
  }
}
```

#### DELETE /users/:id
Delete user (soft delete or deactivate).

**Response (204):** No content

---

### Projects

#### GET /projects
List projects.

**Query Parameters:**
- `page`, `per_page`: Pagination
- `search`: Search by name

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "E-commerce Platform",
      "description": "Main web application",
      "created_at": "2024-01-01T00:00:00Z",
      "test_cases_count": 150,
      "test_runs_count": 45
    }
  ],
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 10
  }
}
```

#### POST /projects
Create project.

**Request Body:**
```json
{
  "name": "Mobile App",
  "description": "iOS and Android application"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Mobile App",
    "description": "iOS and Android application",
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

#### GET /projects/:id
Get project details.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "E-commerce Platform",
    "description": "Main web application",
    "created_at": "2024-01-01T00:00:00Z",
    "test_suites": [
      {
        "id": "uuid",
        "name": "Checkout Flow",
        "test_cases_count": 25
      }
    ]
  }
}
```

#### PUT /projects/:id
Update project.

#### DELETE /projects/:id
Delete project.

---

### Test Suites

#### GET /test-suites
List test suites.

**Query Parameters:**
- `project_id`: Filter by project
- `parent_id`: Filter by parent suite
- `search`: Search by name

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Authentication",
      "project_id": "uuid",
      "parent_suite_id": null,
      "test_cases_count": 15,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### POST /test-suites
Create test suite.

**Request Body:**
```json
{
  "name": "Checkout Flow",
  "project_id": "uuid",
  "parent_suite_id": "uuid",
  "description": "Test cases for checkout process"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Checkout Flow",
    "project_id": "uuid",
    "parent_suite_id": "uuid",
    "description": "Test cases for checkout process"
  }
}
```

#### PUT /test-suites/:id
Update test suite.

#### DELETE /test-suites/:id
Delete test suite.

---

### Test Cases

#### GET /test-cases
List test cases.

**Query Parameters:**
- `suite_id`: Filter by suite
- `project_id`: Filter by project
- `status`: Filter by status (draft, active, archived)
- `priority`: Filter by priority
- `tags`: Filter by tags (comma-separated)
- `search`: Full-text search
- `page`, `per_page`: Pagination
- `sort`: Sort field (created_at, updated_at, priority)
- `order`: Sort order (asc, desc)

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "User can login with valid credentials",
      "description": "Verify login functionality",
      "steps": [
        {
          "order": 1,
          "description": "Navigate to login page",
          "expected": "Login page is displayed"
        },
        {
          "order": 2,
          "description": "Enter valid email and password",
          "expected": "Credentials are accepted"
        }
      ],
      "expected_result": "User is logged in and redirected to dashboard",
      "priority": "high",
      "automation_type": "manual",
      "suite_id": "uuid",
      "created_by": "uuid",
      "version": 2,
      "status": "active",
      "tags": ["auth", "smoke"],
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 150
  }
}
```

#### POST /test-cases
Create test case.

**Request Body:**
```json
{
  "title": "User can reset password",
  "description": "Verify password reset functionality",
  "steps": [
    {
      "order": 1,
      "description": "Click 'Forgot Password' link",
      "expected": "Reset password form is displayed"
    },
    {
      "order": 2,
      "description": "Enter registered email",
      "expected": "Reset email is sent"
    }
  ],
  "expected_result": "User receives reset email and can set new password",
  "priority": "medium",
  "automation_type": "manual",
  "suite_id": "uuid",
  "tags": ["auth", "password"],
  "custom_fields": {
    "estimated_time": 5,
    "requires_api": true
  }
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "User can reset password",
    "description": "Verify password reset functionality",
    "steps": [...],
    "expected_result": "User receives reset email and can set new password",
    "priority": "medium",
    "automation_type": "manual",
    "suite_id": "uuid",
    "version": 1,
    "status": "active",
    "tags": ["auth", "password"],
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

#### GET /test-cases/:id
Get test case details.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "User can login with valid credentials",
    "description": "Verify login functionality",
    "steps": [...],
    "expected_result": "User is logged in and redirected to dashboard",
    "priority": "high",
    "automation_type": "manual",
    "suite_id": "uuid",
    "created_by": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "John Doe"
    },
    "version": 2,
    "status": "active",
    "tags": ["auth", "smoke"],
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-15T10:30:00Z",
    "history": [
      {
        "version": 1,
        "changes": ["Initial version"],
        "updated_at": "2024-01-01T00:00:00Z"
      }
    ]
  }
}
```

#### PUT /test-cases/:id
Update test case.

**Request Body:**
```json
{
  "title": "Updated title",
  "steps": [...],
  "priority": "critical"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Updated title",
    "version": 3
  }
}
```

#### DELETE /test-cases/:id
Delete test case.

#### POST /test-cases/:id/clone
Clone test case.

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "new-uuid",
    "title": "Copy of User can login with valid credentials",
    "version": 1
  }
}
```

#### POST /test-cases/bulk-delete
Bulk delete test cases.

**Request Body:**
```json
{
  "ids": ["uuid-1", "uuid-2", "uuid-3"]
}
```

**Response (204):** No content

---

### Test Runs

#### GET /test-runs
List test runs.

**Query Parameters:**
- `project_id`: Filter by project
- `suite_id`: Filter by suite
- `status`: Filter by status (pending, running, completed, failed)
- `created_by`: Filter by creator
- `from_date`, `to_date`: Date range filter

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Sprint 24 Smoke Tests",
      "description": "Smoke tests for sprint 24",
      "project_id": "uuid",
      "suite_id": "uuid",
      "created_by": {
        "id": "uuid",
        "name": "John Doe"
      },
      "status": "running",
      "started_at": "2024-01-15T10:00:00Z",
      "completed_at": null,
      "passed_count": 15,
      "failed_count": 3,
      "skipped_count": 2,
      "blocked_count": 0,
      "total_tests": 20,
      "pass_rate": 75.0,
      "environment": "staging",
      "created_at": "2024-01-15T09:00:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 45
  }
}
```

#### POST /test-runs
Create test run.

**Request Body:**
```json
{
  "name": "Sprint 25 Regression",
  "description": "Regression tests for sprint 25",
  "project_id": "uuid",
  "suite_id": "uuid",
  "include_all": true,
  "case_ids": ["uuid-1", "uuid-2"],
  "environment": "staging",
  "config": {
    "build_number": "v2.5.1",
    "branch": "develop"
  }
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Sprint 25 Regression",
    "description": "Regression tests for sprint 25",
    "project_id": "uuid",
    "suite_id": "uuid",
    "status": "pending",
    "total_tests": 20,
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

#### GET /test-runs/:id
Get test run details with results.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Sprint 24 Smoke Tests",
    "status": "running",
    "started_at": "2024-01-15T10:00:00Z",
    "passed_count": 15,
    "failed_count": 3,
    "skipped_count": 2,
    "blocked_count": 0,
    "total_tests": 20,
    "pass_rate": 75.0,
    "results": [
      {
        "id": "uuid",
        "test_case_id": "uuid",
        "test_case_title": "User can login",
        "status": "passed",
        "executed_by": {
          "id": "uuid",
          "name": "Jane Smith"
        },
        "executed_at": "2024-01-15T10:05:00Z",
        "duration_ms": 45000,
        "comment": "Working as expected"
      }
    ]
  }
}
```

#### POST /test-runs/:id/start
Start test run.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "running",
    "started_at": "2024-01-15T10:30:00Z"
  }
}
```

#### POST /test-runs/:id/complete
Complete test run.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "completed",
    "completed_at": "2024-01-15T11:30:00Z",
    "summary": {
      "total": 20,
      "passed": 15,
      "failed": 3,
      "skipped": 2,
      "blocked": 0
    }
  }
}
```

#### DELETE /test-runs/:id
Delete test run.

---

### Test Results

#### GET /test-runs/:run-id/results
Get results for a test run.

**Query Parameters:**
- `status`: Filter by status
- `search`: Search by test case title

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "test_run_id": "uuid",
      "test_case_id": "uuid",
      "test_case_title": "User can login",
      "status": "failed",
      "comment": "Error: 500 Internal Server Error",
      "executed_by": {
        "id": "uuid",
        "name": "Jane Smith"
      },
      "executed_at": "2024-01-15T10:10:00Z",
      "duration_ms": 120000,
      "attachments": [
        {
          "id": "uuid",
          "filename": "screenshot.png",
          "url": "https://s3.../screenshot.png"
        }
      ],
      "bugs": [
        {
          "id": "uuid",
          "title": "Login endpoint returns 500 error",
          "external_url": "https://jira.com/BUG-123",
          "severity": "critical"
        }
      ]
    }
  ]
}
```

#### PUT /test-results/:id
Update test result.

**Request Body:**
```json
{
  "status": "passed",
  "comment": "Fixed after server restart",
  "attachments": [
    {
      "filename": "proof.png",
      "data": "base64-encoded-image"
    }
  ]
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "passed",
    "comment": "Fixed after server restart",
    "executed_at": "2024-01-15T10:15:00Z"
  }
}
```

#### POST /test-results/:id/bug
Create bug from failed test.

**Request Body:**
```json
{
  "title": "Login endpoint returns 500 error",
  "description": "When attempting to login, server returns 500 error",
  "severity": "critical",
  "provider": "jira"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Login endpoint returns 500 error",
    "external_id": "BUG-123",
    "external_url": "https://jira.com/BUG-123",
    "provider": "jira",
    "severity": "critical"
  }
}
```

---

### Reports

#### GET /reports/summary
Get summary report for organization.

**Query Parameters:**
- `from_date`: Start date
- `to_date`: End date
- `project_id`: Filter by project

**Response (200):**
```json
{
  "success": true,
  "data": {
    "total_test_runs": 45,
    "total_test_cases": 150,
    "total_tests_executed": 900,
    "average_pass_rate": 87.5,
    "active_projects": 10,
    "top_failures": [
      {
        "test_case_title": "Payment gateway timeout",
        "failure_count": 15,
        "percentage": 10.5
      }
    ],
    "trend": {
      "dates": ["2024-01-01", "2024-01-02", ...],
      "pass_rates": [85, 87, 90, ...]
    }
  }
}
```

#### GET /reports/test-run/:id
Get detailed test run report.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "test_run": {
      "id": "uuid",
      "name": "Sprint 24 Smoke Tests",
      "created_at": "2024-01-15T09:00:00Z"
    },
    "summary": {
      "total": 20,
      "passed": 15,
      "failed": 3,
      "skipped": 2,
      "blocked": 0,
      "pass_rate": 75.0,
      "duration_minutes": 60
    },
    "by_priority": {
      "critical": { "total": 5, "passed": 4, "failed": 1 },
      "high": { "total": 8, "passed": 6, "failed": 2 },
      "medium": { "total": 5, "passed": 4, "failed": 0 },
      "low": { "total": 2, "passed": 1, "failed": 0 }
    },
    "results": [...]
  }
}
```

#### GET /reports/export/:type
Export report in various formats.

**Path Parameters:**
- `type`: Export format (pdf, csv, xlsx, html)

**Query Parameters:**
- `test_run_id`: Test run ID to export

**Response (200):** Binary file download

---

### Integrations

#### GET /integrations
List integrations for organization.

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "type": "jira",
      "name": "Jira Integration",
      "enabled": true,
      "config": {
        "url": "https://company.atlassian.net",
        "project": "QA"
      }
    }
  ]
}
```

#### POST /integrations
Create integration.

**Request Body:**
```json
{
  "type": "jira",
  "name": "Jira Integration",
  "config": {
    "url": "https://company.atlassian.net",
    "api_token": "encrypted-token",
    "email": "admin@company.com",
    "project": "QA",
    "issue_type": "Bug"
  },
  "enabled": true
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "type": "jira",
    "name": "Jira Integration",
    "enabled": true
  }
}
```

#### PUT /integrations/:id
Update integration.

#### DELETE /integrations/:id
Delete integration.

#### POST /integrations/:id/test
Test integration connection.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "status": "connected",
    "message": "Successfully connected to Jira"
  }
}
```

---

### Notifications

#### GET /notifications
Get user notifications.

**Query Parameters:**
- `unread_only`: Filter unread only
- `page`, `per_page`: Pagination

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "type": "test_run_completed",
      "title": "Sprint 24 Smoke Tests completed",
      "message": "Test run completed with 75% pass rate",
      "read_at": null,
      "created_at": "2024-01-15T11:30:00Z"
    }
  ],
  "meta": {
    "unread_count": 5,
    "total": 20
  }
}
```

#### PUT /notifications/:id/read
Mark notification as read.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "read_at": "2024-01-15T12:00:00Z"
  }
}
```

#### PUT /notifications/read-all
Mark all notifications as read.

**Response (204):** No content

---

## WebSocket Events

### Connection
```javascript
const socket = io('wss://api.testrails-clone.com', {
  auth: { token: 'access_token' }
});
```

### Events

#### test_run:progress
Real-time test execution progress.
```json
{
  "test_run_id": "uuid",
  "total": 20,
  "completed": 15,
  "passed": 12,
  "failed": 2,
  "skipped": 1,
  "current_test": {
    "id": "uuid",
    "title": "Test case title"
  }
}
```

#### test_result:updated
When a test result is updated.
```json
{
  "test_result_id": "uuid",
  "test_run_id": "uuid",
  "status": "passed",
  "test_case_title": "Test case title"
}
```

#### notification:new
New notification received.
```json
{
  "id": "uuid",
  "type": "test_run_completed",
  "title": "Title",
  "message": "Message",
  "created_at": "2024-01-15T11:30:00Z"
}
```

## Error Codes

| Code | Description |
|------|-------------|
| `AUTH_INVALID` | Invalid authentication credentials |
| `AUTH_EXPIRED` | Access token expired |
| `AUTH_MISSING` | Authentication required |
| `PERMISSION_DENIED` | Insufficient permissions |
| `VALIDATION_ERROR` | Request validation failed |
| `NOT_FOUND` | Resource not found |
| `CONFLICT` | Resource already exists |
| `RATE_LIMIT_EXCEEDED` | Too many requests |
| `INTERNAL_ERROR` | Internal server error |

## Rate Limiting

- **Authenticated**: 1000 requests per hour
- **Unauthenticated**: 100 requests per hour

Headers:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 995
X-RateLimit-Reset: 1705317600
```

## Pagination

Default pagination: 20 items per page
Maximum: 100 items per page

Use cursor-based pagination for large datasets:
```
GET /test-cases?cursor=eyJpZCI6InV1aWQxIn0=&limit=20
```
