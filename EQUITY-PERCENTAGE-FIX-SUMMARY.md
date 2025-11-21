# Equity Percentage Fix - Implementation Summary

**Date:** 2025-11-19
**File Modified:** `src/components/doom-runner-experience.tsx`
**Lines Changed:** 489-554

---

## What Was Fixed

The DOOM HUD now correctly displays **equity percentage change** from your starting balance, not the absolute equity ratio.

### Example (Your Desired Behavior)

| Metric | Value |
|--------|-------|
| Starting balance (collateral) | $100 |
| Current equity (collateral ± PnL) | $105 |
| **DOOM HUD Display** | **+5%** ✅ |

Previously it would have shown `105%` or jumped erratically due to baseline initialization bugs.

---

## Changes Made

### 1. Separate Baseline Initialization (Lines 489-502)

**NEW: Dedicated effect for one-time initialization**

```typescript
// Initialize equity baseline once when starting balance is available
useEffect(() => {
  if (equityBaselineRef.current > 0) return // Already initialized

  if (gameMode === "real" && startingRealBalance > 0) {
    equityBaselineRef.current = startingRealBalance
    streakBaselineRef.current = startingRealBalance
    console.log(`[DoomRunner] Equity baseline initialized: $${startingRealBalance.toFixed(2)} (real)`)
  } else if (gameMode === "mock" && mockStartingBalance > 0) {
    equityBaselineRef.current = mockStartingBalance
    streakBaselineRef.current = mockStartingBalance
    console.log(`[DoomRunner] Equity baseline initialized: $${mockStartingBalance.toFixed(2)} (mock)`)
  }
}, [gameMode, startingRealBalance, mockStartingBalance])
```

**Why:** This ensures the baseline is set **only once** when the starting balance becomes available, preventing it from being initialized with the wrong value.

### 2. Fixed Equity Percentage Calculation (Lines 520-525)

**OLD (buggy):**
```typescript
const equityPercent = equityBaseline > 0 ? (equity / equityBaseline) * 100 : 100
const equityHudValue = Math.round(clamp(equityPercent, 0, 999))
```
- Result: $105 / $100 = **105%** ❌

**NEW (correct):**
```typescript
// Calculate equity change as PERCENTAGE CHANGE from starting balance
// Example: $100 start → $105 now = +5% (not 105%)
const equityChangePct = ((equity - equityBaseline) / equityBaseline) * 100

// Clamp to reasonable range: -99% to +899% (allow for big wins, prevent display overflow)
const equityHudValue = Math.round(clamp(equityChangePct, -99, 899))
```
- Result: ($105 - $100) / $100 × 100 = **+5%** ✅

**Why:** The formula now calculates the **change** (delta) as a percentage, not the ratio.

### 3. Guard Against Uninitialized Baseline (Lines 508-518)

**NEW: Skip updates until baseline is ready**

```typescript
// Get baseline (must be initialized before we can calculate percentage)
const equityBaseline =
  gameMode === "real"
    ? (startingRealBalance > 0 ? startingRealBalance : equityBaselineRef.current)
    : (mockStartingBalance > 0 ? mockStartingBalance : equityBaselineRef.current)

// Skip update if baseline not available yet
if (equityBaseline <= 0) {
  console.warn('[DoomRunner] Skipping HUD update - equity baseline not initialized')
  return
}
```

**Why:** Prevents erratic calculations when the starting balance hasn't loaded yet.

### 4. Debug Logging (Lines 545-548)

**NEW: Console logs for verification**

```typescript
// Log for debugging
if (equityChangePct !== 0) {
  console.log(`[DoomRunner] Equity: $${equity.toFixed(2)} / $${equityBaseline.toFixed(2)} = ${equityChangePct >= 0 ? '+' : ''}${equityChangePct.toFixed(2)}% → HUD: ${equityHudValue}`)
}
```

**Why:** You can now see in the console exactly what percentage is being calculated and verify it's correct.

---

## Behavior Examples

### Mock Trading ($1000 starting balance)

| Equity | Calculation | HUD Display |
|--------|-------------|-------------|
| $1000 | ($1000 - $1000) / $1000 × 100 | **0%** (break even) |
| $1050 | ($1050 - $1000) / $1000 × 100 | **+5%** |
| $950 | ($950 - $1000) / $1000 × 100 | **-5%** |
| $1200 | ($1200 - $1000) / $1000 × 100 | **+20%** |
| $500 | ($500 - $1000) / $1000 × 100 | **-50%** |
| $100 | ($100 - $1000) / $1000 × 100 | **-90%** (clamped at -99%) |

