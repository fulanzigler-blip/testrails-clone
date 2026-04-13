# TestRails Clone — Project State

## Project Overview
Visual Test Builder for Flutter integration tests. Multi-runner support, auto-execute, test suites.

## Tech Stack
- Backend: Node.js + Fastify + Prisma + PostgreSQL + Redis
- Frontend: React + Vite + Redux Toolkit + shadcn/ui
- Runners: SSH → Mac hosts → `flutter test`

## Runners (SSH via Tailscale)
| Name | Host | User | Project Path | Device | Default |
|------|------|------|-------------|--------|---------|
| Mac 2015 (Mac Mini) | 100.76.181.104 | clawbot | /Users/clawbot/actions-runner/_work/discipline-tracker/discipline-tracker | SDE0219926003245 (real device) | No |
| Mac Air (Apple Silicon) | 100.114.57.93 | bankraya | /Users/bankraya/Development/discipline-tracker | emulator-5554 | Yes |
- SSH key: `/home/nodejs/.ssh/id_ed25519` (mounted in Docker)
- Default runner: Mac Air

## Docker Setup
- `docker-compose.yml` — backend + frontend + postgres + redis
- **PostgreSQL**: `127.0.0.1:5432`, v15-alpine, user: `testrails`, pass in `.env` (DATABASE_URL)
- **Redis**: `127.0.0.1:6379`, password-protected, REDIS_URL in `.env`
- **Frontend**: port 3002 public
- **Backend**: internal only (port 3000)
- SSH key mounted: `/home/clawdbot/.ssh/id_ed25519:/tmp/host_ssh_key:ro`

## Key Features Implemented
1. **Visual Test Builder** — Select elements from catalog → generate Flutter test code → save as test case
2. **Element Scanner** — SSH to Mac → scan Flutter codebase → catalog screens/inputs/buttons
3. **Test Cases** — CRUD, edit (fixed field name mismatch: camelCase vs snake_case)
4. **Test Suites** — Auto-group test cases by title prefix, inline run, output viewer
5. **Test Runs** — Create runs from suites, auto-execute on Flutter runner, manual pass/fail
6. **Save-as-Test-Case** — Dart code stored in `test_cases.custom_fields.dartCode`
7. **Multi-Runner** — Runner selector in UI, tests run on selected Mac
8. **Security Fixed** — Redis password + localhost-only, PostgreSQL localhost-only, removed hardcoded IPs/paths from scanner defaults, git remote token removed

## Scanner Limitation
- Static scan only detects **hardcoded** widgets (Text('x'), TextField(hintText: 'y'))
- **Does NOT detect** dynamic content from API calls (Text(response.data['title']))
- Pending: Hybrid scan (static + runtime widget dump)

## Key File Locations
- Backend routes: `backend/src/routes/`
- Frontend pages: `frontend/src/pages/`
- Scanner: `backend/src/utils/element-scanner-ssh.ts`
- Test executor: `backend/src/utils/test-executor.ts`
- Schema: `backend/prisma/schema.prisma`

## Branch
- `feature/test-suites-rework` — latest pushed branch

## Known Issues / TODO
- Element scanner can't detect API-driven UI content
- Need to find app with API calls for hybrid scan demo
- Manual test case → Test Suites assignment (drag-and-drop)
- Test Runs execution shows results inline but needs auto-refresh polling
