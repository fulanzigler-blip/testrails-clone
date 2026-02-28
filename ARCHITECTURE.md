# TestRails Clone - System Architecture

## Overview

A test management system for organizing test cases, executing test runs, tracking results, and generating reports.

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Client Layer                         │
├─────────────────────────────────────────────────────────────┤
│  Web App (React)    │  Mobile App (React Native)            │
└────────────────────┴────────────────────────────────────────┘
                              │
                              │ REST API / WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        API Gateway                            │
├─────────────────────────────────────────────────────────────┤
│  Authentication    │  Rate Limiting    │  Request Logging   │
└────────────────────┴───────────────────┴────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       Backend Services                       │
├─────────────────────────────────────────────────────────────┤
│  Test Case Service  │  Test Run Service  │  Report Service  │
│  User Service       │  Integration Service│  Notification Svc│
└────────────────────┴───────────────────┴────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       Data Layer                             │
├─────────────────────────────────────────────────────────────┤
│  PostgreSQL (Primary)  │  Redis (Cache)  │  S3 (Attachments) │
└────────────────────────┴─────────────────┴──────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    External Integrations                      │
├─────────────────────────────────────────────────────────────┤
│  Jira        │  GitHub Issues    │  Slack     │  Email       │
└──────────────┴──────────────────┴───────────┴───────────────┘
```

### Component Details

#### 1. Frontend Layer
- **Web Application**: React + TypeScript + Tailwind CSS
- **State Management**: Redux Toolkit or Zustand
- **Real-time Updates**: Socket.io client
- **Routing**: React Router

#### 2. API Gateway
- **Authentication**: JWT with refresh tokens
- **Rate Limiting**: Token bucket algorithm
- **Request Logging**: Structured logs for debugging
- **CORS**: Configured for allowed origins

#### 3. Backend Services (Node.js + Express/Fastify)

##### Test Case Service
- CRUD operations for test cases
- Test case versioning
- Search and filtering
- Import/export functionality

##### Test Run Service
- Create and manage test runs
- Execute test cases (manual/automated)
- Track test results (pass/fail/skip/blocked)
- Real-time progress updates

##### User Service
- User management
- Role-based access control (RBAC)
- Organization management
- Team management

##### Integration Service
- Bug tracker integrations (Jira, GitHub, etc.)
- Webhook handling
- External API sync

##### Report Service
- Generate test reports
- Dashboard analytics
- Historical trend analysis
- Export to PDF/Excel

##### Notification Service
- Email notifications
- In-app notifications
- Webhook notifications
- Slack integrations

#### 4. Data Layer

##### PostgreSQL (Primary Database)
- Relational data with ACID compliance
- Full-text search capabilities
- JSON columns for flexible data storage

##### Redis (Cache Layer)
- Session storage
- Rate limiting counters
- Real-time pub/sub
- Query result caching

##### S3/MinIO (Object Storage)
- Test attachments (screenshots, logs)
- Exported reports
- User-uploaded files

### Data Flow

#### Test Execution Flow
```
1. User starts test run from UI
2. Frontend calls API: POST /api/test-runs
3. Test Run Service creates run, assigns test cases
4. WebSocket connection established for real-time updates
5. User executes tests, submits results
6. Results stored in PostgreSQL
7. WebSocket pushes updates to UI
8. Optional: Integration Service creates bug in Jira on failure
9. Test Run Service updates run status (completed/failed)
10. Report Service generates final report
```

#### Authentication Flow
```
1. User logs in → POST /api/auth/login
2. User Service validates credentials
3. JWT access token + refresh token issued
4. Access token stored in Redis (whitelist)
5. Subsequent requests include Bearer token
6. API Gateway validates token
7. Request routed to appropriate service
```

### Scalability Considerations

1. **Horizontal Scaling**: Stateless services can scale horizontally
2. **Database**: Read replicas for reporting queries
3. **Caching**: Redis layer to reduce database load
4. **Async Processing**: Message queue (RabbitMQ/Redis Streams) for background jobs
5. **CDN**: Static assets served via CDN

### Security

1. **Authentication**: JWT with short-lived access tokens
2. **Authorization**: RBAC with fine-grained permissions
3. **Data Encryption**: TLS in transit, at rest encryption for sensitive data
4. **Input Validation**: Strict schema validation on all inputs
5. **Rate Limiting**: Prevent brute force and DoS
6. **Audit Logging**: Track all sensitive operations
7. **SQL Injection Prevention**: Parameterized queries only

### Monitoring & Observability

1. **Metrics**: Prometheus + Grafana
2. **Logging**: Structured JSON logs (ELK stack or Loki)
3. **Tracing**: Distributed tracing with Jaeger or OpenTelemetry
4. **Health Checks**: /health endpoint for all services
5. **Error Tracking**: Sentry integration

### Deployment Architecture

```
┌─────────────────────────────────────────────┐
│           Load Balancer (Nginx)              │
└─────────────────┬───────────────────────────┘
                  │
    ┌─────────────┼─────────────┐
    │             │             │
┌───▼───┐     ┌───▼───┐     ┌───▼───┐
│ Web 1 │     │ Web 2 │     │ Web N │
└───┬───┘     └───┬───┘     └───┬───┘
    │             │             │
    └─────────────┼─────────────┘
                  │
        ┌─────────▼─────────┐
        │  PostgreSQL       │
        │  (Primary + Replicas)
        └───────────────────┘
                  │
        ┌─────────▼─────────┐
        │  Redis Cluster    │
        └───────────────────┘
```

### Technology Rationale

See [TECH_STACK.md](./TECH_STACK.md) for detailed rationale.
