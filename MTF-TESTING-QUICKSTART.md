# MTF System Testing - Quick Start Guide

**Date:** 2025-11-20
**Goal:** Test the Multi-Timeframe Technical Analysis system with real trades

---

## Pre-Flight Checklist

### 1. Start Dev Server

```bash
npm run dev
```

Wait for: `✓ Ready in Xms`

---

### 2. Game Setup Screen Configuration

**Recommended settings for first test:**

```
Strategy:           Balanced ⚖️
Leverage:           20-50x (NOT 100x)
Starting Collateral: $10-20
Market:             SOL-PERP (default)
```

**Why these settings:**
- **Balanced strategy**: Filters weak MTF signals (70%+ conviction only), trades 1-2x per hour
- **20-50x leverage**: Survivable (100x = instant liquidation risk on small moves)
- **$10-20 collateral**: Enough runway for 5-10 trades before needing to restart

---

## What to Watch For

### Startup Logs (First 10 seconds)

You should see these logs in sequence:

```
[DoomRunner] Initializing data feed (mode: real)
[DoomRunner] Data source: pyth
[DoomRunner] Fetching historical data to seed candle history...
[HistoricalCandles] Fetching 3600s of SOL/USD history...
[HistoricalCandles] ✅ Built 3574 candles from historical data
[DoomRunner] ✅ Pre-populated 360 historical candles
[DoomRunner] ✅ Analysis ready immediately with historical data
[DoomRunner] ✅ Data feed polling started (1s interval)
```

**✅ If you see these:** Historical data loaded successfully, MTF ready
**❌ If you don't:** Check console for errors, may fall back to live-only data (5-15 min delay)

---

### MTF Signal Logs (Every 1-60 seconds)

#### When Systems Agree (Good - Trade Likely)

```
[MTF] ✅ AGREEMENT: Both systems want LONG (conviction: 87.5%)
[MTF] Trends: uptrend | uptrend | strong_uptrend | Aligned: true
[Filter] ✅ Trade approved (balanced strategy)
[TradingController] Position sizing: conviction=0.88, collateral=$10.00, size=$7.50
[Live] Opening LONG $7.50 @ 50x...
```

**This means:**
- Rolling Window (RW) wants long
- Multi-Timeframe (MTF) wants long
- MTF conviction 87.5% (high quality setup)
- All trends aligned (1m/5m/15m/1h/4h/1d pointing same direction)
- Balanced strategy approved (87.5% > 70% threshold)
- Position opened with $7.50 collateral (~85% of available)

---

#### When Systems Disagree (Good - Filter Working)

```
[MTF] ⚠️ DISAGREEMENT: RW wants long, MTF wants flat → FLAT
[Filter] ❌ Conviction too low: 30% < 70%
```

**This means:**
- Rolling Window sees short-term bullish candles (wants long)
- MTF sees choppy/ranging market or bearish higher timeframes (wants flat)
- Systems disagree → stays flat for safety
- This is **correct behavior** - avoiding a potentially bad trade

You should see both agreements AND disagreements. If you only see one or the other, something may be off.

---

### Trade Execution Logs

#### Position Opened

```
[Live] Opening LONG $7.50 @ 50x...
[DriftPositionManager] Opening LONG position: $7.50 collateral ($375.00 notional)
[DriftPositionManager] ✅ Position opened successfully
```

#### Position Closed (Profit)

```
[Live] Closed LONG +$2.40
[DriftPositionManager] Position closed: +$2.40 profit
[AccountState] Balance updated: $12.40 (was $10.00)
```

#### Position Closed (Loss)

```
[Live] Closed SHORT -$1.80
[DriftPositionManager] Position closed: -$1.80 loss (stop loss triggered)
[AccountState] Balance updated: $8.20 (was $10.00)
```

---

## Expected Behavior (First 30 Minutes)

### Frequency

**Balanced strategy:**
- **MTF logs**: Every 1-60 seconds (analysis runs continuously)
- **Agreements**: ~5-10 per hour (30-40% of signals)
- **Trades executed**: 1-2 per hour

**If you see:**
- ✅ 1-2 trades in first 30 minutes → **Perfect**
- ⚠️ 0 trades in 30 minutes → Market may be choppy/ranging (normal), or check logs for issues
- ❌ 5+ trades in 30 minutes → Strategy may be too aggressive (check settings)

---

### Signal Quality

**Expected conviction range:**
- Agreements: 70-90% conviction
- Disagreements: Force to 30% conviction (blocked)

**If you see:**
- ✅ Trades executing with 70-90% conviction → **Excellent**
- ⚠️ Trades executing with 50-69% conviction → Shouldn't happen with Balanced (check strategy settings)
- ❌ No MTF logs at all → MTF system not running (check for errors)

