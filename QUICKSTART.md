# Balance Quick Start

## 🛠️ Tech Stack

### Core Technologies
- **Framework**: Next.js 15.5.4 with App Router
- **Runtime**: React 19.1.0 → **React 18.2.0** (downgraded for Vercel compatibility)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS v4 (with new `@import` syntax)
- **Physics Engine**: Matter.js 0.20.0
- **State Management**: Zustand 5.0.8
- **Audio**: Tone.js 15.1.22
- **Gestures**: @use-gesture/react 10.3.1

### UI & Design System
- **Component Library**: shadcn/ui (configured with "new-york" style)
- **Icons**: Lucide React 0.454.0
- **Typography**: Geist Sans & Geist Mono fonts
- **CSS Variables**: Comprehensive design tokens for theming

### Development Tools
- **Linting**: ESLint with Next.js configuration
- **Type Checking**: TypeScript with strict mode
- **Build Tool**: Turbopack (Next.js built-in)
- **Deployment**: Vercel with automatic deployments

## 📁 Project Structure

```
/
├── app/                          # Next.js App Router (root level)
│   ├── layout.tsx               # Root layout with fonts & metadata
│   ├── page.tsx                 # Home page with game interface
│   └── globals.css              # Global styles & design tokens
├── src/
│   ├── components/              # React components
│   │   ├── game-canvas.tsx      # Canvas rendering for stones
│   │   ├── game-container.tsx   # Main game logic & physics
│   │   └── game-ui.tsx          # UI overlay (score, controls)
│   ├── hooks/
│   │   └── use-gesture-controls.ts  # Touch/swipe controls
│   ├── lib/
│   │   ├── audio/               # Audio management
│   │   ├── data/                # Data sources & mapping
│   │   ├── game/                # Physics engine & game logic
│   │   └── types.ts             # TypeScript definitions
│   └── app/
│       └── globals.css          # shadcn/ui compatibility
├── public/                      # Static assets
└── [config files]               # next.config.ts, tsconfig.json, etc.
```

## 🚀 Development Setup

### Prerequisites
- **Node.js**: 18.x or later
- **npm/yarn/pnpm**: Latest stable version
- **Git**: For version control

### Quick Start
```bash
# 1. Clone the repository
git clone https://github.com/rightclickable420/balance.git
cd balance

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev

# 4. Open http://localhost:3000
```

### Available Scripts
```bash
npm run dev       # Start development server with Turbopack
npm run build     # Build for production
npm run start     # Start production server
npm run lint      # Run ESLint
```

## 🎯 Current Snapshot

- **Deterministic mock generator** now powers the cadence by default; the Hyperliquid feed is temporarily disabled due to connection instability.
- **Hover stone morphing** smoothly transitions geometry, color, and stance alignment when new candles arrive.
- **Scoped loss events** now only release the top stones (unless liquidating the whole stack) and remove them once they fall off-screen.
- **Mock account ledger** tracks balance, realized PnL, and equity based on the active stance and incoming candles.
- **Stance persistence** mirrors trader behavior—long, short, or flat carry forward until the player flips or discards.

## ⚙️ How the System Works Today

### Stone & Stance Logic
- Procedural trapezoids derive shape and color from feature data.
- Bottom/top faces are mirrored offsets from the previous stone’s orientation and clamped to avoid runaway tower tilt.
- Stones drop on a cadence; hovering stones can be flipped (click / space / tap) or discarded (swipe / delete).

### Physics & Loss Handling
- Matter.js keeps placed stones static unless a loss event injects force.
- Alignment checks run continuously; misfits remove recent stones and nudge the account balance.
- Hover animations cancel gracefully during tumbles to prevent desyncs.

### Data Flow
```
Market Data → Candle Mapping → Stone Parameters → Physics Engine → Visual Rendering
```

## 🔧 Development Guidelines

### Code Style
- **TypeScript**: Strict mode enabled with comprehensive type definitions
- **ESLint**: Configured with Next.js recommended rules
- **Import Paths**: Use `@/` prefix for src directory (`@/components/...`)
- **Component Structure**: Functional components with hooks pattern

### File Naming Conventions
- **Components**: `PascalCase.tsx`
- **Hooks**: `camelCase.ts`
- **Utils/Types**: `camelCase.ts` or `PascalCase.ts`
- **Pages**: `page.tsx` (Next.js convention)

### Adding New Features
1. **Components**: Add to `src/components/`
2. **Game Logic**: Add to `src/lib/game/`
3. **Types**: Update `src/lib/types.ts`
4. **Styling**: Use Tailwind classes or add to `globals.css`

