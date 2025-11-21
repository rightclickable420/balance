# Drift Settled Position Diagnosis

**Date:** 2025-11-19
**Issue:** `getActivePerpPositions()` returns 0 but free collateral is still $0
**Hypothesis:** Settled position with unsettled PnL or margin requirements
**Files Changed:** `src/lib/trading/drift-position-manager.ts`

---

## Problem Discovery

### Observation from Console Logs

```
[DriftPositionManager] getActivePerpPositions() returned 0 position(s)
[DriftPositionManager] Returning 0 total position(s)

[DriftPositionManager] Failed to withdraw collateral: Error: Insufficient free collateral to withdraw.

Total collateral: $2.77
Used by positions/margin: $2.77
Free to withdraw: $0.00
```

**Paradox:**
- No "active" positions detected by `getActivePerpPositions()`
- But all collateral is still locked by "positions/margin"

### Root Cause Hypothesis

**Drift SDK's `getActivePerpPositions()` only returns positions with non-zero `baseAssetAmount`.**

This means it filters out:
- **Settled positions** (baseAssetAmount = 0) that still have unsettled PnL
- **Closing positions** awaiting final settlement
- **Positions with pending funding payments**
- **Positions with open orders** (order placed but not filled)

These "inactive" positions can still lock collateral for margin requirements even though they don't show up in the active positions list.

---

## Changes Made

### 1. Enhanced Position Detection (Lines 780-813)

**BEFORE:**
```typescript
const positions: Position[] = []
const perpPositions = this.user.getActivePerpPositions()

console.log(`[DriftPositionManager] getActivePerpPositions() returned ${perpPositions.length} position(s)`)
```

**Problem:** Only sees positions with baseAssetAmount > 0

**AFTER:**
```typescript
const positions: Position[] = []

// Get ALL perp positions (not just active ones with open size)
// This includes positions with baseAssetAmount = 0 that may still have unsettled PnL or margin
const userAccount = this.user.getUserAccount()
const allPerpPositions = userAccount.perpPositions

console.log(`[DriftPositionManager] Total perp position slots: ${allPerpPositions.length}`)

// Filter for positions that are actually open (marketIndex !== 65535 which is unused marker)
const perpPositions = allPerpPositions.filter(p => p.marketIndex !== 65535)

console.log(`[DriftPositionManager] Perp positions in use: ${perpPositions.length}`)
console.log(`[DriftPositionManager] getActivePerpPositions() comparison: ${this.user.getActivePerpPositions().length} active`)

for (const perpPos of perpPositions) {
  const marketIndex = perpPos.marketIndex
  const marketSymbol = this.getMarketSymbol(marketIndex)

  const baseAssetAmount = perpPos.baseAssetAmount
  const quoteAssetAmount = perpPos.quoteAssetAmount

  console.log(`[DriftPositionManager] Examining ${marketSymbol} position: baseAssetAmount=${baseAssetAmount.toString()}, quoteAssetAmount=${quoteAssetAmount.toString()}`)

  // Skip positions with zero base asset (no actual position open)
  if (baseAssetAmount.eq(new BN(0))) {
    console.log(`[DriftPositionManager] Skipping ${marketSymbol} - zero baseAssetAmount (settled position)`)
    continue
  }

  // ... process active position
}
```

**Benefits:**
- Examines **all** perp position slots (Drift accounts have 8 slots)
- Shows which slots are in use (marketIndex !== 65535)
- Logs `baseAssetAmount` and `quoteAssetAmount` for each slot
- Identifies settled positions (baseAssetAmount = 0 but slot still occupied)

---

### 2. Enhanced Withdrawal Diagnostics (Lines 701-744)

**Added detailed error diagnostics when free collateral is insufficient:**