---

### Win Rate

**Target metrics (30-60 minute session):**
- Trades: 1-3 total
- Win rate: 55-65%
- Average win: $2.00-$4.00
- Average loss: -$1.50 to -$2.50
- Net P&L: Break-even to +$1.00 (considering fees)

**Remember:** Sample size is small (1-3 trades), so variance is high. Real win rate assessment needs 20+ trades.

---

## Troubleshooting

### Issue: No MTF Logs Appearing

**Possible causes:**
1. Historical data failed to load (check for error logs)
2. Not enough candles yet (need 3600+)
3. MTF code not integrated properly

**Debug:**
```typescript
// Check doom-runner-experience.tsx line 398
// Should be:
if (candleHistoryRef.current.length >= 3600 && analysisReadyRef.current) {
```

---

### Issue: All Disagreements, No Trades

**Possible causes:**
1. Market is genuinely choppy (ADX < 25 on most timeframes)
2. RW and MTF have fundamentally different views

**What to do:**
- Wait 10-20 minutes for market conditions to change
- Check if `[MTF]` logs show trend alignment (should see `Aligned: true` sometimes)
- If still no trades after 30 min, switch to **Aggressive strategy** (45% conviction threshold)

---

### Issue: Too Many Trades (5+ in 30 min)

**Possible causes:**
1. Using Aggressive strategy instead of Balanced
2. MTF minConviction too low

**What to do:**
- Verify setup screen shows "Balanced"
- Check console for `[Filter] ✅ Trade approved (balanced strategy)` (not "aggressive")
- If issue persists, MTF conviction threshold may need adjustment

---

### Issue: Instant Liquidation

**Possible causes:**
1. Using 100x leverage (too risky)
2. Position size too large relative to collateral
3. Volatile market + tight stops

**What to do:**
- Reduce leverage to 20-30x
- Increase starting collateral to $20-30
- Check stop loss multiplier in strategy settings

---

## Observing MTF Decision Making

### Good Signal Example

```
[MTF] ✅ AGREEMENT: Both systems want LONG (conviction: 87.5%)
[MTF] Trends: uptrend | uptrend | strong_uptrend | Aligned: true
```

**Why this is good:**
- High conviction (87.5%)
- Trends aligned across all timeframes
- Both systems agree (confluence)
- Strong uptrend on longer timeframes (4h/1d)

---

### Bad Signal Example (Correctly Filtered)

```
[MTF] ⚠️ DISAGREEMENT: RW wants long, MTF wants short → FLAT
```

**Why this was filtered:**
- RW sees short-term bounce (1-5 second candles)
- MTF sees bearish 1h/4h/1d trends
- Counter-trend scalp → high risk of loss
- System correctly blocks trade

---

## Interpreting Trends

From MTF logs: `Trends: uptrend | uptrend | strong_uptrend`

**Format:** `short-term | medium-term | long-term`

**Trend types:**
- `strong_uptrend`: Strong bullish momentum (ADX > 30, price > all EMAs)
- `uptrend`: Moderate bullish momentum
- `ranging`: No clear direction (ADX < 20)
- `downtrend`: Moderate bearish momentum
- `strong_downtrend`: Strong bearish momentum

**Best setups:**
- All three aligned in same direction
- Example: `uptrend | uptrend | strong_uptrend` = high-conviction long
- Example: `downtrend | strong_downtrend | downtrend` = high-conviction short

**Risky setups (should be filtered):**
- Short-term diverges from long-term
- Example: `uptrend | ranging | downtrend` = choppy, no clear direction
- Example: `strong_uptrend | downtrend | ranging` = counter-trend bounce (risky)

---

## After 30-60 Minutes of Testing

### Collect These Metrics

Track in a notepad or spreadsheet:

```
Session Duration: ______ minutes
Total Trades: ______
Wins: ______
Losses: ______
Win Rate: ______ %
Average Win: $______
Average Loss: $______
Total Fees Paid: $______
Net P&L: $______

Observations:
- MTF agreements seen: ______
- MTF disagreements seen: ______
- Conviction range: ______ to ______
- Market conditions: (trending/choppy/volatile)
```

---

### Expected Results (Balanced Strategy)

**Good session:**
```
Duration: 60 minutes
Trades: 1-2
Win Rate: 50-65%
Net P&L: -$0.50 to +$1.50 (including fees)
Observations: Mix of agreements/disagreements, conviction 70-90%
```

**Neutral session (choppy market):**
```
Duration: 60 minutes
Trades: 0-1
Win Rate: N/A or 50%
Net P&L: -$0.50 to +$0.50
Observations: Mostly disagreements (market ranging)
```

