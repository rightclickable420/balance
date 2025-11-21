# Trading Dashboard Plan

**Date:** 2025-11-21
**Status:** Planning Phase
**Goal:** Pivot from automated trading bot to visual trading dashboard with DOOM game integration

---

## Executive Summary

Transform the current automated trading system into an **intelligent trading dashboard** that combines:
- Real-time technical analysis visualization
- Multi-timeframe indicator displays
- Live sentiment feeds from X (Twitter)
- Entertaining DOOM game backdrop

**Core Philosophy:** Manual trading with AI-powered insights, not automated execution.

---

## Current Assets (Already Built)

### ✅ Technical Analysis Engine
- **Multi-timeframe analysis** ([multi-timeframe-analysis.ts](src/lib/trading/multi-timeframe-analysis.ts))
  - Analyzes 6 timeframes: 1m, 5m, 15m, 1h, 4h, 1d
  - Detects trend direction and alignment across timeframes
  - Identifies support/resistance levels
  - Calculates conviction scores (0-1)

- **Technical Indicators Library** ([technical-indicators.ts](src/lib/trading/technical-indicators.ts))
  - Moving Averages: SMA, EMA (20, 50, 200 periods)
  - Momentum: RSI, Stochastic, MACD
  - Volatility: ATR, Bollinger Bands
  - Trend: ADX, Parabolic SAR
  - Volume: OBV, VWAP
  - Pattern Recognition: Support/Resistance detection, Pivot Points

### ✅ Real-Time Data Pipeline
- 1-second candle streaming from Pyth oracle
- Rolling window aggregation (5s, 30s, 60s, 300s)
- Historical candle storage (last 360 1s candles = 6 minutes)
- Feature extraction for market conviction

### ✅ DOOM Game Integration
- Working game engine with transparent overlays
- Real-time HUD system
- Message passing between React and game canvas
- Lane targeting system (could repurpose for trend visualization)

### ✅ UI Components
- Game setup screen
- Mock/real trading modes
- Wallet connection
- Balance/equity displays

---

## Dashboard Vision

### Three Core Panels

#### 1. **Primary Chart Panel** (Large, Semi-Transparent)
TradingView-style chart overlaid on DOOM game:
- Candlestick chart (1m, 5m, 15m timeframe selector)
- Auto-drawn support/resistance levels
- Trend lines and channels
- Bollinger Bands overlay
- Volume bars at bottom
- Price scale on right edge

**Visual Elements:**
- Support levels: Green dashed lines
- Resistance levels: Red dashed lines
- Current price: Yellow crosshair
- Bullish candles: Green
- Bearish candles: Red
- Volume: Gradient bars (green/red)

#### 2. **Indicator Carousel Panel** (Medium, Bottom-Right)
Rotating display of secondary indicators (10s per rotation):
- **RSI Card**: Gauge with overbought (70) / oversold (30) zones
- **MACD Card**: Histogram bars + signal line crossovers
- **ADX Card**: Trend strength meter (0-100)
- **Bollinger Bands Card**: Bandwidth % + price position
- **Volume Profile Card**: Volume distribution chart
- **Support/Resistance Card**: Distance to nearest levels

**UI Pattern:**
```
┌──────────────────────────┐
│  RSI: 67.3              │
│  ▓▓▓▓▓▓▓░░░ 🔥          │
│  Approaching Overbought  │
└──────────────────────────┘
```

#### 3. **Sentiment Feed Panel** (Small, Top-Right)
Live crypto sentiment updates:
- X (Twitter) trending topics
- Market sentiment score (bullish/bearish/neutral)
- Notable mentions (whales, influencers)
- On-chain activity alerts
- Exchange flow data

**UI Pattern (Popup Notifications):**
```
┌──────────────────────────┐
│ 🟢 BULLISH SENTIMENT     │
│ SOL +15% mentions (1h)   │
│ @cryptowhale: "Breakout" │
│ 2 min ago                │
└──────────────────────────┘
```

---

## Technical Architecture

### Component Structure

