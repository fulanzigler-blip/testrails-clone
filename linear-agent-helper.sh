#!/bin/bash
# Linear Agent Helper - untuk SDLC agents
# Usage: source linear-agent-helper.sh

LINEAR_API_KEY=${LINEAR_API_KEY:-$(cat ~/.linear_api_key 2>/dev/null)}
TEAM_ID="${LINEAR_TEAM_ID:-}"

# Check if API key exists
if [ -z "$LINEAR_API_KEY" ]; then
    echo "❌ Error: LINEAR_API_KEY not set"
    echo "Set via: export LINEAR_API_KEY='lin_api_...'"
    echo "Or save to: ~/.linear_api_key"
    return 1
fi

# Helper: Create issue from agent
linear_create_issue() {
    local title="$1"
    local description="$2"
    local label="${3:-}"
    
    if [ -z "$TEAM_ID" ]; then
        echo "❌ Error: LINEAR_TEAM_ID not set"
        return 1
    fi
    
    local label_part=""
    if [ -n "$label" ]; then
        label_part=", labelIds: [\"$label\"]"
    fi
    
    local response=$(curl -s -X POST https://api.linear.app/graphql \
        -H "Authorization: $LINEAR_API_KEY" \
        -H "Content-Type: application/json" \
        -d "{
            \"query\": \"mutation { issueCreate(input: { title: \\\"$title\\\", description: \\\"$description\\\", teamId: \\\"$TEAM_ID\\\"$label_part }) { issue { id identifier url state { name } } } }\"
        }" 2>/dev/null)
    
    local issue_id=$(echo "$response" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    local identifier=$(echo "$response" | grep -o '"identifier":"[^"]*"' | head -1 | cut -d'"' -f4)
    local url=$(echo "$response" | grep -o '"url":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [ -n "$identifier" ]; then
        echo "✅ Created: $identifier"
        echo "   URL: $url"
        echo "   ID: $issue_id"
        return 0
    else
        echo "❌ Failed to create issue"
        echo "Response: $response"
        return 1
    fi
}

# Helper: Update issue status
linear_update_status() {
    local issue_id="$1"
    local state_name="$2"
    
    # Map state names to state IDs (you'll need to get these from your Linear workspace)
    # Common states: backlog, todo, in_progress, in_review, done, canceled
    
    local response=$(curl -s -X POST https://api.linear.app/graphql \
        -H "Authorization: $LINEAR_API_KEY" \
        -H "Content-Type: application/json" \
        -d "{
            \"query\": \"mutation { issueUpdate(id: \\\"$issue_id\\\", input: { stateId: \\\"$state_name\\\" }) { issue { id identifier state { name } } } }\"
        }" 2>/dev/null)
    
    local new_state=$(echo "$response" | grep -o '"name":"[^"]*"' | tail -1 | cut -d'"' -f4)
    
    if [ -n "$new_state" ]; then
        echo "✅ Updated to: $new_state"
        return 0
    else
        echo "❌ Failed to update status"
        echo "Response: $response"
        return 1
    fi
}

# Helper: List team issues
linear_list_issues() {
    local state_filter="${1:-}"
    
    if [ -z "$TEAM_ID" ]; then
        echo "❌ Error: LINEAR_TEAM_ID not set"
        return 1
    fi
    
    local response=$(curl -s -X POST https://api.linear.app/graphql \
        -H "Authorization: $LINEAR_API_KEY" \
        -H "Content-Type: application/json" \
        -d "{
            \"query\": \"query { team(id: \\\"$TEAM_ID\\\") { issues { nodes { id identifier title state { name } assignee { name } } } } }\"
        }" 2>/dev/null)
    
    echo "$response" | grep -o '"identifier":"[^"]*","title":"[^"]*"' | while read line; do
        id=$(echo "$line" | grep -o '"identifier":"[^"]*"' | cut -d'"' -f4)
        title=$(echo "$line" | grep -o '"title":"[^"]*"' | cut -d'"' -f4)
        echo "$id: $title"
    done
}

# Helper: Get issue details
linear_get_issue() {
    local issue_id="$1"
    
    local response=$(curl -s -X POST https://api.linear.app/graphql \
        -H "Authorization: $LINEAR_API_KEY" \
        -H "Content-Type: application/json" \
        -d "{
            \"query\": \"query { issue(id: \\\"$issue_id\\\") { id identifier title description state { name } assignee { name } createdAt } } }\"
        }" 2>/dev/null)
    
    echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
}

# Print usage
echo ""
echo "🚀 Linear Agent Helper Loaded"
echo "=============================="
echo ""
echo "Available functions:"
echo "  linear_create_issue 'Title' 'Description' [label_id]"
echo "  linear_update_status 'issue_id' 'state_name'"
echo "  linear_list_issues [state_filter]"
echo "  linear_get_issue 'issue_id'"
echo ""
echo "Environment:"
echo "  LINEAR_API_KEY: ${LINEAR_API_KEY:+✅ Set}${LINEAR_API_KEY:-❌ Not set}"
echo "  LINEAR_TEAM_ID: ${TEAM_ID:+✅ Set}${TEAM_ID:-❌ Not set}"
echo ""