### Real Trading ($100 starting balance)

| Equity | Calculation | HUD Display |
|--------|-------------|-------------|
| $100.00 | ($100 - $100) / $100 × 100 | **0%** |
| $105.50 | ($105.50 - $100) / $100 × 100 | **+5%** |
| $95.00 | ($95 - $100) / $100 × 100 | **-5%** |
| $110.25 | ($110.25 - $100) / $100 × 100 | **+10%** |
| $89.50 | ($89.50 - $100) / $100 × 100 | **-10%** |

---

## What You'll See in Console

When the game starts:
```
[DoomRunner] Equity baseline initialized: $100.00 (real)
```

During trading:
```
[DoomRunner] Equity: $105.50 / $100.00 = +5.50% → HUD: 5
[DoomRunner] Equity: $110.25 / $100.00 = +10.25% → HUD: 10
[DoomRunner] Equity: $95.00 / $100.00 = -5.00% → HUD: -5
```

If baseline isn't ready yet:
```
[DoomRunner] Skipping HUD update - equity baseline not initialized
```

---

## Clamping Behavior

The HUD value is clamped to prevent display overflow:

- **Minimum:** -99% (you can't lose more than 99% in display)
- **Maximum:** +899% (allows for 9x gains before clamping)

This is more generous than the old 0-999% range, which couldn't display losses.

---

## Streak System (Unchanged)

The streak system (which resets every 20% gain) still works but is **separate** from the equity percentage:

- **Equity HUD:** Always shows total P&L from original starting balance
- **Streak:** Resets every 20% gain (for gamification)

Both values are sent to the DOOM engine, but the main HUD displays the **equity percentage change**.

---

## Testing Verification

To verify this works correctly:

1. **Start a game** (mock or real)
2. **Check console** for: `[DoomRunner] Equity baseline initialized: $X.XX`
3. **Make a trade** that gains $5
4. **Check console** for: `[DoomRunner] Equity: $105.00 / $100.00 = +5.00% → HUD: 5`
5. **Look at DOOM HUD** - should display **+5%** (or just **5**)

If the HUD shows 105% or jumps erratically, check:
- Console errors
- Whether baseline was initialized correctly
- Whether `startingRealBalance` or `mockStartingBalance` is 0

---

## Troubleshooting

### HUD shows 0% when it shouldn't
- Check if baseline is initialized: look for console log
- Verify `startingRealBalance` > 0 in real mode
- Verify `mockStartingBalance` > 0 in mock mode

### HUD shows wrong percentage
- Check console log for actual calculation
- Verify equity and baseline values are correct
- Look for errors about skipping HUD update

### Baseline initialized with wrong value
- Should only see one initialization log per game session
- If you see multiple, there's a bug in the effect dependencies
- Check that `equityBaselineRef.current` starts at 0

### HUD doesn't update at all
- Check if DOOM engine is ready: `bridgeRef.current?.isReady()`
- Look for "Skipping HUD update" warnings
- Verify iframe exists: `document.querySelector('iframe[title="GZDoom Runner"]')`

---

## Next Steps

After testing this fix, you may want to:

1. **Remove streak system** if it's confusing (lines 527-540)
2. **Adjust clamping range** if you want different min/max values
3. **Add sign (+/-) to HUD display** in the DOOM engine code
4. **Change logging verbosity** (remove debug logs once verified)

---

## Related Files

This fix only touches the calculation in `doom-runner-experience.tsx`.

If the DOOM engine **also** needs updates to properly display the value (e.g., showing "+5%" instead of "5"), you'll need to modify the DOOM/GZDoom code separately.

The value is sent via postMessage:
```typescript
iframe.contentWindow.postMessage(
  {
    type: "balance-hud-update",
    payload: {
      equity: equityHudValue,  // Now sends +5 instead of 105
      balance: Math.round(balance * 100),
      solPrice: Math.round((lastPrice ?? 0) * 100),
      streakGainPct: Math.max(0, streakGainPct),
      suddenLoss,
    },
  },
  window.location.origin,
)
```

If the DOOM HUD expects a 0-100 range instead of -99 to +899, you may need to adjust the clamping or add an offset.
