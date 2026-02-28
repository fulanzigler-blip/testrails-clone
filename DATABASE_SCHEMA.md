# TestRails Clone - Database Schema

## Entity Relationship Diagram (ERD)

```
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│    Organization   │         │   User           │         │   Team           │
├──────────────────┤         ├──────────────────┤         ├──────────────────┤
│ id (PK)          │────┐    │ id (PK)          │         │ id (PK)          │
│ name             │    │    │ email            │         │ name             │
│ slug             │    │    │ password_hash    │         │ organization_id  │
│ created_at       │    │    │ first_name       │         │ created_at       │
│ updated_at       │    │    │ last_name        │         └──────────────────┘
└──────────────────┘    │    │ role             │                    │
                       │    │ organization_id  │◄───────────────────┘
                       │    │ created_at       │
                       │    │ updated_at       │
                       │    └──────────────────┘
                       │             │
                       │             │
                       │    ┌────────▼──────────┐
                       │    │   User_Team       │
                       │    ├──────────────────┤
                       │    │ user_id          │
                       │    │ team_id          │
                       │    │ role             │
                       │    └──────────────────┘
                       │
                       │    ┌──────────────────┐
                       │    │   Project         │
                       │    ├──────────────────┤
                       │    │ id (PK)          │
                       │    │ name             │
                       │    │ description      │
                       │    │ organization_id  │◄─────────┐
                       │    │ created_at       │          │
                       │    │ updated_at       │          │
                       │    └──────────────────┘          │
                       │                                 │
                       │    ┌──────────────────┐         │
                       └────│   Test_Suite     │         │
                            ├──────────────────┤         │
                            │ id (PK)          │         │
                            │ name             │         │
                            │ description      │         │
                            │ project_id       │◄────────┘
                            │ parent_suite_id  │◄─────┐
                            │ created_at       │      │
                            │ updated_at       │      │
                            └──────────────────┘      │
                                                       │
         ┌──────────────────┐         ┌──────────────▼─────────┐
         │   Test_Case      │         │   Test_Suite_Member     │
         ├──────────────────┤         ├─────────────────────────┤
         │ id (PK)          │         │ test_suite_id           │
         │ title            │         │ test_case_id            │
         │ description      │         │ order_index             │
         │ steps (JSONB)    │         └─────────────────────────┘
         │ expected_result  │
         │ priority         │                  ┌──────────────────┐
         │ automation_type  │                  │   Test_Run       │
         │ suite_id         │◄─────────────────┤──────────────────┤
         │ created_by       │                  │ id (PK)          │
         │ created_at       │                  │ name             │
         │ updated_at       │                  │ description      │
         │ version          │                  │ project_id       │◄────────┐
         │ status           │                  │ suite_id         │         │
         │ custom_fields    │                  │ created_by       │         │
         │ tags             │                  │ status           │         │
         └──────────────────┘                  │ started_at       │         │
                                               │ completed_at     │         │
         ┌──────────────────┐                  │ passed_count     │         │
         │ Test_Result      │                  │ failed_count     │         │
         ├──────────────────┤                  │ skipped_count    │         │
         │ id (PK)          │                  │ blocked_count    │         │
         │ test_run_id      │◄─────────────────│ environment      │         │
         │ test_case_id     │◄─────────────────│ config (JSONB)   │         │
         │ status           │                  └──────────────────┘         │
         │ comment          │                                               │
         │ executed_by      │         ┌──────────────────┐                  │
         │ executed_at      │         │   Bug           │                  │
         │ duration_ms      │         ├──────────────────┤                  │
         │ attachments      │         │ id (PK)          │                  │
         │ custom_fields    │         │ test_result_id   │◄─────────────────┘
         └──────────────────┘         │ title            │
                                       │ description      │
         ┌──────────────────┐         │ external_id      │
         │ Integration      │         │ external_url     │
         ├──────────────────┤         │ provider         │
         │ id (PK)          │         │ status           │
         │ organization_id  │         │ severity         │
         │ type             │         │ created_at       │
         │ config (JSONB)   │         └──────────────────┘
         │ enabled          │
         └──────────────────┘
```

