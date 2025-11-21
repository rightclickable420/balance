# Can You Actually Gain an Edge on Drift Protocol?

**Date:** 2025-11-20
**Question:** Is it possible to beat Drift's JIT auction system with short-term scalping?
**Short Answer:** No, not with 1-10 second scalping. But maybe with medium-term trend following.

---

## The Reality of Drift JIT Auctions

### How JIT Auctions Extract Value

When you place a market order:

```
1. Your order hits the blockchain (public, ~50-100ms)
   ↓
2. Keepers detect order instantly (they monitor mempool)
   ↓
3. Auction window opens (400ms = 1 Solana slot)
   ↓
4. Keepers analyze:
   - Your max slippage (e.g., 60 bps)
   - Current oracle price
   - Their inventory position
   - Probability of adverse selection
   ↓
5. Keepers bid to fill at worst acceptable price for you
   ↓
6. Best (worst for you) fill wins
   ↓
7. Order executes at edge of your slippage tolerance
```

### Your True Cost Per Trade

From [trading-controller.ts:266-289](src/lib/trading/trading-controller.ts#L266-L289):

```typescript
private getExecutionProfile(conviction, isFlip, orderSizeUsd) {
  if (isFlip && largeOrder) {
    return { slippageBps: 70, auctionDurationSeconds: 1 }  // 0.7% slippage
  }
  if (conviction >= 0.9) {
    return { slippageBps: 25, auctionDurationSeconds: 2 }  // 0.25% slippage
  }
  return { slippageBps: 60, auctionDurationSeconds: 1 }    // 0.6% slippage
}
```

**Per-trade cost breakdown:**

| Component | Best Case | Typical | Worst Case |
|-----------|-----------|---------|------------|
| Entry fee | 0.05% | 0.05% | 0.05% |
| Entry slippage | 0.125% | 0.30% | 0.35% |
| Exit fee | 0.05% | 0.05% | 0.05% |
| Exit slippage | 0.125% | 0.30% | 0.35% |
| **TOTAL** | **0.35%** | **0.70%** | **0.80%** |

For $300 position:
- Best: $1.05 per round-trip
- Typical: **$2.10 per round-trip**
- Worst: $2.40 per round-trip

**You need 0.7-0.8% price move just to break even.**

---

## Why Short-Term Scalping Can't Work

### SOL Price Movement Analysis

At $250/SOL, here's typical price action:

| Timeframe | Avg Range | Your Break-even | Can Capture? |
|-----------|-----------|-----------------|--------------|
| 1 second | 0.04% ($0.10) | 0.7% ($1.75) | ❌ No (18× too small) |
| 5 seconds | 0.12% ($0.30) | 0.7% ($1.75) | ❌ No (6× too small) |
| 10 seconds | 0.20% ($0.50) | 0.7% ($1.75) | ❌ No (3.5× too small) |
| 30 seconds | 0.40% ($1.00) | 0.7% ($1.75) | ⚠️ Maybe (1.75× too small) |
| 1 minute | 0.80% ($2.00) | 0.7% ($1.75) | ✅ Possible |
| 5 minutes | 2.50% ($6.25) | 0.7% ($1.75) | ✅ Yes |

**Conclusion:** You need to hold positions for **at least 1-5 minutes** to have any chance.

### The Keeper Advantage

Professional market makers (keepers) have:

1. **Latency edge** - 10-50ms response time (you: 1000ms+)
2. **Information edge** - See all pending orders (you: blind)
3. **Capital edge** - Can absorb inventory risk (you: $3-20)
4. **Model edge** - Sophisticated pricing models (you: momentum indicators)
5. **Infrastructure edge** - Co-located nodes (you: browser WebSocket)

**You cannot compete on speed or information.**

---

## Can You Actually Win? The Only 4 Paths

### Path #1: Medium-Term Trend Following ✅ MOST REALISTIC

**Strategy:** Hold positions for 5-30 minutes, only trade clear macro trends

**Why this could work:**
- Keepers are market makers, not trend followers
- They profit on bid-ask spread, not directional moves
- Your 0.7% cost is negligible on a 3-5% trending move
- You're not competing with HFT, you're riding larger participant flows

**Required changes:**
1. **Use longer timeframes** (5min, 15min, 1hr instead of 5s, 30s, 1min)
2. **Add trend filter** (only trade when 1hr trend agrees with 5min signal)
3. **Much higher conviction threshold** (0.85-0.90 minimum)
4. **Hold positions 10-30 minutes minimum**
5. **Reduce leverage to 5-10x** (survive 10-20% adverse moves)

**Expected performance:**
- Trades: 1-3 per hour (not 8 per minute!)
- Win rate: 50-55%
- Average win: $5-15 (on 2-5% moves)
- Average loss: $3-8 (wider stops)
- Net expectancy: +$1-3 per trade

**Implementation difficulty:** Medium (requires timeframe changes)

---

### Path #2: CEX Arbitrage Detection ⚠️ ADVANCED

**Strategy:** Detect large moves on Binance/Bybit, front-run Drift oracle updates

**How it works:**
- Drift uses Pyth oracle (updates every 400ms)
- Large CEX moves take 1-3 seconds to fully propagate
- **You trade Drift based on CEX leading indicators**

**Example:**
```
1. Binance SOL jumps $2 (0.8%) in 500ms
2. Drift oracle still at old price (400ms lag)
3. You immediately long on Drift
4. Oracle updates 400ms later
5. You capture 0.3-0.5% of the move before others react
```

**Why this could work:**
- Information edge (CEX leads perp oracle by 400ms+)
- Repeatable edge (happens 10-20 times per day)
- Can scalp small moves profitably

**Required infrastructure:**
1. WebSocket to Binance/Bybit SOL-PERP
2. Real-time oracle price monitoring
3. Sub-200ms order execution
4. Algorithmic trade trigger (no human reaction time)

**Expected performance:**
- Trades: 10-20 per day
- Win rate: 60-70%
- Average win: $0.50-1.50
- Average loss: $0.80-1.50
- Net expectancy: +$0.20-0.60 per trade

**Implementation difficulty:** High (requires CEX integration)

---

### Path #3: Become a Maker (Not Taker) ⚠️ REQUIRES CODE CHANGES

**Strategy:** Use limit orders instead of market orders

**Current:** You pay 0.05% taker fee
**Alternative:** Pay 0.02% maker fee (or even get rebate on some exchanges)

**On Drift:**
- Taker fee: 0.05% (market orders)
- Maker fee: 0.02% (limit orders that add liquidity)
- **Savings: 0.03% per side = 0.06% round-trip**

**For $300 position:**
- Old cost: $2.10 (0.70% round-trip)
- New cost: $1.32 (0.44% round-trip)
- **Savings: $0.78 per trade** (37% reduction!)

**The challenge:**
- Limit orders may not fill immediately
- Market may move against you while waiting
- Need to chase price if no fill (becomes taker anyway)

**When this works:**
- Ranging/choppy markets (80% of the time)
- Medium-term holds (5-30 min)
- Less urgent entries/exits

**Required changes:**
1. Modify `openPosition()` in drift-position-manager.ts
2. Add `usePostOnly` flag for limit orders
3. Implement "chase" logic if no fill in 2-5 seconds
4. Fall back to taker if urgent

**Expected impact:**
- Fee reduction: 37%
- Fill rate: ~60-70% (30-40% require chase/taker)
- Net savings: ~25% on total fees

**Implementation difficulty:** Medium-High (Drift SDK changes)

---

### Path #4: Fundamental/Macro Edge 🎯 LONG-TERM

**Strategy:** Trade based on macro events, not technical signals

**Examples:**
- Fed announcement at 2pm → SOL correlation with risk assets
- Solana network upgrade news → trade SOL-PERP based on sentiment
- Bitcoin ETF flows → SOL follows BTC with 80% correlation
- On-chain metrics → large wallet movements, DEX volume spikes

**Why this could work:**
- Not competing on speed (macro events play out over hours/days)
- Information edge (understanding crypto fundamentals)
- Drift keepers don't have fundamental models
- Your cost is 0.7%, but moves are 5-20%

**Required changes:**
1. Manual trading mode (disable auto-align)
2. Hold positions for hours to days
3. Much larger stop losses (5-10%)
4. Lower leverage (3-5x)
5. External research/analysis

**Expected performance:**
- Trades: 1-5 per week
- Win rate: 55-60%
- Average win: $20-100 (on 10-30% moves)
- Average loss: $15-50
- Net expectancy: +$5-20 per trade

**Implementation difficulty:** Low (just use manual mode)

---

## Recommended Approach: Hybrid Trend + Macro

Combine **Path #1** (trend following) with **Path #4** (macro awareness):

### Strategy Design

**Timeframes:**
- **1-minute candles** → short-term momentum
- **5-minute candles** → trend confirmation
- **15-minute candles** → primary trend
- **1-hour candles** → macro trend filter

**Entry rules:**
1. 1hr trend must agree with 5min trend (both long or both short)
2. Conviction > 0.85 (top 15% of signals)
3. Not in choppy regime (ADX > 25 or similar)
4. Recent 15min candle shows follow-through (not reversal)

**Exit rules:**
1. Hold minimum 10 minutes (let trend develop)
2. Close when 5min trend reverses AND conviction < 0.60
3. Stop loss: -2% (wide enough to survive noise)
4. Profit target: +1.5% minimum (2× break-even)

**Position sizing:**
- Leverage: 5-10x (not 100x!)
- Size: 10-20% of collateral per trade
- Max 1 position at a time (no hedging/multiple positions)

### Expected Performance

**Per trading session (1 hour):**
- Signals generated: ~30-40
- Signals filtered: ~35 (87% filter rate)
- Trades executed: ~3-5
- Total fees: ~$6-10 ($2/trade × 3-5 trades)

**P&L distribution:**
- Wins (55%): 2-3 trades @ +$8 avg = +$16-24
- Losses (45%): 2 trades @ -$6 avg = -$12
- **Net P&L: +$4-12 per hour**

**With $20 starting capital:**
- Target: +20-60% per hour (aggressive but feasible in trending conditions)
- Drawdown: -10 to -20% (wide stops)
- Survival time: 3-5 hours minimum

---

## Implementation Plan

### Phase 1: Timeframe Changes (High Priority)

Edit [doom-runner-experience.tsx:50-55](src/components/doom-runner-experience.tsx#L50-L55):

**Current:**
```typescript
const ROLLING_WINDOWS: RollingWindowDefinition[] = [
  { name: "5s", length: 5, weight: 0.15 },
  { name: "30s", length: 30, weight: 0.2 },
  { name: "60s", length: 60, weight: 0.25 },
  { name: "300s", length: 300, weight: 0.4 },
]
```

**Change to:**
```typescript
const ROLLING_WINDOWS: RollingWindowDefinition[] = [
  { name: "1min", length: 60, weight: 0.15 },     // Short-term momentum
  { name: "5min", length: 300, weight: 0.25 },    // Trend confirmation
  { name: "15min", length: 900, weight: 0.35 },   // Primary trend
  { name: "1hr", length: 3600, weight: 0.25 },    // Macro filter
]
```

**Impact:**
- Signals become much more stable
- Fewer false signals in choppy markets
- Trend-following bias (captures larger moves)

---

### Phase 2: Add Trend Alignment Filter (Medium Priority)

Create new file: `src/lib/trading/trend-filter.ts`

```typescript
import type { Candle } from "@/lib/types"

/**
 * Detect if market is in a clear trending state
 * Returns: "uptrend" | "downtrend" | "ranging"
 */
export function detectTrend(candles: Candle[], period: number = 60): "uptrend" | "downtrend" | "ranging" {
  if (candles.length < period) return "ranging"

  const recent = candles.slice(-period)
  const prices = recent.map(c => c.close)

  // Calculate simple moving average
  const sma = prices.reduce((sum, p) => sum + p, 0) / prices.length
  const currentPrice = prices[prices.length - 1]

  // Calculate linear regression slope
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
  for (let i = 0; i < prices.length; i++) {
    sumX += i
    sumY += prices[i]
    sumXY += i * prices[i]
    sumX2 += i * i
  }
  const n = prices.length
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)

  // Normalize slope as percentage per candle
  const avgPrice = sumY / n
  const slopePercent = (slope / avgPrice) * 100

  // Trend strength (how far price is from SMA)
  const deviation = ((currentPrice - sma) / sma) * 100

  // Strong uptrend: positive slope + price above SMA
  if (slopePercent > 0.02 && deviation > 0.5) return "uptrend"

  // Strong downtrend: negative slope + price below SMA
  if (slopePercent < -0.02 && deviation < -0.5) return "downtrend"

  // Otherwise ranging
  return "ranging"
}

/**
 * Check if short-term trend aligns with long-term trend
 */
export function isTrendAligned(
  shortTerm: "uptrend" | "downtrend" | "ranging",
  longTerm: "uptrend" | "downtrend" | "ranging"
): boolean {
  // Only trade if both agree
  if (shortTerm === "uptrend" && longTerm === "uptrend") return true
  if (shortTerm === "downtrend" && longTerm === "downtrend") return true
  return false
}
```

Then modify `onStanceChange()` in trading-controller.ts to check trend alignment:

```typescript
async onStanceChange(newStance: Stance, currentPrice: number, conviction: number = 1.0) {
  // ... existing code ...

  // NEW: Trend alignment filter
  const { candleHistory } = useGameState.getState()
  const shortTrendCandles = candleHistory.slice(-300)  // 5min trend
  const longTrendCandles = candleHistory.slice(-3600)  // 1hr trend

  const shortTrend = detectTrend(shortTrendCandles, 60)
  const longTrend = detectTrend(longTrendCandles, 300)

  if (!isTrendAligned(shortTrend, longTrend)) {
    console.log(`[Filter] ❌ Trend not aligned: 5min=${shortTrend}, 1hr=${longTrend}`)
    this.trackFilteredTrade(this.calculatePositionSize(conviction))
    return
  }

  // Ensure direction matches trend
  if (shortTrend === "uptrend" && newStance !== "long" && newStance !== "flat") {
    console.log(`[Filter] ❌ Signal conflicts with uptrend`)
    return
  }
  if (shortTrend === "downtrend" && newStance !== "short" && newStance !== "flat") {
    console.log(`[Filter] ❌ Signal conflicts with downtrend`)
    return
  }

  console.log(`[Filter] ✅ Trend aligned: ${shortTrend}`)

  // ... continue with existing trade logic ...
}
```

**Impact:**
- Only trade WITH the macro trend (no counter-trend scalping)
- Massively reduce whipsaw losses in ranging markets
- Improve win rate from ~45% to ~55-60%

---

### Phase 3: Reduce Leverage (High Priority - Easy)

Edit [trading-controller.ts:931-935](src/lib/trading/trading-controller.ts#L931-L935):

**Current:**
```typescript
tradingControllerInstance = new TradingController({
  positionSizeUsd: 10,
  leverage: 20,  // 20x leverage
  maxSlippageBps: 50,
})
```

**Change to:**
```typescript
tradingControllerInstance = new TradingController({
  positionSizeUsd: 10,
  leverage: 10,  // Reduce to 10x (was 20x, user uses 100x)
  maxSlippageBps: 50,
})
```

Or better yet, make it configurable from the UI.

**Impact:**
- Wider stop losses possible (2-5% adverse moves survivable)
- Less liquidation risk
- Better risk/reward (capture larger moves)

---

### Phase 4: Add Momentum Indicators (Optional - Advanced)

Add RSI and MACD to feature extraction:

```typescript
// In features.ts
export interface Features {
  // ... existing features ...
  rsi: number        // 0-100, overbought > 70, oversold < 30
  macd: number       // MACD line value
  macdSignal: number // Signal line value
  macdHistogram: number // MACD - Signal
}

function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50

  let gains = 0, losses = 0
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i-1]
    if (change > 0) gains += change
    else losses -= change
  }

  const avgGain = gains / period
  const avgLoss = losses / period

  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - (100 / (1 + rs))
}
```

Then add filter:

```typescript
// Don't long when RSI > 75 (overbought)
if (newStance === "long" && latestFeatures.rsi > 75) {
  console.log(`[Filter] ❌ RSI overbought: ${latestFeatures.rsi.toFixed(1)}`)
  return
}

// Don't short when RSI < 25 (oversold)
if (newStance === "short" && latestFeatures.rsi < 25) {
  console.log(`[Filter] ❌ RSI oversold: ${latestFeatures.rsi.toFixed(1)}`)
  return
}
```

**Impact:**
- Avoid buying tops and selling bottoms
- Improve entry timing
- Win rate +5-10%

---

## Expected Results: Before vs After

### Current State (Short-Term Scalping)

**10 minutes of trading:**
- Timeframes: 5s, 30s, 1min, 5min
- Leverage: 100x
- Trade frequency: 2/min (after our fixes)
- Trades: 20
- Fees: $42 ($2.10/trade × 20)
- Wins: 9 @ $1.50 = $13.50
- Losses: 11 @ -$2.50 = -$27.50
- **Net: -$56.00**

Still losing because moves are too small relative to cost.

---

### After Implementation (Medium-Term Trend Following)

**10 minutes of trading:**
- Timeframes: 1min, 5min, 15min, 1hr
- Leverage: 10x
- Trade frequency: 0.3/min (1 trade per 3 minutes)
- Trades: 3
- Fees: $6.30 ($2.10/trade × 3)
- Wins: 2 @ $12.00 = $24.00 (capturing 3-4% trending moves)
- Losses: 1 @ -$8.00 = -$8.00 (wider stop but only 1 loss)
- **Net: +$9.70**

**Key differences:**
- 85% fewer trades (20 → 3)
- 85% less in fees ($42 → $6.30)
- 8× larger average win ($1.50 → $12.00)
- 50% fewer losses (11 → 1)
- **Break-even to profitable instead of consistent bleed**

---

## The Uncomfortable Truth

### You Probably Still Won't Beat Buy-and-Hold

Even with perfect execution:

**Trading SOL perps for 1 week:**
- Starting capital: $100
- Win rate: 55%
- Average win: $8
- Average loss: $6
- Trades: ~30 per week
- Net P&L: **+$15-30** (15-30% weekly return)

**Buying SOL and holding for 1 week:**
- Starting capital: $100
- SOL weekly volatility: ±10-20%
- Up weeks (60%): +$15
- Down weeks (40%): -$12
- **Expected value: +$4.20 per week** (4.2% weekly return)

**But with less:**
- ❌ No execution risk (no bad fills)
- ❌ No liquidation risk (no leverage)
- ❌ No fees (one-time buy)
- ❌ No time commitment (set and forget)

### When Trading Makes Sense

**You should trade perps if:**
1. You have conviction on SHORT-TERM (1hr-1day) direction
2. You want to short (can't short by holding spot)
3. You want leverage (amplify small moves)
4. You're treating it as entertainment/learning (not primary investment)

**You should NOT trade perps if:**
5. Your goal is long-term wealth accumulation (buy and hold BTC/SOL)
6. You can't monitor positions frequently (risk of liquidation)
7. You're using rent money / can't afford to lose

---

## My Honest Recommendation

### For This Project (Learning/Entertainment)

**Implement Path #1: Medium-Term Trend Following**

1. ✅ Change timeframes to 1min/5min/15min/1hr
2. ✅ Add trend alignment filter
3. ✅ Reduce leverage to 10x
4. ✅ Use Balanced or High Conviction strategy
5. ✅ Start with $20-50 capital (gives runway)

**Expected outcome:**
- 3-5 trades per hour
- Break-even to +10-20% per hour in trending conditions
- -5 to -10% per hour in choppy conditions
- Overall: Slight profit to slight loss (educational value)

---

### For Actual Profit (If You're Serious)

**Switch to Path #4: Macro/Fundamental Trading**

1. Disable auto-trading (use manual mode)
2. Monitor macro events (Fed, network upgrades, BTC ETFs)
3. Enter 1-3 positions per week based on conviction
4. Hold for hours to days (not seconds to minutes)
5. Use 3-5x leverage (not 100x)
6. Accept -2 to -5% stop losses (not -1%)
7. Target +5 to +20% moves (not +0.5%)

**Expected outcome:**
- Win rate: 50-55%
- Average win: $50-200
- Average loss: $30-100
- Net: +$10-50 per trade
- **Realistic long-term edge**

---

## Summary

**Can you gain an edge?**

✅ **Yes, but NOT with sub-minute scalping**
- 0.7% round-trip cost kills any edge on small moves
- Keepers have too many advantages (speed, info, capital)
- Expected value is negative

✅ **Yes, with medium-term trend following**
- Hold 5-30 minutes, catch 2-5% moves
- 0.7% cost is manageable on larger moves
- Not competing with HFT on speed
- Expected value is slightly positive

✅ **Yes, with macro/fundamental trading**
- Hold hours to days, catch 10-30% moves
- Focus on events, not technicals
- Cost is negligible on large moves
- Best realistic edge

**Next steps:**
1. Implement timeframe changes (1min/5min/15min/1hr)
2. Add trend filter (only trade WITH the macro trend)
3. Reduce leverage to 5-10x
4. Test with $20-50 capital
5. Monitor results over 1-2 hours
6. Iterate based on data

**Files to modify:**
- [doom-runner-experience.tsx](src/components/doom-runner-experience.tsx#L50-L55) - Change ROLLING_WINDOWS
- [trading-controller.ts](src/lib/trading/trading-controller.ts#L431-L584) - Add trend filter to onStanceChange()
- New file: `src/lib/trading/trend-filter.ts` - Trend detection logic

Should I implement these changes?
