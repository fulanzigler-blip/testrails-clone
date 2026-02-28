#!/bin/bash

# Continuous monitoring script
# Runs in background and generates daily report at 15:00 WIB (8:00 UTC)

SCRIPT_DIR="/home/clawdbot/.openclaw/workspace/arbitrage"
LOG_FILE="$SCRIPT_DIR/monitor.log"
PID_FILE="$SCRIPT_DIR/monitor.pid"
CONTINUOUS_SCRIPT="$SCRIPT_DIR/monitor_continuous.py"

echo "=== ARBITRAGE CONTINUOUS MONITORING ==="

# Check if already running
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p $PID > /dev/null 2>&1; then
        echo "⚠️  Monitoring already running (PID: $PID)"
        echo "To stop: kill $PID"
        exit 1
    else
        echo "Removing stale PID file..."
        rm "$PID_FILE"
    fi
fi

# Check if continuous monitor script exists
if [ ! -f "$CONTINUOUS_SCRIPT" ]; then
    echo "❌ Continuous monitor script not found at $CONTINUOUS_SCRIPT"
    exit 1
fi

# Start monitoring in background
echo "🚀 Starting continuous monitoring..."
nohup python3 "$CONTINUOUS_SCRIPT" >> "$LOG_FILE" 2>&1 &
PID=$!

# Save PID
echo $PID > "$PID_FILE"

echo "✓ Monitoring started (PID: $PID)"
echo "Log file: $LOG_FILE"
echo ""
echo "To stop monitoring:"
echo "  kill $PID"
echo "  rm $PID_FILE"
echo ""
echo "To view logs:"
echo "  tail -f $LOG_FILE"