```
src/
├── components/
│   ├── dashboard/
│   │   ├── chart-panel.tsx           # Main price chart
│   │   ├── indicator-carousel.tsx    # Rotating indicators
│   │   ├── sentiment-feed.tsx        # X sentiment stream
│   │   ├── chart-overlays.tsx        # Support/resistance lines
│   │   └── timeframe-selector.tsx    # 1m/5m/15m/1h buttons
│   ├── doom-runner-experience.tsx    # (existing) Game backdrop
│   └── dashboard-container.tsx       # Main layout orchestrator
├── lib/
│   ├── trading/
│   │   ├── multi-timeframe-analysis.ts  # (existing)
│   │   ├── technical-indicators.ts      # (existing)
│   │   └── chart-generator.ts           # NEW: Chart data formatting
│   ├── sentiment/
│   │   ├── x-client.ts                  # NEW: Twitter API client
│   │   ├── sentiment-analyzer.ts        # NEW: Sentiment scoring
│   │   └── crypto-mentions.ts           # NEW: Track crypto mentions
│   └── visualization/
│       ├── candlestick-renderer.tsx     # NEW: Canvas-based chart
│       ├── indicator-cards.tsx          # NEW: Indicator UI components
│       └── support-resistance-overlay.tsx # NEW: SR level rendering
```

### Data Flow

```
Pyth Oracle (1s candles)
    ↓
Multi-Timeframe Analyzer
    ↓
    ├─→ Chart Panel (price + indicators)
    ├─→ Indicator Carousel (secondary metrics)
    └─→ Game HUD (conviction, equity)

X API (sentiment data)
    ↓
Sentiment Analyzer
    ↓
Sentiment Feed Panel (popup alerts)
```

---

## Implementation Phases

### Phase 1: Chart Panel Foundation (Week 1)
**Goal:** Replace automated trading with visual chart overlay

- [ ] **Task 1.1:** Create `chart-panel.tsx` component
  - Semi-transparent background (80% opacity)
  - Positioned over DOOM game (absolute positioning)
  - Responsive sizing (adjusts to viewport)
  - Toggle visibility (press `C` key)

- [ ] **Task 1.2:** Build candlestick renderer
  - Use HTML5 Canvas for performance
  - Render 1m/5m/15m candles (timeframe selector)
  - Auto-scaling price axis
  - Real-time updates (1s polling)

- [ ] **Task 1.3:** Add support/resistance overlays
  - Use existing `findSupportResistanceLevels()` function
  - Draw horizontal lines at SR levels
  - Color-coded: green (support), red (resistance)
  - Labels with price values

- [ ] **Task 1.4:** Implement Bollinger Bands overlay
  - Use existing `bollingerBands()` function
  - Render upper/middle/lower bands
  - Semi-transparent fill between bands
  - Update in real-time

- [ ] **Task 1.5:** Add volume bars
  - Volume histogram at chart bottom
  - Color-coded by candle direction (green/red)
  - Auto-scaling to fit panel

**Deliverable:** Working chart overlay showing price, SR levels, BB bands, volume

---

### Phase 2: Indicator Carousel (Week 2)
**Goal:** Visual display of secondary indicators with auto-rotation

- [ ] **Task 2.1:** Create `indicator-carousel.tsx` component
  - Fixed position (bottom-right corner)
  - Card-based UI (one indicator per card)
  - Auto-rotation (10s per card)
  - Manual navigation (left/right arrows)

- [ ] **Task 2.2:** Build indicator card components
  - **RSI Card:** Gauge visual (0-100 scale)
  - **MACD Card:** Histogram + signal line
  - **ADX Card:** Trend strength meter
  - **Bollinger Card:** Bandwidth % + price position
  - **Volume Card:** Volume profile distribution
  - **SR Distance Card:** Distance to nearest levels

- [ ] **Task 2.3:** Add visual alerts
  - Flash animation when RSI > 70 or < 30
  - Highlight when MACD crosses signal line
  - Pulse effect when ADX > 25 (strong trend)
  - Color transitions (green → yellow → red)

- [ ] **Task 2.4:** Implement rotation logic
  - Cycle through cards every 10s
  - Smooth fade transitions
  - Pause on hover
  - Resume on mouse leave

**Deliverable:** Rotating indicator carousel with 6 card types

---

### Phase 3: Sentiment Feed (Week 3)
**Goal:** Live crypto sentiment from X (Twitter)

- [ ] **Task 3.1:** Research sentiment data sources
  - **Option A:** Twitter API v2 (requires paid tier for streaming)
  - **Option B:** Alternative APIs:
    - LunarCrush (crypto sentiment API)
    - Santiment (on-chain + social data)
    - CoinGecko (trending coins)
  - **Option C:** Web scraping (higher maintenance)

