#!/usr/bin/env python3
"""
PASSIVE MARKET MONITORING SYSTEM
==================================
MONITORING ONLY - NO TRADING EXECUTION

Task:
1. Passive monitoring harga IDX, US Markets (NASDAQ, NYSE)
2. Tracking spread real-time (bid/ask, mid-price)
3. Melaporkan peluang arbitrase ketika spread > biaya transaksi
4. Melaporkan peluang spread "free money" (profit kecil tanpa risiko)
5. Laporan real-time ketika peluang muncul
6. JANGAN eksekusi BUY/SELL orders sama sekali

Risk: 0% (modal $50 AMAN)
Gain: Potensial kecil (jika spread > fee)

Laporan bahasa Indonesia, ringkas.
Fokus ke peluang aman tanpa risiko rugi.

Laporan ke Telegram setiap saat peluang ditemukan (real-time) atau setiap 6 jam (summary).
"""

import json
import time
import requests
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict
from decimal import Decimal, getcontext
import threading

# Set precision for calculations
getcontext().prec = 8

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s UTC | %(levelname)s | %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.FileHandler('/home/clawdbot/.openclaw/workspace/arbitrage/passive_monitor.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# State file for sharing opportunities with main agent
STATE_FILE = '/home/clawdbot/.openclaw/workspace/arbitrage/monitor_state.json'

@dataclass
class PriceData:
    symbol: str
    market: str
    bid: Optional[float]
    ask: Optional[float]
    mid_price: Optional[float]
    currency: str
    timestamp: str

@dataclass
class ArbitrageOpportunity:
    symbol: str
    market1: str
    price1_orig: float
    price1_usd: float
    bid1: Optional[float]
    ask1: Optional[float]
    market2: str
    price2_orig: float
    price2_usd: float
    bid2: Optional[float]
    ask2: Optional[float]
    spread_pct: float
    potential_profit_usd: float
    estimated_fees: float
    net_profit: float
    is_free_money: bool
    timestamp: str

    def to_dict(self):
        """Convert to dict for JSON serialization"""
        return asdict(self)

class PassiveMonitor:
    def __init__(self, config_path: str):
        self.config = self.load_config(config_path)
        self.opportunities_found = []
        self.last_summary_time = datetime.now(timezone.utc)
        self.last_opportunity_reported = {}  # To avoid spamming same opportunity
        self.state_lock = threading.Lock()

    def load_config(self, path: str) -> dict:
        """Load configuration from JSON file"""
        with open(path, 'r') as f:
            return json.load(f)

    def save_state(self):
        """Save state to JSON file for main agent to read"""
        with self.state_lock:
            state = {
                'last_update': datetime.now(timezone.utc).isoformat(),
                'opportunities': [opp.to_dict() for opp in self.opportunities_found[-20:]],  # Keep last 20
                'total_opportunities_found': len(self.opportunities_found),
                'last_summary_time': self.last_summary_time.isoformat(),
                'monitoring_status': 'running'
            }

            with open(STATE_FILE, 'w') as f:
                json.dump(state, f, indent=2, default=str)

            logger.debug(f"💾 State saved to {STATE_FILE}")

    def get_yahoo_finance_data(self, symbol: str) -> Optional[PriceData]:
        """
        Get stock data from Yahoo Finance
        Returns bid, ask, and mid-price
        """
        try:
            url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }

            response = requests.get(url, headers=headers, timeout=10)

            if response.status_code == 200:
                data = response.json()
                if not data['chart']['result']:
                    logger.warning(f"No data found for {symbol}")
                    return None

                result = data['chart']['result'][0]
                meta = result['meta']

                bid = None
                ask = None

                if 'bid' in meta and meta['bid']:
                    bid = float(meta['bid'])
                if 'ask' in meta and meta['ask']:
                    ask = float(meta['ask'])

                if 'regularMarketPrice' in meta and meta['regularMarketPrice']:
                    mid_price = float(meta['regularMarketPrice'])
                else:
                    mid_price = None

                currency = meta.get('currency', 'USD')
                market = 'NASDAQ/NYSE' if currency == 'USD' else 'IDX'

                return PriceData(
                    symbol=symbol,
                    market=market,
                    bid=bid,
                    ask=ask,
                    mid_price=mid_price,
                    currency=currency,
                    timestamp=datetime.now(timezone.utc).isoformat()
                )

            logger.warning(f"Yahoo Finance returned status {response.status_code} for {symbol}")
            return None

        except requests.exceptions.RequestException as e:
            logger.warning(f"Network error fetching {symbol}: {e}")
            return None
        except Exception as e:
            logger.error(f"Error fetching data for {symbol}: {e}")
            return None

    def get_fx_rate(self, from_currency: str, to_currency: str = 'USD') -> Optional[float]:
        """Get exchange rate from free API"""
        try:
            if from_currency == to_currency:
                return 1.0

            url = f"https://api.exchangerate-api.com/v4/latest/{from_currency}"
            response = requests.get(url, timeout=10)

            if response.status_code == 200:
                data = response.json()
                rate = float(data['rates'].get(to_currency, 1.0))
                logger.debug(f"FX Rate: {from_currency} → {to_currency} = {rate}")
                return rate
            else:
                # Fallback hardcoded rate
                if from_currency == 'IDR' and to_currency == 'USD':
                    logger.warning("FX API failed, using fallback IDR/USD rate")
                    return 0.000063
                elif from_currency == 'USD' and to_currency == 'IDR':
                    return 15850.0

            return None

        except Exception as e:
            logger.error(f"Error getting FX rate: {e}")
            if from_currency == 'IDR' and to_currency == 'USD':
                return 0.000063
            elif from_currency == 'USD' and to_currency == 'IDR':
                return 15850.0
            return None

    def calculate_spread(self, price1_usd: float, price2_usd: float) -> float:
        """Calculate spread percentage from USD prices"""
        if price1_usd == 0 or price2_usd == 0:
            return 0.0
        avg_price = (price1_usd + price2_usd) / 2
        if avg_price == 0:
            return 0.0
        return (abs(price1_usd - price2_usd) / avg_price) * 100.0

    def estimate_transaction_fees(self, amount_usd: float) -> float:
        """Estimate transaction fees (conservative estimate)"""
        base_fee = 5.0
        percentage_fee = amount_usd * 0.001
        return base_fee + percentage_fee

    def analyze_arbitrage(self, symbol: str) -> List[ArbitrageOpportunity]:
        """Analyze arbitrage opportunities for a symbol across different markets"""
        logger.info(f"🔍 Analyzing {symbol}...")

        prices = []

        # Try Yahoo Finance directly
        yahoo_data = self.get_yahoo_finance_data(symbol)
        if yahoo_data and yahoo_data.mid_price:
            prices.append(yahoo_data)

        # For IDX stocks, try Jakarta listing
        if symbol in ['BBCA', 'UNVR', 'TLKM', 'GOTO', 'ADRO']:
            idx_data = self.get_yahoo_finance_data(f"{symbol}.JK")
            if idx_data and idx_data.mid_price:
                prices.append(idx_data)

        # Also check ADRs if they exist
        adrs = {
            'BBCA': None,
            'UNVR': 'UNVR',
            'TLKM': 'TLK',
            'GOTO': None,
            'ADRO': None
        }

        if symbol in adrs and adrs[symbol]:
            adr_data = self.get_yahoo_finance_data(adrs[symbol])
            if adr_data and adr_data.mid_price:
                prices.append(adr_data)

        # Analyze all pairs
        opportunities = []
        for i in range(len(prices)):
            for j in range(i + 1, len(prices)):
                p1 = prices[i]
                p2 = prices[j]

                # Convert both to USD for comparison
                price1_usd = p1.mid_price
                price2_usd = p2.mid_price

                if p1.currency != 'USD':
                    fx_rate = self.get_fx_rate(p1.currency, 'USD')
                    if fx_rate:
                        price1_usd = p1.mid_price * fx_rate
                    else:
                        continue

                if p2.currency != 'USD':
                    fx_rate = self.get_fx_rate(p2.currency, 'USD')
                    if fx_rate:
                        price2_usd = p2.mid_price * fx_rate
                    else:
                        continue

                # Skip if prices are too different (likely different instruments/ADRs)
                if price1_usd == 0 or price2_usd == 0:
                    continue

                # Calculate spread using USD prices
                spread_pct = self.calculate_spread(price1_usd, price2_usd)

                # Skip unrealistic spreads (>100% likely means different instruments)
                if spread_pct > 100:
                    logger.debug(f"Skipping {symbol} - spread too high ({spread_pct:.2f}%), likely different instruments")
                    continue

                trade_amount = 25.0
                estimated_fees = self.estimate_transaction_fees(trade_amount * 2)

                # Estimate potential profit based on spread
                # With $25 in each market, profit would be spread% * $25 / 2 (rough estimate)
                profit_per_unit = abs(price1_usd - price2_usd)
                shares = 25.0 / min(price1_usd, price2_usd)
                potential_profit = profit_per_unit * shares - estimated_fees

                net_profit = potential_profit

                is_free_money = net_profit > 0 and spread_pct >= 0.5

                opportunity = ArbitrageOpportunity(
                    symbol=symbol,
                    market1=f"{p1.market} ({p1.currency})",
                    price1_orig=p1.mid_price,
                    price1_usd=price1_usd,
                    bid1=p1.bid,
                    ask1=p1.ask,
                    market2=f"{p2.market} ({p2.currency})",
                    price2_orig=p2.mid_price,
                    price2_usd=price2_usd,
                    bid2=p2.bid,
                    ask2=p2.ask,
                    spread_pct=spread_pct,
                    potential_profit_usd=potential_profit,
                    estimated_fees=estimated_fees,
                    net_profit=net_profit,
                    is_free_money=is_free_money,
                    timestamp=datetime.now(timezone.utc).isoformat()
                )

                opportunities.append(opportunity)

        return opportunities

    def format_opportunity_message(self, opp: ArbitrageOpportunity) -> str:
        """Format arbitrage opportunity as Indonesian message"""
        emoji = "🟢" if opp.is_free_money else "⚡"

        msg = f"""{emoji} PELUANG ARBITRASE DETECTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 {opp.symbol}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Market 1: {opp.market1}
  • Harga: ${opp.price1_orig:.4f} ({opp.price1_usd:.4f} USD)
  {f'  • Bid: ${opp.bid1:.4f}' if opp.bid1 else ''}
  {f'  • Ask: ${opp.ask1:.4f}' if opp.ask1 else ''}

Market 2: {opp.market2}
  • Harga: ${opp.price2_orig:.4f} ({opp.price2_usd:.4f} USD)
  {f'  • Bid: ${opp.bid2:.4f}' if opp.bid2 else ''}
  {f'  • Ask: ${opp.ask2:.4f}' if opp.ask2 else ''}

📈 Spread: {opp.spread_pct:.2f}%
💰 Profit Potensial: ${opp.potential_profit_usd:.4f}
💸 Estimasi Fee: ${opp.estimated_fees:.4f}
📊 Net Profit: ${opp.net_profit:.4f}

{opp.is_free_money and '✅ FREE MONEY PELUANG!' or '📌 Spread terdeteksi'}
⏰ Waktu: {opp.timestamp}

⚠️  MONITORING ONLY - Tidak ada eksekusi otomatis"""

        return msg

    def should_report_opportunity(self, opp: ArbitrageOpportunity) -> bool:
        """Determine if opportunity should be reported"""
        if opp.spread_pct < 0.3 and not opp.is_free_money:
            return False

        key = f"{opp.symbol}_{opp.market1}_{opp.market2}"
        if key in self.last_opportunity_reported:
            time_since = datetime.now(timezone.utc) - self.last_opportunity_reported[key]
            if time_since < timedelta(minutes=30):
                return False

        return True

    def report_opportunity(self, opp: ArbitrageOpportunity):
        """Mark opportunity as reported and save state"""
        if not self.should_report_opportunity(opp):
            return

        key = f"{opp.symbol}_{opp.market1}_{opp.market2}"
        self.last_opportunity_reported[key] = datetime.now(timezone.utc)

        self.opportunities_found.append(opp)
        logger.info(f"📢 New arbitrage opportunity: {opp.symbol} spread={opp.spread_pct:.2f}%")

        # Save state so main agent can send Telegram message
        self.save_state()

    def generate_summary(self) -> str:
        """Generate 6-hour summary report"""
        now = datetime.now(timezone.utc)

        six_hours_ago = now - timedelta(hours=6)
        recent_opps = [
            opp for opp in self.opportunities_found
            if datetime.fromisoformat(opp.timestamp) > six_hours_ago
        ]

        free_money_count = sum(1 for opp in recent_opps if opp.is_free_money)
        max_spread = max((opp.spread_pct for opp in recent_opps), default=0.0)

        stock_counts = {}
        for opp in recent_opps:
            stock_counts[opp.symbol] = stock_counts.get(opp.symbol, 0) + 1

        top_stocks = sorted(stock_counts.items(), key=lambda x: x[1], reverse=True)[:5]

        msg = f"""📊 LAPORAN 6 JAM - MONITORING PASIF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏰ Periode: {six_hours_ago.strftime('%Y-%m-%d %H:%M')} → {now.strftime('%Y-%m-%d %H:%M')} UTC

📈 STATISTIK:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Total peluang terdeteksi: {len(recent_opps)}
• Peluang "free money": {free_money_count}
• Spread tertinggi: {max_spread:.2f}%

🏆 TOP SAHAM (peluang terbanyak):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"""

        for symbol, count in top_stocks:
            msg += f"\n• {symbol}: {count} peluang"

        msg += f"""

⚠️  STATUS: MONITORING SAJA - 0% RISIKO
💰 Modal: $50.00 (aman, tidak dipakai)
📝 Tidak ada eksekusi trade otomatis

⏰ Waktu: {now.strftime('%Y-%m-%d %H:%M:%S')} UTC"""

        return msg

    def run_continuous(self, check_interval_minutes=5, summary_interval_hours=6):
        """Run continuous monitoring"""
        logger.info("=" * 60)
        logger.info("🚀 PASIF MARKET MONITORING DIMULAI")
        logger.info("=" * 60)
        logger.info(f"📊 Monitoring interval: {check_interval_minutes} menit")
        logger.info(f"📊 Summary interval: {summary_interval_hours} jam")
        logger.info(f"🔒 Mode: PASSIVE ONLY - Tidak ada eksekusi trade")
        logger.info("⏰ Waktu mulai: " + datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC'))

        # Save initial state
        startup_msg = """🟢 MONITORING PASIF START
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Sistem monitoring 24/7 telah dimulai:

✅ Monitoring: IDX, NASDAQ, NYSE
✅ Tracking: Bid/Ask, Mid-price, Spread
✅ Laporan: Real-time jika peluang muncul
✅ Summary: Setiap 6 jam

🔒 PENTING: HANYA MONITORING - Tidak ada eksekusi trade
💰 Modal $100% aman (tidak dipakai)

⏰ """ + datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')

        # Add startup message to state
        with self.state_lock:
            state = {
                'last_update': datetime.now(timezone.utc).isoformat(),
                'startup_message': startup_msg,
                'opportunities': [],
                'total_opportunities_found': 0,
                'last_summary_time': self.last_summary_time.isoformat(),
                'monitoring_status': 'running'
            }
            with open(STATE_FILE, 'w') as f:
                json.dump(state, f, indent=2, default=str)

        logger.info("💾 Initial state saved")

        try:
            while True:
                now = datetime.now(timezone.utc)

                logger.info("-" * 60)
                logger.info(f"🔍 Checking markets at {now.strftime('%H:%M:%S UTC')}...")

                watchlist = self.config['stocks']['idx_high_liquidity']

                for symbol in watchlist:
                    try:
                        opportunities = self.analyze_arbitrage(symbol)

                        for opp in opportunities:
                            self.report_opportunity(opp)

                    except Exception as e:
                        logger.error(f"❌ Error analyzing {symbol}: {e}")
                        continue

                # Check if it's time for summary report
                time_since_summary = now - self.last_summary_time
                if time_since_summary >= timedelta(hours=summary_interval_hours):
                    logger.info("📊 Generating 6-hour summary...")
                    summary = self.generate_summary()

                    # Save summary to state
                    with self.state_lock:
                        with open(STATE_FILE, 'r+') as f:
                            state = json.load(f)
                            state['summary_message'] = summary
                            state['last_summary_time'] = now.isoformat()
                            f.seek(0)
                            json.dump(state, f, indent=2, default=str)

                    self.last_summary_time = now

                # Save state periodically
                self.save_state()

                # Wait for next check
                logger.info(f"✅ Check complete. Next check in {check_interval_minutes} minutes...")
                time.sleep(check_interval_minutes * 60)

        except KeyboardInterrupt:
            logger.info("\n⏸️  Monitoring stopped by user")
        except Exception as e:
            logger.error(f"❌ Fatal error in monitoring loop: {e}")
            raise
        finally:
            # Save final state
            with self.state_lock:
                with open(STATE_FILE, 'r+') as f:
                    state = json.load(f)
                    state['monitoring_status'] = 'stopped'
                    state['last_update'] = datetime.now(timezone.utc).isoformat()
                    f.seek(0)
                    json.dump(state, f, indent=2, default=str)

def main():
    """Main entry point"""
    monitor = PassiveMonitor('/home/clawdbot/.openclaw/workspace/arbitrage/config.json')
    monitor.run_continuous(check_interval_minutes=5, summary_interval_hours=6)

if __name__ == '__main__':
    main()