## Table Definitions

### Organizations

```sql
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    plan VARCHAR(50) DEFAULT 'free',
    max_users INTEGER DEFAULT 10,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_organizations_slug ON organizations(slug);
```

### Users

```sql
CREATE TYPE user_role AS ENUM ('admin', 'manager', 'tester', 'viewer');

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role user_role NOT NULL DEFAULT 'tester',
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_organization ON users(organization_id);
```

### Teams

```sql
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_teams_organization ON teams(organization_id);
```

### User_Team (Many-to-Many)

```sql
CREATE TABLE user_teams (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member',
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (user_id, team_id)
);
```

### Projects

```sql
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_projects_organization ON projects(organization_id);
```

### Test_Suites

```sql
CREATE TABLE test_suites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    parent_suite_id UUID REFERENCES test_suites(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_test_suites_project ON test_suites(project_id);
CREATE INDEX idx_test_suites_parent ON test_suites(parent_suite_id);
```

### Test_Suite_Members

```sql
CREATE TABLE test_suite_members (
    test_suite_id UUID REFERENCES test_suites(id) ON DELETE CASCADE,
    test_case_id UUID REFERENCES test_cases(id) ON DELETE CASCADE,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (test_suite_id, test_case_id)
);

CREATE INDEX idx_suite_members_suite ON test_suite_members(test_suite_id);
CREATE INDEX idx_suite_members_case ON test_suite_members(test_case_id);
```

### Test_Cases

```sql
CREATE TYPE test_case_status AS ENUM ('draft', 'active', 'archived');
CREATE TYPE test_case_priority AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE automation_type AS ENUM ('manual', 'automated', 'semi-automated');

CREATE TABLE test_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    steps JSONB,  -- Array of step objects: {order, description, expected}
    expected_result TEXT,
    priority test_case_priority DEFAULT 'medium',
    automation_type automation_type DEFAULT 'manual',
    suite_id UUID REFERENCES test_suites(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    status test_case_status DEFAULT 'active',
    custom_fields JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT ARRAY[]::TEXT[]
);

CREATE INDEX idx_test_cases_suite ON test_cases(suite_id);
CREATE INDEX idx_test_cases_status ON test_cases(status);
CREATE INDEX idx_test_cases_tags ON test_cases USING GIN(tags);
CREATE INDEX idx_test_cases_search ON test_cases USING GIN(to_tsvector('english', title || ' ' || COALESCE(description, '')));
```

### Test_Runs

```sql
CREATE TYPE test_run_status AS ENUM ('pending', 'running', 'completed', 'failed');

CREATE TABLE test_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    suite_id UUID REFERENCES test_suites(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id),
    status test_run_status DEFAULT 'pending',
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    passed_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    skipped_count INTEGER DEFAULT 0,
    blocked_count INTEGER DEFAULT 0,
    environment VARCHAR(100),
    config JSONB DEFAULT '{}'
);

CREATE INDEX idx_test_runs_project ON test_runs(project_id);
CREATE INDEX idx_test_runs_status ON test_runs(status);
CREATE INDEX idx_test_runs_created_by ON test_runs(created_by);
```

### Test_Results

```sql
CREATE TYPE test_result_status AS ENUM ('passed', 'failed', 'skipped', 'blocked', 'running');

CREATE TABLE test_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_run_id UUID REFERENCES test_runs(id) ON DELETE CASCADE,
    test_case_id UUID REFERENCES test_cases(id) ON DELETE CASCADE,
    status test_result_status DEFAULT 'running',
    comment TEXT,
    executed_by UUID REFERENCES users(id),
    executed_at TIMESTAMP,
    duration_ms INTEGER,
    attachments JSONB DEFAULT '[]',
    custom_fields JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_test_results_run ON test_results(test_run_id);
CREATE INDEX idx_test_results_case ON test_results(test_case_id);
CREATE INDEX idx_test_results_status ON test_results(status);
```

