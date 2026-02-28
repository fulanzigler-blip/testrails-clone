#!/bin/bash

# Quick scan script to check for arbitrage opportunities

cd /home/clawdbot/.openclaw/workspace/arbitrage
source venv/bin/activate

echo "=== RUNNING QUICK ARBITRAGE SCAN ==="
echo ""

python3 << 'EOF'
from monitor import ArbitrageMonitor
import time

monitor = ArbitrageMonitor('/home/clawdbot/.openclaw/workspace/arbitrage/config.json')

# Run one monitoring cycle
monitor.run_monitoring_cycle()

print("\n=== QUICK SCAN COMPLETE ===")
print("\nSummary:")
print(f"  Current Capital: ${monitor.state['current_capital']:.2f}")
print(f"  Opportunities Found: {monitor.state['opportunities_found']}")
print(f"  Trades Executed: {monitor.state['trades_executed']}")
print(f"  Win Rate: {monitor.get_win_rate():.1f}%")
EOF
