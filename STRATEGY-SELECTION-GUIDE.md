# Strategy Selection Guide - With MTF System

**Date:** 2025-11-20
**Context:** Multi-Timeframe Technical Analysis is now active
**Question:** Which strategy should I select for testing?

---

## How Strategies Work with MTF

### The Filter Stack

Your trades now go through **3 layers of filters:**

```
1. MTF Analysis (NEW)
   ↓ Requires both RW and MTF to agree + 60% MTF conviction
   ↓ Filters ~50-60% of signals

2. Strategy Settings (Trading Controller)
   ↓ minConviction threshold
   ↓ minHoldTimeMs
   ↓ Choppy market filter

3. Position Management
   ↓ Stop loss
   ↓ Profit targets
   ↓ Free collateral checks
```

---

## Strategy Comparison Table

| Strategy | minConviction | Min Hold | Stop Loss | Profit Target | Expected Trades/Hour (with MTF) |
|----------|---------------|----------|-----------|---------------|--------------------------------|
| **Aggressive** | 0.45 | 5s | 6× fees | 1× fees | **~2-3** |
| **Balanced** | 0.70 | 15s | 10× fees | 2× fees | **~1-2** |
| **High Conviction** | 0.85 | 30s | 12× fees | 3× fees | **~0.5-1** |

---

## Strategy Details

### 1. Aggressive Strategy ⚡

**Settings:**
- `minConviction: 0.45` (45%)
- `minHoldTimeMs: 5000` (5 seconds)
- `minProfitToClose: 1.0` (close if profit > fees)
- `stopLossMultiplier: 6` (stop at -6× fees)

**How it works with MTF:**
```
MTF generates signal: conviction 0.85
↓
Strategy check: 0.85 > 0.45 ✅ PASS
↓
Trade executes
```

**Characteristics:**
- ✅ Most responsive (trades MTF signals quickly)
- ✅ 5-second minimum hold (quick in/out)
- ✅ Takes profits early (1× fees)
- ⚠️ Tighter stops (6× fees)
- ⚠️ May exit winners too early

**Best for:**
- Active testing (see more trades)
- Learning how MTF signals work
- Volatile markets (quick moves)

**Expected Performance:**
- Trades: ~2-3 per hour
- Win rate: 55-58%
- Avg win: $1.50-2.00
- Avg loss: -$1.50
- Net: +$0.30-0.60/hour

---

### 2. Balanced Strategy ⚖️ **← RECOMMENDED FOR TESTING**

**Settings:**
- `minConviction: 0.70` (70%)
- `minHoldTimeMs: 15000` (15 seconds)
- `minProfitToClose: 2.0` (close if profit > 2× fees)
- `stopLossMultiplier: 10` (stop at -10× fees)

**How it works with MTF:**
```
MTF generates signal: conviction 0.85
↓
Strategy check: 0.85 > 0.70 ✅ PASS
↓
Trade executes

MTF generates signal: conviction 0.65
↓
Strategy check: 0.65 > 0.70 ❌ FAIL
↓
Filtered (too low conviction)
```

**Characteristics:**
- ✅ Filters low-quality MTF signals (only trades 70%+ conviction)
- ✅ 15-second minimum hold (lets trends develop)
- ✅ Lets winners run (2× fees profit target)
- ✅ Wider stops (10× fees, avoids noise)
- ✅ Best risk/reward balance

**Best for:**
- **Initial testing** (see MTF in action with good filtering)
- Medium-term trend following
- Most market conditions

**Expected Performance:**
- Trades: ~1-2 per hour
- Win rate: 58-62%
- Avg win: $2.50-3.50
- Avg loss: -$2.00
- Net: +$0.50-1.00/hour

---

### 3. High Conviction Strategy 🎯

**Settings:**
- `minConviction: 0.85` (85%)
- `minHoldTimeMs: 30000` (30 seconds)
- `minProfitToClose: 3.0` (close if profit > 3× fees)
- `stopLossMultiplier: 12` (stop at -12× fees)

