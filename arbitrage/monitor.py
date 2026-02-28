#!/usr/bin/env python3
"""
Stock Arbitrage Monitoring System
Modal: $50 USD
Focus: IDX vs US Markets, cross-broker, and cross-market arbitrage
"""

import json
import time
import requests
from datetime import datetime, timezone
import logging
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from decimal import Decimal, getcontext

# Set precision for calculations
getcontext().prec = 6

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/home/clawdbot/.openclaw/workspace/arbitrage/monitor.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

@dataclass
class ArbitrageOpportunity:
    """Data class for arbitrage opportunity"""
    symbol: str
    market_1: str
    price_1: Decimal
    currency_1: str
    market_2: str
    price_2: Decimal
    currency_2: str
    fx_rate: Decimal
    spread_pct: Decimal
    risk_reward: Decimal
    risk_amount: Decimal
    reward_amount: Decimal
    timestamp: str
    is_valid: bool
    reason: str

class ArbitrageMonitor:
    def __init__(self, config_path: str):
        self.config = self.load_config(config_path)
        self.state = self.config['state']
        self.performance = self.config['performance']
        self.fx_rates = {}
        self.stock_prices = {}
        self.opportunities_log = []

    def load_config(self, path: str) -> dict:
        """Load configuration from JSON file"""
        with open(path, 'r') as f:
            return json.load(f)

    def save_config(self, path: str):
        """Save current state to config file"""
        self.config['state'] = self.state
        self.config['performance'] = self.performance
        with open(path, 'w') as f:
            json.dump(self.config, f, indent=2)

    def get_fx_rate(self, from_currency: str, to_currency: str) -> Optional[Decimal]:
        """
        Get exchange rate between two currencies
        For demo: using mock data - in production use real FX API
        """
        try:
            # Mock data for demonstration
            # In production: use https://api.exchangerate-api.com or similar
            base_rates = {
                'USD': Decimal('1.00'),
                'IDR': Decimal('15850.00')  # Current approximate rate
            }

            if from_currency == to_currency:
                return Decimal('1.00')

            if from_currency in base_rates and to_currency in base_rates:
                rate = base_rates[from_currency] / base_rates[to_currency]
                return rate

            logger.warning(f"FX rate for {from_currency}/{to_currency} not available")
            return None

        except Exception as e:
            logger.error(f"Error getting FX rate: {e}")
            return None

    def get_stock_price(self, symbol: str, market: str) -> Optional[Decimal]:
        """
        Get stock price from a market
        For demo: using mock data - in production use market APIs (Yahoo Finance, etc.)
        """
        try:
            # Mock data for demonstration
            # Format: {symbol: {market: {price: X, currency: Y}}}
            mock_prices = {
                'BBCA': {
                    'idx': {'price': Decimal('9500.00'), 'currency': 'IDR'},
                    'idx_broker1': {'price': Decimal('9480.00'), 'currency': 'IDR'},
                    'idx_broker2': {'price': Decimal('9520.00'), 'currency': 'IDR'}
                },
                'UNVR': {
                    'idx': {'price': Decimal('3200.00'), 'currency': 'IDR'},
                    'idx_broker1': {'price': Decimal('3190.00'), 'currency': 'IDR'},
                    'idx_broker2': {'price': Decimal('3210.00'), 'currency': 'IDR'}
                },
                'TLKM': {
                    'idx': {'price': Decimal('3750.00'), 'currency': 'IDR'},
                    'idx_broker1': {'price': Decimal('3740.00'), 'currency': 'IDR'},
                    'idx_broker2': {'price': Decimal('3760.00'), 'currency': 'IDR'}
                },
                'GOTO': {
                    'idx': {'price': Decimal('84.00'), 'currency': 'IDR'},
                    'idx_broker1': {'price': Decimal('83.50'), 'currency': 'IDR'},
                    'idx_broker2': {'price': Decimal('84.50'), 'currency': 'IDR'}
                },
                'ADRO': {
                    'idx': {'price': Decimal('2800.00'), 'currency': 'IDR'},
                    'idx_broker1': {'price': Decimal('2790.00'), 'currency': 'IDR'},
                    'idx_broker2': {'price': Decimal('2810.00'), 'currency': 'IDR'}
                }
            }

            if symbol in mock_prices and market in mock_prices[symbol]:
                return mock_prices[symbol][market]['price'], mock_prices[symbol][market]['currency']

            logger.warning(f"Price for {symbol} on {market} not available")
            return None

        except Exception as e:
            logger.error(f"Error getting stock price for {symbol}: {e}")
            return None

    def calculate_spread(self, price_1: Decimal, price_2: Decimal, fx_rate: Decimal) -> Tuple[Decimal, Decimal]:
        """
        Calculate spread percentage and adjusted prices
        Returns: (spread_pct, price_1_converted, price_2_converted)
        """
        # Convert price_2 to same currency as price_1
        price_2_converted = price_2 * fx_rate

        # Calculate spread percentage
        if price_1 > 0 and price_2_converted > 0:
            spread = abs(price_1 - price_2_converted)
            spread_pct = (spread / min(price_1, price_2_converted)) * Decimal('100')
        else:
            spread_pct = Decimal('0')

        return spread_pct, price_2_converted

    def calculate_risk_reward(self, entry_price: Decimal, spread_pct: Decimal, capital: float) -> Tuple[Decimal, Decimal, Decimal]:
        """
        Calculate risk-reward ratio
        Returns: (risk_amount, reward_amount, risk_reward_ratio)
        """
        # Convert capital to Decimal
        capital_decimal = Decimal(str(capital))

        # Conservative risk estimation: 0.5% of spread as risk (slippage + fees)
        risk_pct = spread_pct * Decimal('0.5')
        reward_pct = spread_pct * Decimal('0.8')  # Account for fees

        risk_amount = (risk_pct / Decimal('100')) * capital_decimal
        reward_amount = (reward_pct / Decimal('100')) * capital_decimal

        if risk_amount > 0:
            risk_reward = reward_amount / risk_amount
        else:
            risk_reward = Decimal('0')

        return risk_amount, reward_amount, risk_reward

    def check_cross_broker_arbitrage(self, symbol: str) -> List[ArbitrageOpportunity]:
        """
        Check for arbitrage opportunities across different brokers
        """
        opportunities = []

        brokers = self.config['brokers']
        stocks = self.config['stocks']['idx_high_liquidity']

        if symbol not in stocks:
            return opportunities

        # Get prices from all brokers
        prices = {}
        for broker in brokers:
            price_data = self.get_stock_price(symbol, broker)
            if price_data:
                prices[broker] = {'price': price_data[0], 'currency': price_data[1]}

        # Check all pairs
        broker_list = list(prices.keys())
        for i in range(len(broker_list)):
            for j in range(i + 1, len(broker_list)):
                broker_1 = broker_list[i]
                broker_2 = broker_list[j]

                price_1 = prices[broker_1]['price']
                currency_1 = prices[broker_1]['currency']
                price_2 = prices[broker_2]['price']
                currency_2 = prices[broker_2]['currency']

                # Get FX rate
                fx_rate = self.get_fx_rate(currency_2, currency_1)
                if not fx_rate:
                    continue

                # Calculate spread
                spread_pct, _ = self.calculate_spread(price_1, price_2, fx_rate)

                # Check if spread exceeds minimum threshold
                min_spread = Decimal(str(self.config['thresholds']['min_spread_pct']))
                if spread_pct < min_spread:
                    continue

                # Calculate risk-reward
                capital = float(self.state['current_capital'])
                risk_amount, reward_amount, risk_reward = self.calculate_risk_reward(
                    price_1, spread_pct, capital
                )

                # Check if valid opportunity
                is_valid = True
                reason = ""

                min_rr = Decimal(str(self.config['risk_management']['min_risk_reward_ratio']))
                if risk_reward < min_rr:
                    is_valid = False
                    reason = f"Risk-reward {risk_reward:.2f} < minimum {min_rr}"

                if risk_amount > self.config['risk_management']['max_loss_per_trade']:
                    is_valid = False
                    reason = f"Risk ${risk_amount:.2f} > max ${self.config['risk_management']['max_loss_per_trade']}"

                if self.state['open_positions'] >= self.config['risk_management']['max_open_positions']:
                    is_valid = False
                    reason = f"Max open positions reached ({self.state['open_positions']})"

                if float(self.state['total_loss']) >= self.config['risk_management']['max_loss_total']:
                    is_valid = False
                    reason = "Total loss limit reached"

                opportunity = ArbitrageOpportunity(
                    symbol=symbol,
                    market_1=broker_1,
                    price_1=price_1,
                    currency_1=currency_1,
                    market_2=broker_2,
                    price_2=price_2,
                    currency_2=currency_2,
                    fx_rate=fx_rate,
                    spread_pct=spread_pct,
                    risk_reward=risk_reward,
                    risk_amount=risk_amount,
                    reward_amount=reward_amount,
                    timestamp=datetime.now(timezone.utc).isoformat(),
                    is_valid=is_valid,
                    reason=reason
                )

                opportunities.append(opportunity)

        return opportunities

    def scan_opportunities(self) -> List[ArbitrageOpportunity]:
        """
        Scan for all arbitrage opportunities
        """
        all_opportunities = []

        stocks = self.config['stocks']['idx_high_liquidity']

        for symbol in stocks:
            opportunities = self.check_cross_broker_arbitrage(symbol)
            all_opportunities.extend(opportunities)

        # Sort by spread_pct (descending)
        all_opportunities.sort(key=lambda x: x.spread_pct, reverse=True)

        # Update opportunity counter
        valid_opportunities = [op for op in all_opportunities if op.is_valid]
        self.state['opportunities_found'] += len(valid_opportunities)

        return all_opportunities

    def execute_trade(self, opportunity: ArbitrageOpportunity) -> bool:
        """
        Execute an arbitrage trade (CONSERVATIVE - only if valid)
        Returns: success (True/False)
        """
        if not opportunity.is_valid:
            logger.warning(f"Attempted to execute invalid opportunity: {opportunity.reason}")
            return False

        # Check risk limits
        if float(opportunity.risk_amount) > self.config['risk_management']['max_loss_per_trade']:
            logger.warning(f"Risk ${opportunity.risk_amount:.2f} exceeds max ${self.config['risk_management']['max_loss_per_trade']}")
            return False

        if float(self.state['total_loss']) >= self.config['risk_management']['max_loss_total']:
            logger.warning("Total loss limit reached - stopping all trades")
            return False

        if self.state['open_positions'] >= self.config['risk_management']['max_open_positions']:
            logger.warning(f"Max open positions ({self.config['risk_management']['max_open_positions']}) reached")
            return False

        # Simulate trade execution (in production: connect to broker APIs)
        logger.info(f"EXECUTING TRADE: {opportunity.symbol}")
        logger.info(f"  Buy at: {opportunity.market_2} ({opportunity.price_2} {opportunity.currency_2})")
        logger.info(f"  Sell at: {opportunity.market_1} ({opportunity.price_1} {opportunity.currency_1})")
        logger.info(f"  Spread: {opportunity.spread_pct:.2f}%")
        logger.info(f"  Risk: ${opportunity.risk_amount:.4f}, Reward: ${opportunity.reward_amount:.4f}")

        # Update state
        self.state['trades_executed'] += 1
        self.state['open_positions'] += 1

        # Log opportunity
        self.opportunities_log.append({
            'timestamp': opportunity.timestamp,
            'symbol': opportunity.symbol,
            'spread_pct': float(opportunity.spread_pct),
            'risk_reward': float(opportunity.risk_reward),
            'risk_amount': float(opportunity.risk_amount),
            'reward_amount': float(opportunity.reward_amount),
            'executed': True
        })

        # Save state
        self.save_config('/home/clawdbot/.openclaw/workspace/arbitrage/config.json')

        return True

    def close_position(self, symbol: str, profit: Decimal, is_win: bool):
        """
        Close a position and update state
        """
        self.state['open_positions'] -= 1

        if is_win:
            self.state['wins'] += 1
            self.state['total_profit'] += float(profit)
            self.state['current_capital'] += float(profit)

            # Update top stocks
            if symbol not in self.performance['top_stocks']:
                self.performance['top_stocks'][symbol] = 0.0
            self.performance['top_stocks'][symbol] += float(profit)
        else:
            self.state['losses'] += 1
            self.state['total_loss'] += float(profit)
            self.state['current_capital'] -= float(profit)

        logger.info(f"POSITION CLOSED: {symbol} - {'WIN' if is_win else 'LOSS'} ${profit:.4f}")
        logger.info(f"  Current capital: ${self.state['current_capital']:.2f}")
        logger.info(f"  Total profit/loss: ${self.state['total_profit']:.2f} / ${self.state['total_loss']:.2f}")
        logger.info(f"  Win rate: {self.get_win_rate():.1f}%")

        # Save state
        self.save_config('/home/clawdbot/.openclaw/workspace/arbitrage/config.json')

    def get_win_rate(self) -> float:
        """Calculate win rate"""
        total_trades = self.state['wins'] + self.state['losses']
        if total_trades == 0:
            return 0.0
        return (self.state['wins'] / total_trades) * 100

    def generate_daily_report(self) -> str:
        """Generate daily report in Indonesian"""
        total_trades = self.state['wins'] + self.state['losses']
        win_rate = self.get_win_rate()

        # Sort top stocks
        top_stocks_sorted = sorted(
            self.performance['top_stocks'].items(),
            key=lambda x: x[1],
            reverse=True
        )[:5]

        top_stocks_str = "\n".join([
            f"  • {symbol}: ${profit:.2f}"
            for symbol, profit in top_stocks_sorted
        ]) if top_stocks_sorted else "  • Belum ada data"

        report = f"""📊 LAPORAN HARIAN ARBITRASE SAHAM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔍 Peluang Arbitrase Ditemukan: {self.state['opportunities_found']}
💰 Modal Awal: $50.00
💵 Sisa Modal: ${self.state['current_capital']:.2f}
📈 Total Profit: ${self.state['total_profit']:.2f}
📉 Total Loss: ${self.state['total_loss']:.2f}
🔄 Trade Dieksekusi: {self.state['trades_executed']}
✅ Menang: {self.state['wins']}
❌ Kalah: {self.state['losses']}
📊 Win Rate: {win_rate:.1f}%

🏆 Top Saham (Profit Tertinggi):
{top_stocks_str}

⏰ Waktu: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Mode: CONSERVATIF (Data-Driven Analysis)
Risk-Reward Ratio Minimal: {self.config['risk_management']['min_risk_reward_ratio']}:1
Max Loss Per Trade: ${self.config['risk_management']['max_loss_per_trade']}
Stop Total Loss: ${self.config['risk_management']['max_loss_total']}
"""
        return report

    def run_monitoring_cycle(self):
        """Run one monitoring cycle"""
        logger.info("=== STARTING MONITORING CYCLE ===")

        # Scan for opportunities
        opportunities = self.scan_opportunities()

        if not opportunities:
            logger.info("Tidak ada peluang arbitrase yang ditemukan")
        else:
            logger.info(f"Total peluang: {len(opportunities)}")
            valid_opportunities = [op for op in opportunities if op.is_valid]
            logger.info(f"Peluang valid: {len(valid_opportunities)}")

            # Log top opportunities
            for i, op in enumerate(opportunities[:5]):
                logger.info(f"\n#{i+1} {op.symbol}:")
                logger.info(f"  Spread: {op.spread_pct:.2f}%")
                logger.info(f"  Risk-Reward: {op.risk_reward:.2f}")
                logger.info(f"  Risk: ${op.risk_amount:.4f}")
                logger.info(f"  Valid: {op.is_valid}")
                if not op.is_valid:
                    logger.info(f"  Reason: {op.reason}")

            # Execute best valid opportunity (conservative)
            if valid_opportunities and valid_opportunities[0].is_valid:
                self.execute_trade(valid_opportunities[0])

        logger.info("=== MONITORING CYCLE COMPLETE ===\n")

    def run_continuous(self, interval_seconds: int = 60):
        """Run continuous monitoring"""
        logger.info("Starting continuous monitoring...")

        try:
            while True:
                self.run_monitoring_cycle()
                time.sleep(interval_seconds)
        except KeyboardInterrupt:
            logger.info("Monitoring stopped by user")
        except Exception as e:
            logger.error(f"Error in continuous monitoring: {e}")
            raise


def main():
    """Main function"""
    monitor = ArbitrageMonitor('/home/clawdbot/.openclaw/workspace/arbitrage/config.json')

    # Generate and log daily report
    report = monitor.generate_daily_report()
    logger.info("\n" + report)

    # Save report to file
    with open('/home/clawdbot/.openclaw/workspace/arbitrage/daily_report.txt', 'w') as f:
        f.write(report)

    print(report)


if __name__ == '__main__':
    main()
