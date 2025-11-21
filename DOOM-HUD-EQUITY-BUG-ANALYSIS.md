# DOOM HUD Equity Percentage Bug Analysis

**Date:** 2025-11-19
**Component:** Balance HUD Widget (DOOM Runner)
**File:** `src/components/doom-runner-experience.tsx`
**Symptom:** Equity percentage moves erratically, appears to calculate from wrong baseline

---

## The Problem

The DOOM HUD shows an equity percentage above the custom EQUITY label, but this number jumps around erratically instead of smoothly tracking profit/loss from the initial account balance.

---

## Root Cause Analysis

### Location: Lines 516-536

The equity percentage calculation has **multiple competing baselines** that create erratic behavior:

```typescript
if (equityBaselineRef.current <= 0 && equity > 0) {
  if (gameMode === "real" && startingRealBalance > 0) {
    equityBaselineRef.current = startingRealBalance  // ✅ Correct for real mode
  } else if (gameMode === "mock" && mockStartingBalance > 0) {
    equityBaselineRef.current = mockStartingBalance  // ✅ Correct for mock mode
  } else {
    equityBaselineRef.current = equity  // ⚠️ FALLBACK: Uses current equity!
  }
}

const equityBaseline =
  gameMode === "real"
    ? startingRealBalance > 0
      ? startingRealBalance  // ✅ Real mode baseline
      : equityBaselineRef.current  // ⚠️ Fallback to ref
    : mockStartingBalance > 0
      ? mockStartingBalance  // ✅ Mock mode baseline
      : equityBaselineRef.current  // ⚠️ Fallback to ref

const equityPercent = equityBaseline > 0 ? (equity / equityBaseline) * 100 : 100
const equityHudValue = Math.round(clamp(equityPercent, 0, 999))
```

### Why It's Erratic

**Problem 1: Initialization Race Condition**

The baseline is calculated in a `useEffect` that runs EVERY time `equity` changes. On first render:

1. `startingRealBalance` might be `0` (not loaded yet from Drift)
2. Code falls back to `equityBaselineRef.current = equity`
3. This sets baseline to the **current equity** instead of **starting balance**
4. If equity = $105 at this moment, baseline becomes $105
5. Later when equity drops to $100, it calculates: `($100 / $105) * 100 = 95%` ❌

**Problem 2: Ref vs State Conflict**

The code has TWO sources of truth:
- `equityBaselineRef.current` (initialized in effect)
- `startingRealBalance` / `mockStartingBalance` (from game state)

The calculation uses **different values** depending on timing:

```typescript
// First calculation (before startingRealBalance loads):
equityBaseline = equityBaselineRef.current = equity  // Could be any value!

// Later calculations (after startingRealBalance loads):
equityBaseline = startingRealBalance  // Correct value
```

This causes the percentage to **jump** when `startingRealBalance` finally loads.

**Problem 3: Per-Trade Baseline Reset**

Line 265 resets the baseline on mode/phase changes:

```typescript
useEffect(() => {
  equityBaselineRef.current = 0
}, [gameMode, setupPhase])
```

This triggers the fallback logic **every time you start a new game**, which can grab the wrong equity value as the baseline.

---

## Concrete Example of Erratic Behavior

### Scenario: Starting Real Trading

**Timeline:**

| Time | Event | `equity` | `startingRealBalance` | `equityBaselineRef.current` | Calculated % |
|------|-------|----------|----------------------|---------------------------|--------------|
| T0 | Game starts | $0 | $0 | $0 | N/A |
| T1 | Drift initializes | $100 | $0 (not loaded) | $0 | N/A |
| T2 | First render with equity | $100 | $0 | $100 ⚠️ (fallback!) | 100% |
| T3 | Trade +$5 | $105 | $0 | $100 | 105% ✅ |
| T4 | `startingRealBalance` loads | $105 | $100 ✅ | $100 | 105% ✅ |
| T5 | Trade -$10 | $95 | $100 | $100 | 95% ✅ |