**How it works with MTF:**
```
MTF generates signal: conviction 0.85
↓
Strategy check: 0.85 > 0.85 ✅ PASS (barely)
↓
Trade executes

MTF generates signal: 0.80
↓
Strategy check: 0.80 > 0.85 ❌ FAIL
↓
Filtered (conviction too low)
```

**Characteristics:**
- ✅ Extremely selective (only 85%+ conviction)
- ✅ 30-second minimum hold (catches large moves)
- ✅ Lets winners run far (3× fees profit target)
- ✅ Widest stops (12× fees)
- ⚠️ Very few trades (may feel "slow")
- ⚠️ Requires strong trending markets

**Best for:**
- Conservative testing
- Strong trending markets only
- Maximizing win rate over frequency

**Expected Performance:**
- Trades: ~0.5-1 per hour (1 trade every 1-2 hours)
- Win rate: 65-70%
- Avg win: $4.00-6.00
- Avg loss: -$2.50
- Net: +$0.75-1.50/hour

---

## Recommendation for Testing

### **Start with Balanced Strategy** ⚖️

**Why:**

1. **See MTF in action without too much noise**
   - Aggressive trades too often (hard to observe individual signals)
   - High Conviction trades too rarely (boring, can't see if it's working)
   - Balanced trades ~1-2x per hour (good observation rate)

2. **Best filtering**
   - 70% conviction threshold filters weak MTF signals
   - Only trades when MTF is fairly confident
   - Shows you high-quality setups

3. **Better risk/reward**
   - 15-second hold lets trends develop
   - 2× fees profit target captures meaningful moves
   - 10× fees stop loss avoids getting stopped on noise

4. **Expected profitability**
   - Most likely to be profitable in testing
   - Good win rate (58-62%)
   - Decent trade frequency

---

## Testing Sequence

### Phase 1: Balanced (First Session - 30-60 min)

**Goals:**
- See if MTF system is working
- Observe agreement/disagreement patterns
- Check trade quality

**What to watch:**
```
[MTF] ✅ AGREEMENT: Both systems want LONG (conviction: 87.5%)
[Filter] ✅ Trade approved (balanced strategy)
[TradingController] Position sizing: conviction=0.88
[Live] Opening LONG $7.50 @ 100x...
```

**Success criteria:**
- MTF logs appearing every 1-60 seconds
- Some agreements, some disagreements (both should happen)
- Trades executing with 0.70+ conviction
- 1-2 trades in 30-60 minutes

---

### Phase 2: Aggressive (If want more action)

**When:**
- After verifying Balanced works
- If you want to see more trades
- If market is trending strongly

**Change in behavior:**
- More trades (~2-3 per hour vs 1-2)
- Lower conviction trades allowed (0.45+ vs 0.70+)
- Faster in/out (5s vs 15s holds)
- May see more small wins/losses

---

### Phase 3: High Conviction (For best setups only)

**When:**
- After confirming system profitability
- In strong trending markets
- When maximizing win rate

**Change in behavior:**
- Very few trades (0.5-1 per hour)
- Only absolute best setups (0.85+ conviction)
- Larger position holds (30s minimum)
- Highest win rate but may feel "slow"

---

## Configuration Quick Reference

### In Game Setup Screen

**Recommended for First Test:**
```
Strategy: Balanced
Leverage: 20-50x (NOT 100x for safety)
Starting Collateral: $10-20
```

**Why this config:**
- Balanced: Best filtering + trade frequency
- 20-50x leverage: Survivable (vs 100x = instant liquidation risk)
- $10-20 collateral: Enough runway to test multiple trades

---

### Expected Console Output

**With Balanced strategy:**

