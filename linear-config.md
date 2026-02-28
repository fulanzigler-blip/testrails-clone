# Linear + GitHub Integration Setup

## 1. Linear API Key Setup

### Step 1: Generate API Key
1. Login ke [linear.app](https://linear.app)
2. Go to **Settings** → **Account** → **API** 
3. Click **Create personal API key**
4. Copy key (starts with `lin_api_...`)

### Step 2: Store API Key
```bash
# Simpan di environment variable
export LINEAR_API_KEY="lin_api_your_key_here"

# Atau simpan di file (lebih aman)
echo "lin_api_your_key_here" > ~/.linear_api_key
chmod 600 ~/.linear_api_key
```

## 2. GitHub Integration

### Option A: Linear GitHub App (Recommended)
1. Di Linear: **Settings** → **Integrations** → **GitHub**
2. Click **Connect GitHub**
3. Pilih repository yang mau di-link
4. Auto-sync: PRs, commits, branches

### Option B: GitHub Actions (Manual)
Buat file `.github/workflows/linear-sync.yml`:

```yaml
name: Linear Sync

on:
  pull_request:
    types: [opened, closed, edited]
  push:
    branches: [main, develop]

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Sync to Linear
        env:
          LINEAR_API_KEY: ${{ secrets.LINEAR_API_KEY }}
        run: |
          # Extract issue IDs from commits/PRs
          # Update Linear issue status via API
          echo "Syncing to Linear..."
```

## 3. Workflow Commands

### Create Issue via API
```bash
curl -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { issueCreate(input: { title: \"User Story: Login\", description: \"As a user...\", teamId: \"TEAM_ID\" }) { issue { id identifier } } }"
  }'
```

### Update Issue Status
```bash
curl -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { issueUpdate(id: \"ISSUE_ID\", input: { stateId: \"IN_PROGRESS_STATE_ID\" }) { issue { id state { name } } } }"
  }'
```

## 4. Agent Integration Script

Buat file `linear-agent-helper.sh`:

```bash
#!/bin/bash
# Linear Agent Helper - untuk SDLC agents

LINEAR_API_KEY=${LINEAR_API_KEY:-$(cat ~/.linear_api_key 2>/dev/null)}
TEAM_ID="your_team_id"

# Create issue from agent
create_issue() {
  local title="$1"
  local description="$2"
  local label="$3"
  
  curl -s -X POST https://api.linear.app/graphql \
    -H "Authorization: $LINEAR_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"query\": \"mutation { issueCreate(input: { title: \\\"$title\\\", description: \\\"$description\\\", teamId: \\\"$TEAM_ID\\\", labelIds: [\\\"$label\\\"] }) { issue { id identifier url } } }\"
    }" | jq -r '.data.issueCreate.issue'
}

# Update issue status
update_status() {
  local issue_id="$1"
  local state="$2"
  
  curl -s -X POST https://api.linear.app/graphql \
    -H "Authorization: $LINEAR_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"query\": \"mutation { issueUpdate(id: \\\"$issue_id\\\", input: { stateId: \\\"$state\\\" }) { issue { id state { name } } } }\"
    }" | jq -r '.data.issueUpdate.issue.state.name'
}

# Usage examples:
# create_issue "User Story: Login" "As a user..." "label_id"
# update_status "issue_id" "in_progress_state_id"
```

## Next Steps

1. **Generate Linear API Key** → Simpan di `~/.linear_api_key`
2. **Install GitHub App** → Connect ke repo project
3. **Set TEAM_ID** → Dari Linear settings
4. **Test script** → `./linear-agent-helper.sh`

Ready to integrate SDLC agents with Linear! 🚀