- [ ] **Task 3.2:** Create `x-client.ts` API client
  - Connect to chosen sentiment API
  - Filter for SOL/crypto mentions
  - Real-time streaming or polling
  - Rate limiting + error handling

- [ ] **Task 3.3:** Build sentiment analyzer
  - Score sentiment (0-1: bearish → bullish)
  - Detect sentiment shifts (sudden changes)
  - Calculate mention velocity (mentions/hour)
  - Identify influential accounts

- [ ] **Task 3.4:** Create `sentiment-feed.tsx` component
  - Popup notification style (top-right corner)
  - Auto-dismiss after 10s
  - Stack multiple notifications
  - Color-coded by sentiment (green/yellow/red)

- [ ] **Task 3.5:** Implement sentiment alerts
  - Alert on sentiment score > 0.7 (bullish) or < 0.3 (bearish)
  - Alert on +50% mention velocity
  - Alert on whale/influencer posts
  - Play sound effect (optional)

**Deliverable:** Live sentiment feed with popup notifications

---

### Phase 4: Multi-Timeframe Alignment Visual (Week 4)
**Goal:** Show when multiple timeframes agree on trend direction

- [ ] **Task 4.1:** Create trend alignment indicator
  - Visual: 6 stacked bars (one per timeframe)
  - Color per timeframe:
    - Green: uptrend/strong uptrend
    - Red: downtrend/strong downtrend
    - Gray: ranging
  - Highlight when 4+ timeframes align

- [ ] **Task 4.2:** Add conviction meter
  - Use existing `MultiTimeframeSignal.conviction` value
  - Visual: Circular progress meter (0-100%)
  - Color gradient: red (0%) → yellow (50%) → green (100%)
  - Flash animation when conviction > 80%

- [ ] **Task 4.3:** Implement "trade signal" alerts
  - Trigger when:
    - Conviction > 80%
    - 4+ timeframes aligned
    - Not overbought/oversold (RSI check)
  - Full-screen flash overlay (subtle)
  - Sound effect + notification
  - Display suggested entry price

**Deliverable:** Visual trend alignment + high-conviction trade alerts

---

### Phase 5: Polish & Integration (Week 5)
**Goal:** Refinement, performance optimization, user settings

- [ ] **Task 5.1:** Add user customization settings
  - Toggle panel visibility (chart, carousel, sentiment)
  - Adjust panel transparency (50-95%)
  - Resize panels (drag corners)
  - Choose indicator rotation order
  - Enable/disable audio alerts

- [ ] **Task 5.2:** Performance optimization
  - Canvas rendering optimizations
  - Throttle sentiment API calls
  - Lazy load indicator calculations
  - Reduce re-renders (React.memo)

- [ ] **Task 5.3:** Mobile responsive layout
  - Stack panels vertically on mobile
  - Smaller chart (focus on recent candles)
  - Swipe gesture for indicator carousel
  - Collapsible panels

- [ ] **Task 5.4:** Add keyboard shortcuts
  - `C`: Toggle chart panel
  - `I`: Toggle indicator carousel
  - `S`: Toggle sentiment feed
  - `T`: Cycle timeframes (1m/5m/15m/1h)
  - `[` / `]`: Navigate carousel cards
  - `H`: Show help overlay

- [ ] **Task 5.5:** Create dashboard tutorial
  - First-time user walkthrough
  - Explain each panel
  - Show example trade setup
  - Tips for reading indicators

**Deliverable:** Polished, performant dashboard with user customization

---

## Design Mockups

### Dashboard Layout (Desktop)

