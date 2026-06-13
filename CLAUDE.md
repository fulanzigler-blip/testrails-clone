# CLAUDE.md — TestRails Clone

## Project
Flutter integration test management platform. Repo: `~/workspace-sdlc/testrails-clone/`
Deploy: `docker compose up -d` (services: testrails-backend, testrails-frontend)

## Stack
- **Backend:** Fastify + Prisma + PostgreSQL (`backend/src/`)
- **Frontend:** React + Vite + Tailwind (`frontend/src/`)
- **Runners:** Mac 2015 (`100.76.181.104`, user: `clawbot`) and Mac Air (`100.114.57.93`, user: `bankraya`)
- **SSH key:** `/home/clawdbot/.ssh/id_ed25519`

## Runner Details
| Runner | Host | User | Project Path | Flutter |
|--------|------|------|-------------|---------|
| Mac 2015 | 100.76.181.104 | clawbot | `/Users/clawbot/actions-runner/_work/discipline-tracker/discipline-tracker` | `/Users/clawbot/development/flutter` |
| Mac Air | 100.114.57.93 | bankraya | `/Users/bankraya/Development/discipline-tracker` | `/opt/homebrew/share/flutter` (Homebrew) |

## Key Architecture Decisions

### Flutter Test Script (integration-tests.ts `executeTestWithRunner`)
- Uses `#!/bin/bash -l` login shell
- `cd "${projectPath}" || { echo ...; echo "EXIT_CODE:1"; exit 1; }` — cd failure guard
- Exports pushed as **separate script lines** (not joined string) to avoid bash parsing `export C command` as one export
- `homeDir` derived from `projectPath.match(/^\/Users\/([^/]+)/)` — each runner has its own home
- SemanticsHandle cleanup: if ONLY error is `SemanticsHandle`, backend treats as pass and strips exception from output

### Generated Test Template
```dart
testWidgets('Generated Test Scenario', (WidgetTester tester) async {
  final handle = tester.ensureSemantics();
  app.main();
  // ... steps ...
  handle.dispose();
});
```
- `semanticsEnabled` is default (true) — NOT false
- `handle.dispose()` at end of test body (NOT via addTearDown which runs after verification)

### `find.byType` with Duplicate Widgets
`parseWidgetTree` tags duplicates as `TextFormField #2`. The `buildTypeFinder()` function converts:
- `TextFormField #2` → `find.byType(TextFormField).at(1)`
- `IconButton #3` → `find.byType(IconButton).at(2)`
Three places use `buildTypeFinder()` in `integration-tests.ts` (tap, enter_text, buildFinder switch).

### Semantic Injector (`backend/src/utils/semantic-injector.ts`)
- `resolveStartPos()` shifts 6 chars back when `const ` precedes widget — prevents `const Semantics(...)` (invalid, no const ctor)
- BackButton/CloseButton: always `finderStrategy: 'type'` → `find.byType(BackButton)`
- Injection is idempotent; `alreadyHasSemantics()` check prevents double-wrap
- Files with `const BackButton()` in AppBar: must add `leading: const BackButton()` explicitly (auto-generated back buttons aren't in source)

### Test Cases List (`test-cases.ts GET /`)
- Base `where.OR` = org filter (suite org check OR suiteId=null by creator)
- Search filter uses `where.AND` (NOT `where.OR`) to preserve org filter
- Test cases saved from VisualTestBuilder have `suiteId=null` — they appear under the creator's org

### Save Test Case Dialog
- "Save as Test Case" opens a dialog (not auto-save)
- Fields: name, project, suite (filtered by project), priority, description
- `VisualTestBuilder.tsx` return is wrapped in `<>` fragment so modal lives alongside root div

## Universal Visual Test Builder (no app hardcoding)
- Codebase dropdown is built from runner `projectPath`s + last 5 custom paths (localStorage `vtb_recent_paths`) — no hardcoded app presets
- Dart package name comes from `pubspec.yaml` `name:` (canonical); main.dart import heuristic is fallback only
- `FLUTTER_PROJECT_PATH` env has NO app default — routes resolve `runner.projectPath` first and return a clear error when nothing is configured
- Runner test script puts all common Flutter locations on PATH (`~/development/flutter/bin`, `~/flutter/bin`, `/opt/homebrew/*`) and fails fast with "flutter binary not found" if unresolvable
- `discoverAppContext(projectPath?)` is parameterized; legacy AI endpoints resolve the default runner's path
- Default `appId` in FlowBuilder/CrawlGenerateModal/PageAutomation = last used (localStorage `vtb_last_app_id`), not a fixed package

## App Profile System
- `AppProfile` model: `buttonRules[]`, `inputRules[]`, `injectorRules{}`
- Runner can have `defaultProfileId`
- Profile resolution: `profileId param → runner.defaultProfile → system default (isDefault=true)`
- `LiveViewPanel` receives `profileId` as prop (not closure — separate top-level component)

## Discipline Tracker App (test subject)
- **Root screens** (no back button): `staff_home_screen.dart`, `manager_dashboard_screen.dart`
- **Sub-screens** (need `leading: const BackButton()`): `overtime_form_screen.dart`, `staff_detail_screen.dart`
- Both runners have explicit BackButton added to sub-screen AppBars
