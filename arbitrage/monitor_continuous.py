#!/usr/bin/env python3
"""
Continuous Arbitrage Monitor
Runs indefinitely, checking for opportunities periodically
Generates daily report at 15:00 WIB (8:00 UTC)
"""

import json
import time
from datetime import datetime, timezone, timedelta
import signal
import sys
from monitor import ArbitrageMonitor

# Global flag for graceful shutdown
running = True

def signal_handler(signum, frame):
    """Handle shutdown signals gracefully"""
    global running
    print("\n⚠️  Shutdown signal received...")
    running = False

def send_telegram_report(report: str, channel: str = None):
    """
    Send report to Telegram via message tool
    This would be called by the main agent or via external integration
    For now, we save to file
    """
    with open('/home/clawdbot/.openclaw/workspace/arbitrage/daily_report.txt', 'w') as f:
        f.write(report)

    print("\n" + report)

def is_report_time() -> bool:
    """Check if it's time to generate daily report (15:00 WIB = 8:00 UTC)"""
    now = datetime.now(timezone.utc)
    return now.hour == 8 and now.minute == 0

def main():
    """Main continuous monitoring loop"""
    global running

    # Setup signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    print("=== ARBITRAGE CONTINUOUS MONITORING STARTED ===")
    print("Report time: 15:00 WIB (8:00 UTC)")
    print("Press Ctrl+C to stop")
    print()

    # Initialize monitor
    monitor = ArbitrageMonitor('/home/clawdbot/.openclaw/workspace/arbitrage/config.json')

    last_report_date = None

    try:
        while running:
            now = datetime.now(timezone.utc)
            current_date = now.date()

            # Check if it's report time and we haven't sent one today
            if is_report_time() and last_report_date != current_date:
                print(f"\n📊 [{now.isoformat()}] Generating daily report...")

                # Generate report
                report = monitor.generate_daily_report()

                # Send/save report
                send_telegram_report(report)

                last_report_date = current_date
                print("✓ Report generated and saved\n")

            # Run monitoring cycle
            print(f"[{now.strftime('%Y-%m-%d %H:%M:%S UTC')}] Scanning for arbitrage opportunities...")

            monitor.run_monitoring_cycle()

            # Wait before next check (check every 5 minutes during trading hours, 30 minutes otherwise)
            # IDX trading hours: 08:45-15:00 WIB = 01:45-08:00 UTC
            if 1 <= now.hour < 8:
                # During trading hours - check more frequently
                sleep_time = 300  # 5 minutes
            else:
                # Outside trading hours - check less frequently
                sleep_time = 1800  # 30 minutes

            print(f"Next check in {sleep_time // 60} minutes...")
            print()

            # Sleep with interruption check
            for _ in range(sleep_time):
                if not running:
                    break
                time.sleep(1)

    except Exception as e:
        print(f"\n❌ Error in continuous monitoring: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    print("\n=== ARBITRAGE CONTINUOUS MONITORING STOPPED ===")


if __name__ == '__main__':
    main()
