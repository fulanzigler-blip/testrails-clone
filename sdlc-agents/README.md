# SDLC 7-Agent Swarm

## Overview
A complete software development lifecycle team of specialized AI agents.

## Agents

| Agent | Dir | Role |
|-------|-----|------|
| PM | `pm/` | Product Manager & Business Analyst |
| Architect | `architect/` | System Architect |
| Frontend | `frontend/` | Frontend Developer |
| Backend | `backend/` | Backend Developer |
| QA | `qa/` | QA Engineer |
| DevOps | `devops/` | DevOps Engineer |
| Docs | `docs/` | Technical Writer |

## Workflow

```
PM → Architect → (Frontend + Backend) → QA → DevOps
         ↑            ↓         ↓       ↓
         └──────────── Docs (all artifacts)
```

## Quick Start

```bash
# Spawn all agents
openclaw session spawn pm --label sdlc-pm --agent-dir sdlc-agents/pm
openclaw session spawn architect --label sdlc-arch --agent-dir sdlc-agents/architect
openclaw session spawn frontend --label sdlc-frontend --agent-dir sdlc-agents/frontend
openclaw session spawn backend --label sdlc-backend --agent-dir sdlc-agents/backend
openclaw session spawn qa --label sdlc-qa --agent-dir sdlc-agents/qa
openclaw session spawn devops --label sdlc-devops --agent-dir sdlc-agents/devops
openclaw session spawn docs --label sdlc-docs --agent-dir sdlc-agents/docs
```

## Usage Flow

1. **Start with PM**: Give project requirements
2. **PM → Architect**: PM sends requirements, Architect designs system
3. **Architect → Devs**: Architect sends design to Frontend & Backend
4. **Devs parallel**: Frontend and Backend work simultaneously
5. **Devs → QA**: Both devs send code to QA for testing
6. **QA → Devs**: QA reports bugs back to respective devs
7. **DevOps**: Handles CI/CD and deployment
8. **Docs**: Updates documentation throughout

## Features

- **Parallel execution**: Frontend and Backend work simultaneously
- **Clear handoffs**: Each agent knows who to send work to
- **Quality gates**: QA blocks bad code from reaching production
- **Living docs**: Documentation stays current with code changes

## Customization

Edit each agent's `AGENT.md` to:
- Change technology stack
- Add/remove skills
- Adjust collaboration flows
- Modify voice/personality