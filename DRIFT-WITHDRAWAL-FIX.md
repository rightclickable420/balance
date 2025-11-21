# Drift Withdrawal & Position Closure Fix

**Date:** 2025-11-19
**Issue:** Cannot withdraw $3.75 from Drift due to subscription errors and open positions
**Root Cause:** NotSubscribedError + InsufficientCollateral from unclosed position

---

## Problems Fixed

### 1. NotSubscribedError - Drift Client Not Subscribed ✅

**Error:**
```
NotSubscribedError: You must call `subscribe` before using this function
at DriftPositionManager.getOpenPositions (drift-position-manager.ts:713)
```

**Root Cause:**

The `initialize()` method had an early-return path that didn't properly re-subscribe after `cleanup()` was called. The flow was:

1. Game ends → `cleanup()` called → sets `isUserSubscribed = false`
2. User clicks "Check Drift Balance" → `initialize()` called again
3. Early return detects existing instance → **skips re-subscription** ❌
4. Tries to call `user.getActivePerpPositions()` → crashes with NotSubscribedError

**Fix in [drift-position-manager.ts:162-184](src/lib/trading/drift-position-manager.ts#L162-L184):**

```typescript
// If already initialized with same session, just ensure subscriptions are active
if (this.isInitialized && this.sessionAuthority && this.user && this.driftClient) {
  console.log("[DriftPositionManager] Re-initializing - ensuring subscriptions are active")

  // Always re-subscribe to ensure we have fresh data
  if (!this.isClientSubscribed) {
    console.log("[DriftPositionManager] Re-subscribing DriftClient...")
    await this.driftClient.subscribe()
    this.isClientSubscribed = true
  }
  if (!this.isUserSubscribed) {
    console.log("[DriftPositionManager] Re-subscribing User...")
    await this.user.subscribe()
    this.isUserSubscribed = true
  }

  // Fetch latest account data after re-subscription
  await this.user.fetchAccounts()  // ✅ NEW: Refresh data
  console.log("[DriftPositionManager] ✅ Re-initialization complete, subscriptions active")

  this.sessionAuthority = sessionKeypair.publicKey
  return
}
```

**What Changed:**
- Added `fetchAccounts()` call to refresh data after re-subscription
- Added console logs to verify subscription state
- Ensures subscriptions are always active before returning

---

### 2. InsufficientCollateral - Open Position Blocking Withdrawal ✅

**Error:**
```
Error: Insufficient collateral
User attempting to withdraw where total_collateral 2768190 is below initial_margin_requirement 2768199
```

**Translation:** You have $2.77 collateral, but an open position is using $2.77 for margin requirements, leaving $0.00 free to withdraw.

**Root Cause:**

The withdrawal was attempted without closing the open position first. The position was using all available collateral as margin.

**Fix #1 - Better Error Messages in [drift-position-manager.ts:664-690](src/lib/trading/drift-position-manager.ts#L664-L690):**

```typescript
// Check for open positions
const openPositions = await this.getOpenPositions()
if (openPositions.length > 0) {
  const positionDetails = openPositions.map(p =>
    `${p.marketSymbol} ${p.side.toUpperCase()} $${p.sizeUsd.toFixed(2)} (PnL: ${p.unrealizedPnl >= 0 ? '+' : ''}$${p.unrealizedPnl.toFixed(2)})`
  ).join(', ')

  throw new Error(
    `Cannot withdraw with ${openPositions.length} open position(s):\n${positionDetails}\n\nClose all positions first.`
  )
}

// Check free collateral
const freeCollateral = this.user.getFreeCollateral()
const freeCollateralNumber = freeCollateral.toNumber() / QUOTE_PRECISION.toNumber()

if (freeCollateralNumber <= 0.01) {
  const totalCollateral = this.user.getTotalCollateral()
  const totalCollateralNumber = totalCollateral.toNumber() / QUOTE_PRECISION.toNumber()
  const usedCollateral = totalCollateralNumber - freeCollateralNumber

  throw new Error(
    `Insufficient free collateral to withdraw.\n\n` +
    `Total collateral: $${totalCollateralNumber.toFixed(2)}\n` +
    `Used by positions/margin: $${usedCollateral.toFixed(2)}\n` +
    `Free to withdraw: $${freeCollateralNumber.toFixed(2)}\n\n` +
    `Close all positions to free up collateral.`
  )
}
```

**What Changed:**
- Shows exactly which positions are open (market, side, size, PnL)
- Shows collateral breakdown (total, used, free)
- Clear instructions: "Close all positions first"

**Fix #2 - Auto-Close Positions in Setup Screen [game-setup-screen.tsx:217-264](src/components/game-setup-screen.tsx#L217-L264):**

```typescript
// Close positions if requested and any exist
if (ensureFlat && summary.positions.length > 0) {
  console.log(`[Setup] Found ${summary.positions.length} open position(s), attempting to close...`)

  const closeResults: { success: boolean; position: string; error?: string }[] = []

  for (const position of summary.positions) {
    try {
      console.log(`[Setup] Closing ${position.marketSymbol} ${position.side} position...`)
      await driftManager.closePosition(position.marketIndex, 100)
      closeResults.push({
        success: true,
        position: `${position.marketSymbol} ${position.side.toUpperCase()}`
      })
      console.log(`[Setup] ✅ Closed ${position.marketSymbol}`)
    } catch (closeError) {
      const errorMsg = closeError instanceof Error ? closeError.message : 'Unknown error'
      console.error(`[Setup] ❌ Failed to close ${position.marketSymbol}:`, closeError)
      closeResults.push({
        success: false,
        position: `${position.marketSymbol} ${position.side.toUpperCase()}`,
        error: errorMsg
      })
    }
  }

  // Refresh summary after closures
  summary = await driftManager.getPositionSummary()

  // Show results
  const successCount = closeResults.filter(r => r.success).length
  const failCount = closeResults.filter(r => !r.success).length

  if (failCount > 0 && !silent) {
    const failedPositions = closeResults
      .filter(r => !r.success)
      .map(r => `${r.position}: ${r.error}`)
      .join('\n')

    alert(
      `Warning: Failed to close ${failCount} position(s):\n\n${failedPositions}\n\n` +
      `${successCount} position(s) closed successfully.\n` +
      `Remaining positions: ${summary.positions.length}`
    )
  } else if (successCount > 0 && !silent) {
    console.log(`[Setup] ✅ Closed ${successCount} position(s) successfully`)
  }
}
```

**What Changed:**
- Tracks success/failure for each position closure
- Shows detailed results if any closures fail
- Refreshes summary after all closure attempts
- Better console logging for debugging

**Fix #3 - Enhanced Balance Display [game-setup-screen.tsx:271-290](src/components/game-setup-screen.tsx#L271-L290):**

```typescript
if (!silent) {
  const message = [
    `Drift collateral: $${summary.totalCollateral.toFixed(2)}`,
    `Equity: $${summary.totalEquity.toFixed(2)}`,
    `Free collateral: $${summary.freeCollateral.toFixed(2)}`,
  ]

  if (summary.positions.length > 0) {
    message.push(`\n⚠️ Open positions: ${summary.positions.length}`)
    summary.positions.forEach(p => {
      message.push(
        `  ${p.marketSymbol} ${p.side.toUpperCase()}: $${p.sizeUsd.toFixed(2)} ` +
        `(PnL: ${p.unrealizedPnl >= 0 ? '+' : ''}$${p.unrealizedPnl.toFixed(2)})`
      )
    })
    message.push('\nClose all positions before withdrawing.')
  }

  alert(message.join('\n'))
}
```

**What Changed:**
- Shows all open positions with details
- Warning if positions remain after closure attempts
- Clear instruction to close positions before withdrawing

---

## How to Use the Fixes

### Scenario 1: Check Drift Balance

1. Click "Check Drift Balance" button
2. **New behavior:**
   - Auto-closes all open positions
   - Shows detailed closure results
   - Displays updated balance with position info

**Example Output (with positions):**
```
Drift collateral: $2.77
Equity: $2.85
Free collateral: $0.00

⚠️ Open positions: 1
  SOL-PERP SHORT: $2.50 (PnL: +$0.08)

Close all positions before withdrawing.
```

**Example Output (positions closed successfully):**
```
✅ Closed 1 position(s) successfully

Drift collateral: $2.77
Equity: $2.77
Free collateral: $2.77
```

### Scenario 2: Withdraw Drift Funds

1. Click "Withdraw Drift Funds" button
2. **New behavior:**
   - Auto-closes positions via `ensureAllPositionsClosed()`
   - Checks for remaining positions
   - Shows detailed error if positions remain
   - Shows collateral breakdown if insufficient free collateral

**Example Error (position still open):**
```
Cannot withdraw with 1 open position(s):
SOL-PERP SHORT $2.50 (PnL: +$0.08)

Close all positions first.
```

**Example Error (insufficient free collateral):**
```
Insufficient free collateral to withdraw.

Total collateral: $2.77
Used by positions/margin: $2.77
Free to withdraw: $0.00

Close all positions to free up collateral.
```

---

## Console Logs You'll See

### Subscription Re-initialization:
```
[DriftPositionManager] Re-initializing - ensuring subscriptions are active
[DriftPositionManager] Re-subscribing User...
[DriftPositionManager] ✅ Re-initialization complete, subscriptions active
```

### Position Closure:
```
[Setup] Found 1 open position(s), attempting to close...
[Setup] Closing SOL-PERP short position...
[Setup] ✅ Closed SOL-PERP
✅ Closed 1 position(s) successfully
```

### Position Closure Failure:
```
[Setup] ❌ Failed to close SOL-PERP: InvalidOrderAuction
Warning: Failed to close 1 position(s):

SOL-PERP SHORT: InvalidOrderAuction

0 position(s) closed successfully.
Remaining positions: 1
```

---

## Your Specific Case: $3.75 on Drift

Based on the error, here's what's happening:

**Current State:**
- Total collateral: $2.77 (not $3.75 - might be showing stale data)
- Open position: Using $2.77 as margin requirement
- Free collateral: $0.00

**To Withdraw:**

1. **Option A: Use "Check Drift Balance"**
   - Automatically closes positions
   - Shows updated balance
   - Then use "Withdraw Drift Funds"

2. **Option B: Use "Withdraw Drift Funds" directly**
   - Also auto-closes positions
   - If closure fails, shows detailed error
   - Try again after error is resolved

**If Auto-Close Fails:**

The position might be failing to close due to:
- Network issues
- Auction errors (price bounds invalid)
- Slippage issues
- Drift API issues

**Manual Recovery:**

1. Go to https://app.drift.trade
2. Connect your session wallet (you have the encrypted backup)
3. Manually close the position through Drift UI
4. Return to Balance and withdraw

---

## Testing Verification

After these fixes, test:

- [ ] Click "Check Drift Balance" → subscriptions work (no NotSubscribedError)
- [ ] Check Drift Balance with open position → auto-closes position
- [ ] Check Drift Balance with no position → shows correct balance
- [ ] Click "Withdraw Drift Funds" with open position → closes position first
- [ ] Click "Withdraw Drift Funds" with no position → withdraws successfully
- [ ] Position closure failure → shows detailed error message
- [ ] Console shows subscription re-initialization logs
- [ ] Console shows position closure attempt logs

---

## Summary

**Fixed Issues:**
1. ✅ NotSubscribedError - Now re-subscribes correctly after cleanup
2. ✅ InsufficientCollateral - Auto-closes positions before withdrawal
3. ✅ Silent failures - Now shows detailed error messages
4. ✅ Poor UX - Now shows position details and clear instructions

**Files Changed:**
- `src/lib/trading/drift-position-manager.ts` (lines 162-184, 664-690)
- `src/components/game-setup-screen.tsx` (lines 217-290)

**Next Steps:**
1. Try "Check Drift Balance" button
2. It should auto-close the open position
3. Then "Withdraw Drift Funds" should work
4. If it still fails, check console logs for specific error
