# Quick Start Guide

## 1. Install Dependencies

```bash
cd aggregator-service
npm install
```

## 2. Start the Aggregator Service

```bash
npm run dev
```

You should see:
```
[Aggregator] Starting...
[Jupiter] Started polling at 100 ms interval
[Raydium] Subscribed to pool: 58oQChx4ywMVKDwLLZZbi4ChocC2FQCuWbkWMihLYQo2
[WebSocket] Server listening on port 8080
[Aggregator] ✅ Started successfully!
```

## 3. Configure Frontend to Use Real Data

Edit `/Users/ethangill/balance/.env.local`:

```bash
# Change from mock to realtime
NEXT_PUBLIC_BALANCE_DATA_PROVIDER=realtime
NEXT_PUBLIC_REALTIME_WS_URL=ws://localhost:8080
```

## 4. Start Your Game

```bash
# In the main balance directory
npm run dev
```

## 5. Test It!

Open http://localhost:3000 and you should see:
- Console log: `[Balance] Using real-time Solana aggregator: ws://localhost:8080`
- Console log: `[RealtimeWS] ✅ Connected`
- Your game now using real Solana market data!

## Verify It's Working

### In Aggregator Service Terminal:
```
[CandleBuilder] Finalized candle: O=204.15 H=204.25 L=204.10 C=204.20 V=125.50 (10 price ticks)
[WebSocket] Broadcasted candle to 1 client(s)
[Aggregator] 📊 Generated 10 candles, 1 clients connected
```

### In Browser Console:
```
[RealtimeWS] ✅ Connected
[RealtimeWS] Connected to aggregator service
```

### In Your Game:
- Stones should be forming based on real SOL/USDC price movement
- Auto-align algorithm is now testing against real market data!

## Troubleshooting

### "Connection failed"
- Make sure aggregator service is running (`npm run dev` in aggregator-service/)
- Check port 8080 is not in use

### "No candles available"
- Wait ~2 seconds for first candle
- Check aggregator service logs for errors
- Verify Jupiter API is reachable

### Rate limit errors
- Jupiter API has 600 req/min limit
- We use ~600/min at 10Hz (should be fine)
- If issues, reduce `JUPITER_POLL_INTERVAL_MS` in .env

## Next Steps

1. **Test Auto-Align**: Your algorithm now runs against real market data
2. **Monitor Indicators**: Watch how your 6 indicators behave with real price action
3. **Tune Parameters**: Adjust your auto-align thresholds based on real volatility

## Switching Back to Mock Data

```bash
# In .env.local
NEXT_PUBLIC_BALANCE_DATA_PROVIDER=mock
```

Then restart your frontend.
