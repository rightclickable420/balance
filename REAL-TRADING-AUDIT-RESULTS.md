# Real Trading Audit Results

**Date:** 2025-11-19
**Auditor:** Claude Code
**Scope:** Real trading equity calculation and trade closure mechanisms

---

## Executive Summary

This audit examined the real trading implementation with focus on:
1. **Equity percentage display** (PnL as percentage of starting collateral)
2. **Trade closure mechanisms** at three critical points
3. **Rolling window candle system** implementation

### Critical Findings

✅ **PASS**: Trade closure mechanisms are implemented at all 3 required points
❌ **FAIL**: Equity percentage calculation is not implemented - showing raw equity instead
⚠️ **WARNING**: Trade closure has retry logic but lacks comprehensive error recovery

---

## Issue #1: Equity Percentage Not Displayed

### Current Behavior
The UI displays raw equity values instead of percentage change from starting collateral:
- Shows: `$105.50` (raw equity)
- Should show: `+5.5%` (percentage from $100 starting balance)

### Root Cause
**Location:** [src/components/game-ui.tsx:132](src/components/game-ui.tsx#L132)

```typescript
const totalPnl = gameMode === "real" ? equity - startingBalance : balance - startingBalance
```

This calculates the **absolute dollar PnL** but the UI never converts it to a percentage.

### Evidence in UI Code

**Desktop view** ([game-ui.tsx:563-580](src/components/game-ui.tsx#L563-L580)):
```typescript
<div className="flex flex-col">
  <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Balance</div>
  <div className="text-3xl font-black text-white tabular-nums tracking-tight leading-none mt-0.5">
    {formatBalanceDisplay(balance)}  // Shows: "$100.00"
  </div>
</div>
```

**Equity display** ([game-ui.tsx:572-579](src/components/game-ui.tsx#L572-L579)):
```typescript
<div className="flex flex-col">
  <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Equity</div>
  <div className={`text-3xl font-black tabular-nums tracking-tight leading-none mt-0.5 ${
    equity <= 0 ? 'text-rose-500 animate-pulse' :
    equity < balance * 0.2 ? 'text-rose-400' :
    equity < balance * 0.5 ? 'text-amber-400' :
    'text-white'
  }`}>
    {formatEquityDisplay(equity)}  // Shows: "$105.50" (should be "+5.5%")
  </div>
</div>
```

### Mobile View Issue
Same problem exists in mobile layout ([game-ui.tsx:376-393](src/components/game-ui.tsx#L376-L393)).

### Recommendation

**Add an equity percentage display component:**

```typescript
// Add after line 132
const equityPercent = startingBalance > 0
  ? ((equity - startingBalance) / startingBalance) * 100
  : 0

const formatEquityPercent = (percent: number) => {
  const sign = percent >= 0 ? '+' : ''
  return `${sign}${percent.toFixed(2)}%`
}
```

**Update the equity display to show percentage:**

```typescript
<div className="flex flex-col">
  <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Equity</div>
  <div className={`text-3xl font-black tabular-nums tracking-tight leading-none mt-0.5 ${
    equityPercent < -50 ? 'text-rose-500 animate-pulse' :
    equityPercent < -20 ? 'text-rose-400' :
    equityPercent < 0 ? 'text-amber-400' :
    'text-emerald-400'
  }`}>
    {formatEquityPercent(equityPercent)}
  </div>
  <div className="text-xs text-muted-foreground mt-0.5">
    {formatEquityDisplay(equity)}
  </div>
</div>
```

---

## Issue #2: Trade Closure Mechanisms Audit

### ✅ Closure Point 1: Stop Trading Button Press

**Location:** [src/components/game-ui.tsx:193-224](src/components/game-ui.tsx#L193-L224)

**Implementation Status:** ✅ **IMPLEMENTED**

```typescript
const toggleLiveTrading = async () => {
  if (gameMode !== "real" || isPauseActionPending) {
    return
  }
  setIsPauseActionPending(true)
  try {
    // ... resume logic ...

    await tradingController.pauseTrading()  // ✅ CLOSES POSITIONS
    setIsTradingPaused(true)
    setUserDisabledRealTrading(true)
  } catch (error) {
    console.error("[GameUI] Failed to toggle live trading:", error)
    toast.error("Could not update live execution. Check console for details.")
  } finally {
    setIsPauseActionPending(false)
  }
}
```

**Verification:** The `pauseTrading()` method ([trading-controller.ts:384-405](src/lib/trading/trading-controller.ts#L384-L405)):

```typescript
async pauseTrading(): Promise<void> {
  if (this.isPaused) {
    console.log("[TradingController] pauseTrading ignored (already paused)")
    return
  }

  this.isPaused = true
  console.log("[TradingController] Pausing live execution...")

  try {
    if (this.activePosition) {
      await this.closeCurrentPosition()  // ✅ CLOSES ACTIVE POSITION
    }
    await this.ensureAllPositionsClosed("pauseTrading")  // ✅ DOUBLE-CHECK
    toast.info("Live trading paused — standing flat")
  } catch (error) {
    this.isPaused = false
    console.error("[TradingController] Failed to pause trading:", error)
    toast.error("Failed to pause live trading. Check console for details.")
    throw error
  }
}
```

**Assessment:** ✅ **PASS** - Implements closure with error handling and double-check via `ensureAllPositionsClosed()`.

---

### ✅ Closure Point 2: Back to Setup Button Press

**Location:** [src/components/game-ui.tsx:267-291](src/components/game-ui.tsx#L267-L291)

**Implementation Status:** ✅ **IMPLEMENTED**

```typescript
const handleBackToSetup = async () => {
  if (gameMode !== "real") {
    const { reset } = useGameState.getState()
    reset()
    return
  }

  if (isStoppingReal) return

  setIsStoppingReal(true)
  try {
    await stopRealTradingRoutine()
    await tradingController.ensureAllPositionsClosed("back_to_setup")  // ✅ EXPLICIT CLOSURE

    const { reset } = useGameState.getState()
    reset()
  } catch (error) {
    console.error("[GameUI] Failed to stop real trading:", error)
    toast.error(
      "Failed to stop real trading safely. Check console logs and recover through the setup screen."
    )
  } finally {
    setIsStoppingReal(false)
  }
}
```

**Verification:** The `stopRealTradingRoutine()` ([game-ui.tsx:226-265](src/components/game-ui.tsx#L226-L265)):

```typescript
const stopRealTradingRoutine = async (options: { withdrawCollateral?: boolean } = {}) => {
  tradingController.disable()
  await tradingController.cleanup()  // ✅ CALLS CLEANUP WHICH CLOSES POSITIONS

  const driftManager = getDriftPositionManager()
  let latestSummary: PositionSummary | null = null
  if (driftManager.getIsInitialized()) {
    if (options.withdrawCollateral !== false) {
      try {
        await driftManager.withdrawCollateral(0)  // ✅ WITHDRAWAL REQUIRES FLAT
      } catch (error) {
        console.warn("[GameUI] Drift withdrawal failed during stop:", error)
        throw error
      }
    }
    // ... registry updates ...
    await driftManager.cleanup()
  }
  // ... balance updates ...
}
```

And `tradingController.cleanup()` ([trading-controller.ts:899-909](src/lib/trading/trading-controller.ts#L899-L909)):

```typescript
async cleanup(): Promise<void> {
  this.stopPnlUpdates()

  if (this.activePosition) {
    console.log("[TradingController] Cleanup: closing active position...")
    await this.forceClose()  // ✅ CLOSES POSITION
  }
  await this.ensureAllPositionsClosed("cleanup")  // ✅ DOUBLE-CHECK

  console.log("[TradingController] Cleanup complete")
}
```

**Assessment:** ✅ **PASS** - Multiple layers of closure:
1. `tradingController.cleanup()` closes active positions
2. `ensureAllPositionsClosed("back_to_setup")` double-checks
3. Drift withdrawal requires flat position (enforced at [drift-position-manager.ts:650-656](src/lib/trading/drift-position-manager.ts#L650-L656))

---

### ✅ Closure Point 3: Drift Balance Check / Withdrawal

**Location:** [src/components/game-setup-screen.tsx:198-253](src/components/game-setup-screen.tsx#L198-L253)

**Implementation Status:** ✅ **IMPLEMENTED**

#### 3a. Check Drift Balance

```typescript
const handleCheckDriftBalance = useCallback(
  async ({ silent = false, ensureFlat = true }: { silent?: boolean; ensureFlat?: boolean } = {}) => {
    // ... keypair checks ...

    try {
      setIsCheckingDrift(true)
      const driftManager = getDriftPositionManager()
      await driftManager.initialize(keypair, { skipDeposit: true })
      let summary = await driftManager.getPositionSummary()

      if (ensureFlat && summary.positions.length > 0) {  // ✅ CLOSES OPEN POSITIONS
        for (const position of summary.positions) {
          try {
            await driftManager.closePosition(position.marketIndex, 100)  // ✅ CLOSE 100%
          } catch (closeError) {
            console.warn("[Setup] Failed to close position during recovery:", closeError)
          }
        }
        summary = await driftManager.getPositionSummary()
      }
      // ... balance updates ...
    } catch (error) {
      console.error("[Setup] Failed to fetch Drift balance:", error)
    }
  },
  [sessionWalletAddress, refreshSessionRegistry]
)
```

**Assessment:** ✅ **PASS** - Closes all positions when `ensureFlat=true` (default).

#### 3b. Withdraw Drift Funds

**Location:** [src/components/game-setup-screen.tsx:255-305](src/components/game-setup-screen.tsx#L255-L305)

```typescript
const handleWithdrawDriftFunds = useCallback(async () => {
  // ... keypair checks ...

  try {
    setIsWithdrawingDrift(true)
    const controller = getTradingController()
    await controller.ensureAllPositionsClosed("setup_withdraw_request")  // ✅ EXPLICIT CLOSURE

    const driftManager = getDriftPositionManager()
    await driftManager.initialize(keypair, { skipDeposit: true })

    const hasPositions = await driftManager.hasOpenPositions()
    if (hasPositions) {
      alert("Close all Drift positions before withdrawing.")  // ✅ ENFORCES FLAT
      await driftManager.cleanup()
      return
    }

    // ... withdrawal logic ...
  } catch (error) {
    console.error("[Setup] Failed to withdraw from Drift:", error)
  }
}, [sessionWalletAddress, refreshSessionRegistry])
```

**Assessment:** ✅ **PASS** - Three layers of protection:
1. `ensureAllPositionsClosed("setup_withdraw_request")` before initialization
2. `hasOpenPositions()` check blocks withdrawal if positions exist
3. `withdrawCollateral()` at [drift-position-manager.ts:642-701](src/lib/trading/drift-position-manager.ts#L642-L701) enforces flat state

**Drift Manager Withdrawal Enforcement:**

```typescript
async withdrawCollateral(amountSol: number = 0): Promise<string> {
  // ... initialization checks ...

  const openPositions = await this.getOpenPositions()
  if (openPositions.length > 0) {
    throw new Error(
      `Cannot withdraw with ${openPositions.length} open position(s). Close all positions first.`
    )  // ✅ ENFORCES CLOSURE
  }

  // ... withdrawal logic ...
}
```

---

## Issue #3: Money Left Behind on Drift

### Problem Analysis

You mentioned "money is being left behind on drift perhaps in a trade that didn't close properly."

### Current Safeguards

The codebase has **multiple attempts** to close positions:

#### Attempt 1: `closePosition()` with Retry Logic

**Location:** [drift-position-manager.ts:605-624](src/lib/trading/drift-position-manager.ts#L605-L624)

```typescript
console.log("[DriftPositionManager] Placing close order with JIT auction...")
let txSig: string
try {
  txSig = await this.driftClient.placePerpOrder(orderParams)
} catch (orderError) {
  if (isInvalidAuctionError(orderError)) {  // ✅ RETRY ON AUCTION ERROR
    console.warn(
      "[DriftPositionManager] Auction bounds invalid when closing. Retrying with static price..."
    )
    const fallbackPriceBn = new BN(Math.floor(currentPrice * pricePrecision))
    txSig = await this.driftClient.placePerpOrder({
      ...orderParams,
      auctionStartPrice: fallbackPriceBn,
      auctionEndPrice: fallbackPriceBn,
      auctionDuration: 1,
      price: fallbackPriceBn,
    })
  } else {
    throw orderError
  }
}
```

**Assessment:** ✅ Retries with fallback pricing on auction errors.

#### Attempt 2: `ensureAllPositionsClosed()` Triple-Close Strategy

**Location:** [trading-controller.ts:274-304](src/lib/trading/trading-controller.ts#L274-L304)

```typescript
async ensureAllPositionsClosed(context: string = "unspecified"): Promise<void> {
  try {
    const sessionWallet = getSessionWallet()
    const keypair = sessionWallet.getKeypair()
    if (!keypair) {
      console.warn("[TradingController] ensureAllPositionsClosed skipped (no session wallet)")
      return
    }
    const driftManager = getDriftPositionManager()
    await driftManager.initialize(keypair, { skipDeposit: true })
    const openPositions = await driftManager.getOpenPositions()
    if (openPositions.length === 0) {
      await driftManager.cleanup()
      return
    }
    console.log(
      `[TradingController] ${context}: Closing ${openPositions.length} remaining Drift position(s)`
    )
    for (const position of openPositions) {
      await driftManager.closePosition(position.marketIndex, 100)  // ✅ CLOSES EACH POSITION
    }
    this.activePosition = null
    useGameState.setState({
      openPositionSize: 0,
      driftPositionSide: "flat",
    })
    await driftManager.cleanup()
  } catch (error) {
    console.error("[TradingController] Failed to ensure all positions closed:", error)
  }
}
```

**Assessment:** ✅ Iterates through all open positions and closes them individually.

#### Attempt 3: Auto-Close on Setup Screen Mount

**Location:** [game-setup-screen.tsx:98-103](src/components/game-setup-screen.tsx#L98-L103)

```typescript
useEffect(() => {
  const controller = getTradingController()
  controller.ensureAllPositionsClosed("setup_screen_mount").catch((error) => {
    console.warn("[Setup] Failed to auto-close Drift positions:", error)
  })
}, [])
```

**Assessment:** ✅ Automatically closes positions when navigating to setup screen.

### Identified Weaknesses

#### ⚠️ Silent Failure in `ensureAllPositionsClosed()`

**Location:** [trading-controller.ts:302](src/lib/trading/trading-controller.ts#L302)

```typescript
} catch (error) {
  console.error("[TradingController] Failed to ensure all positions closed:", error)
}
```

**Problem:** Errors are logged but **not surfaced to the user**. If a position fails to close, the user won't know.

**Impact:**
- User thinks positions are closed
- Position remains open on Drift
- Money accumulates unrealized PnL
- User can't withdraw (withdrawal requires flat)

#### ⚠️ No Retry Logic in `ensureAllPositionsClosed()`

The method tries to close each position once, but doesn't retry if individual closes fail. Compare to `closePosition()` which has retry logic for auction errors.

#### ⚠️ Withdrawal Can Fail Silently

**Location:** [game-ui.tsx:233-239](src/components/game-ui.tsx#L233-L239)

```typescript
if (options.withdrawCollateral !== false) {
  try {
    await driftManager.withdrawCollateral(0)
  } catch (error) {
    console.warn("[GameUI] Drift withdrawal failed during stop:", error)
    throw error  // ✅ DOES re-throw, but...
  }
}
```

This **does** re-throw, but the caller in `handleBackToSetup` only shows a generic error toast. The user doesn't know **why** the withdrawal failed (likely open positions).

---

## Issue #4: Rolling Window Candle System

### Implementation Review

**Location:** [src/lib/trading/market-regime.ts](src/lib/trading/market-regime.ts)

The rolling window system uses:
- **Minimum window:** 10 candles
- **Dynamic window:** `Math.max(MIN_CANDLES, Math.floor(candles.length / 2))`
- **Analysis:** Directional strength, body-to-range ratio, noise ratio

```typescript
export function detectMarketRegime(candles: Candle[]): MarketRegime {
  if (candles.length < MIN_CANDLES) {
    return "trending"
  }

  const recent = candles.slice(-Math.max(MIN_CANDLES, Math.floor(candles.length / 2)))
  const highs = recent.map((c) => c.high)
  const lows = recent.map((c) => c.low)
  const priceRange = Math.max(...highs) - Math.min(...lows)
  const avgBody =
    recent.reduce((sum, candle) => sum + Math.abs(candle.close - candle.open), 0) / recent.length

  const avgRange =
    recent.reduce((sum, candle) => sum + (candle.high - candle.low), 0) / recent.length

  const directionalMoves = calculateDirectionalMoves(recent)
  const directionalStrength = directionalMoves / recent.length
  const bodyToRangeRatio = priceRange === 0 ? 0 : avgBody / priceRange
  const noiseRatio = avgRange === 0 ? 0 : avgBody / avgRange

  if (directionalStrength >= 0.6 && bodyToRangeRatio >= 0.15) {
    return "trending"
  }

  if (priceRange <= avgBody * 3 || noiseRatio < 0.25) {
    return "ranging"
  }

  return "choppy"
}
```

**Assessment:** ✅ **WELL-DESIGNED**

The system correctly:
- Uses a rolling window that grows with available data (up to 50% of total history)
- Calculates multiple regime indicators (directional strength, volatility, noise)
- Classifies markets into 3 regimes that affect trading strategy

**Integration with Trading Controller:**

**Location:** [trading-controller.ts:462-491](src/lib/trading/trading-controller.ts#L462-L491)

```typescript
const { candleHistory } = useGameState.getState()
const marketRegime = detectMarketRegime(candleHistory)
const isChoppy = marketRegime === "choppy"
const allowChoppyTrade = isChoppy && conviction >= choppyConvictionThreshold

if (isChoppy && !allowChoppyTrade) {
  console.log("[TradingController] Regime=choppy → forcing flat mode")
  if (this.activePosition) {
    this.isProcessing = true
    try {
      await this.closeCurrentPosition()
      this.lastStance = "flat"
    } catch (error) {
      console.error("[TradingController] Failed to flatten during choppy regime:", error)
    } finally {
      this.isProcessing = false
    }
  }

  if (newStance !== "flat") {
    this.trackFilteredTrade(this.calculatePositionSize(conviction))
  }
  return
}
```

**Assessment:** ✅ Correctly integrates regime detection to avoid trading in choppy markets (unless conviction is very high).

---

## Recommendations

### Priority 1: Fix Equity Percentage Display

**File:** `src/components/game-ui.tsx`

Add equity percentage calculation and update all equity displays (desktop + mobile).

**Implementation:**
```typescript
// Line 132 - Add equity percentage calculation
const equityPercent = startingBalance > 0
  ? ((equity - startingBalance) / startingBalance) * 100
  : 0

const formatEquityPercent = (percent: number) => {
  const sign = percent >= 0 ? '+' : ''
  return `${sign}${percent.toFixed(2)}%`
}

// Update equity color based on percentage, not absolute value
const getEquityColor = (percent: number) => {
  if (percent < -50) return 'text-rose-500 animate-pulse'
  if (percent < -20) return 'text-rose-400'
  if (percent < 0) return 'text-amber-400'
  if (percent > 10) return 'text-emerald-400'
  return 'text-white'
}
```

### Priority 2: Surface Position Closure Failures to User

**File:** `src/lib/trading/trading-controller.ts`

**Change `ensureAllPositionsClosed()` to track failures:**

```typescript
async ensureAllPositionsClosed(context: string = "unspecified"): Promise<{
  success: boolean
  closedCount: number
  failedCount: number
  errors: string[]
}> {
  const errors: string[] = []
  let closedCount = 0
  let failedCount = 0

  try {
    const sessionWallet = getSessionWallet()
    const keypair = sessionWallet.getKeypair()
    if (!keypair) {
      console.warn("[TradingController] ensureAllPositionsClosed skipped (no session wallet)")
      return { success: true, closedCount: 0, failedCount: 0, errors: [] }
    }

    const driftManager = getDriftPositionManager()
    await driftManager.initialize(keypair, { skipDeposit: true })
    const openPositions = await driftManager.getOpenPositions()

    if (openPositions.length === 0) {
      await driftManager.cleanup()
      return { success: true, closedCount: 0, failedCount: 0, errors: [] }
    }

    console.log(
      `[TradingController] ${context}: Closing ${openPositions.length} remaining Drift position(s)`
    )

    for (const position of openPositions) {
      try {
        await driftManager.closePosition(position.marketIndex, 100)
        closedCount++
      } catch (closeError) {
        failedCount++
        const errorMsg = closeError instanceof Error ? closeError.message : 'Unknown error'
        errors.push(`Market ${position.marketSymbol}: ${errorMsg}`)
        console.error(`[TradingController] Failed to close position ${position.marketSymbol}:`, closeError)
      }
    }

    this.activePosition = null
    useGameState.setState({
      openPositionSize: 0,
      driftPositionSide: "flat",
    })
    await driftManager.cleanup()

    return {
      success: failedCount === 0,
      closedCount,
      failedCount,
      errors
    }
  } catch (error) {
    console.error("[TradingController] Failed to ensure all positions closed:", error)
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      closedCount,
      failedCount: failedCount + 1,
      errors: [...errors, errorMsg]
    }
  }
}
```

**Update callers to check results:**

```typescript
// In game-ui.tsx - handleBackToSetup
const result = await tradingController.ensureAllPositionsClosed("back_to_setup")
if (!result.success) {
  toast.error(
    `Failed to close ${result.failedCount} position(s). Check Drift directly:\n` +
    result.errors.join('\n')
  )
  // Don't proceed with reset
  throw new Error('Position closure failed')
}
```

### Priority 3: Add Retry Logic to Position Closure

**File:** `src/lib/trading/trading-controller.ts`

Implement retry for failed position closes (similar to drift-position-manager's retry on auction errors):

```typescript
private async closePositionWithRetry(
  driftManager: DriftPositionManager,
  marketIndex: number,
  maxRetries: number = 3
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await driftManager.closePosition(marketIndex, 100)
      return
    } catch (error) {
      if (attempt === maxRetries) {
        throw error
      }
      console.warn(
        `[TradingController] Position close attempt ${attempt}/${maxRetries} failed, retrying...`
      )
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt)) // Exponential backoff
    }
  }
}
```

### Priority 4: Add Position Monitor Recovery

Add a background monitor that checks for orphaned positions:

```typescript
// In trading-controller.ts
private async monitorOrphanedPositions(): Promise<void> {
  if (!this.config.enabled) return

  try {
    const driftManager = getDriftPositionManager()
    if (!driftManager.getIsInitialized()) return

    const positions = await driftManager.getOpenPositions()

    // Check if we have positions we don't know about
    if (positions.length > 0 && !this.activePosition && this.isPaused) {
      console.warn(
        `[TradingController] Detected ${positions.length} orphaned position(s)!`
      )
      toast.warning(
        `Found ${positions.length} orphaned position(s). Attempting to close...`
      )

      for (const position of positions) {
        try {
          await driftManager.closePosition(position.marketIndex, 100)
          toast.success(`Closed orphaned ${position.marketSymbol} position`)
        } catch (error) {
          console.error('[TradingController] Failed to close orphaned position:', error)
          toast.error(
            `Failed to close orphaned ${position.marketSymbol}. ` +
            `Close manually via Drift UI.`
          )
        }
      }
    }
  } catch (error) {
    console.error('[TradingController] Failed to monitor orphaned positions:', error)
  }
}
```

Call this in the PnL update interval to check every second.

---

## Testing Checklist

Before deploying fixes, test these scenarios:

### Equity Percentage Display Tests
- [ ] Start with $100, gain $10 → shows "+10.00%"
- [ ] Start with $100, lose $20 → shows "-20.00%" (red)
- [ ] Start with $100, break even → shows "+0.00%"
- [ ] Mobile view shows same percentages as desktop

### Trade Closure Tests
- [ ] Press "Stop Trading" → all positions close, confirmed on Drift UI
- [ ] Press "Back to Setup" → all positions close, withdrawal succeeds
- [ ] Check Drift balance → positions close before showing balance
- [ ] Withdraw from Drift → positions close before withdrawal

### Error Recovery Tests
- [ ] Simulate network error during position close → retry succeeds
- [ ] Simulate Drift API error → user sees clear error message
- [ ] Leave orphaned position → monitor detects and closes it
- [ ] Try to withdraw with open position → clear error message

### Edge Cases
- [ ] Multiple positions across different markets → all close
- [ ] Position partially filled during close → handles gracefully
- [ ] User navigates away mid-close → cleanup completes
- [ ] Session expires during close → recoverable state

---

## Conclusion

**Current State:**
- ✅ Trade closure mechanisms are implemented at all required points
- ✅ Rolling window candle system is well-designed
- ❌ Equity percentage is NOT displayed (shows raw dollar values)
- ⚠️ Position closure failures are logged but not surfaced to user

**Priority Actions:**
1. **Immediate:** Implement equity percentage display (Priority 1)
2. **High:** Add position closure failure notifications (Priority 2)
3. **Medium:** Implement retry logic for failed closes (Priority 3)
4. **Nice-to-have:** Add orphaned position monitor (Priority 4)

**Risk Assessment:**
- **Current risk of money left on Drift:** MEDIUM
  - Multiple closure attempts exist
  - But silent failures could leave positions open
  - User may not notice until trying to withdraw

**Mitigation:**
- Implement Priority 2 immediately to surface failures
- Add retry logic (Priority 3) to reduce failure rate
- Consider orphaned position monitor for safety net

