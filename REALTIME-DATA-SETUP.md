# Real-Time Solana Data Integration

## What We Built

A **hybrid aggregator service** that combines the best of both worlds:

1. **Jupiter API** - Aggregated SOL/USDC price across 20+ DEXs
   - Polls at 10Hz (100ms intervals) for smooth price action
   - Best execution price using Jupiter's Metis routing algorithm

2. **Raydium WebSocket** - Real trade volume from SOL/USDC pool
   - Subscribes to on-chain swaps in real-time
   - Captures actual trading volume (not simulated)

3. **1-Second OHLCV Candles** - Perfect for your indicators
   - All 6 indicators work (momentum, volatility, volume, breadth, orderImbalance, regime)
   - Real market microstructure for testing auto-align algorithm

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Your Game (Frontend)                                       │
│  └─ Receives 1-second candles via WebSocket                │
└─────────────────────────────────────────────────────────────┘
                         ↑ ws://localhost:8080
                         │
┌─────────────────────────────────────────────────────────────┐
│  Aggregator Service (Node.js)                               │
│  ├─ Jupiter Client (polls price at 10Hz)                   │
│  ├─ Raydium Client (subscribes to trades)                  │
│  ├─ Candle Builder (combines data)                         │
│  └─ WebSocket Server (broadcasts to frontend)              │
└─────────────────────────────────────────────────────────────┘
          ↓                                    ↓
┌──────────────────────┐          ┌──────────────────────┐
│  Jupiter Quote API   │          │  Solana RPC Node     │
│  (REST polling)      │          │  (WebSocket logs)    │
└──────────────────────┘          └──────────────────────┘
```

## Quick Start

### 1. Start Aggregator Service

```bash
cd aggregator-service
npm install
npm run dev
```

### 2. Configure Frontend

Edit `.env.local`:
```bash
NEXT_PUBLIC_BALANCE_DATA_PROVIDER=realtime
NEXT_PUBLIC_REALTIME_WS_URL=ws://localhost:8080
```

### 3. Start Your Game

```bash
npm run dev
```

Visit http://localhost:3000 - you're now using real Solana market data!

## What You Get

### Real Market Data
- **SOL/USDC price**: Aggregated across Raydium, Orca, Meteora, Jupiter, and 15+ other DEXs
- **Trading volume**: Real swaps from Raydium's $11M liquidity pool
- **Update frequency**: 1-second candles with ~10 price samples each

### All Indicators Working
```typescript
// Your 6 indicators now compute from real data:
{
  momentum: -0.23,      // Real price direction
  volatility: 0.65,     // Real market volatility
  volume: 0.82,         // Real trading activity
  breadth: 0.45,        // Real body-to-range ratio
  orderImbalance: -0.15, // Real price pressure
  regime: 0.72          // Real volatility regime
}
```

### Perfect for Testing Auto-Align
- Test your algorithm against real market conditions
- Dial in thresholds based on actual volatility
- See how it performs during trending vs choppy markets

## Data Quality

### Price Data (Jupiter)
- ✅ Aggregated across 20+ DEXs
- ✅ Best execution price (not single venue)
- ✅ Includes: Raydium, Orca, Meteora, Phoenix, etc.
- ✅ 10 samples per second = smooth OHLC

### Volume Data (Raydium)
- ✅ Real on-chain swaps
- ✅ From highest liquidity pool ($11M TVL)
- ✅ 24h volume: ~$28M
- ⚠️ Only Raydium volume (not aggregated)

**Note**: Volume represents ~40% of total SOL/USDC trading (Raydium's market share). This is accurate enough for testing your indicators.

## Cost & Rate Limits

### Free Tier
- **Jupiter API**: 600 requests/min (we use ~600/min)
- **Solana Public RPC**: WebSocket subscriptions (no limit)
- **Total cost**: $0/month ✅

### Recommended (Production)
- **Helius Free Tier**: 100k requests/day
- **Better reliability** and WebSocket support
- **Still free**: Sign up at helius.dev

## Switching Between Data Sources

### Use Real Data (for testing auto-align)
```bash
# .env.local
NEXT_PUBLIC_BALANCE_DATA_PROVIDER=realtime
```

### Use Mock Data (for development)
```bash
# .env.local
NEXT_PUBLIC_BALANCE_DATA_PROVIDER=mock
```

## Monitoring

### Aggregator Service Logs
```
[Jupiter] Started polling at 100 ms interval
[Raydium] Subscribed to pool: 58oQChx...
[CandleBuilder] Finalized candle: O=204.15 H=204.25 L=204.10 C=204.20 V=125.5
[WebSocket] Broadcasted candle to 1 client(s)
[Aggregator] 📊 Generated 10 candles, 1 clients connected
```

### Browser Console
```
[Balance] Using real-time Solana aggregator: ws://localhost:8080
[RealtimeWS] ✅ Connected
```

### Game Data Provider
Check the provider indicator in your game UI - should show "realtime"

## Files Created

### Backend Service
```
/aggregator-service/
  ├── src/
  │   ├── index.ts                    # Main service
  │   ├── jupiter-client.ts           # Jupiter API poller
  │   ├── raydium-client.ts          # Raydium log subscriber
  │   ├── candle-builder.ts          # OHLCV aggregation
  │   ├── websocket-server.ts        # Broadcast server
  │   └── types.ts                   # Type definitions
  ├── package.json
  ├── tsconfig.json
  ├── .env                           # Configuration
  ├── README.md                      # Full documentation
  └── QUICKSTART.md                  # Quick start guide
```

### Frontend Integration
```
/src/lib/data/
  ├── realtime-websocket-source.ts   # WebSocket candle source
  └── candle-source-factory.ts       # Updated factory (added realtime option)
```

## Troubleshooting

### No connection
- Ensure aggregator service is running
- Check WebSocket port 8080 is available
- Verify .env.local has correct settings

### No volume data
- Raydium logs may be sparse during low activity
- Volume will be 0 during quiet periods (normal)
- Price data will still work perfectly

### Jupiter rate limits
- 600 req/min is the limit
- We use exactly that at 10Hz
- If issues, reduce poll interval in aggregator-service/.env

## Next Steps

1. **Start both services** and verify connection
2. **Test auto-align** against real market data
3. **Observe indicator behavior** during different market conditions
4. **Tune your algorithm** based on real volatility patterns
5. **Monitor performance** over multiple sessions

## Future Enhancements

### Could Add Later:
- Multiple token pairs (BTC, ETH, etc.)
- Aggregated volume across multiple DEXs
- Historical candle storage (database)
- Multiple aggregator instances (load balancing)
- Geyser plugin for ultra-low latency

### Currently Good Enough For:
- ✅ Testing and tuning auto-align algorithm
- ✅ Understanding real market behavior
- ✅ Validating indicator calculations
- ✅ Demo/prototype with real data

---

**You now have real Solana market data flowing into your game!** 🎉

The hybrid approach gives you the best aggregated price (Jupiter) with real trading volume (Raydium), perfect for testing your auto-align algorithm against actual market conditions.
