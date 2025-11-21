# Chart Library Research for Trading Dashboard

**Date:** 2025-11-21
**Purpose:** Find the best charting library for live crypto trading with user drawing tools and TA automation

---

## Requirements

### Must Have (MVP)
- [x] Real-time candlestick charts
- [x] React compatibility
- [x] Good performance (handle 1000+ candles at 60fps)
- [x] Free/open source
- [x] Active maintenance

### Nice to Have (Future)
- [ ] Built-in drawing tools (trendlines, Fibonacci, channels)
- [ ] User-drawn TA lines/shapes
- [ ] Built-in technical indicators (RSI, MACD, etc.)
- [ ] Auto-pattern detection (triangles, head & shoulders)
- [ ] Multi-timeframe support

---

## Library Comparison

### 1. TradingView Lightweight Charts ⭐ RECOMMENDED FOR MVP

**Overview:**
- Free, open-source (Apache 2.0 license)
- 45 KB bundle size
- Built by TradingView
- 7.8k+ GitHub stars

**Pros:**
- ✅ Extremely lightweight and performant
- ✅ Excellent React integration (official tutorials)
- ✅ Beautiful default styling
- ✅ Active maintenance (latest v5.0 with pane support)
- ✅ Supports candlesticks, area, line, histogram charts
- ✅ Great documentation
- ✅ Free for commercial use with attribution

**Cons:**
- ❌ No built-in drawing tools
- ❌ No built-in technical indicators
- ❌ Limited to basic chart types
- ❌ User must build own TA features

**Workarounds:**
- Use plugin system for custom primitives
- Community project: `lightweight-charts-line-tools` (20+ drawing tools, but on old v3.8)
- Build custom overlays for SR levels, Bollinger Bands (we already have the math!)

**Best For:** MVP - Get charts working fast, then extend with plugins

**Links:**
- GitHub: https://github.com/tradingview/lightweight-charts
- Docs: https://tradingview.github.io/lightweight-charts/
- React Tutorial: https://tradingview.github.io/lightweight-charts/tutorials/react/simple
- Community Drawing Tools: https://github.com/difurious/lightweight-charts-line-tools

---

### 2. TradingView Advanced Charts (Charting Library)

**Overview:**
- Free for qualifying projects (requires license agreement)
- Full TradingView experience
- 100+ indicators, 70+ drawing tools

**Pros:**
- ✅ Professional-grade features
- ✅ Built-in drawing tools (Fibonacci, channels, trendlines)
- ✅ 100+ technical indicators
- ✅ Custom indicators in JavaScript
- ✅ User can draw own TA lines
- ✅ Multi-timeframe support

**Cons:**
- ❌ Requires license agreement (even though free)
- ❌ Larger bundle size
- ❌ More complex integration
- ❌ Must contact TradingView for access
- ❌ More restrictive licensing

**Best For:** Production v2 - When we need full TA features

**Links:**
- Info: https://www.tradingview.com/charting-library-docs/latest/
- Comparison: https://www.tradingview.com/charting-library-docs/latest/getting_started/product-comparison/

---

### 3. DXcharts Lite

**Overview:**
- Free, open-source (MPL-2.0 license)
- Modern white-label library
- Claims 100+ indicators, 48 drawing tools

**Pros:**
- ✅ Free and open source
- ✅ Active maintenance (v2.7.21 released Nov 21, 2025)
- ✅ TypeScript support
- ✅ Multiple chart types
- ✅ Claims extensive drawing tools

**Cons:**
- ❌ Documentation lacks detail on drawing tools
- ❌ No explicit React support
- ❌ Less popular (smaller community)
- ❌ Harder to evaluate features without trying it
- ❌ 2,341 commits vs 7,000+ for lightweight-charts

**Best For:** Alternative if lightweight-charts doesn't work out

**Links:**
- GitHub: https://github.com/devexperts/dxcharts-lite
- Website: https://dxcharts.devexperts.com/

---

### 4. LightningChart JS Trader

**Overview:**
- Commercial license ($4,900+ per year)
- 100+ indicators, 30+ drawing tools
- High-performance rendering

