#!/usr/bin/env python3
"""
Check monitor state and send Telegram messages for new opportunities
This script should be called by the main agent periodically
"""

import json
import os
from datetime import datetime, timezone

STATE_FILE = '/home/clawdbot/.openclaw/workspace/arbitrage/monitor_state.json'
LAST_CHECK_FILE = '/home/clawdbot/.openclaw/workspace/arbitrage/last_check.json'

def load_state():
    """Load monitor state"""
    if not os.path.exists(STATE_FILE):
        return None

    with open(STATE_FILE, 'r') as f:
        return json.load(f)

def load_last_check():
    """Load last check state"""
    if not os.path.exists(LAST_CHECK_FILE):
        return {
            'last_opportunity_count': 0,
            'startup_sent': False,
            'last_summary_time': None
        }

    with open(LAST_CHECK_FILE, 'r') as f:
        return json.load(f)

def save_last_check(state):
    """Save last check state"""
    with open(LAST_CHECK_FILE, 'w') as f:
        json.dump(state, f, indent=2)

def format_opportunity_message(opp):
    """Format arbitrage opportunity message"""
    emoji = "🟢" if opp['is_free_money'] else "⚡"

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

    return msg

def check_and_report():
    """Check monitor state and report new opportunities"""
    state = load_state()
    if not state:
        print("❌ Monitor state file not found")
        return

    last_check = load_last_check()
    messages_to_send = []

    # Check startup message
    if not last_check['startup_sent'] and 'startup_message' in state:
        messages_to_send.append({
            'type': 'startup',
            'message': state['startup_message']
        })
        last_check['startup_sent'] = True

    # Check for new opportunities
    current_count = len(state.get('opportunities', []))
    last_count = last_check['last_opportunity_count']

    if current_count > last_count:
        # Send new opportunities
        for opp in state['opportunities'][last_count:]:
            messages_to_send.append({
                'type': 'opportunity',
                'message': format_opportunity_message(opp),
                'data': opp
            })
        last_check['last_opportunity_count'] = current_count

    # Check for summary message
    if 'summary_message' in state:
        summary_time = state['last_summary_time']
        if last_check['last_summary_time'] != summary_time:
            messages_to_send.append({
                'type': 'summary',
                'message': state['summary_message']
            })
            last_check['last_summary_time'] = summary_time

    # Save state
    save_last_check(last_check)

    # Return messages to send
    return messages_to_send, state

def main():
    """Main function"""
    messages, state = check_and_report()

    print(f"Monitor status: {state.get('monitoring_status', 'unknown')}")
    print(f"Total opportunities: {state.get('total_opportunities_found', 0)}")
    print(f"Messages to send: {len(messages)}")

    # Print messages for the main agent to send
    if messages:
        print("\n" + "="*60)
        print("MESSAGES TO SEND TO TELEGRAM:")
        print("="*60)
        for i, msg in enumerate(messages, 1):
            print(f"\n--- Message {i} ({msg['type']}) ---")
            print(msg['message'])
            print("-" * 60)

    return messages

if __name__ == '__main__':
    main()