```typescript
if (freeCollateralNumber <= 0.01) {
  const totalCollateral = this.user.getTotalCollateral()
  const totalCollateralNumber = totalCollateral.toNumber() / QUOTE_PRECISION.toNumber()
  const usedCollateral = totalCollateralNumber - freeCollateralNumber

  // Get margin requirements to diagnose what's using the collateral
  const initialMarginReq = this.user.getInitialMarginRequirement()
  const maintenanceMarginReq = this.user.getMaintenanceMarginRequirement()
  const initialMarginReqNumber = initialMarginReq.toNumber() / QUOTE_PRECISION.toNumber()
  const maintenanceMarginReqNumber = maintenanceMarginReq.toNumber() / QUOTE_PRECISION.toNumber()

  // Check all perp positions including settled ones
  const userAccount = this.user.getUserAccount()
  const allPerpPositions = userAccount.perpPositions.filter(p => p.marketIndex !== 65535)

  console.error(
    `[DriftPositionManager] Collateral breakdown:\n` +
    `  Total: $${totalCollateralNumber.toFixed(2)}\n` +
    `  Free: $${freeCollateralNumber.toFixed(2)}\n` +
    `  Initial margin req: $${initialMarginReqNumber.toFixed(2)}\n` +
    `  Maintenance margin req: $${maintenanceMarginReqNumber.toFixed(2)}\n` +
    `  Perp positions in use: ${allPerpPositions.length}\n` +
    `  Open positions detected: ${openPositions.length}`
  )

  // Log details of all perp position slots
  allPerpPositions.forEach((pos, idx) => {
    console.error(
      `  Perp slot ${idx}: market=${pos.marketIndex} (${this.getMarketSymbol(pos.marketIndex)}), ` +
      `base=${pos.baseAssetAmount.toString()}, quote=${pos.quoteAssetAmount.toString()}`
    )
  })

  throw new Error(
    `Insufficient free collateral to withdraw.\n\n` +
    `Total collateral: $${totalCollateralNumber.toFixed(2)}\n` +
    `Used by positions/margin: $${usedCollateral.toFixed(2)}\n` +
    `Free to withdraw: $${freeCollateralNumber.toFixed(2)}\n` +
    `Initial margin req: $${initialMarginReqNumber.toFixed(2)}\n` +
    `Maintenance margin req: $${maintenanceMarginReqNumber.toFixed(2)}\n\n` +
    `Detected ${openPositions.length} open position(s) but margin is still locked.\n` +
    `Check console for detailed position slot info.`
  )
}
```

**New Diagnostics Provided:**
1. **Initial margin requirement** - minimum collateral needed for current positions
2. **Maintenance margin requirement** - collateral needed to avoid liquidation
3. **Perp positions in use** - how many position slots are occupied
4. **Per-slot details** - baseAssetAmount and quoteAssetAmount for each slot

---

## Expected Console Output (Next Withdrawal Attempt)

### When Position Detection Runs

```
[DriftPositionManager] Fetching latest account data before reading positions...
[DriftPositionManager] ✅ Account data fetched
[DriftPositionManager] Total perp position slots: 8
[DriftPositionManager] Perp positions in use: 1
[DriftPositionManager] getActivePerpPositions() comparison: 0 active

[DriftPositionManager] Examining SOL-PERP position: baseAssetAmount=0, quoteAssetAmount=2500000000
[DriftPositionManager] Skipping SOL-PERP - zero baseAssetAmount (settled position)

[DriftPositionManager] Returning 0 total position(s)
```

**Interpretation:**
- 1 position slot is occupied (SOL-PERP)
- `baseAssetAmount = 0` (position is closed/settled)
- `quoteAssetAmount = 2500000000` (~$2.50) - **unsettled quote balance**
- This unsettled balance is likely locking your collateral

### When Withdrawal Fails

```
[DriftPositionManager] Collateral breakdown:
  Total: $2.77
  Free: $0.00
  Initial margin req: $2.77
  Maintenance margin req: $1.39
  Perp positions in use: 1
  Open positions detected: 0

  Perp slot 0: market=0 (SOL-PERP), base=0, quote=2500000000

Error: Insufficient free collateral to withdraw.

Total collateral: $2.77
Used by positions/margin: $2.77
Free to withdraw: $0.00
Initial margin req: $2.77
Maintenance margin req: $1.39

Detected 0 open position(s) but margin is still locked.
Check console for detailed position slot info.
```

**Key Insight:**
- Initial margin requirement = $2.77 (same as total collateral!)
- This means Drift is reserving 100% of your collateral for something
- The "something" is likely the unsettled quoteAssetAmount in the settled position

---

## What's Likely Happening

### Scenario: Unsettled Position

1. **You opened a SOL-PERP SHORT position** (e.g., -0.01 SOL at $250 = $2.50 notional)
2. **Position was closed** → `baseAssetAmount = 0`
3. **But the settlement hasn't finalized** → `quoteAssetAmount` still non-zero
4. **Drift is holding margin** for the unsettled position
5. **Cannot withdraw** until settlement completes

### Why Settlement Might Be Delayed

- **Pending funding payments** - Drift perps have 1-hour funding payments
- **JIT auction still active** - Order placed but hasn't settled on-chain
- **Oracle price update needed** - Settlement awaits next oracle update
- **Network congestion** - Settlement transaction pending

---

## Solutions

### Solution 1: Wait for Settlement (Recommended)

**Most positions settle within 5-10 minutes after closing.**

1. Wait 10-15 minutes
2. Try "Withdraw Drift Funds" again
3. The new diagnostics will show if settlement completed

**How to verify settlement:**
- `quoteAssetAmount` should become 0
- `Initial margin req` should become $0
- `Free collateral` should equal total collateral

---

### Solution 2: Manually Settle via Drift UI

If automatic settlement is taking too long:

1. Go to https://app.drift.trade
2. Connect your session wallet (you have the encrypted backup)
3. Navigate to "Portfolio" → "Positions"
4. Look for any positions marked as "Settling" or "Pending"
5. Click "Settle" if available
6. Return to Balance and try withdrawal again

---

### Solution 3: Force Settlement (Advanced)

If you're comfortable with Solana transactions:

```typescript
// In drift-position-manager.ts, add a new method:
async settlePosition(marketIndex: number): Promise<void> {
  if (!this.driftClient || !this.user) {
    throw new Error("Drift client not initialized")
  }

  console.log(`[DriftPositionManager] Settling position for market ${marketIndex}...`)

  const txSig = await this.driftClient.settlePNL(
    await this.user.getUserAccountPublicKey(),
    this.user.getUserAccount(),
    marketIndex
  )

  console.log(`[DriftPositionManager] ✅ Settlement transaction: ${txSig}`)

  // Wait for settlement to confirm
  await new Promise(resolve => setTimeout(resolve, 2000))
  await this.user.fetchAccounts()
}
```

Then call this before withdrawal:
```typescript
await driftManager.settlePosition(0) // 0 = SOL-PERP market index
```

---

## Testing Steps

### Step 1: Try Withdrawal Now

Click "Withdraw Drift Funds" and check console for new diagnostics:

**Look for:**
```
[DriftPositionManager] Total perp position slots: 8
[DriftPositionManager] Perp positions in use: ?
[DriftPositionManager] Examining <MARKET> position: baseAssetAmount=?, quoteAssetAmount=?
```

**Expected Results:**
- If `Perp positions in use: 0` → Withdrawal should succeed
- If `Perp positions in use: 1+` → Check baseAssetAmount and quoteAssetAmount values

---

### Step 2: Interpret the Diagnostics

**Scenario A: Settlement Complete**
```
Perp positions in use: 0
Free collateral: $2.77
```
→ **Withdrawal will succeed**

**Scenario B: Settled but Not Cleaned Up**
```
Perp positions in use: 1
baseAssetAmount=0, quoteAssetAmount=0
Free collateral: $2.77
```
→ **Withdrawal will succeed** (position slot occupied but empty)

**Scenario C: Settlement Pending**
```
Perp positions in use: 1
baseAssetAmount=0, quoteAssetAmount=2500000000
Free collateral: $0.00
Initial margin req: $2.77
```
→ **Withdrawal will fail** (wait for settlement or force settle)

**Scenario D: Active Position Still Open**
```
Perp positions in use: 1
baseAssetAmount=-10000000000, quoteAssetAmount=2500000000
Free collateral: $0.00
```
→ **Withdrawal will fail** (position didn't actually close - retry closePosition)

---

## Next Steps Based on Diagnostics

### If Settlement Is Pending

1. **Wait 10 minutes** and try again
2. **Check Drift UI** at https://app.drift.trade for settlement status
3. **Implement force settlement** using `settlePNL()` method (see Solution 3)

### If Position Is Still Open

1. **Retry position closure:**
   ```typescript
   await driftManager.closePosition(0, 100) // market 0 (SOL-PERP), 100% size
   ```

2. **Check for order placement errors** in console
3. **Manually close via Drift UI** if automated closure keeps failing

### If Issue Persists

1. **Share the diagnostic output** from console:
   - Perp position slot details
   - Initial/maintenance margin requirements
   - Base and quote asset amounts

2. **Check Drift Protocol status** - may be experiencing issues

3. **Contact Drift support** if account appears stuck

---

## Files Changed Summary

### drift-position-manager.ts

**Lines 780-813:** Enhanced position detection to examine all perp slots
- Replaced `getActivePerpPositions()` with `userAccount.perpPositions`
- Added logging for baseAssetAmount and quoteAssetAmount
- Skip settled positions (baseAssetAmount = 0)

**Lines 701-744:** Enhanced withdrawal diagnostics
- Show initial margin requirement
- Show maintenance margin requirement
- Log all perp position slots with details
- Clearer error message with margin info

---

## Summary

**What We Discovered:**
- `getActivePerpPositions()` doesn't detect settled positions
- Your $2.77 is likely locked by a settled position awaiting final settlement
- `quoteAssetAmount` being non-zero indicates unsettled PnL or margin

**What We Added:**
- Examination of all 8 perp position slots
- Detailed logging of baseAssetAmount and quoteAssetAmount
- Margin requirement diagnostics (initial + maintenance)
- Per-slot position details in error messages

**Expected Outcome:**
When you try withdrawal now, the console will show **exactly what's using your collateral** - whether it's a settled position awaiting settlement, an active position that didn't close, or something else.

**Next Action:**
Try "Withdraw Drift Funds" again and share the new diagnostic output!
