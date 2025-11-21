# Drift Open Orders Fix

**Date:** 2025-11-19
**Root Cause:** Open orders locking collateral
**Solution:** Auto-cancel open orders before withdrawal
**Files Changed:** `src/lib/trading/drift-position-manager.ts`

---

## Problem Discovery

### Diagnostic Output Revealed

From your console logs:
```
[DriftPositionManager] Collateral breakdown:
  Total: $2.76
  Free: $0.00
  Initial margin req: $2.77
  Maintenance margin req: $2.77
  Perp positions in use: 8
  Open positions detected: 0

  Perp slot 0-7: market=0 (SOL-PERP), base=0, quote=0
```

**Key Findings:**
1. **All 8 perp position slots show base=0, quote=0** (completely empty/settled)
2. **But initial margin requirement = $2.77** (same as total collateral!)
3. **Free collateral = $0.00** (everything locked)

**Conclusion:** Something besides positions is locking your collateral.

### The Likely Culprit: Open Orders

When you close a position on Drift using market orders, the order may:
1. **Not fill immediately** due to JIT auction mechanics
2. **Remain open** for several seconds awaiting matching
3. **Lock collateral** for margin requirements
4. **Block withdrawals** even after position is closed

This explains why:
- Positions show as closed (base=0, quote=0)
- But collateral is still locked (free=$0)
- Margin requirements equal total collateral

---

## Changes Made

### 1. Added Open Orders Detection (Lines 716-750)

**Enhanced diagnostics to show open orders:**

```typescript
// Check for open orders (these lock collateral even without open positions!)
const openOrders = userAccount.orders.filter(o => o.status === 0) // 0 = Open status
const openOrdersCount = openOrders.length

console.error(
  `[DriftPositionManager] Collateral breakdown:\n` +
  `  Total: $${totalCollateralNumber.toFixed(2)}\n` +
  `  Free: $${freeCollateralNumber.toFixed(2)}\n` +
  `  Initial margin req: $${initialMarginReqNumber.toFixed(2)}\n` +
  `  Maintenance margin req: $${maintenanceMarginReqNumber.toFixed(2)}\n` +
  `  Perp positions in use: ${allPerpPositions.length}\n` +
  `  Open positions detected: ${openPositions.length}\n` +
  `  Open orders: ${openOrdersCount}`
)

// Log open orders if any
if (openOrdersCount > 0) {
  console.error(`\n  Open orders:`)
  openOrders.forEach((order, idx) => {
    console.error(
      `    Order ${idx}: market=${order.marketIndex}, ` +
      `type=${order.orderType}, direction=${order.direction}, ` +
      `baseAssetAmount=${order.baseAssetAmount.toString()}, ` +
      `price=${order.price.toString()}, status=${order.status}`
    )
  })
}
```

**Benefits:**
- Shows count of open orders
- Logs details for each open order (market, type, direction, size, price)
- Helps diagnose what's locking collateral

---

### 2. Added cancelAllOrders() Method (Lines 672-717)

**New method to cancel all open orders:**

```typescript
/**
 * Cancel all open orders
 * @returns Number of orders cancelled
 */
async cancelAllOrders(): Promise<number> {
  if (!this.driftClient || !this.user) {
    throw new Error("Drift client not initialized")
  }

  try {
    await this.user.fetchAccounts()

    const userAccount = this.user.getUserAccount()
    const openOrders = userAccount.orders.filter(o => o.status === 0) // 0 = Open status

    if (openOrders.length === 0) {
      console.log("[DriftPositionManager] No open orders to cancel")
      return 0
    }

    console.log(`[DriftPositionManager] Cancelling ${openOrders.length} open order(s)...`)

    let cancelledCount = 0
    for (const order of openOrders) {
      try {
        const txSig = await this.driftClient.cancelOrder(order.orderId)
        console.log(`[DriftPositionManager] ✅ Cancelled order ${order.orderId}: ${txSig}`)
        cancelledCount++
      } catch (error) {
        console.error(`[DriftPositionManager] ❌ Failed to cancel order ${order.orderId}:`, error)
      }
    }

    // Wait for cancellations to settle
    if (cancelledCount > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      await this.user.fetchAccounts()
    }

    console.log(`[DriftPositionManager] Cancelled ${cancelledCount}/${openOrders.length} order(s)`)
    return cancelledCount
  } catch (error) {
    console.error("[DriftPositionManager] Failed to cancel orders:", error)
    throw error
  }
}
```