### Bugs

```sql
CREATE TYPE bug_severity AS ENUM ('trivial', 'minor', 'major', 'critical');
CREATE TYPE bug_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');
CREATE TYPE bug_provider AS ENUM ('jira', 'github', 'gitlab', 'linear', 'custom');

CREATE TABLE bugs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_result_id UUID REFERENCES test_results(id) ON DELETE SET NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    external_id VARCHAR(255),
    external_url VARCHAR(500),
    provider bug_provider,
    status bug_status DEFAULT 'open',
    severity bug_severity,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_bugs_result ON bugs(test_result_id);
CREATE INDEX idx_bugs_status ON bugs(status);
CREATE INDEX idx_bugs_external_id ON bugs(external_id);
```

### Integrations

```sql
CREATE TYPE integration_type AS ENUM ('jira', 'github', 'slack', 'email', 'webhook');

CREATE TABLE integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    type integration_type NOT NULL,
    name VARCHAR(255),
    config JSONB NOT NULL,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_integrations_org ON integrations(organization_id);
CREATE INDEX idx_integrations_type ON integrations(type);
```

### Notifications

```sql
CREATE TYPE notification_type AS ENUM ('test_run_completed', 'bug_created', 'mention', 'assignment');

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type notification_type NOT NULL,
    title VARCHAR(255),
    message TEXT,
    data JSONB DEFAULT '{}',
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(read_at);
```

### Audit_Log

```sql
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    changes JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_log(created_at);
```

## Database Migrations

Using a migration framework like Knex.js or node-pg-migrate to manage schema changes.

Example migration structure:
```
migrations/
├── 001_initial_schema.js
├── 002_add_test_case_versioning.js
├── 003_add_custom_fields_support.js
└── ...
```

## Views & Materialized Views

### Test Case Version History
```sql
CREATE VIEW test_case_versions AS
SELECT tc.id, tc.title, tc.version, tc.created_at, u.email as created_by
FROM test_cases tc
JOIN users u ON tc.created_by = u.id;
```

### Test Run Statistics
```sql
CREATE MATERIALIZED VIEW test_run_stats AS
SELECT
    tr.id,
    tr.name,
    tr.status,
    COUNT(trr.id) as total_tests,
    SUM(CASE WHEN trr.status = 'passed' THEN 1 ELSE 0 END) as passed,
    SUM(CASE WHEN trr.status = 'failed' THEN 1 ELSE 0 END) as failed,
    SUM(CASE WHEN trr.status = 'skipped' THEN 1 ELSE 0 END) as skipped,
    SUM(CASE WHEN trr.status = 'blocked' THEN 1 ELSE 0 END) as blocked,
    ROUND(
        SUM(CASE WHEN trr.status = 'passed' THEN 1 ELSE 0 END)::numeric /
        NULLIF(COUNT(trr.id), 0) * 100, 2
    ) as pass_rate
FROM test_runs tr
LEFT JOIN test_results trr ON tr.id = trr.test_run_id
GROUP BY tr.id, tr.name, tr.status;

CREATE INDEX idx_test_run_stats_id ON test_run_stats(id);
```

Refresh materialized view periodically:
```sql
CREATE OR REPLACE FUNCTION refresh_test_run_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY test_run_stats;
END;
$$ LANGUAGE plpgsql;
```

## Performance Optimization

### Indexing Strategy
- Foreign keys indexed for JOIN performance
- Status columns indexed for filtering
- Full-text search indexes for test case search
- GIN indexes for JSONB and array columns

### Partitioning
Consider partitioning test_results table by test_run_id for large datasets.

### Connection Pooling
Use connection pooling (PgBouncer) to handle high concurrency.

## Backup Strategy

- Daily full backups
- Point-in-time recovery enabled
- WAL archiving configured
- Off-site backup storage (S3 or similar)
