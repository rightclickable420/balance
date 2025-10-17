# Balance Game - Quick Start Guide

## 🎮 Project Overview

**Balance** is a sophisticated physics-based stone stacking game that visualizes financial market data through interactive gameplay. Stones are procedurally generated from candlestick chart data, creating a unique blend of physics simulation and data visualization.

**Current Status**: ✅ **Fully Deployed & Operational**
- **Live URL**: https://balance-lx4ucum7k-ethangillart-gmailcoms-projects.vercel.app
- **Status**: Production-ready with complete game functionality
- **Tech Stack**: Next.js 15.5.4, React 18, Matter.js, TypeScript, Tailwind CSS v4

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

## 🎯 Key Features & Architecture

### Game Mechanics
- **Stone Generation**: Procedural stones from financial candlestick data
- **Physics Simulation**: Realistic 2D physics with Matter.js
- **Interactive Controls**:
  - Click/tap to flip stones (180° rotation)
  - Swipe/drag to discard unwanted stones
  - Keyboard controls (Space/F to flip, D/Delete to discard)
- **Market Data Integration**: Real-time market conditions affect gameplay

### Architecture Highlights
- **Modular Design**: Separate concerns (physics, data, audio, UI)
- **Type Safety**: Comprehensive TypeScript interfaces
- **Performance Optimized**: RequestAnimationFrame-based game loop
- **Responsive Design**: Works on desktop and mobile devices
- **Audio System**: Contextual sound effects for interactions

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
Currently no environment variables required. Add to `.env.local` for local development if needed.

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

## 🔍 Debugging & Development

### Debug Mode
- **Enable**: Press `L` key during gameplay
- **Features**: 60x time scale, detailed console logging
- **Visual Debug**: Overlay showing game state and physics data

### Common Development Tasks
```bash
# Check build status
npm run build

# Run type checking
npx tsc --noEmit

# Check for linting issues
npm run lint

# Clear Next.js cache
rm -rf .next
```

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

## 📚 Additional Resources

- **Next.js Documentation**: https://nextjs.org/docs
- **Matter.js Documentation**: https://brm.io/matter-js/docs/
- **shadcn/ui Components**: https://ui.shadcn.com/
- **Tailwind CSS**: https://tailwindcss.com/docs

---

**Project Status**: ✅ **Production Ready** | **Last Updated**: October 2025 | **Version**: 1.0.0

## 🗺️ Roadmap — Hover Stones & Live Market Sync

- [x] **Hover Stone Lifecycle**
  - ✅ `hoverStone` state (`GameContainer`) now preloads the next stone as soon as the previous placement settles.
  - ✅ Hover stones remain suspended above the stack until the cadence tick fires.
- [x] **Cadence Controller**
  - ✅ Timer aligns drops to fixed cadence slots (respects `timeScale`) and only releases stones when a hover is ready.
  - ✅ Scheduler pauses during loss / placing phases and resumes automatically once the tower is stable again.
- [ ] **Live Shape Modulation**
  - Stream mock “live” price deltas during hover and feed them into `generateStoneShape` adjustments (convexity/jaggedness/baseBias).
  - Render deformation updates in `game-canvas.tsx` with smooth lerps so the preview advertises risk.
- [ ] **Player Decisions**
  - Surface flip/discard controls specifically for the hover stone, with decision deadlines tied to `DEFAULT_CONFIG.decisionWindow`.
  - Persist the user’s final stance (long/short/flat) for later loss calculations.
- [x] **Stack Viewport Management**
  - ✅ Pre-seed tower bodies and recycle offsets so the visible stack height stays constant.
  - ✅ Eased `towerOffset` transitions keep scroll adjustments smooth when stones are added or fall.
- [ ] **Loss Event Refresh**
  - When losses trigger, activate physics for the top N stones and inject replacements from the bottom pool to maintain tower height.
  - Sync audio and UI feedback with the number of stones lost and regenerated.

> _Next step_: Spike the `hoverStone` state machine and cadence controller, then loop back here to tick the first two boxes.