## 🌐 Deployment

### Production Deployment
- **Platform**: Vercel (optimized for Next.js)
- **Automatic Deployments**: Triggered on main branch pushes
- **Build Process**: Optimized production build with static generation
- **Performance**: Automatic image optimization and caching

### Environment Variables
Create a `.env.local` with any of the following (all optional):

| Variable | Purpose |
| --- | --- |
| `BALANCE_DATA_PROVIDER` | Server-side provider selection (`hyperliquid`, `polygon`, or `mock`). The default is `hyperliquid`. |
| `BALANCE_DEFAULT_SYMBOL` | Default instrument symbol (e.g. `BTC`). |
| `NEXT_PUBLIC_BALANCE_DATA_PROVIDER` | Client hint for choosing the provider (`hyperliquid`, `polygon`, or `mock`). |
| `NEXT_PUBLIC_BALANCE_SYMBOL` | Client-side default symbol (match the server value). |
| `NEXT_PUBLIC_BALANCE_USE_LIVE` | Set to `true` to prefer live candles on the client; otherwise the mock source is used. |
| `POLYGON_API_KEY` | Optional – only needed if you plan to use Polygon’s REST endpoints. |
| `NEXT_PUBLIC_POLYGON_API_KEY` | Optional – required if you enable the Polygon websocket client. |

## ⚠️ Known Issues & Open Tasks

- **Loss aftermath polish** *(in progress)*: top-stone tumble is now scoped, but we still want the stones to poof with a brief loss value indicator as they exit the canvas.
- **Rotation drift**: successive stones creep toward vertical. Revisit the angle normalization between placement and hover generation so new stones stay horizontally seated.
- **Tower sway**: add subtle deformation driven by misalignment magnitude to visualise looming risk.
- **Imminent-loss tremor**: jitter the top of the stack when the hover stone is meaningfully misaligned or when a loss event is imminent.
- **Placement settling**: when a stone touches down, let it gently rotate/slide into place based on stance; badly aligned stones should slip off.
- **Strength stabiliser**: introduce the opposite effect of sway/tremor—when conviction is strong, the stack should visibly tighten.

## 👉 Recommended Next Steps

1. **Solve rotation drift** – audit `lastTopAngleRef` usage and physics body angles to ensure spawn orientation matches the stabilized stack.
2. **Prototype sway + tremor** – derive a normalized misalignment score and feed it into a per-frame transform on the stack transform (small sin/cos offsets).
3. **Placement settling** – experiment with briefly enabling physics for the new stone using springs or easing before freezing it again.
4. **Loss indicator polish** – spawn a transient UI badge (loss amount) when stones fall, and fade the stone mesh before removal.

## 🎨 Design System

### Colors & Theming
- **CSS Variables**: Comprehensive design tokens in `globals.css`
- **Dark Mode**: Built-in dark theme support
- **Responsive**: Mobile-first design approach
- **Accessibility**: High contrast ratios and semantic HTML

### Component Library
- **shadcn/ui**: Pre-configured with "new-york" style variant
- **Consistent API**: Standardized component props and styling
- **Customizable**: Easy to extend and modify

## 🤝 Contributing