**Pros:**
- ✅ Professional trading features
- ✅ Extensive drawing tools
- ✅ 100+ technical indicators
- ✅ Exceptional performance
- ✅ 30-day free trial

**Cons:**
- ❌ Expensive ($4,900/year minimum)
- ❌ Not open source
- ❌ Overkill for our use case

**Best For:** Enterprise clients with budget

**Links:**
- Website: https://lightningchart.com/js-charts/trader/

---

### 5. Chart.js

**Overview:**
- Most popular general-purpose charting library
- Open source, very lightweight

**Pros:**
- ✅ Free and open source
- ✅ Excellent documentation
- ✅ Large community
- ✅ React wrapper available

**Cons:**
- ❌ General-purpose, not finance-specific
- ❌ No candlestick support out of box
- ❌ No drawing tools
- ❌ No technical indicators
- ❌ Would require extensive customization

**Best For:** Not suitable for our use case

---

## Recommendation: Phased Approach

### Phase 1: MVP - Lightweight Charts + Custom Overlays ⭐

**Library:** TradingView Lightweight Charts v5.0

**Strategy:**
1. Use lightweight-charts for base candlestick rendering
2. Build custom overlays using plugin system for:
   - Support/Resistance levels (we already have `findSupportResistanceLevels()`)
   - Bollinger Bands (we already have `bollingerBands()`)
   - Moving averages (we already have `ema()`, `sma()`)
3. Display indicators in separate panel (carousel) rather than on chart
4. Skip user drawing tools for MVP

**Rationale:**
- Fastest time to market
- We already have the TA math implemented
- Just need to visualize what we've already calculated
- Can add drawing tools later via plugins or upgrade to Advanced Charts

**Timeline:** 1-2 weeks for working chart overlay

---

### Phase 2: Add Drawing Tools (Future)

**Option A:** Extend lightweight-charts with custom plugins
- Fork/update `lightweight-charts-line-tools` to v5.0
- Build our own drawing primitives
- Full control but more work

**Option B:** Upgrade to TradingView Advanced Charts
- Contact TradingView for license
- Get 70+ drawing tools out of box
- More restrictive licensing

**Option C:** Try DXcharts Lite
- Evaluate if drawing tools work as advertised
- Fall back to Option A/B if disappointing

**Recommendation:** Start with Option A (custom plugins), evaluate Option B/C later

---

## Technical Implementation Plan

### Step 1: Install & Setup (Day 1)
```bash
npm install lightweight-charts
```

### Step 2: Create Chart Component (Day 1-2)
```typescript
// src/components/dashboard/chart-panel.tsx
import { createChart } from 'lightweight-charts'
import { useEffect, useRef } from 'react'

export function ChartPanel() {
  const chartContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!chartContainerRef.current) return

    const chart = createChart(chartContainerRef.current, {
      layout: { background: { color: 'transparent' }, textColor: '#DDD' },
      width: 800,
      height: 400,
      // ... config
    })

    const candlestickSeries = chart.addCandlestickSeries()

    // Subscribe to our existing candle data stream
    // useGameState.subscribe(state => state.candleHistory)

    return () => chart.remove()
  }, [])

  return (
    <div className="absolute top-20 left-20 w-[800px] h-[400px] bg-black/80 rounded-lg">
      <div ref={chartContainerRef} />
    </div>
  )
}
```

### Step 3: Connect to Existing Data Pipeline (Day 2-3)
- Subscribe to `useGameState` candle history
- Format candles for lightweight-charts: `{ time, open, high, low, close }`
- Update chart in real-time as new candles arrive

### Step 4: Add Custom Overlays (Day 3-5)
- Create price line primitives for support/resistance
- Add Bollinger Band series
- Add EMA series (20, 50, 200)

### Step 5: Styling & Positioning (Day 5-7)
- Semi-transparent background
- Position over DOOM game
- Responsive sizing
- Toggle visibility (press `C` key)

---

## Code Examples from Research