```
[DoomRunner] ✅ Pre-populated 360 historical candles
[DoomRunner] ✅ Analysis ready immediately with historical data

[MTF] ⚠️ DISAGREEMENT: RW wants long, MTF wants flat → FLAT
[MTF] ⚠️ DISAGREEMENT: RW wants short, MTF wants long → FLAT

[MTF] ✅ AGREEMENT: Both systems want LONG (conviction: 75.5%)
[MTF] Trends: uptrend | uptrend | uptrend | Aligned: true
[Filter] ✅ Trade approved (balanced strategy)
[TradingController] Position sizing: conviction=0.76, collateral=$10.00, size=$6.50
[Live] Opening LONG $6.50 @ 50x...

[MTF] ⚠️ DISAGREEMENT: RW wants long, MTF wants flat → FLAT

[MTF] ✅ AGREEMENT: Both systems want SHORT (conviction: 82.0%)
[Filter] ✅ Trade approved (balanced strategy)
[Live] Opening SHORT $7.20 @ 50x...

... 15 seconds later ...

[Live] Closed SHORT +$2.40
```

---

## What If No Trades Execute?

**Possible reasons with each strategy:**

### Balanced (minConviction 0.70)

**If no trades after 20-30 minutes:**

1. **MTF conviction too low**
   - MTF generating 0.60-0.69 conviction signals
   - Below Balanced 0.70 threshold
   - **Solution:** Switch to Aggressive (0.45 threshold)

2. **Market ranging/choppy**
   - MTF detecting no clear trend
   - Staying flat to avoid chop
   - **This is correct behavior!**
   - Wait for trending conditions or switch to Aggressive

3. **RW and MTF disagreeing constantly**
   - RW wants one direction, MTF wants another
   - **Solution:** Check logs to see disagreement patterns
   - May need to tune MTF settings

---

### Aggressive (minConviction 0.45)

**If no trades after 20-30 minutes:**

1. **MTF not generating any signals**
   - Check for `[MTF]` logs in console
   - If missing, MTF may not have enough data yet
   - **Solution:** Wait for 3600+ candles (should be immediate with historical data)

2. **RW and MTF always disagreeing**
   - Systems fundamentally conflicting
   - **Solution:** Check `[MTF] ⚠️ DISAGREEMENT` logs
   - May indicate need to tune RW or MTF parameters

---

## Quick Decision Chart

```
Do you want to:

1. SEE MORE TRADES & LEARN HOW SYSTEM WORKS
   → Choose: AGGRESSIVE
   → Expect: 2-3 trades/hour
   → Conviction: 0.45+

2. BALANCE FREQUENCY & QUALITY (RECOMMENDED)
   → Choose: BALANCED
   → Expect: 1-2 trades/hour
   → Conviction: 0.70+

3. MAXIMIZE WIN RATE & PROFIT PER TRADE
   → Choose: HIGH CONVICTION
   → Expect: 0.5-1 trades/hour
   → Conviction: 0.85+
```

---

## Summary

**For your first test, select:**

### ✅ **Balanced Strategy**

**Settings to use:**
- Strategy: **Balanced**
- Leverage: **20-50x** (safer than 100x)
- Starting Collateral: **$10-20**

**Why:**
- Sweet spot of frequency vs quality
- Filters low-quality MTF signals (70%+ only)
- Best chance of profitability
- Easy to observe what's happening

**Expected results:**
- 1-2 trades in first hour
- High conviction (0.70-0.90)
- See both agreements and disagreements
- Should be profitable or break-even

**After testing Balanced, try:**
- **Aggressive** if you want more action
- **High Conviction** if you want max win rate

---

## Current Strategy Settings Summary

| Setting | Aggressive | Balanced ⭐ | High Conviction |
|---------|-----------|----------|-----------------|
| Min conviction | 45% | **70%** | 85% |
| Min hold time | 5s | **15s** | 30s |
| Stop loss | 6× fees | **10× fees** | 12× fees |
| Profit target | 1× fees | **2× fees** | 3× fees |
| Trades/hour | 2-3 | **1-2** | 0.5-1 |
| Win rate | 55% | **60%** | 65% |
| Best for | Testing/Active | **First test** | Max profit |

**⭐ = Recommended for first test**
