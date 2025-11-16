# Trading Strategy Modes - User Guide

Balance now offers three trading strategies to match your risk appetite and market conditions. Choose the strategy that fits your trading style!

---

## 🔴 Aggressive Mode
**"Trade every signal • More action • Higher fees"**

### Best For:
- Maximum action and engagement
- Strong trending markets
- Players who want frequent trades
- Learning and experimentation

### How It Works:
- **Trades**: ~8 per minute
- **Conviction threshold**: 40% (trades almost every signal)
- **Hold time**: 2 seconds minimum
- **Position sizing**: Fixed (no dynamic scaling)
- **Profit target**: Close when profit > 0.5× fees
- **Stop loss**: 3× fees

### Pros:
✅ Most responsive to market changes
✅ High engagement - always in action
✅ Good for volatile, choppy markets
✅ Lower win rate needed (~35%)

### Cons:
❌ Highest fee burden (~$0.40-0.60 per session)
❌ More whipsaw trades
❌ Can overtrade in ranging markets
❌ 65% of balance goes to fees on $1

### Expected Performance:
```
Trades: 100+/session
Volume: $1,000+
Fees: $0.50+
Breakeven win rate: 60%
```

---

## ⚪ Balanced Mode (Recommended)
**"Filter weak signals • Good risk/reward • Moderate fees"**

### Best For:
- Most players - best all-around strategy
- Mixed market conditions
- Good balance of action and profitability
- Learning profitable trading habits

### How It Works:
- **Trades**: ~3 per minute
- **Conviction threshold**: 60% (only decent setups)
- **Hold time**: 5 seconds minimum
- **Position sizing**: Dynamic (scales with conviction)
- **Profit target**: Close when profit > 1.5× fees
- **Stop loss**: 2× fees

### Pros:
✅ Best risk/reward balance
✅ Filters out noise, keeps good signals
✅ Dynamic sizing maximizes good setups
✅ Moderate fees (~$0.15-0.25 per session)

### Cons:
❌ Less action than Aggressive
❌ Requires some signal quality
❌ May miss quick reversals

### Expected Performance:
```
Trades: 30-50/session
Volume: $300-500
Fees: $0.15-0.25
Breakeven win rate: 45%
```

---

## 🟢 High Conviction Mode
**"Only best setups • Low fees • Needs strong signals"**

### Best For:
- Strong trending markets
- Advanced players
- Maximizing profit per trade
- Minimum fee overhead

### How It Works:
- **Trades**: ~1 per minute (or less)
- **Conviction threshold**: 75% (only very clear signals)
- **Hold time**: 10 seconds minimum
- **Position sizing**: Dynamic (heavily scaled with conviction)
- **Profit target**: Close when profit > 2× fees (let winners run)
- **Stop loss**: 1.5× fees (tight)

### Pros:
✅ Lowest fee burden (~$0.10-0.15 per session)
✅ Best for strong trends
✅ Maximum position sizing on best setups
✅ Highest profit per trade potential

### Cons:
❌ Least action - may feel slow
❌ Needs clear market direction
❌ Can miss opportunities in choppy markets
❌ Boring in ranging markets

### Expected Performance:
```
Trades: 10-20/session
Volume: $150-250
Fees: $0.10-0.15
Breakeven win rate: 40%
```

---

## Strategy Comparison

| Metric | Aggressive | Balanced | High Conviction |
|--------|-----------|----------|-----------------|
| **Trades/min** | ~8 | ~3 | ~1 |
| **Min conviction** | 40% | 60% | 75% |
| **Hold time** | 2s | 5s | 10s |
| **Dynamic sizing** | ❌ | ✅ | ✅ |
| **Fee burden** | High | Medium | Low |
| **Win rate needed** | 60% | 45% | 40% |
| **Best market** | Volatile | Mixed | Trending |
| **Engagement** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **Profitability** | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

---

## How to Choose

### Start with Balanced
Most players should start with **Balanced** mode. It offers:
- Good action without overtrading
- Fee-efficient operation
- Dynamic sizing for better returns
- Works in most market conditions

### Switch to Aggressive when:
- Market is very volatile/choppy
- You want maximum engagement
- You're learning and experimenting
- You enjoy frequent trading action

### Switch to High Conviction when:
- Market is in a strong trend
- You want to minimize fees
- You prefer quality over quantity
- Your balance is growing and you want efficiency

---

## Technical Details

### Conviction Calculation
Market conviction is calculated from:
- Directional clarity (40%): How clear is the trend?
- Volume confirmation (30%): Is volume supporting the move?
- Stability factor (20%): Low volatility = higher conviction
- Candle quality (10%): Strong bodies vs wicks

### Position Sizing (Dynamic Strategies)
```
Min size = Base × 0.5 (50%)
Max size = Base × 1.5 (150%)

Scale = (conviction - threshold) / (1.0 - threshold)
Position = Min + (Max - Min) × Scale
```

**Example with $10 base, Balanced strategy:**
- 60% conviction (threshold) → $5 position
- 75% conviction → $10 position
- 90% conviction → $15 position

### Fee Awareness
The strategy automatically prevents unprofitable trades:
- Won't close winners if profit < threshold × fees
- Stops losses before they compound
- Considers round-trip costs (open + close)

---

## Tips for Each Strategy

### Aggressive Tips:
- Use in volatile markets for best results
- Watch for overtrading in ranges
- Consider reducing leverage to 5-10x
- Focus on quick scalps, not swing trades

### Balanced Tips:
- Let the dynamic sizing work for you
- Trust the conviction filter
- Works well with 10-15x leverage
- Best all-around performance

### High Conviction Tips:
- Be patient - wait for clear setups
- Use maximum leverage (20x) on best signals
- Perfect for strong trend days
- Don't force trades when conviction is low

---

## Monitoring Your Strategy

Check the trading metrics to see how your strategy is performing:
- **Total trades**: How active is the strategy?
- **Filtered trades**: How many signals were rejected?
- **Total volume**: Dollar volume traded
- **Estimated fees**: Cost of trading
- **Avg hold time**: How long positions last

Adjust your strategy based on market conditions and your results!

---

## Summary

| If you want... | Choose |
|----------------|---------|
| Maximum action | Aggressive |
| Best balance | Balanced ⭐ |
| Lowest fees | High Conviction |
| Learning | Balanced or Aggressive |
| Profitability | Balanced or High Conviction |

**Default recommendation: Balanced** - It's optimized for most players and market conditions.