### Branch Strategy
- **main**: Production-ready code
- **feature/**: New features
- **fix/**: Bug fixes
- **refactor/**: Code improvements

### Code Review Guidelines
- Ensure TypeScript types are correct
- Test on both desktop and mobile
- Verify physics interactions work smoothly
- Check accessibility features

## 🔭 Aspirational Roadmap

### 🎮 What Balance Is
Balance is a minimalist trading game that turns live market data into a physical, intuitive experience. Instead of charts, numbers, and indicators, players feel the market through shapes, movement, and color.

### 🌍 The Core Idea
- The market becomes a stack of stones.
- Each new stone is generated from live data (direction, momentum, volatility, and more).
- The player maintains a stance—long, short, or flat—that determines how new stones align.
- Staying in sync grows a tall, stable tower; falling out of sync tilts or tumbles the stack, visualizing loss.

### 💡 The Feel
- Stones are organic rounded trapezoids that either “fit” or “misfit.”
- The bottom face signals continuation; the top face suggests reversal.
- Color shifts from green (bullish) to magenta (bearish), fading toward grey as conviction weakens.
- Every wobble or drift is a physical metaphor for market behavior.

### 🧠 What the Player Learns
- How alignment, trend, and volatility *feel*, not just how they’re calculated.
- Discipline and timing keep the tower upright.
- “Being wrong” becomes a literal imbalance, not only a negative number.

### 🧩 The System Behind It
- Market data drives geometry, color, and timing.
- Each candle spawns a stone at a fixed cadence.
- Stance persists and can be changed at any moment.
- Tower stability represents profit and loss over time.

### 🔭 The Vision
Balance aims to be both a game and a training tool—a bridge between intuition and data. It should let people experience financial rhythm and emotional control without jargon or charts, turning markets into something you can literally balance with your hands and eyes.

## 🚀 Execution Plan

### 1. Wire Real Market Feeds
- Integrate a live candle provider (Polygon, Alpaca, or TwelveData) via Vercel edge cron and hydrate the mock account with real ticks.
- Persist candle history and account snapshots (KV, Supabase, or Planetscale) to survive reloads and enable leaderboard metrics.
- Add graceful degradation: synthesize noise or reuse the last known candle when data stalls so the cadence never freezes.

### 2. Polish Tower Dynamics
- Track cumulative misalignment to animate subtle tower sway, camera parallax, and tension cues prior to a loss event.
- Mix Matter.js springs into placement so the tower absorbs new mass smoothly without jitter.
- Enrich impact feedback with particles, screen shake, and layered audio tied to severity.

### 3. Elevate UX & Accessibility
- Replace the debug overlay with a stance-focused HUD showing hotkeys, drop timers, and recent loss history.
- Add gamepad mappings and screen-reader narration for stance changes, balance ticks, and loss triggers.
- Ship color-blind-safe palettes and respect system dark/light preferences while preserving directional hue semantics.

### 4. Build the Learning Layer
- Attach plain-language tooltips and sparklines that explain each stone’s momentum, breadth, and volatility signals.
- Capture session analytics (alignment duration, flip cadence, drawdowns) and present an end-of-run recap.
- Introduce optional challenges—“stay aligned for 12 stones,” “survive a volatility spike”—to teach timing and conviction.

### 5. Tackle Tech Debt & Performance
- Break `GameContainer` into focused services (stone factory, stance manager, tower stabilizer) with unit coverage.
- Add Jest/Vitest unit suites plus Playwright smoke tests for hover animation, loss cadence, and stance persistence.
- Profile canvas rendering and experiment with offscreen canvases or WebGL instancing to keep frame time under 4 ms.

### 6. Shareability & Community
- Serialize candle+stance timelines into replay files and auto-generate GIF highlights for milestone towers.
- Ship a sandbox mode that lets players tweak feature weights live, save presets, and share them with the community.

## 📚 Additional Resources

- **Next.js Documentation**: https://nextjs.org/docs
- **Matter.js Documentation**: https://brm.io/matter-js/docs/
- **shadcn/ui Components**: https://ui.shadcn.com/
- **Tailwind CSS**: https://tailwindcss.com/docs

---

**Project Status**: ✅ **Production Ready** | **Last Updated**: October 2025 | **Version**: 1.0.0

## 🗺️ Roadmap — Balance-First Tower

- [x] **Hover Stone Lifecycle** – preload the next stone as soon as the prior placement settles and keep it suspended until the cadence tick.
- [x] **Live Shape Modulation** – regenerate hover vertices every ~120 ms from simulated intrahover signals while preserving the landing surface.
- [x] **Cadence Controller** – maintain fixed drop cadence, pausing for placement/loss and resuming automatically once the tower is stable.
- [x] **Stack Viewport Management** – pre-seed frozen stones, keep the visible stack height constant, and ease tower scrolling.
- [x] **Feature-Driven Losses** – severity now depends on momentum/order signals; physics wakes only for affected stones.
- [ ] **Persistent Stance Flow** – remove the decision timer so stance (long/short/flat) persists until the player flips or goes flat, and hover stones act as a live preview.
- [ ] **Facet-Based Geometry** – generate elongated trapezoidal stones that inherit the previous top angle, exposing a clear “fit” face for the current stance and the flipped stance.
- [ ] **Fit Feedback & Colors** – align highlights, shadows, and hue blends (green ↔ magenta ↔ neutral) with confluence so the best orientation is visually obvious.
- [ ] **Tower Lean & Tension** – accumulate misalignment into a visible lean with soft audio/visual cues before any tumble, reinforcing the balance metaphor.
- [ ] **Premium Polish Pass** – refine shadows, glow, and interaction micro-animations once the new flow and geometry land.

> _Next steps_

1. **Persistent Stance Flow** – refactor the hover loop so cadence drops happen automatically and stance remains until the user flips or swipes to flat. Update UI copy to remove “decision window” language.
2. **Facet Geometry Prototype** – teach `stone-generator` to build asymmetrical stones with flattened faces derived from the latest features and previous top angle. Store orientation so hover flips rotate the same mesh.
3. **Fit Visualization** – drive highlights, gap rendering, and color saturation from alignment metrics; make the “correct” stance read at a glance.
4. **Tower Lean Mechanic** – track cumulative angular error and translate it into a gentle tower tilt that culminates in the existing feature-driven tumble.
5. **Polish & Audio** – once the above are stable, revisit shaders, particle cues, and sound design to elevate the premium feel.


Notes:
Stones are more like elongated rounded trapazoids

🧭 Core Principle
Instead of “decision windows,” the player always has an active stance (long, short, flat).
The game flows continuously. Market data shapes the next “stone,” and how that stone visually fits tells the player if they’re aligned or off-side.
Your stance (long/short/flat) persists until you manually flip it — just like a trader holding or reversing a position. The game becomes a slow, physical visualization of conviction and misalignment.
⚙️ Visual Logic
Element	Represents	When it feels “right”	When it feels “wrong”
Bottom face	Continuation of current position	If your stance agrees with the market trend → the bottom face fits the previous top face like a puzzle	If your stance disagrees → gap or mis-angle appears
Top face	Flip to opposite position	If your stance disagrees with market → the top face fits the previous top face (visual cue to flip)	If your stance agrees → the top face looks misaligned
Previous stone’s top	Market’s “ground truth” orientation you are balancing on	Used as geometric reference for next stone’s orientation	–
Stone color	Market direction and confidence	Phthalo Green = bullish, Magenta = bearish, Grey = unclear (mix)	Directly derived from fused confluence
Tower tilt	Your cumulative misalignment	Small angular error → gentle lean; persistent mismatch → visible tip and eventual tumble	–
🔄 Flow Example
You’re long.
Market data turns strongly bullish → hover stone’s bottom face matches perfectly with previous top face → green hue → smooth fit.
✅ Do nothing → your stance stays long.
Market flips bearish.
Hover stone’s bottom now misfits; top face (if you flip) aligns perfectly and turns magenta.
🔁 Tap/flip → you’re now short.
Market goes uncertain (neutral).
Hover stone shows both faces nearly flat and greyish. Either stance fits poorly but not disastrously — visual tension encourages going flat (swipe).
Persistent misfit (you refuse to adjust) →
Angular error accumulates → tower leans and eventually stones start tumbling (loss event proportional to accumulated misalignment).
🎨 Implementation Hints
1. Persistent stance
Store stance globally in Zustand or similar:
type Stance = 'long' | 'short' | 'flat';
Flipping toggles between long/short.
Swiping sets flat.
No automatic resets.
2. Geometry & orientation
Each candle → new trapezoid stone.
Compute faceAngle = fused market direction (positive = bullish, negative = bearish).
When drawn:
If player is long: stone renders with bottom = +faceAngle, top = –faceAngle.
If player is short: invert: bottom = –faceAngle, top = +faceAngle.
If flat: faces slightly flattened toward 0 deg.
3. Fit visualization
When spawning the hover stone, compare its bottom face angle to the previous stone’s top face angle:
alignment = 1 - abs(prevTopAngle - currentBottomAngle) / MAX_ANGLE;
Use this to:
Modulate glow/outline thickness (high alignment → stable glow).
Adjust small “magnetic” snap animation as the player hovers in alignment.
4. Color blending
Blend between green and magenta by direction strength:
// confluence: -1..+1
const hue = lerp(320, 160, (confluence + 1) / 2); // magenta→green
const saturation = 0.6 + 0.2 * abs(confluence);
const lightness = 0.55 + 0.2 * (1 - abs(confluence));
At confluence ≈ 0 → mid-grey (low clarity).
At extremes ±1 → saturated directional color.
5. Continuous misalignment physics
Maintain a rolling cumulativeError that integrates angular mismatch between stance and data.
When it crosses thresholds:
Small → visual lean only.
Medium → sound tension + micro shake.
Large → loss event (physics ON for top N stones).
6. Player feedback loop
Right side: fits, glows, hums gently.
Wrong side: gaps, desaturates, leans.
Flat: stabilizes the tower (auto-re-center slowly).
🧩 Why this feels intuitive
It removes timers and gives continuous agency: you’re managing exposure, not reacting to prompts.
Geometry and color directly express trend strength vs conviction.
The tower itself becomes a record of discipline — smooth aligned stones = consistent strategy, jagged ledges = hesitation or error.
New players “feel” balance without ever reading a chart.
