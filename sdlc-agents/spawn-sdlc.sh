#!/bin/bash
# SDLC Agent Swarm Launcher
# Usage: ./spawn-sdlc.sh [all|pm|architect|frontend|backend|qa|devops|docs] [model]
#
# Examples:
#   ./spawn-sdlc.sh all                    # Spawn all with default model (zai/glm-4)
#   ./spawn-sdlc.sh pm                     # Just PM agent
#   ./spawn-sdlc.sh all zai/glm-4          # Explicitly use z.ai GLM-4
#   ./spawn-sdlc.sh all moonshot/kimi      # Use Moonshot Kimi instead

set -e

AGENT_TYPE=${1:-all}
MODEL=${2:-zai/glm-4}

echo "🧠 Using model: $MODEL"
echo ""

SPAWN_PM() {
  echo "📝 Spawning PM/Analyst agent..."
  sessions_spawn \
    "You are PM/Analyst agent. Read sdlc-agents/pm/AGENT.md for your role." \
    --label sdlc-pm \
    --model "$MODEL" \
    --thinking high
}

SPAWN_ARCH() {
  echo "🏗️ Spawning Architect agent..."
  sessions_spawn \
    "You are Architect agent. Read sdlc-agents/architect/AGENT.md for your role." \
    --label sdlc-arch \
    --model "$MODEL" \
    --thinking high
}

SPAWN_FRONTEND() {
  echo "🎨 Spawning Frontend Dev agent..."
  sessions_spawn \
    "You are Frontend Developer agent. Read sdlc-agents/frontend/AGENT.md for your role." \
    --label sdlc-frontend \
    --model "$MODEL" \
    --thinking high
}

SPAWN_BACKEND() {
  echo "⚙️ Spawning Backend Dev agent..."
  sessions_spawn \
    "You are Backend Developer agent. Read sdlc-agents/backend/AGENT.md for your role." \
    --label sdlc-backend \
    --model "$MODEL" \
    --thinking high
}

SPAWN_QA() {
  echo "🐛 Spawning QA Engineer agent..."
  sessions_spawn \
    "You are QA Engineer agent. Read sdlc-agents/qa/AGENT.md for your role." \
    --label sdlc-qa \
    --model "$MODEL" \
    --thinking high
}

SPAWN_DEVOPS() {
  echo "🚀 Spawning DevOps agent..."
  sessions_spawn \
    "You are DevOps Engineer agent. Read sdlc-agents/devops/AGENT.md for your role." \
    --label sdlc-devops \
    --model "$MODEL" \
    --thinking high
}

SPAWN_DOCS() {
  echo "📚 Spawning Tech Writer agent..."
  sessions_spawn \
    "You are Technical Writer agent. Read sdlc-agents/docs/AGENT.md for your role." \
    --label sdlc-docs \
    --model "$MODEL" \
    --thinking high
}

case "$AGENT_TYPE" in
  pm)
    SPAWN_PM
    ;;
  architect|arch)
    SPAWN_ARCH
    ;;
  frontend|fe)
    SPAWN_FRONTEND
    ;;
  backend|be)
    SPAWN_BACKEND
    ;;
  qa)
    SPAWN_QA
    ;;
  devops)
    SPAWN_DEVOPS
    ;;
  docs|writer)
    SPAWN_DOCS
    ;;
  all|*)
    SPAWN_PM
    sleep 2
    SPAWN_ARCH
    sleep 2
    SPAWN_FRONTEND
    sleep 2
    SPAWN_BACKEND
    sleep 2
    SPAWN_QA
    sleep 2
    SPAWN_DEVOPS
    sleep 2
    SPAWN_DOCS
    echo ""
    echo "✅ All 7 SDLC agents spawned with $MODEL!"
    ;;
esac