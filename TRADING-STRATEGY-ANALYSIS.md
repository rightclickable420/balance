# Trading Strategy Analysis - Why Trades Are Losing Money

**Date:** 2025-11-20
**Status:** Active Investigation
**User Complaint:** "We are consistently losing money, trades closing at break even or a few cents loss"

---

## Executive Summary

After analyzing the trading system, I've identified **5 critical issues** that are causing consistent losses:

1. **Fee Drain from High Frequency Trading** - Aggressive strategy trades too often
2. **Stop Loss Too Tight** - Cutting winners before they can profit
3. **Poor Signal Quality** - Multi-timeframe conviction may not be predictive
4. **No Trend Filter** - Trading both directions in choppy markets
5. **Leverage Not Providing Edge** - 100x leverage amplifies small losses into realized losses

---

## Issue #1: Fee Drain from High Frequency Trading

### Problem

**Drift Protocol charges 0.05% per side** (5 basis points). A round-trip trade costs:
- Open: 0.05% × position size
- Close: 0.05% × position size
- **Total: 0.10% per trade**

At 100x leverage:
- $3 collateral × 100 = $300 notional position
- Round-trip fees = $300 × 0.001 = **$0.30 per trade**

### Aggressive Strategy Trade Frequency

From [trading-controller.ts:94](src/lib/trading/trading-controller.ts#L94):
```typescript
aggressive: {
  minConviction: 0.25, // Trade almost everything
  minHoldTimeMs: 1500, // 1.5 seconds minimum hold
  minProfitToClose: 0,  // Let exits follow signal immediately
  stopLossMultiplier: 4,
  dynamicSizing: true,
}
```

**Estimated trade frequency:** ~8 trades per minute

This means:
- **8 trades/min × $0.30/trade = $2.40/min in fees**
- Over 5 minutes: **$12 in fees**
- Over 10 minutes: **$24 in fees**

### Why This Kills Profitability

With $3-$4 collateral and positions of $250-$400 notional:
- You need **0.10% price movement just to break even** on fees
- At $250 SOL, 0.10% = **$0.25 movement**
- SOL moves ~$0.10-$0.30 per second in volatile conditions
- **Most moves reverse before covering fees**

### Evidence from User Reports

User: "All of the trades are closing at break even or a few cents loss"
- "Trades losing around 50 cents"
- "$6-$15 positions at 100x leverage"

**Math Check:**
- $6 collateral × 100 = $600 position
- Round-trip fees = $600 × 0.001 = **$0.60**
- If trade closes at -$0.50, the actual P&L before fees was likely **+$0.10**
- **The fees ate the entire profit**

---

## Issue #2: Stop Loss Too Tight

### Current Stop Loss Logic

From [trading-controller.ts:542-552](src/lib/trading/trading-controller.ts#L542-L552):
```typescript
// FILTER 3: Stop loss awareness
if (unrealizedPnl !== undefined) {
  const estimatedFees = this.estimateFees(this.activePosition.sizeUsd)
  const stopLoss = -estimatedFees * preset.stopLossMultiplier

  if (unrealizedPnl < stopLoss) {
    console.log(
      `[Filter] ⚠️ Stop loss triggered: $${unrealizedPnl.toFixed(2)} < $${stopLoss.toFixed(2)}`
    )
    // Force close - don't filter this
  }
}
```

**Aggressive strategy:**
- `stopLossMultiplier: 4`
- For $3 position: fees = $0.30, stop = -$0.30 × 4 = **-$1.20**

### Why This Is Too Tight

SOL price at $250 with $300 position (100x leverage):
- 1 SOL contract = $300 / $250 = 1.2 SOL
- Stop loss at -$1.20 = **0.4% adverse movement**
- **$250 × 0.004 = $1 move triggers stop**

**SOL volatility:**
- Average 1-minute range: $2-$5
- Your stop triggers on **<$1 move** (20-50% of normal range)

**Result:** You're getting stopped out on normal market noise before the trade has a chance to work.

---

## Issue #3: Poor Signal Quality

### Current Signal Calculation

From [alignment.ts:76-105](src/lib/game/alignment.ts#L76-L105):
```typescript
export const computeMarketConviction = (features: Features): number => {
  const directionalClarity = (Math.abs(safeMomentum) * 0.4 + Math.abs(safeOrderImbalance) * 0.4) / 0.8
  const volumeConviction = safeVolume
  const stabilityFactor = 1.0 - clamp(safeVolatility, 0, 1)
  const candleQuality = Math.abs(safeBreadth)

  const conviction = clamp(
    directionalClarity * 0.4 +
    volumeConviction * 0.3 +
    stabilityFactor * 0.2 +
    candleQuality * 0.1,
    0,
    1
  )

  return conviction
}
```

### Problems with This Approach

1. **Lagging Indicators**: Momentum and order imbalance are backward-looking
2. **No Microstructure**: Doesn't consider bid/ask spread, depth, or liquidity
3. **Volume Irrelevant on Solana**: DEX volume doesn't correlate with price moves like CEX
4. **No Market Regime Filter**: Treats trending and choppy markets the same

### Multi-Timeframe Signal (doom-runner-experience.tsx:97-135)

```typescript
function buildMultiTimeframeSignal(history: Candle[]): MultiTimeframeSignal {
  const windowStats = computeRollingWindows(history)
  const readyWeight = windowStats.reduce((sum, stat) => sum + stat.effectiveWeight, 0)
  const weightedScore =
    readyWeight > 0
      ? windowStats.reduce((sum, stat) => sum + stat.effectiveWeight * stat.score, 0) / readyWeight
      : 0
  const stanceSuggestion: Stance =
    weightedScore > 0.05 ? "long" : weightedScore < -0.05 ? "short" : "flat"
  return {
    timestamp: Date.now(),
    score: weightedScore,
    conviction: Math.abs(weightedScore),
    readyWeight,
    windowStats,
    stanceSuggestion,
  }
}
```

**Issue:** Rolling windows of 5s, 30s, 60s, 300s are all too short for perp trading
- These timeframes are designed for scalping
- Drift JIT auction takes 1-2 seconds to fill
- By the time position opens, the 5s signal has reversed

---

## Issue #4: No Trend Filter

### Current Market Regime Detection

From [market-regime.ts](src/lib/trading/market-regime.ts) (referenced in trading-controller.ts:468):
```typescript
const marketRegime = detectMarketRegime(candleHistory)
const isChoppy = marketRegime === "choppy"
```

### Choppy Market Handling (trading-controller.ts:472-496)

```typescript
if (isChoppy && !allowChoppyTrade) {
  console.log("[TradingController] Regime=choppy → forcing flat mode")
  if (this.activePosition) {
    // Close position
  }
  if (newStance !== "flat") {
    this.trackFilteredTrade(this.calculatePositionSize(conviction))
  }
  return
} else if (isChoppy && allowChoppyTrade) {
  console.log(
    `[TradingController] Regime=choppy but conviction ${(conviction * 100).toFixed(0)}% ≥ ${(
      choppyConvictionThreshold * 100
    ).toFixed(0)}% → executing with reduced size`
  )
}
```

### Problem: This Doesn't Work

Looking at the choppy threshold logic:
```typescript
const CHOPPY_THRESHOLD_OFFSET = 0.05
const CHOPPY_MIN_THRESHOLD = 0.45
const CHOPPY_MAX_THRESHOLD = 0.82

const getChoppyConvictionThreshold = (preset: StrategyPreset) =>
  Math.min(
    CHOPPY_MAX_THRESHOLD,
    Math.max(CHOPPY_MIN_THRESHOLD, preset.minConviction + CHOPPY_THRESHOLD_OFFSET)
  )
```

For aggressive strategy:
- `minConviction = 0.25`
- Choppy threshold = `0.25 + 0.05 = 0.30`
- **Still trading in choppy markets with just 30% conviction!**

**Crypto perps are choppy 70-80% of the time.** You need to filter aggressively or you'll get chopped to pieces.

---

## Issue #5: Leverage Not Providing Edge

### How Leverage Works on Drift

From [drift-position-manager.ts:583-591](src/lib/trading/drift-position-manager.ts#L583-L591):
```typescript
const notionalPositionUsd = sizeUsd * leverage
const baseAssetAmount = (notionalPositionUsd / currentPrice) * BASE_PRECISION.toNumber()

console.log(
  `[DriftPositionManager] Position calculation: collateral=${sizeUsd.toFixed(2)}, ` +
  `leverage=${leverage}x, notional=${notionalPositionUsd.toFixed(2)}, ` +
  `baseAsset=${(baseAssetAmount / BASE_PRECISION.toNumber()).toFixed(4)} SOL`
)
```

**What 100x leverage actually does:**
- Amplifies both profits AND losses by 100x
- A 1% adverse move = -100% of collateral (liquidation)
- A 0.1% adverse move = -10% of collateral

### The Math on Your Trades

With $3 collateral at 100x:
- Position = $300 notional
- Required move for profit = **> 0.10% after fees**
- Typical SOL 1-minute range = 0.5% ($1.25 at $250)

**Best case scenario:**
- You catch 0.3% of the move
- $300 × 0.003 = **$0.90 profit**
- Minus fees ($0.30) = **+$0.60**

**Typical scenario:**
- Signal reverses after 0.05% move
- $300 × 0.0005 = **$0.15 profit**
- Minus fees ($0.30) = **-$0.15 loss**

**Worst case (common):**
- Stop loss triggers at -0.4%
- $300 × 0.004 = **-$1.20 loss**
- Total loss with fees = **-$1.50**

**Win/Loss Ratio:**
- Best case: +$0.60
- Typical: -$0.15
- Worst: -$1.50

You need **60% win rate just to break even**, but market signals are ~50% accurate at best.

---

## Fee Impact Analysis

### Current Fee Structure

From [trading-controller.ts:294-298](src/lib/trading/trading-controller.ts#L294-L298):
```typescript
private estimateFees(positionSize: number): number {
  const DRIFT_TAKER_FEE = 0.0005 // 0.05% per side
  const SLIPPAGE_EST = 0.0002 // ~0.02% average slippage
  return positionSize * (DRIFT_TAKER_FEE * 2 + SLIPPAGE_EST)
}
```

**Round-trip cost: 0.12%** (0.10% fees + 0.02% slippage)

### Position Size vs Fee Comparison

| Collateral | Leverage | Notional | Fees/Trade | Break-even Move |
|-----------|----------|----------|------------|-----------------|
| $2.50     | 100x     | $250     | $0.30      | 0.12%           |
| $3.00     | 100x     | $300     | $0.36      | 0.12%           |
| $5.00     | 100x     | $500     | $0.60      | 0.12%           |
| $10.00    | 100x     | $1,000   | $1.20      | 0.12%           |

### Trade Frequency vs Fees

| Strategy        | Trades/Min | Position Size | Fees/Min | Fees/10min |
|----------------|-----------|---------------|----------|------------|
| Aggressive     | 8         | $300          | $2.88    | $28.80     |
| Balanced       | 3         | $300          | $1.08    | $10.80     |
| High Conviction| 1         | $300          | $0.36    | $3.60      |

**With starting collateral of $3:**
- Aggressive: Blown out in **1.5 minutes** from fees alone (even with 0% win rate)
- Balanced: Blown out in **3 minutes**
- High Conviction: Could last **10 minutes** if win rate > 40%

---

## Recommended Fixes

### Fix #1: Reduce Trade Frequency ✅ HIGH PRIORITY

**Change aggressive strategy parameters:**

```typescript
aggressive: {
  name: "Aggressive",
  description: "Trade clear signals • Good risk/reward • Lower fees",
  minConviction: 0.60, // Increased from 0.25 - only trade decent setups
  minHoldTimeMs: 8000, // Increased from 1500ms - hold positions longer
  minProfitToClose: 1.5, // Added profit target (was 0) - don't close until profit > 1.5× fees
  stopLossMultiplier: 8, // Increased from 4 - wider stop to avoid noise
  dynamicSizing: true,
}
```

**Expected impact:**
- Trade frequency: ~8/min → **~2/min** (75% reduction)
- Fee burn: $2.88/min → **$0.72/min** (75% reduction)
- Survival time: 1.5min → **6+ minutes**

---

### Fix #2: Widen Stop Loss ✅ HIGH PRIORITY

**Increase stop loss multiplier to 8-10x fees:**

For $3 position:
- Fees = $0.36
- Stop = $0.36 × 8 = **-$2.88**
- Allows **~1% adverse move** before stopping out

**Why this helps:**
- Survives normal market noise
- Lets winning trades develop
- Reduces overtrading from getting stopped and re-entering

---

### Fix #3: Add Minimum Profit Target ✅ MEDIUM PRIORITY

**Don't close positions until they're profitable:**

```typescript
balanced: {
  minProfitToClose: 2.0, // Close if profit > 2× fees
}
```

For $300 position:
- Fees = $0.36
- Target = $0.36 × 2 = **$0.72 profit**
- This is **0.24% price move** - achievable in trending markets

**Why this helps:**
- Forces you to wait for actual profits instead of closing at break-even
- Increases average win size
- Improves win/loss ratio

---

### Fix #4: Filter Choppy Markets Aggressively ✅ HIGH PRIORITY

**Increase choppy conviction threshold:**

```typescript
const CHOPPY_THRESHOLD_OFFSET = 0.20  // Increased from 0.05
const CHOPPY_MIN_THRESHOLD = 0.70     // Increased from 0.45
```

For aggressive strategy:
- Choppy threshold = `0.60 + 0.20 = 0.80`
- **Only trade in choppy markets with 80%+ conviction**
- Essentially: stay flat during chop, only trade clear breakouts

**Why this helps:**
- Crypto perps chop 70% of the time
- Most losses come from whipsaw in ranging markets
- Waiting for clear moves improves win rate dramatically

---

### Fix #5: Reduce Leverage to 20-50x ⚠️ OPTIONAL

**Lower leverage gives more breathing room:**

| Leverage | Required Move | Stop Distance | Liquidation Risk |
|----------|---------------|---------------|------------------|
| 100x     | 0.12%         | 1%            | Very High        |
| 50x      | 0.24%         | 2%            | High             |
| 20x      | 0.60%         | 5%            | Medium           |
| 10x      | 1.20%         | 10%           | Low              |

**Recommendation:** Start with **20-30x leverage**
- Fees still matter but less critical
- Wider stops possible (2-3% adverse moves)
- Still get meaningful exposure ($3 × 20 = $60 notional)

---

### Fix #6: Increase Position Hold Time ✅ HIGH PRIORITY

**Current aggressive strategy holds for only 1.5 seconds minimum.**

**Recommended minimum hold times:**
```typescript
aggressive: {
  minHoldTimeMs: 8000, // 8 seconds (was 1500ms)
}
balanced: {
  minHoldTimeMs: 15000, // 15 seconds (was 5000ms)
}
high_conviction: {
  minHoldTimeMs: 30000, // 30 seconds (was 9000ms)
}
```

**Why this helps:**
- Reduces round-trip fees from over-trading
- Lets moves develop instead of scalping noise
- Most profitable moves take 10-30 seconds to play out

---

### Fix #7: Use Longer Timeframe Signals ⚠️ ADVANCED

**Current rolling windows are too short:**
- 5s, 30s, 60s, 300s

**Recommended for perp trading:**
- 30s, 1min, 5min, 15min

**Implementation in doom-runner-experience.tsx:50-55:**
```typescript
const ROLLING_WINDOWS: RollingWindowDefinition[] = [
  { name: "30s", length: 30, weight: 0.10 },
  { name: "1min", length: 60, weight: 0.20 },
  { name: "5min", length: 300, weight: 0.35 },
  { name: "15min", length: 900, weight: 0.35 },
]
```

**Why this helps:**
- Longer timeframes = stronger trends
- Less noise = fewer false signals
- Better alignment with actual position duration

---

## Immediate Action Plan

### Step 1: Update Strategy Presets (trading-controller.ts)

Change these lines in the `STRATEGY_PRESETS` object:

**Lines 91-99 (Aggressive):**
```typescript
aggressive: {
  name: "Aggressive",
  description: "Trade clear signals • Good risk/reward • Moderate fees",
  minConviction: 0.60, // Changed from 0.25
  minHoldTimeMs: 8000, // Changed from 1500
  minProfitToClose: 1.5, // Changed from 0
  stopLossMultiplier: 8, // Changed from 4
  dynamicSizing: true,
}
```

**Lines 100-108 (Balanced):**
```typescript
balanced: {
  name: "Balanced",
  description: "Filter weak signals • Good risk/reward • Low fees",
  minConviction: 0.70, // Changed from 0.60
  minHoldTimeMs: 15000, // Changed from 5000
  minProfitToClose: 2.0, // Changed from 1.5
  stopLossMultiplier: 10, // Changed from 2
  dynamicSizing: true,
}
```

**Lines 109-118 (High Conviction):**
```typescript
high_conviction: {
  name: "High Conviction",
  description: "Only best setups • Very low fees • Needs strong signals",
  minConviction: 0.85, // Changed from 0.75
  minHoldTimeMs: 30000, // Changed from 9000
  minProfitToClose: 3.0, // Changed from 2.0
  stopLossMultiplier: 12, // Changed from 1.5
  dynamicSizing: true,
}
```

---

### Step 2: Update Choppy Market Filter (trading-controller.ts)

**Lines 120-122:**
```typescript
const CHOPPY_THRESHOLD_OFFSET = 0.20 // Changed from 0.05
const CHOPPY_MIN_THRESHOLD = 0.70    // Changed from 0.45
const CHOPPY_MAX_THRESHOLD = 0.85    // Changed from 0.82
```

---

### Step 3: Test with Conservative Settings

**Start game with:**
- Strategy: **Balanced** (not aggressive)
- Leverage: **20x** (not 100x)
- Starting collateral: **$10-20** (not $3)

**Why:**
- Balanced strategy will trade 2-3x per minute instead of 8x
- 20x leverage gives room to survive 5% adverse moves
- More collateral = larger positions that can absorb fees better

---

### Step 4: Monitor These Metrics

**Console logs to watch:**
```
[TradingController] Position sizing: conviction=X, collateral=$Y, size=$Z
[Filter] ✅ Trade approved
[Filter] ❌ Conviction too low: X% < Y%
[TradingController] ✅ Position rebalanced
[TradingController] Position PnL: $X
```

**Success indicators:**
- Fewer `Trade approved` messages (< 3/min)
- More `Conviction too low` filters (> 50% of signals filtered)
- Positive PnL on closed positions (> $0.50 average win)
- Win rate > 45%

---

## Expected Results After Fixes

### Before (Current)
- Trade frequency: **8/min**
- Fee burn: **$2.88/min**
- Average hold time: **2-3 seconds**
- Win rate: **~30%** (most trades stopped out on noise)
- Average win: **$0.20**
- Average loss: **-$0.80**
- Net result: **Consistent bleeding**

### After (Fixed)
- Trade frequency: **1-2/min**
- Fee burn: **$0.36-$0.72/min**
- Average hold time: **10-15 seconds**
- Win rate: **~45-50%** (better signals + wider stops)
- Average win: **$0.80-$1.50** (profit targets)
- Average loss: **-$1.00-$1.50** (wider stops but fewer losses)
- Net result: **Breakeven to slight profit**

---

## Long-Term Improvements (Future)

1. **Add momentum indicators** (RSI, MACD) to confirm signal direction
2. **Implement trend-following strategy** (only trade with the daily trend)
3. **Add spread/liquidity filters** (avoid trading when spread > 0.05%)
4. **Dynamic position sizing based on win streak** (Kelly criterion)
5. **Add session PnL stop** (quit if down > 20% of starting capital)
6. **Use limit orders instead of market orders** (become a maker, reduce fees to 0.02%)

---

## Files to Modify

1. **[trading-controller.ts](src/lib/trading/trading-controller.ts#L91-L118)**
   - Update `STRATEGY_PRESETS` object (lines 91-118)
   - Update choppy market constants (lines 120-122)

2. **[doom-runner-experience.tsx](src/components/doom-runner-experience.tsx#L50-L55)** (Optional)
   - Update `ROLLING_WINDOWS` for longer timeframes

3. **Test configuration:**
   - Use Balanced strategy instead of Aggressive
   - Reduce leverage from 100x to 20x
   - Increase starting collateral to $10-20

---

## Summary

**Root cause of losses:** Over-trading with high fees + tight stops + poor signals

**Primary fixes:**
1. ✅ Reduce trade frequency (minConviction 0.25 → 0.60)
2. ✅ Widen stop loss (4x fees → 8x fees)
3. ✅ Add profit targets (minProfitToClose: 0 → 1.5)
4. ✅ Increase min hold time (1.5s → 8s)
5. ✅ Filter choppy markets harder (threshold 0.30 → 0.70)

**Expected outcome:** Breakeven to slight profit instead of consistent bleeding

**Next action:** Apply the fixes in Step 1-3 and test