```
┌────────────────────────────────────────────────────────────┐
│  Wallet: Adz...k3e     Balance: $105.23     Equity: +5.2%  │
├────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────┐  ┌──────────────────┐ │
│  │                                 │  │ 🟢 BULLISH       │ │
│  │    DOOM GAME CANVAS             │  │ SOL mentions +45%│ │
│  │    (Running in Background)      │  │ 1 min ago        │ │
│  │                                 │  └──────────────────┘ │
│  │  ┌─────────────────────────┐   │                        │
│  │  │ 📈 PRICE CHART          │   │  ┌─────────────────┐  │
│  │  │ ┌───┬───┬───┬───┬───┐   │   │  │ TIMEFRAME ALIGN │  │
│  │  │ │░▓░│▓░░│░░▓│░▓░│▓▓▓│   │   │  │ 1m  ▓▓▓ Long    │  │
│  │  │ └───┴───┴───┴───┴───┘   │   │  │ 5m  ▓▓▓ Long    │  │
│  │  │ Support: 104.50 ─────   │   │  │ 15m ▓▓▓ Long    │  │
│  │  │ Resistance: 107.20 ───── │   │  │ 1h  ▓▓░ Ranging │  │
│  │  │ Volume ▂▃▅▇▅▃▂▁         │   │  │ 4h  ░░░ Ranging │  │
│  │  └─────────────────────────┘   │  │ 1d  ░░░ Ranging │  │
│  │                                 │  │ Conviction: 67% │  │
│  │  ┌─────────────────────────┐   │  └─────────────────┘  │
│  │  │ 📊 RSI: 67.3            │   │                        │
│  │  │ ▓▓▓▓▓▓▓░░░ 🔥          │   │                        │
│  │  │ Approaching Overbought   │   │                        │
│  │  └─────────────────────────┘   │                        │
│  └─────────────────────────────────┘                        │
│                                                              │
│  [C] Chart  [I] Indicators  [S] Sentiment  [T] Timeframe   │
└────────────────────────────────────────────────────────────┘
```

### Chart Panel (Detailed)

```
┌──────────────────────────────────────────────────┐
│ SOL/USD  [1m] [5m] [15m] [1h]            🔍 ⚙️ ╳│
├──────────────────────────────────────────────────┤
│                                            108.50│
│                          ┌─────  Resistance ─────┤
│                      ┌───┤                 107.20│
│                  ┌───┤   └───┐                   │
│              ┌───┤   └───┐   └───┐         106.00│
│          ┌───┤   └───┐   └───┐   └───┐           │
│      ┌───┤   └───┐   │       └───┐   └───┐ 105.00│
│  ┌───┤   └───┐   │   │           └───┐   │       │
│  │   └───┐   │   │   │               │   │ 104.50│
│  │       │   │   │   │  Support ─────────────────┤
│  │       │   │   │   │               │   │ 104.00│
│                                                    │
│  Volume: ▂▃▅▇▅▃▂▁▂▃▅▇▅▃▂▁                        │
└──────────────────────────────────────────────────┘
  10:30   10:35   10:40   10:45   10:50   10:55
```

### Indicator Carousel Cards

```
┌─────────────────────────┐  ┌─────────────────────────┐
│ 📈 RSI (14)             │  │ 📊 MACD                 │
│                         │  │                         │
│       67.3              │  │   Histogram:            │
│   ┌────────────┐        │  │   ▇▇▇▅▃▂▂▁▁            │
│ 70├─ Overbought ─ 🔥    │  │   Signal: Bullish Cross│
│ 50├──────●──────        │  │   MACD: 0.45           │
│ 30├─ Oversold ───       │  │   Signal: 0.38         │
│   └────────────┘        │  │                         │
│ Status: Neutral         │  │ Strength: Medium       │
└─────────────────────────┘  └─────────────────────────┘

┌─────────────────────────┐  ┌─────────────────────────┐
│ 🎯 ADX (14)             │  │ 📏 Support/Resistance   │
│                         │  │                         │
│   Trend Strength: 32    │  │  Nearest Resistance:   │
│   ▓▓▓▓▓▓▓░░░            │  │  $107.20 (+2.1%)       │
│                         │  │                         │
│   Status: Strong Trend  │  │  Nearest Support:      │
│   Direction: Up         │  │  $104.50 (-0.5%)       │
│                         │  │                         │
│   Threshold: 25         │  │  Position: Near Support│
└─────────────────────────┘  └─────────────────────────┘
```

---

## API Integrations

### Sentiment Data Sources (Research Needed)

#### Option 1: Twitter API v2
- **Pros:** Official API, reliable, real-time streaming
- **Cons:** Expensive ($100+/month for streaming), rate limits
- **Endpoints:**
  - Filtered stream (track crypto keywords)
  - Tweet counts (volume tracking)
  - User lookup (identify influencers)

#### Option 2: LunarCrush API
- **Pros:** Crypto-focused, pre-calculated sentiment scores
- **Cons:** Limited free tier, delayed data
- **Features:**
  - Social volume tracking
  - Sentiment analysis
  - Influencer rankings
  - Galaxy score (overall social health)