### Basic React Integration
```typescript
import { createChart, ColorType } from 'lightweight-charts'
import { useEffect, useRef } from 'react'

export const ChartComponent = (props) => {
  const {
    data,
    colors: {
      backgroundColor = 'white',
      lineColor = '#2962FF',
      textColor = 'black',
      areaTopColor = '#2962FF',
      areaBottomColor = 'rgba(41, 98, 255, 0.28)',
    } = {},
  } = props

  const chartContainerRef = useRef()

  useEffect(() => {
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: backgroundColor },
        textColor,
      },
      width: chartContainerRef.current.clientWidth,
      height: 300,
    })
    chart.timeScale().fitContent()

    const newSeries = chart.addAreaSeries({
      lineColor,
      topColor: areaTopColor,
      bottomColor: areaBottomColor
    })
    newSeries.setData(data)

    return () => chart.remove()
  }, [data, backgroundColor, lineColor, textColor, areaTopColor, areaBottomColor])

  return <div ref={chartContainerRef} />
}
```

### Adding Support/Resistance Lines (Custom Primitive)
```typescript
// Create price line for support level
const supportLine = candlestickSeries.createPriceLine({
  price: 104.50,
  color: '#26a69a',
  lineWidth: 2,
  lineStyle: 2, // Dashed
  axisLabelVisible: true,
  title: 'Support',
})
```

---

## Decision Matrix

| Criteria | Lightweight Charts | Advanced Charts | DXcharts Lite | LightningChart |
|----------|-------------------|-----------------|---------------|----------------|
| **Cost** | Free | Free (w/ license) | Free | $4,900/yr |
| **License** | Apache 2.0 | Restrictive | MPL-2.0 | Commercial |
| **Bundle Size** | 45 KB ⭐ | ~500 KB | Unknown | Large |
| **Drawing Tools** | No (plugin) | Yes (70+) ⭐ | Yes (48) | Yes (30+) |
| **Indicators** | No | Yes (100+) ⭐ | Yes (100+) | Yes (100+) |
| **React Support** | Yes ⭐ | Yes | No docs | Yes |
| **Maintenance** | Active ⭐ | Active | Active | Active |
| **Community** | Large ⭐ | Large | Small | Medium |
| **Documentation** | Excellent ⭐ | Excellent | Limited | Good |
| **Time to MVP** | Fast ⭐ | Medium | Medium | Slow |

**Winner for MVP:** TradingView Lightweight Charts

---

## Next Steps

### Immediate Actions
1. ✅ Research complete
2. [ ] Install `lightweight-charts` package
3. [ ] Create basic `ChartPanel` component
4. [ ] Connect to existing candle data stream
5. [ ] Add semi-transparent overlay positioning

### Week 1 Goals
- [ ] Live candlestick chart working
- [ ] Overlaid on DOOM game
- [ ] Toggle visibility with keyboard shortcut
- [ ] Responsive sizing

### Week 2 Goals
- [ ] Add support/resistance overlays
- [ ] Add Bollinger Bands
- [ ] Add volume bars
- [ ] Polish styling

### Future Considerations
- Evaluate TradingView Advanced Charts for drawing tools
- Consider building custom drawing plugin
- Test DXcharts Lite as alternative

---

## Resources

### Documentation
- Lightweight Charts Docs: https://tradingview.github.io/lightweight-charts/
- React Tutorial: https://tradingview.github.io/lightweight-charts/tutorials/react/simple
- Plugin System: https://tradingview.github.io/lightweight-charts/docs/plugins/intro
- API Reference: https://tradingview.github.io/lightweight-charts/docs/api

### Community
- GitHub Issues: https://github.com/tradingview/lightweight-charts/issues
- Discussions: https://github.com/tradingview/lightweight-charts/discussions
- Stack Overflow: `[lightweight-charts]` tag

### Examples
- Codesandbox Examples: https://codesandbox.io/examples/package/lightweight-charts
- React Integration: https://github.com/tradingview/lightweight-charts/tree/master/plugin-examples/react-integration

---

## Conclusion

**For MVP:** Use TradingView Lightweight Charts with custom overlays for support/resistance and indicators. We already have all the TA math implemented - we just need to visualize it.

**For Future:** Upgrade to TradingView Advanced Charts when we need user drawing tools, or build custom drawing plugins if we want more control.

**Timeline:** 1-2 weeks to working chart overlay, then iterate on features.

---

**End of Research Document**