**Bad session (something wrong):**
```
Duration: 60 minutes
Trades: 5+ OR 0
Win Rate: <40% OR N/A
Net P&L: -$5.00+
Observations: Either over-trading or system not working
```

---

## What to Do After Testing

### If Session Was Good

1. Continue with Balanced strategy
2. Try longer session (2-3 hours) for better sample size
3. Potentially increase collateral if profitable

### If Too Few Trades (Choppy Market)

1. Wait for trending market conditions (monitor BTC/SOL charts)
2. OR switch to **Aggressive strategy** (45% threshold, more trades)
3. Check if `Aligned: true` ever appears (if not, trends not aligning)

### If Too Many Trades

1. Verify using **Balanced** not Aggressive
2. Check MTF conviction threshold in code (should be 0.6)
3. May need to increase minConviction in strategy settings

### If Losing Money Consistently

1. Check average hold time (should be 15-30 seconds with Balanced)
2. Verify stop losses triggering appropriately (not too tight)
3. Check fee amount per trade (should be ~$0.36 per round-trip)
4. Review MTF logs to see if signals make sense

---

## Advanced: Viewing Full MTF Analysis

If you want to see detailed indicator breakdowns, add this temporarily:

**In [doom-runner-experience.tsx](src/components/doom-runner-experience.tsx) after line 400:**

```typescript
const mtfSignal = analyzeMultiTimeframe(candleHistoryRef.current, {
  requireTrendAlignment: true,
  minConviction: 0.6
})

// Add this line to see full analysis
logMultiTimeframeAnalysis(mtfSignal)
```

**Output:**
```
================================================================================
📊 MULTI-TIMEFRAME ANALYSIS
================================================================================
🎯 Primary Signal: STRONG_LONG (Conviction: 87.5%)

📈 Trend Analysis:
  Short-term (1m-5m):  uptrend
  Medium-term (15m-1h): uptrend
  Long-term (4h-1d):   strong_uptrend
  Aligned: ✅ YES

📉 Indicators:
  RSI Overbought: ✅ NO
  RSI Oversold: ✅ NO
  MACD Bullish: 5/6 timeframes
  MACD Bearish: 1/6 timeframes
  Strong Trend: ✅ YES

🎚️  Support/Resistance:
  Supports: 138.50, 140.20, 142.10
  Resistances: 145.30, 147.80
  📍 Near Support: $142.10 (0.30% away)

⏱️  Timeframe Details:
  1m: long (uptrend, RSI:58.2, ADX:32.1)
  5m: strong_long (strong_uptrend, RSI:61.4, ADX:41.5)
  15m: strong_long (strong_uptrend, RSI:64.2, ADX:38.7)
  1h: long (uptrend, RSI:55.8, ADX:28.3)
  4h: neutral (ranging, RSI:52.1, ADX:18.2)
  1d: long (uptrend, RSI:56.9, ADX:24.1)
================================================================================
```

**Warning:** This logs every second, so it's VERY verbose. Only enable for debugging specific signals.

---

## Summary

**Your first test session should:**

1. ✅ See historical data load successfully (10 seconds)
2. ✅ See MTF analysis running (logs every 1-60 seconds)
3. ✅ See mix of agreements and disagreements
4. ✅ Execute 1-2 high-conviction trades (70-90%)
5. ✅ Run for 30-60 minutes minimum
6. ✅ Track metrics for evaluation

**Configuration to use:**
- Strategy: **Balanced**
- Leverage: **20-50x**
- Collateral: **$10-20**

**Success criteria:**
- System is working: MTF logs appearing, trades executing with high conviction
- Can evaluate performance: At least 1-2 trades executed
- Ready for next phase: If profitable/break-even, continue testing; if losing, analyze logs

---

## Ready to Start?

1. `npm run dev`
2. Open browser to localhost:3000
3. Select **Balanced** strategy, 20-50x leverage, $10-20 collateral
4. Start game
5. Watch console logs
6. Track your session metrics

**Good luck!** The MTF system is designed to filter low-quality setups and only trade high-conviction confluences. You should see far fewer trades than before, but much higher quality signals.

---

**Files to Reference:**
- Full strategy comparison: [STRATEGY-SELECTION-GUIDE.md](STRATEGY-SELECTION-GUIDE.md)
- MTF integration details: [MTF-INTEGRATION-COMPLETE.md](MTF-INTEGRATION-COMPLETE.md)
- Historical data feature: [HISTORICAL-DATA-FEATURE.md](HISTORICAL-DATA-FEATURE.md)
- Technical indicators: [MULTI-TIMEFRAME-TECHNICAL-ANALYSIS.md](MULTI-TIMEFRAME-TECHNICAL-ANALYSIS.md)
