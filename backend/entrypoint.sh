#!/bin/sh
# Copy SSH key and fix permissions (runs as root, then drops to nodejs)
if [ -f /tmp/host_ssh_key ]; then
  mkdir -p /home/nodejs/.ssh
  cp /tmp/host_ssh_key /home/nodejs/.ssh/id_ed25519
  chown nodejs:nodejs /home/nodejs/.ssh/id_ed25519
  chmod 600 /home/nodejs/.ssh/id_ed25519
  export MAESTRO_RUNNER_KEY_PATH=/home/nodejs/.ssh/id_ed25519
fi
exec su-exec nodejs "$@"