#### Option 3: Santiment API
- **Pros:** On-chain + social data, crypto-native
- **Cons:** Complex API, higher cost
- **Features:**
  - Social trends
  - Dev activity
  - Exchange flows
  - Whale transactions

#### Option 4: CoinGecko API (Free Tier)
- **Pros:** Free, simple, reliable
- **Cons:** Limited social data, no real-time streaming
- **Features:**
  - Trending coins
  - Market data
  - Community stats
  - Developer stats

**Recommendation:** Start with CoinGecko (free) for MVP, then upgrade to LunarCrush or Twitter API for production.

---

## Technical Challenges

### Challenge 1: Chart Performance
**Problem:** Rendering 1000+ candles at 60 FPS with overlays
**Solutions:**
- Use HTML5 Canvas instead of SVG (10x faster)
- Implement virtual scrolling (only render visible candles)
- Throttle updates to 1s instead of every candle
- Use Web Workers for heavy calculations

### Challenge 2: Overlay Transparency
**Problem:** Chart must be readable over moving DOOM game
**Solutions:**
- Semi-transparent background (80-90% opacity)
- Dark theme with high-contrast colors
- Blur game canvas behind panels (CSS backdrop-filter)
- Toggle panel visibility with keyboard shortcuts

### Challenge 3: Real-Time Updates
**Problem:** Multiple data sources updating at different rates
**Solutions:**
- Centralized data store (Zustand or Redux)
- Event-driven architecture (pub/sub pattern)
- Debounce/throttle UI updates
- Use React.memo to prevent unnecessary re-renders

### Challenge 4: Mobile Layout
**Problem:** Limited screen space for 3+ panels
**Solutions:**
- Collapsible panels (accordion style)
- Swipe gestures for panel navigation
- Full-screen chart mode (hide game)
- Vertical stacking instead of overlays

### Challenge 5: Sentiment API Rate Limits
**Problem:** Free tier APIs have strict rate limits
**Solutions:**
- Cache sentiment data (TTL: 5 minutes)
- Batch requests (fetch multiple coins at once)
- Fallback to cached data when rate limited
- Implement exponential backoff

---

## User Experience Flow

### First-Time User Journey

1. **Landing Page**
   - Brief explanation of dashboard concept
   - "Try Demo" button (mock data mode)
   - "Connect Wallet" button (real trading mode)

2. **Dashboard Tutorial (First Load)**
   - Highlight chart panel: "This shows real-time SOL price"
   - Highlight indicator carousel: "These metrics help you understand market conditions"
   - Highlight sentiment feed: "See what crypto Twitter is saying"
   - Highlight DOOM game: "Enjoy the game while monitoring markets!"

3. **Dashboard Interaction**
   - User can toggle panels on/off with keyboard shortcuts
   - User can resize/reposition panels (drag & drop)
   - User can customize indicator rotation order
   - User can set up alerts (RSI > 70, MACD crossover, etc.)

4. **Alert Workflow**
   - Dashboard detects high-conviction setup (conviction > 80%, trends aligned)
   - Full-screen subtle flash + sound effect
   - Notification popup: "HIGH CONVICTION LONG SIGNAL"
   - User reviews indicators and makes manual trading decision
   - User can execute trade via connected wallet (optional)

---

## Success Metrics

### User Engagement
- **Goal:** Average session time > 15 minutes
- **Measurement:** Track time spent on dashboard page
- **Target:** 70% of users stay 15+ minutes

### Feature Adoption
- **Goal:** Users interact with all 3 panels
- **Measurement:** Track panel visibility toggles
- **Target:** 80% of users view chart + indicators + sentiment

### Trading Activity (If Connected)
- **Goal:** Manual trade execution from dashboard
- **Measurement:** Track wallet transactions
- **Target:** 30% of connected users make at least 1 trade

### Retention
- **Goal:** Users return multiple times
- **Measurement:** Track return visits within 7 days
- **Target:** 40% return rate

---

## Marketing Positioning

### Tagline Ideas
- "TradingView meets DOOM - Gaming meets Trading"
- "Level up your trading while you game"
- "The most entertaining trading dashboard ever"
- "Trade smarter, game harder"