**Features:**
- Cancels all open orders (status = 0)
- Tracks success/failure for each cancellation
- Waits 1 second and refreshes account after cancellations
- Returns count of successfully cancelled orders

---

### 3. Auto-Cancel Orders Before Withdrawal (Lines 732-736)

**Modified withdrawCollateral() to auto-cancel orders:**

```typescript
try {
  // Refresh account first
  await this.user.fetchAccounts()

  // Cancel any open orders first (they lock collateral)
  const cancelledOrders = await this.cancelAllOrders()
  if (cancelledOrders > 0) {
    console.log(`[DriftPositionManager] Cancelled ${cancelledOrders} open order(s) before withdrawal`)
  }

  // Check for open positions
  const openPositions = await this.getOpenPositions()
  // ...rest of withdrawal logic
}
```

**Workflow:**
1. Refresh account data
2. **Auto-cancel all open orders** ← NEW
3. Check for open positions
4. Check free collateral
5. Attempt withdrawal

---

### 4. Updated Error Message (Lines 798-808)

**Enhanced error message to mention open orders:**

```typescript
throw new Error(
  `Insufficient free collateral to withdraw.\n\n` +
  `Total collateral: $${totalCollateralNumber.toFixed(2)}\n` +
  `Used by positions/margin: $${usedCollateral.toFixed(2)}\n` +
  `Free to withdraw: $${freeCollateralNumber.toFixed(2)}\n` +
  `Initial margin req: $${initialMarginReqNumber.toFixed(2)}\n` +
  `Maintenance margin req: $${maintenanceMarginReqNumber.toFixed(2)}\n\n` +
  `Detected ${openPositions.length} open position(s) and ${openOrdersCount} open order(s).\n` +
  (openOrdersCount > 0 ? `Open orders lock collateral - cancel them to free collateral.\n` : ``) +
  `Check console for detailed position slot and order info.`
)
```

---

## Expected Behavior Now

### Scenario A: Open Orders Exist (Most Likely)

When you click "Withdraw Drift Funds":

```
[DriftPositionManager] Fetching latest account data before reading positions...
[DriftPositionManager] ✅ Account data fetched

[DriftPositionManager] Cancelling 1 open order(s)...
[DriftPositionManager] ✅ Cancelled order 123: AbC...XyZ
[DriftPositionManager] Cancelled 1/1 order(s)
[DriftPositionManager] Cancelled 1 open order(s) before withdrawal

[DriftPositionManager] Fetching latest account data before reading positions...
[DriftPositionManager] Total perp position slots: 8
[DriftPositionManager] Perp positions in use: 0
[DriftPositionManager] Returning 0 total position(s)

[DriftPositionManager] Withdrawing all SOL from Drift...
[DriftPositionManager] ✅ Withdrawn to session wallet: xyz...abc

[Setup] ✅ Withdrew $2.76 from Drift
```

**Result:** ✅ **Withdrawal succeeds after cancelling open orders**

---

### Scenario B: No Open Orders (Drift Account Issue)

If there are **no open orders** but collateral is still locked:

```
[DriftPositionManager] Collateral breakdown:
  Total: $2.76
  Free: $0.00
  Initial margin req: $2.77
  Maintenance margin req: $2.77
  Perp positions in use: 8
  Open positions detected: 0
  Open orders: 0

Error: Insufficient free collateral to withdraw.
Detected 0 open position(s) and 0 open order(s).
Check console for detailed position slot and order info.
```

**This would indicate a Drift Protocol account state issue requiring manual intervention via Drift UI.**

---

## Testing Instructions

### Step 1: Try Withdrawal Now

Click **"Withdraw Drift Funds"** and monitor console output.

**What to Look For:**

1. **Order cancellation logs:**
   ```
   [DriftPositionManager] Cancelling X open order(s)...
   [DriftPositionManager] ✅ Cancelled order 123: ...
   ```

2. **Free collateral after cancellation:**
   ```
   Free collateral: $2.76 (should match total)
   ```

3. **Withdrawal success:**
   ```
   [DriftPositionManager] ✅ Withdrawn to session wallet: ...
   ```

---

### Step 2: Interpret Results

