# Sistem Arbitrage Saham - $50 USD Capital

## 📋 Overview

Sistem monitoring arbitrage saham dengan modal $50 USD. Fokus pada price difference antar market, bukan prediksi random.

## 🎯 Tujuan

1. **Monitor Real-Time** perbedaan harga antar:
   - IDX (Indonesia) vs US Markets (NASDAQ, NYSE) → Beda kurs IDR/USD
   - IDX vs IDX (cross-check beda harga lokal antar broker)
   - Market global comparison untuk beda kurs

2. **Identifikasi Peluang VALID**:
   - High liquidity stocks: BBCA, UNVR, TLKM, GOTO, ADRO
   - Beda kurs IDR/USD > 1% fluctuation
   - Beda harga di beda broker untuk saham yang sama
   - Market inefficiencies saat open/close

3. **Conservative Execution**:
   - HANYA eksekusi jika math menguntungkan (minim 2:1 ratio)
   - Tolak jika risk > reward atau spread terlalu kecil

## 🔒 Risk Management Ketat

- **Max loss per trade**: 1% dari modal ($0.50)
- **Stop total jika hit 10% ($5)** → Proteksi modal
- **Stop-loss hard** → Jangan biarkan rugi terus
- **Max 2 posisi terbuka** untuk kontrol exposure

## 📁 Struktur File

```
arbitrage/
├── config.json           # Konfigurasi dan state
├── monitor.py           # Script monitoring utama
├── setup.sh             # Setup script
├── requirements.txt     # Python dependencies
├── README.md           # Documentation ini
├── monitor.log         # Log monitoring
└── daily_report.txt   # Laporan harian
```

## 🚀 Cara Install

```bash
cd /home/clawdbot/.openclaw/workspace/arbitrage
chmod +x setup.sh
./setup.sh
```

## 💻 Cara Pakai

### Generate Laporan Harian
```bash
python3 /home/clawdbot/.openclaw/workspace/arbitrage/monitor.py
```

Output akan tersimpan di `daily_report.txt` dan ditampilkan di terminal.

### Continuous Monitoring (Opsional)
Ubah script `monitor.py` untuk menjalankan mode continuous dengan:
```python
if __name__ == '__main__':
    monitor = ArbitrageMonitor('/home/clawdbot/.openclaw/workspace/arbitrage/config.json')
    monitor.run_continuous(interval_seconds=60)  # Check setiap 60 detik
```

### Schedule Laporan Harian (15:00 WIB / 8:00 UTC)

Tambahkan ke crontab:
```bash
# Edit crontab
crontab -e

# Tambahkan baris ini (15:00 WIB = 8:00 UTC)
0 8 * * * /usr/bin/python3 /home/clawdbot/.openclaw/workspace/arbitrage/monitor.py
```

## 📊 Format Laporan Harian

```
📊 LAPORAN HARIAN ARBITRASE SAHAM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔍 Peluang Arbitrase Ditemukan: X
💰 Modal Awal: $50.00
💵 Sisa Modal: $XX.XX
📈 Total Profit: $XX.XX
📉 Total Loss: $XX.XX
🔄 Trade Dieksekusi: X
✅ Menang: X
❌ Kalah: X
📊 Win Rate: XX.X%

🏆 Top Saham (Profit Tertinggi):
  • BBCA: $X.XX
  • UNVR: $X.XX

⏰ Waktu: YYYY-MM-DD HH:MM:SS UTC
```

## 🎲 Aturan Eksekusi

### DILARANG:
- ✗ Prediksi random atau gambling
- ✗ Trade tanpa validasi math
- ✗ Melanggar risk limits

### DIBOLEHKAN:
- ✓ Eksekusi jika spread > 0.5%
- ✓ Risk-reward ratio >= 2:1
- ✓ Risk amount <= $0.50 per trade
- ✓ Total loss < $5

## 📈 Metrics yang Dipantau

- **Peluang arbitrase**: Jumlah peluang yang ditemukan
- **Profit/Loss kumulatif**: Total P/L dari semua trade
- **Win rate**: Persentase win vs lose
- **Top stocks**: Saham dengan profit tertinggi
- **Sisa modal**: Capital yang tersedia

## ⚠️ Catatan Penting

1. **Mode DEMO**: Script ini menggunakan mock data. Untuk production, integrasikan dengan:
   - Real market APIs (Yahoo Finance, Alpha Vantage, dll)
   - Real broker APIs (Sekuritas Indonesia, Interactive Brokers, dll)
   - Real FX APIs (exchangerate-api.com, dll)

2. **Data-Driven**: Sistem hanya berdasarkan data harga, bukan prediksi atau sentimen.

3. **Conservative**: Lebih baik skip peluang daripada rugi. Capital protection > Profit chasing.

## 🛠️ Customization

Edit `config.json` untuk mengubah:
- Modal dan currency
- Thresholds (min spread, min risk-reward)
- Watchlist stocks
- Risk management parameters

## 📝 Bahasa

Semua output dan laporan dalam Bahasa Indonesia sesuai request.

---

*Created: 2026-02-24*
*Mode: CONSERVATIVE - DATA DRIVEN*
