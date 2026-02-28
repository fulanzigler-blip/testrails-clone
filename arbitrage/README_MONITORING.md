# Pasif Market Monitoring System

## 📋 Overview

Sistem monitoring pasar 24/7 untuk mendeteksi peluang arbitrase TANPA eksekusi trading otomatis.

**⚠️ PENTING: Ini HANYA MONITORING PASIF - Tidak ada eksekusi trade!**

## 🎯 Fitur

1. **Passive Monitoring** harga IDX, US Markets (NASDAQ, NYSE)
2. **Real-time Tracking** bid/ask, mid-price, spread
3. **Arbitrase Detection** ketika spread > biaya transaksi
4. **Free Money Detection** profit kecil tanpa risiko
5. **Real-time Reports** ketika peluang muncul
6. **Zero Trading** - JANGAN eksekusi BUY/SELL orders

**Risk: 0% (modal $50 AMAN)**

## 📁 File Structure

```
arbitrage/
├── monitor_passive.py          # Script monitoring utama (berjalan 24/7)
├── check_opportunities.py      # Script untuk cek & kirim laporan
├── config.json                 # Konfigurasi sistem
├── monitor_state.json          # State file (dibaca oleh check script)
├── last_check.json             # Tracking laporan terakhir
├── passive_monitor.log         # Log monitoring
├── REPORTING.md                # Panduan pelaporan
└── README_MONITORING.md        # File ini
```

## 🚀 Cara Kerja

### 1. Monitor Script (`monitor_passive.py`)

Berjalan secara terus-menerus di background:
- Cek harga setiap 5 menit
- Analisa peluang arbitrase
- Simpan state ke `monitor_state.json`
- Generate summary setiap 6 jam

### 2. Check Script (`check_opportunities.py`)

Dijalankan secara berkala oleh main agent:
- Baca `monitor_state.json`
- Deteksi peluang baru
- Format pesan dalam Bahasa Indonesia
- Return messages untuk dikirim ke Telegram

## 📊 Flow System

```
┌─────────────────────────────────────────────────────────────┐
│  monitor_passive.py (berjalan 24/7)                         │
│  - Cek harga setiap 5 menit                                  │
│  - Simpan opportunities ke monitor_state.json               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │  monitor_state.json    │
        │  - opportunities[]      │
        │  - startup_message     │
        │  - summary_message     │
        └────────────────────┬───┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  check_opportunities.py (dipanggil berkala)                │
│  - Baca monitor_state.json                                 │
│  - Deteksi peluang baru                                     │
│  - Format pesan Bahasa Indonesia                            │
│  - Return messages untuk Telegram                          │
└─────────────────────────────────────────────────────────────┘
```

## 🔄 Cara Menjalankan

### Start Monitor (Satu Kali)

```bash
cd /home/clawdbot/.openclaw/workspace/arbitrage
source venv/bin/activate
nohup python3 monitor_passive.py > monitor_stdout.log 2>&1 &
echo $! > /home/clawdbot/.openclaw/workspace/monitor.pid
```

### Check Opportunities (Periodik)

```bash
cd /home/clawdbot/.openclaw/workspace/arbitrage
source venv/bin/activate
python3 check_opportunities.py
```

### Stop Monitor

```bash
kill $(cat /home/clawdbot/.openclaw/workspace/monitor.pid)
```

### Cek Status

```bash
ps aux | grep monitor_passive
tail -f /home/clawdbot/.openclaw/workspace/arbitrage/passive_monitor.log
cat /home/clawdbot/.openclaw/workspace/arbitrage/monitor_state.json
```

## 📈 Contoh Laporan

### Peluang Arbitrase

```
🟢 PELUANG ARBITRASE DETECTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 BBCA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Market 1: IDX (IDR)
  • Harga: 7300.0000 (0.4599 USD)

Market 2: IDX (IDR)
  • Harga: 7310.0000 (0.4605 USD)

📈 Spread: 0.14%
💰 Profit Potensial: $0.0351
💸 Estimasi Fee: $5.0050
📊 Net Profit: -$4.9699

📌 Spread terdeteksi
⏰ Waktu: 2026-02-24T08:15:00.000000+00:00

⚠️  MONITORING ONLY - Tidak ada eksekusi otomatis
```

### Summary 6 Jam

```
📊 LAPORAN 6 JAM - MONITORING PASIF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏰ Periode: 2026-02-24 02:00 → 2026-02-24 08:00 UTC

📈 STATISTIK:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Total peluang terdeteksi: 12
• Peluang "free money": 3
• Spread tertinggi: 1.25%

🏆 TOP SAHAM (peluang terbanyak):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• BBCA: 5 peluang
• TLKM: 3 peluang
• GOTO: 2 peluang

⚠️  STATUS: MONITORING SAJA - 0% RISIKO
💰 Modal: $50.00 (aman, tidak dipakai)
📝 Tidak ada eksekusi trade otomatis

⏰ Waktu: 2026-02-24 08:00:00 UTC
```

## 🎯 Watchlist Stocks

Saat ini memonitor:
- **BBCA** (Bank Central Asia)
- **UNVR** (Unilever Indonesia)
- **TLKM** (Telkom Indonesia)
- **GOTO** (GoTo Gojek Tokopedia)
- **ADRO** (Adaro Energy Indonesia)

## ⚙️ Konfigurasi

Edit `config.json` untuk mengubah:
- Modal dan currency
- Watchlist stocks
- Thresholds (min spread, min risk-reward)
- Trading hours

```json
{
  "capital": 50.00,
  "currency": "USD",
  "stocks": {
    "idx_high_liquidity": ["BBCA", "UNVR", "TLKM", "GOTO", "ADRO"]
  },
  "thresholds": {
    "min_spread_pct": 0.5
  }
}
```

## ⚠️ Catatan Penting

1. **PASSIVE ONLY** - Sistem ini TIDAK akan mengeksekusi trade
2. **Data Source** - Menggunakan Yahoo Finance API (gratis)
3. **Laporan Real-time** - Pesan dikirim ketika peluang muncul
4. **Summary 6 Jam** - Laporan ringkas setiap 6 jam
5. **Bahasa Indonesia** - Semua laporan dalam Bahasa Indonesia

## 🐛 Troubleshooting

### Monitor tidak berjalan?

```bash
# Cek log
tail -50 /home/clawdbot/.openclaw/workspace/arbitrage/passive_monitor.log

# Cek process
ps aux | grep monitor_passive

# Restart jika perlu
kill $(cat /home/clawdbot/.openclaw/workspace/monitor.pid)
cd /home/clawdbot/.openclaw/workspace/arbitrage
source venv/bin/activate
nohup python3 monitor_passive.py > monitor_stdout.log 2>&1 &
echo $! > /home/clawdbot/.openclaw/workspace/monitor.pid
```

### State file tidak update?

```bash
# Cek monitor status
cat /home/clawdbot/.openclaw/workspace/arbitrage/monitor_state.json

# Jika status "stopped", restart monitor
```

## 📝 Log Files

- `passive_monitor.log` - Log monitoring
- `monitor_stdout.log` - Output standard monitor
- `monitor_state.json` - State file (dibaca oleh check script)
- `last_check.json` - Tracking laporan terakhir

---

**Created:** 2026-02-24
**Mode:** PASSIVE MONITORING ONLY - NO TRADING
**Risk:** 0% - Modal $100% Aman