### Value Propositions
1. **Visual Learning:** Understand technical analysis through gamification
2. **Multi-Timeframe Edge:** See what the big money sees (4h, 1d trends)
3. **Sentiment Intel:** Know what traders are talking about in real-time
4. **Entertainment Factor:** Monitor markets without boredom
5. **Manual Control:** You make the decisions, AI provides insights

### Target Audience
- **Primary:** Crypto day traders (18-35 years old)
- **Secondary:** Gaming enthusiasts curious about trading
- **Tertiary:** Technical analysis learners

---

## Open Questions

### Design Decisions
- [ ] Should chart panel be draggable or fixed position?
- [ ] Should indicators auto-rotate or be user-controlled?
- [ ] Should sentiment feed include on-chain data (exchange flows, whale alerts)?
- [ ] Should DOOM game be interactive or just a backdrop?

### Technical Decisions
- [ ] Which sentiment API should we use? (LunarCrush vs Twitter vs CoinGecko)
- [ ] Should we build custom chart renderer or use library (lightweight-charts)?
- [ ] Should we use WebSocket for real-time data or continue polling?
- [ ] Should we support multiple cryptocurrencies or just SOL?

### Business Decisions
- [ ] Should we monetize? (Premium tier for more indicators/alerts)
- [ ] Should we integrate with DEX for direct trading from dashboard?
- [ ] Should we build a community around the dashboard (Discord, leaderboard)?
- [ ] Should we open-source the project or keep it proprietary?

---

## Next Steps

### Immediate Actions (This Week)
1. **Decision:** Review this plan and decide on scope for MVP
2. **Decision:** Choose sentiment API provider (LunarCrush vs CoinGecko)
3. **Design:** Create high-fidelity mockups for chart panel
4. **Prototype:** Build basic chart overlay (no indicators, just candlesticks)

### Short-Term (Next 2 Weeks)
1. **Phase 1:** Complete chart panel with SR levels and volume
2. **Research:** Test different chart libraries (lightweight-charts vs custom Canvas)
3. **Design:** Create indicator card components (RSI, MACD, ADX)

### Medium-Term (Next Month)
1. **Phase 2:** Complete indicator carousel
2. **Phase 3:** Integrate sentiment data feed
3. **Phase 4:** Add multi-timeframe alignment visual
4. **Testing:** User testing with 10-20 beta users

### Long-Term (Next Quarter)
1. **Phase 5:** Polish and optimization
2. **Launch:** Public beta release
3. **Marketing:** Social media campaign, demo videos
4. **Iterate:** Based on user feedback

---

## Resources & References

### Chart Libraries (Evaluation)
- **lightweight-charts** (TradingView's library): Best performance, limited customization
- **react-stockcharts**: React-friendly, moderate performance
- **d3.js**: Maximum customization, steeper learning curve
- **Custom Canvas**: Full control, most work

### Sentiment APIs
- [LunarCrush](https://lunarcrush.com/developers/api)
- [Santiment](https://santiment.net/)
- [CoinGecko](https://www.coingecko.com/en/api)
- [Twitter API v2](https://developer.twitter.com/en/docs/twitter-api)

### Design Inspiration
- TradingView: Chart overlays, indicator panels
- Bloomberg Terminal: Multi-panel layouts
- Cyberpunk UI: Neon colors, transparency effects
- Gaming HUDs: Doom Eternal, Halo, Apex Legends

---

## Version History

| Version | Date       | Changes                           | Author |
|---------|------------|-----------------------------------|--------|
| 1.0     | 2025-11-21 | Initial plan created              | Claude |

---

## Appendix: Technical Stack

### Frontend
- **Framework:** Next.js 14 (App Router)
- **UI Library:** React 18
- **Styling:** Tailwind CSS
- **State Management:** Zustand (already in use)
- **Chart Rendering:** TBD (lightweight-charts vs Custom Canvas)

### Backend / Data
- **Price Data:** Pyth Oracle (already integrated)
- **Sentiment Data:** TBD (LunarCrush vs CoinGecko)
- **On-Chain Data:** Drift Protocol (already integrated)
- **Historical Data:** Pyth historical API (with CORS workaround)

### Infrastructure
- **Hosting:** Vercel (likely current setup)
- **Analytics:** TBD (PostHog, Mixpanel, or custom)
- **Error Tracking:** TBD (Sentry recommended)

---

**End of Plan Document**

*This is a living document. Update as decisions are made and implementation progresses.*
