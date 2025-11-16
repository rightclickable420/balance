# Balance Hybrid Aggregator Service

Real-time Solana DEX aggregator that combines Jupiter's aggregated pricing with Raydium's trade volume to generate 1-second OHLCV candles.

## Architecture

```
Jupiter API (price) ─┐
                     ├─> Candle Builder ─> WebSocket ─> Frontend
Raydium Logs (vol) ──┘
```

### Data Sources

1. **Jupiter Quote API** - Polls at 10Hz (100ms intervals)
   - Aggregated SOL/USDC price across 20+ DEXs
   - Best execution price using Jupiter's Metis routing

2. **Raydium WebSocket** - Real-time subscription
   - SOL/USDC pool address: `58oQChx4ywMVKDwLLZZbi4ChocC2FQCuWbkWMihLYQo2`
   - Captures actual trade volume from on-chain swaps

## Setup

### 1. Install Dependencies

```bash
cd aggregator-service
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` if you want to use a custom RPC endpoint (recommended for production):

```bash
# Get free RPC from Helius, QuickNode, or Alchemy
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_WS_URL=wss://api.mainnet-beta.solana.com
WS_PORT=8080
```

### 3. Run Development Server

```bash
npm run dev
```

The service will:
- ✅ Start polling Jupiter for prices
- ✅ Subscribe to Raydium for volume
- ✅ Generate 1-second candles
- ✅ Broadcast via WebSocket on `ws://localhost:8080`

## Usage

### Connect from Frontend

```typescript
const ws = new WebSocket('ws://localhost:8080')

ws.onmessage = (event) => {
  const message = JSON.parse(event.data)

  if (message.type === 'candle') {
    const candle = message.data
    console.log('New candle:', candle)
    // { timestamp, open, high, low, close, volume }
  }
}
```

### Production Build

```bash
npm run build
npm start
```

## Output Format

Each candle is a JSON object:

```json
{
  "type": "candle",
  "data": {
    "timestamp": 1704067200000,
    "open": 204.15,
    "high": 204.25,
    "low": 204.10,
    "close": 204.20,
    "volume": 125.5
  }
}
```

## Rate Limits

- **Jupiter API**: 600 requests/min (we use ~600/min at 10Hz)
- **Solana Public RPC**: 40 requests/10s (WebSocket subscriptions don't count)

**Recommendation**: Use a free RPC provider (Helius, QuickNode) for better reliability.

## Monitoring

The service logs:
- Connection status
- Candle generation (every 10 candles)
- Client connections/disconnections
- Errors and warnings

## Troubleshooting

### No volume data
- Check Raydium WebSocket connection
- Verify pool address is correct
- Try a different RPC endpoint with better WebSocket support

### Jupiter rate limits
- Reduce `JUPITER_POLL_INTERVAL_MS` in .env
- Use fewer than 10 polls per second

### No candles generated
- Ensure Jupiter is returning prices (check logs)
- Verify at least one price tick per second
- Check for errors in console

## Architecture Notes

### Why Hybrid?

1. **Jupiter**: Best aggregated price across all DEXs
   - But no volume data (quotes are simulated)

2. **Raydium**: Real trades with volume
   - But only one DEX (not aggregated price)

3. **Hybrid**: Best of both worlds
   - Jupiter price (aggregated) + Raydium volume (real)
   - More representative of true market conditions

### Candle Formation

- Polls Jupiter 10x per second (100ms intervals)
- Collects ~10 price samples per 1-second candle
- Open = first price, Close = last price
- High/Low = min/max across all samples
- Volume = accumulated from Raydium trades

This gives smooth price action with realistic volume.