**But if timing is different:**

| Time | Event | `equity` | `startingRealBalance` | `equityBaselineRef.current` | Calculated % |
|------|-------|----------|----------------------|---------------------------|--------------|
| T0 | Game starts | $0 | $0 | $0 | N/A |
| T1 | Drift initializes | $100 | $0 (not loaded) | $0 | N/A |
| T2 | Trade +$5 (fast!) | $105 | $0 | $0 | N/A |
| T3 | **First render** | $105 | $0 | **$105** ⚠️ (wrong baseline!) | 100% |
| T4 | `startingRealBalance` loads | $105 | $100 | $105 | **105%** ❌ (should be 105% of $100) |
| T5 | Trade -$10 | $95 | $100 | $105 | **90%** ❌ (calculating from $105 instead of $100!) |

The **second scenario** causes erratic percentages because the baseline is set to $105 instead of $100.

---

## Additional Issue: Streak Baseline Confusion

Lines 493-508 have a **separate baseline for "streak" tracking**:

```typescript
const baseline = streakBaselineRef.current
const streakGainPct = baseline > 0 ? Math.round(((equity - baseline) / baseline) * 100) : 0

// Auto-reset baseline at 20% gain to start new streak
if (streakGainPct >= 20) {
  streakBaselineRef.current = equity  // ⚠️ Resets baseline mid-session!
}
```

This creates **TWO different percentage calculations**:

1. **Equity percentage** (from initial balance) - sent to HUD as `equity: equityHudValue`
2. **Streak percentage** (from rolling baseline) - sent to HUD as `streakGainPct`

If the HUD displays the **streak percentage** instead of **equity percentage**, it will reset to 0% every time you gain 20%, creating extremely erratic behavior.

### Evidence

Line 544 sends **both values** to the DOOM engine:

```typescript
iframe.contentWindow.postMessage(
  {
    type: "balance-hud-update",
    payload: {
      equity: equityHudValue,        // ← Equity percentage (0-999)
      balance: Math.round(balance * 100),
      solPrice: Math.round((lastPrice ?? 0) * 100),
      streakGainPct: Math.max(0, streakGainPct),  // ← Streak percentage (resets at +20%)
      suddenLoss,
    },
  },
  window.location.origin,
)
```

**Question:** Which value does the DOOM HUD actually display?

If it displays `streakGainPct`, the percentage will:
- Reset to 0% every time you gain 20%
- Jump erratically when trades lose money
- Not reflect total P&L from starting balance

If it displays `equity` (equityHudValue), it will still be erratic due to the baseline initialization bug.

---

## The Fix

### Part 1: Remove Lazy Initialization

**Current problematic code (lines 516-524):**

```typescript
if (equityBaselineRef.current <= 0 && equity > 0) {
  if (gameMode === "real" && startingRealBalance > 0) {
    equityBaselineRef.current = startingRealBalance
  } else if (gameMode === "mock" && mockStartingBalance > 0) {
    equityBaselineRef.current = mockStartingBalance
  } else {
    equityBaselineRef.current = equity  // ⚠️ BUG: Uses current equity as baseline
  }
}
```

**Fixed code:**

```typescript
// Initialize baseline ONLY when starting balance is available
if (equityBaselineRef.current <= 0) {
  if (gameMode === "real" && startingRealBalance > 0) {
    equityBaselineRef.current = startingRealBalance
  } else if (gameMode === "mock" && mockStartingBalance > 0) {
    equityBaselineRef.current = mockStartingBalance
  }
  // Remove fallback! If we don't have a starting balance yet, don't initialize
}
```

### Part 2: Simplify Baseline Calculation

**Current problematic code (lines 526-534):**

```typescript
const equityBaseline =
  gameMode === "real"
    ? startingRealBalance > 0
      ? startingRealBalance
      : equityBaselineRef.current
    : mockStartingBalance > 0
      ? mockStartingBalance
      : equityBaselineRef.current
```

