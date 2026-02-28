#!/bin/bash

# Setup script for Arbitrage Monitoring System

echo "=== SETTING UP ARBITRAGE SAHAM SYSTEM ==="
echo "Modal: $50 USD"
echo ""

# Create directories
mkdir -p /home/clawdbot/.openclaw/workspace/arbitrage/logs
mkdir -p /home/clawdbot/.openclaw/workspace/arbitrage/data

# Check Python
echo "Checking Python..."
python3 --version

# Install dependencies
echo ""
echo "Installing Python dependencies..."
pip3 install -r /home/clawdbot/.openclaw/workspace/arbitrage/requirements.txt

# Make scripts executable
chmod +x /home/clawdbot/.openclaw/workspace/arbitrage/monitor.py

echo ""
echo "✓ Setup complete!"
echo ""
echo "System files created:"
echo "  - /home/clawdbot/.openclaw/workspace/arbitrage/config.json (configuration)"
echo "  - /home/clawdbot/.openclaw/workspace/arbitrage/monitor.py (monitoring script)"
echo "  - /home/clawdbot/.openclaw/workspace/arbitrage/daily_report.txt (daily report)"
echo ""
echo "To run monitoring:"
echo "  python3 /home/clawdbot/.openclaw/workspace/arbitrage/monitor.py"
echo ""
echo "To schedule daily report at 15:00 WIB (8:00 UTC):"
echo "  Use cron: 0 8 * * * /usr/bin/python3 /home/clawdbot/.openclaw/workspace/arbitrage/monitor.py"
