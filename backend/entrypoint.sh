#!/bin/sh
# Copy SSH key and fix permissions (runs as root, then drops to nodejs)
if [ -f /tmp/host_ssh_key ]; then
  mkdir -p /home/nodejs/.ssh
  cp /tmp/host_ssh_key /home/nodejs/.ssh/id_ed25519
  chown nodejs:nodejs /home/nodejs/.ssh/id_ed25519
  chmod 600 /home/nodejs/.ssh/id_ed25519
  export MAESTRO_RUNNER_KEY_PATH=/home/nodejs/.ssh/id_ed25519
fi

# Install Playwright browsers in background (install as nodejs user so cache path is correct)
PLAYWRIGHT_CACHE="/home/nodejs/.cache/ms-playwright"
if [ ! -d "$PLAYWRIGHT_CACHE/chromium-" ]; then
  echo "Installing Playwright browsers in background (for nodejs user)..."
  mkdir -p "$PLAYWRIGHT_CACHE"
  chown -R nodejs:nodejs "$PLAYWRIGHT_CACHE"
  gosu nodejs sh -c 'cd /app && PLAYWRIGHT_BROWSERS_PATH=/home/nodejs/.cache/ms-playwright npx playwright install chromium 2>&1 | tee /tmp/playwright-install.log' &
fi

exec gosu nodejs "$@"
