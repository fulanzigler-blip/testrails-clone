# Passive Market Monitoring - Reporting Guide

## Overview

The passive monitoring system runs continuously and saves opportunities to a state file:
`/home/clawdbot/.openclaw/workspace/arbitrage/monitor_state.json`

## How to Read Opportunities

The state file contains:
- `last_update`: Last time the monitor updated state
- `startup_message`: Message sent when monitoring starts
- `opportunities`: List of arbitrage opportunities found (last 20)
- `summary_message`: 6-hour summary (when available)
- `total_opportunities_found`: Total count
- `monitoring_status`: "running" or "stopped"

## Sending Telegram Messages

The main agent should periodically check the state file and send messages:

### 1. Check for new opportunities

Read the state file and check for new opportunities:
- If `opportunities` array has changed
- If `startup_message` is present (first run)
- If `summary_message` is present (6-hour summary)

### 2. Format and send messages

Use the `message` tool to send to Telegram:

```python
# Read state
import json
with open('/home/clawdbot/.openclaw/workspace/arbitrage/monitor_state.json', 'r') as f:
    state = json.load(f)

# Format opportunity message
for opp in state['opportunities']:
    msg = f"""{emoji} PELUANG ARBITRASE DETECTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 {opp['symbol']}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Market 1: {opp['market1']}
  • Harga: ${opp['price1_orig']:.4f} ({opp['price1_usd']:.4f} USD)
  {f"  • Bid: ${opp['bid1']:.4f}" if opp['bid1'] else ''}
  {f"  • Ask: ${opp['ask1']:.4f}" if opp['ask1'] else ''}

Market 2: {opp['market2']}
  • Harga: ${opp['price2_orig']:.4f} ({opp['price2_usd']:.4f} USD)
  {f"  • Bid: ${opp['bid2']:.4f}" if opp['bid2'] else ''}
  {f"  • Ask: ${opp['ask2']:.4f}" if opp['ask2'] else ''}

📈 Spread: {opp['spread_pct']:.2f}%
💰 Profit Potensial: ${opp['potential_profit_usd']:.4f}
💸 Estimasi Fee: ${opp['estimated_fees']:.4f}
📊 Net Profit: ${opp['net_profit']:.4f}

{opp['is_free_money'] and '✅ FREE MONEY PELUANG!' or '📌 Spread terdeteksi'}
⏰ Waktu: {opp['timestamp']}

⚠️  MONITORING ONLY - Tidak ada eksekusi otomatis"""

    # Send via message tool
    message send --channel telegram --message "$msg"
```

## Check Interval

The monitor checks markets every 5 minutes.

Recommended check frequency for the main agent:
- Every 10-15 minutes for new opportunities
- Every 6 hours for summaries

## State Tracking

To avoid sending duplicate messages, track:
1. The last opportunity timestamp sent
2. The startup message status (sent or not)
3. The summary message timestamp (sent or not)

## Monitoring Status

Check `monitoring_status` in state file:
- "running": Monitor is active
- "stopped": Monitor has stopped

If status is "stopped", the monitor may need to be restarted.

## Monitor Process

- Process ID is saved in: `/home/clawdbot/.openclaw/workspace/monitor.pid`
- Log file: `/home/clawdbot/.openclaw/workspace/arbitrage/passive_monitor.log`
- Script: `/home/clawdbot/.openclaw/workspace/arbitrage/monitor_passive.py`

To restart:
```bash
cd /home/clawdbot/.openclaw/workspace/arbitrage
source venv/bin/activate
nohup python3 monitor_passive.py > monitor_stdout.log 2>&1 &
echo $! > /home/clawdbot/.openclaw/workspace/monitor.pid
```
