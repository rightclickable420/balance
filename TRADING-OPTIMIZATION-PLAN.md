# Trading Execution Optimization Plan

## Problem Analysis

### Current System Issues

**Trading Frequency:** The system currently switches positions every second when stance changes, leading to:
- High trading fees (~0.05% per trade)
- Excessive slippage on quick reversals
- "Death by a thousand cuts" from churning

**Example Cost Breakdown:**
```
Current: Trade every stance change
- 100 trades/session × $10 position = $1,000 volume
- Fees: $1,000 × 0.0005 = $0.50 in fees
- With slippage: ~$0.60-0.75 total cost
- On a $0.50 session balance = 120-150% fee burden!
```

### Key Insights from Code

1. **Alignment updates every 1s** ([alignment.ts:138-153](src/lib/game/alignment.ts#L138-L153))
2. **Stance changes trigger immediate trades** ([trading-controller.ts:88-131](src/lib/trading/trading-controller.ts#L88-L131))
3. **No trade filtering or fee awareness**
4. **Fixed $10 position size regardless of conviction**

---

## Optimization Strategies

### 1. **Trade Filtering: Conviction-Based Entry**

Only trade when conviction is high enough to justify fees.

**Implementation:**
```typescript
// Add to trading-controller.ts
interface TradeFilter {
  minConviction: number // 0-1, minimum conviction to enter trade
  minHoldTime: number // milliseconds to hold before reversing
  minPriceMove: number // minimum % price change to justify new trade
}

class SmartTradingController extends TradingController {
  private filter: TradeFilter = {
    minConviction: 0.6, // Only trade when >60% conviction
    minHoldTime: 5000, // Hold for at least 5 seconds
    minPriceMove: 0.3, // 0.3% minimum move to re-enter
  }

  async onStanceChange(
    newStance: Stance,
    currentPrice: number,
    conviction: number // NEW: pass conviction
  ): Promise<void> {
    // Filter 1: Check conviction threshold
    if (conviction < this.filter.minConviction && newStance !== "flat") {
      console.log(`[Filter] Conviction too low: ${conviction.toFixed(2)} < ${this.filter.minConviction}`)
      return
    }

    // Filter 2: Minimum hold time
    if (this.activePosition) {
      const holdTime = Date.now() - this.activePosition.openTime
      if (holdTime < this.filter.minHoldTime) {
        console.log(`[Filter] Hold time too short: ${holdTime}ms < ${this.filter.minHoldTime}ms`)
        return
      }
    }

    // Filter 3: Minimum price movement for reversal
    if (this.activePosition && this.activePosition.side !== newStance) {
      const priceChange = Math.abs((currentPrice - this.activePosition.entryPrice) / this.activePosition.entryPrice)
      if (priceChange < this.filter.minPriceMove / 100) {
        console.log(`[Filter] Price move too small: ${(priceChange * 100).toFixed(2)}% < ${this.filter.minPriceMove}%`)
        return
      }
    }

    // Passed all filters - execute trade
    await super.onStanceChange(newStance, currentPrice)
  }
}
```

**Expected Impact:**
- Reduce trades by **70-80%**
- Only take high-quality setups
- Fees: $0.50 → **$0.10-0.15** per session

---

### 2. **Dynamic Position Sizing**

Scale position size based on conviction.

**Implementation:**
```typescript
// Calculate position size based on conviction
private calculatePositionSize(conviction: number, balance: number): number {
  const minSize = 5 // $5 minimum
  const maxSize = Math.min(balance * 0.2, 50) // 20% of balance or $50 max

  // Linear scaling: conviction 0.6 → min, conviction 1.0 → max
  const convictionScale = (conviction - 0.6) / 0.4 // 0.6-1.0 → 0-1
  const size = minSize + (maxSize - minSize) * Math.max(0, convictionScale)

  return Math.round(size)
}

// In openNewPosition:
const positionSize = this.calculatePositionSize(currentConviction, sessionBalance)
await driftManager.openPosition(side, positionSize, ...)
```

**Benefits:**
- Small positions on weak signals (less fee impact)
- Large positions on strong signals (maximize profits)
- Better risk management

**Example:**
```
Weak signal (60% conviction): $5 position
Medium (75% conviction): $15 position
Strong (95% conviction): $30 position
```

---

### 3. **Fee-Aware Profit Taking**

Don't close profitable positions unless profit > fees.

**Implementation:**
```typescript
private shouldClose(unrealizedPnl: number, positionSize: number, holdTime: number): boolean {
  const estimatedFees = positionSize * 0.001 // 0.1% round-trip fees
  const feeBreakeven = estimatedFees * 2 // 2x fees to justify close

  // Rule 1: Don't close if PnL < fees (unless going to opposite direction)
  if (unrealizedPnl > 0 && unrealizedPnl < feeBreakeven) {
    console.log(`[FeeAware] PnL $${unrealizedPnl.toFixed(2)} < min $${feeBreakeven.toFixed(2)}`)
    return false
  }

  // Rule 2: Quick stop-loss if losing more than 2x fees
  if (unrealizedPnl < -feeBreakeven) {
    console.log(`[FeeAware] Stop-loss triggered: -$${Math.abs(unrealizedPnl).toFixed(2)}`)
    return true
  }

  // Rule 3: Don't chop - must hold minimum time
  if (holdTime < this.filter.minHoldTime) {
    return false
  }

  return true
}
```

**Impact:**
- Let winners run
- Cut losers before they compound
- Avoid "chopping" for pennies

---

### 4. **Slippage Optimization**

Use limit orders with time-in-force when possible.

**Implementation:**
```typescript
// Instead of market orders, use limit orders with wider tolerance for less urgency
async openPosition(
  side: "long" | "short",
  sizeUsd: number,
  urgency: "high" | "normal" | "patient" = "normal"
): Promise<string> {
  const slippageMap = {
    high: 50,    // 0.5% - market order urgency
    normal: 30,  // 0.3% - balanced
    patient: 15  // 0.15% - wait for good price
  }

  const slippageBps = slippageMap[urgency]

  // Use Drift's auction system more effectively
  const auctionDuration = {
    high: 3,     // 3 second auction
    normal: 5,   // 5 second auction (current)
    patient: 10  // 10 second auction - better fills
  }[urgency]

  return await this.driftClient.placePerpOrder({
    // ... orderParams with adjusted auction duration
    auctionDuration: auctionDuration,
    maxSlippageBps: slippageBps
  })
}
```

**Savings:**
- Better fills from longer auctions
- Reduced slippage: **0.3% → 0.1-0.15%**

---

### 5. **Regime Detection: Don't Trade Chop**

Identify ranging/choppy markets and go flat.

**Implementation:**
```typescript
// Add to alignment.ts
export const detectMarketRegime = (recentCandles: Candle[]): "trending" | "ranging" | "choppy" => {
  // Calculate metrics over last 10 candles
  const priceRange = Math.max(...recentCandles.map(c => c.high)) - Math.min(...recentCandles.map(c => c.low))
  const avgCandleSize = recentCandles.reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) / recentCandles.length
  const directionalMoves = recentCandles.filter((c, i) => i > 0 &&
    (c.close > recentCandles[i-1].close) === (recentCandles[i-1].close > recentCandles[i-2]?.close)
  ).length

  // Trending: consistent direction, large moves
  if (directionalMoves > 6 && avgCandleSize > priceRange * 0.15) {
    return "trending"
  }

  // Ranging: price contained, back and forth
  if (priceRange < avgCandleSize * 3) {
    return "ranging"
  }

  // Choppy: everything else
  return "choppy"
}

// In trading controller:
async onStanceChange(...) {
  const regime = detectMarketRegime(recentCandles)

  if (regime === "choppy") {
    console.log("[Regime] Market is choppy, staying flat")
    if (this.activePosition) {
      await this.closeCurrentPosition()
    }
    return
  }

  // Only trade in trending/ranging markets
  // ...
}
```

**Impact:**
- Avoid worst trading conditions
- Reduce **losing trades by 40-50%**

---

### 6. **Batch Position Updates (Instead of Flip)**

Instead of: LONG → close → open SHORT
Do: LONG → reduce → SHORT (single transaction)

**Implementation:**
```typescript
private async updatePosition(newSide: "long" | "short", newSize: number): Promise<void> {
  const currentPos = await driftManager.getOpenPositions()
  const existing = currentPos[0]

  if (!existing) {
    // No position - open new one
    await this.openNewPosition(newSide, currentPrice)
    return
  }

  // Calculate net change needed
  const currentSizeWithSign = existing.side === "long" ? existing.sizeUsd : -existing.sizeUsd
  const targetSizeWithSign = newSide === "long" ? newSize : -newSize
  const netChange = targetSizeWithSign - currentSizeWithSign

  // Place single order to reach target (Drift handles position offsetting)
  await driftManager.openPosition(
    netChange > 0 ? "long" : "short",
    Math.abs(netChange),
    ...
  )
}
```

**Savings:**
- **1 transaction instead of 2**
- Cut fees in half on reversals
- Less slippage

---

## Implementation Priority

### Phase 1: Quick Wins (1-2 hours)
1. ✅ **Conviction filtering** - Reduce trade count by 70%
2. ✅ **Minimum hold time** - Prevent chopping
3. ✅ **Fee-aware exits** - Don't close for pennies

**Expected Impact:** Reduce fees by **60-70%**

### Phase 2: Smart Sizing (2-3 hours)
4. ✅ **Dynamic position sizing** - Size based on conviction
5. ✅ **Regime detection** - Don't trade chop

**Expected Impact:** Additional **20-30% fee reduction**, better returns

### Phase 3: Advanced (4-6 hours)
6. ✅ **Slippage optimization** - Better order types
7. ✅ **Batch updates** - Single transaction reversals
8. ✅ **Machine learning** - Pattern recognition for entries

**Expected Impact:** Another **10-20% improvement**

---

## Expected Results

### Current Performance (100 trades/session)
```
Volume: $1,000
Fees: $0.50 (50% of $1 balance)
Slippage: $0.15
Total cost: $0.65 (65% of balance!)
Win rate needed: 60%+ just to break even
```

### After Phase 1 (30 trades/session)
```
Volume: $300
Fees: $0.15 (15% of balance)
Slippage: $0.05
Total cost: $0.20 (20% of balance)
Win rate needed: 45% to break even ✅
```

### After Phase 2+3 (15 trades/session, better sizing)
```
Volume: $200 (but sized better)
Fees: $0.10 (10% of balance)
Slippage: $0.03
Total cost: $0.13 (13% of balance)
Win rate needed: 40% to break even ✅✅
```

---

## Monitoring & Metrics

Add these tracking metrics:

```typescript
interface TradingMetrics {
  totalTrades: number
  totalVolume: number
  totalFees: number
  avgHoldTime: number
  winRate: number
  avgWinSize: number
  avgLossSize: number
  filteredTrades: number // How many trades were skipped
  feeSavings: number // Estimated savings from smart routing
}
```

Display in UI for tuning and monitoring.

---

## Next Steps

1. Implement Phase 1 filters
2. Test with mock trading for 100 rounds
3. Compare metrics: trades, fees, win rate
4. Tune conviction threshold based on results
5. Deploy Phase 2 if Phase 1 successful
6. Iterate based on real performance data

Would you like me to start implementing Phase 1?