**Case 1: Orders Cancelled Successfully**
```
Cancelled 1 open order(s) before withdrawal
✅ Withdrawn to session wallet
```
→ **SUCCESS!** Your $2.76 is now in your session wallet.

**Case 2: No Orders Found**
```
No open orders to cancel
Error: Insufficient free collateral to withdraw
  Open orders: 0
```
→ **Account state issue** - see Manual Recovery below.

**Case 3: Order Cancellation Failed**
```
❌ Failed to cancel order 123: <error>
Error: Insufficient free collateral to withdraw
  Open orders: 1
```
→ **Try manual cancellation** via Drift UI.

---

## Manual Recovery (If Auto-Cancel Fails)

### Option 1: Cancel Orders via Drift UI

1. Go to https://app.drift.trade
2. Connect your session wallet (you have the encrypted backup)
3. Navigate to "Orders" tab
4. Cancel all open orders manually
5. Return to Balance and try "Withdraw Drift Funds" again

---

### Option 2: Settle Account via Drift UI

If no orders are open but margin is still locked:

1. Go to https://app.drift.trade
2. Connect your session wallet
3. Navigate to "Portfolio" → "Positions"
4. Look for "Settle" button for SOL-PERP
5. Click "Settle" to finalize position closure
6. Return to Balance and try withdrawal again

---

### Option 3: Contact Drift Support

If both manual methods fail:

1. Account may be in corrupted state
2. Contact Drift support on Discord: https://discord.gg/driftprotocol
3. Provide your session wallet address and describe the issue
4. They may be able to manually settle your account

---

## Why Open Orders Lock Collateral

### Drift JIT Auction Mechanics

When you place a market order on Drift:

1. **Order is placed on-chain** with auction parameters
2. **Keepers bid to fill the order** during auction window (1 slot = ~400ms)
3. **Best fill is selected** and executed
4. **Order is settled** and removed from open orders

**The Problem:**
- During steps 1-3, the order is **open** but not filled
- Drift **locks margin** for this open order
- If auction fails or takes longer, order remains open
- You cannot withdraw while order is open

**Our Fix:**
- Auto-detect open orders before withdrawal
- Cancel them to free up locked margin
- Then proceed with withdrawal

---

## Summary

**What Was Discovered:**
- Your $2.76 is likely locked by **open orders** from position closure attempts
- These orders didn't fill immediately due to JIT auction mechanics
- Open orders lock collateral just like open positions

**What Was Fixed:**
1. ✅ Added open orders detection and logging
2. ✅ Added `cancelAllOrders()` method
3. ✅ Auto-cancel orders before withdrawal
4. ✅ Enhanced error messages with order info

**Expected Result:**
When you try "Withdraw Drift Funds" now:
- Open orders will be automatically cancelled
- Collateral will be freed
- Withdrawal will succeed

**Next Action:**
Try "Withdraw Drift Funds" again and check the console for order cancellation logs!

---

## Files Changed Summary

### drift-position-manager.ts

**Lines 672-717:** Added `cancelAllOrders()` method
- Detects open orders (status = 0)
- Cancels each order via `driftClient.cancelOrder()`
- Tracks success/failure
- Returns count of cancelled orders

**Lines 716-750:** Enhanced withdrawal diagnostics
- Shows open orders count
- Logs details for each open order
- Clearer error message mentioning orders

**Lines 732-736:** Auto-cancel orders in `withdrawCollateral()`
- Calls `cancelAllOrders()` before checking positions
- Logs cancelled order count
- Proceeds with withdrawal after cancellation

---

## Technical Details

### Order Status Codes

```typescript
enum OrderStatus {
  Open = 0,       // Order is active and awaiting fill
  Filled = 1,     // Order was completely filled
  Cancelled = 2,  // Order was cancelled by user
  Expired = 3,    // Order expired (time-based)
}
```

We filter for `status === 0` to find active orders.

### Order Structure

```typescript
interface Order {
  orderId: number
  marketIndex: number
  orderType: OrderType  // MARKET, LIMIT, etc.
  direction: PositionDirection  // LONG, SHORT
  baseAssetAmount: BN
  price: BN
  status: OrderStatus
  // ...other fields
}
```

### Cancellation API

```typescript
await driftClient.cancelOrder(orderId: number): Promise<string>
```

Returns transaction signature of cancellation.