**Fixed code:**

```typescript
// Always use game state as source of truth, fallback to ref only if unavailable
const equityBaseline =
  gameMode === "real"
    ? (startingRealBalance > 0 ? startingRealBalance : equityBaselineRef.current)
    : (mockStartingBalance > 0 ? mockStartingBalance : equityBaselineRef.current)

// Don't calculate percentage if we don't have a valid baseline yet
if (equityBaseline <= 0) {
  return  // Skip HUD update until baseline is available
}
```

### Part 3: Clarify What HUD Should Display

**Decision needed:** Should the HUD display:

**Option A: Total P&L from starting balance** (recommended)
```typescript
const equityPercent = (equity / equityBaseline) * 100
const equityHudValue = Math.round(clamp(equityPercent, 0, 999))
```
- Shows: 105% when up $5 from $100
- Shows: 95% when down $5 from $100
- Never resets mid-session

**Option B: Streak gain percentage** (current behavior)
```typescript
const streakGainPct = baseline > 0 ? Math.round(((equity - baseline) / baseline) * 100) : 0
```
- Shows: +20% after gaining $20
- Resets to 0% after each 20% gain
- More "gamified" but confusing for tracking real P&L

**Recommendation:** Use **Option A** and remove the streak system entirely, or display both separately:
- Main HUD: Total P&L percentage (from starting balance)
- Secondary display: Current streak gain percentage (optional, for gamification)

### Part 4: Better Initialization

**Add a dedicated effect to initialize baseline only once:**

```typescript
// Initialize equity baseline once when starting balance is available
useEffect(() => {
  if (equityBaselineRef.current > 0) return  // Already initialized

  if (gameMode === "real" && startingRealBalance > 0) {
    equityBaselineRef.current = startingRealBalance
    streakBaselineRef.current = startingRealBalance
    console.log(`[DoomRunner] Equity baseline initialized: $${startingRealBalance} (real)`)
  } else if (gameMode === "mock" && mockStartingBalance > 0) {
    equityBaselineRef.current = mockStartingBalance
    streakBaselineRef.current = mockStartingBalance
    console.log(`[DoomRunner] Equity baseline initialized: $${mockStartingBalance} (mock)`)
  }
}, [gameMode, startingRealBalance, mockStartingBalance])

// Reset baseline when mode changes
useEffect(() => {
  equityBaselineRef.current = 0
  streakBaselineRef.current = 0
  prevEquityRef.current = 0
  console.log('[DoomRunner] Equity baseline reset')
}, [gameMode, setupPhase])
```

---

## Complete Fixed Code

**Replace lines 489-536** with:

```typescript
// Initialize equity baseline once when starting balance is available
useEffect(() => {
  if (equityBaselineRef.current > 0) return  // Already initialized

  if (gameMode === "real" && startingRealBalance > 0) {
    equityBaselineRef.current = startingRealBalance
    streakBaselineRef.current = startingRealBalance
    console.log(`[DoomRunner] Equity baseline initialized: $${startingRealBalance} (real)`)
  } else if (gameMode === "mock" && mockStartingBalance > 0) {
    equityBaselineRef.current = mockStartingBalance
    streakBaselineRef.current = mockStartingBalance
    console.log(`[DoomRunner] Equity baseline initialized: $${mockStartingBalance} (mock)`)
  }
}, [gameMode, startingRealBalance, mockStartingBalance])

// Balance HUD update effect
useEffect(() => {
  if (!bridgeRef.current?.isReady()) return

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

  // Calculate equity as percentage of starting balance (100 = break even, 110 = +10%, 90 = -10%)
  const equityPercent = (equity / equityBaseline) * 100
  const equityHudValue = Math.round(clamp(equityPercent, 0, 999))

  // Calculate streak gain from rolling baseline
  const streakBaseline = streakBaselineRef.current > 0 ? streakBaselineRef.current : equityBaseline
  const streakGainPct = Math.round(((equity - streakBaseline) / streakBaseline) * 100)

  // Detect sudden loss (>3% equity drop since last update)
  const prevEquity = prevEquityRef.current > 0 ? prevEquityRef.current : equity
  const equityDropPct = ((prevEquity - equity) / prevEquity) * 100
  const suddenLoss = equityDropPct > 3

  // Auto-reset streak baseline at 20% gain to start new streak
  if (streakGainPct >= 20) {
    console.log(`[DoomRunner] Streak reset at +${streakGainPct}% (${equity.toFixed(2)} / ${streakBaseline.toFixed(2)})`)
    streakBaselineRef.current = equity
  }

  // Update previous equity for next sudden loss check
  prevEquityRef.current = equity

  // Convert market indicators from -1..1 or 0..1 to 0..100 range for display
  const momentum = latestFeatures ? Math.round(((latestFeatures.momentum + 1) / 2) * 100) : 50
  const breadth = latestFeatures ? Math.round(((latestFeatures.breadth + 1) / 2) * 100) : 50
  const volatility = latestFeatures ? Math.round(latestFeatures.volatility * 100) : 50
  const volume = latestFeatures ? Math.round(latestFeatures.volume * 100) : 50

  // Send Balance HUD data to iframe
  const iframe = document.querySelector('iframe[title="GZDoom Runner"]') as HTMLIFrameElement
  if (iframe?.contentWindow) {
    iframe.contentWindow.postMessage(
      {
        type: "balance-hud-update",
        payload: {
          equity: equityHudValue,  // Total P&L as percentage (100 = break even)
          balance: Math.round(balance * 100),
          solPrice: Math.round((lastPrice ?? 0) * 100),
          streakGainPct: Math.max(0, streakGainPct),  // Current streak gain
          suddenLoss,
        },
      },
      window.location.origin,
    )
    // ... rest of the postMessage code ...
  }
}, [
  equity,
  balance,
  lastPrice,
  latestFeatures,
  engineReady,
  gameMode,
  multiTimeframeSignal,
  startingRealBalance,
  mockStartingBalance,
])
```

---

## Testing Checklist

After applying the fix, verify:

### Initialization Tests
- [ ] Start real trading with $100 → HUD shows 100%
- [ ] Gain $5 → HUD shows 105%
- [ ] Lose $10 → HUD shows 95%
- [ ] Baseline NEVER changes from $100 (check console logs)

### Mode Switch Tests
- [ ] Switch from mock to real → baseline resets correctly
- [ ] Switch from real to mock → baseline resets correctly
- [ ] Baseline initializes only once per game session (check console)

### Edge Cases
- [ ] Start game before Drift loads → HUD skips updates until baseline ready
- [ ] Percentage never exceeds 999% (clamped)
- [ ] Percentage never goes below 0% (clamped)
- [ ] Streak resets at +20% but total equity percentage stays accurate

### Real Trading Tests
- [ ] Start with $100, gain $20 → equity shows 120%, streak resets to 0%
- [ ] Continue trading → equity still calculates from original $100
- [ ] Lose money → equity percentage drops from 120%, not from streak reset point

---

## Summary

**Root Cause:**
The equity baseline is initialized lazily in the render effect, which can capture the wrong equity value as the baseline if `startingRealBalance` hasn't loaded yet.

**Symptoms:**
- Percentage jumps erratically between updates
- Baseline appears to be calculated from current equity instead of starting balance
- Streak system (auto-reset at +20%) adds additional confusion

**Solution:**
1. Initialize baseline in a dedicated effect that waits for `startingRealBalance`
2. Never use current equity as fallback baseline
3. Skip HUD updates until baseline is available
4. Add console logs to verify baseline is set only once

**Impact:**
This fix ensures the equity percentage always reflects **total P&L from starting balance**, not per-trade calculations or rolling streaks.
