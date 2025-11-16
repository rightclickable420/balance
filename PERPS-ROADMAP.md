# Jupiter Perps Real Trading Roadmap

## Vision
Transform Balance from a game with real market data into a **real perpetuals trading platform** where users can:
1. Connect their Solana wallet
2. Deposit funds (SOL/USDC)
3. Choose leverage (1x-10x)
4. Let Balance's auto-alignment algorithm execute actual trades on Jupiter Perps
5. Track real P&L and positions

---

## Current Status ✅

### Phase 1: Real Market Data (COMPLETED)
- ✅ Integrated Pyth Oracle for real-time SOL/USD prices (~$154)
- ✅ NO rate limits - using Pyth Hermes HTTP API
- ✅ 1-second candle updates
- ✅ WebSocket streaming to frontend
- ✅ Game responds to real market movements

**What works now:**
- Real SOL/USD prices from Pyth ($154.38-154.43)
- 1-second price updates
- Auto-alignment algorithm runs on real data
- Tower balance reflects real market volatility

---

## Phase 2: Jupiter Perps Integration (NEXT)

### 2.1 Wallet Connection
**Goal:** Connect user's Solana wallet

**Tasks:**
- [ ] Install `@solana/wallet-adapter` packages
- [ ] Add wallet connection UI component
- [ ] Support Phantom, Solflare, Backpack wallets
- [ ] Display connected wallet address
- [ ] Show wallet SOL/USDC balance

**Files to create/modify:**
- `src/components/wallet-connect.tsx`
- `src/hooks/use-wallet.ts`
- `src/lib/solana/wallet-context.tsx`

---

### 2.2 Jupiter Perps Account Setup
**Goal:** Create and manage Jupiter Perps trading account

**Tasks:**
- [ ] Install Jupiter Perps SDK (`@jup-ag/perpetuals-sdk`)
- [ ] Create user's perps account (one-time setup)
- [ ] Deposit funds from wallet to perps account
- [ ] Withdraw funds back to wallet
- [ ] Display perps account balance

**Key Concepts:**
- Jupiter Perps uses isolated accounts (user owns their account)
- Positions are fully on-chain
- Account PDA (Program Derived Address) derived from user wallet

**Files to create:**
- `src/lib/perps/jupiter-perps-client.ts`
- `src/lib/perps/account-manager.ts`
- `src/components/perps-account-panel.tsx`

---

### 2.3 Position Management
**Goal:** Open/close leveraged positions based on Balance decisions

**Tasks:**
- [ ] Implement `openPosition(side, size, leverage)` function
- [ ] Implement `closePosition(positionId)` function
- [ ] Track open positions in game state
- [ ] Display position details (entry price, size, PnL)
- [ ] Handle liquidations

**Position Lifecycle:**
```typescript
// When tower is stable and aligned:
if (alignmentScore > 0.7 && stance === 'long') {
  await jupiterPerps.openPosition({
    side: 'long',
    market: 'SOL-PERP',
    size: calculatePositionSize(accountBalance, leverage),
    leverage: userSelectedLeverage // 1x-10x
  })
}

// When tower falls or misaligned:
if (alignmentScore < 0.3 || towerFell) {
  await jupiterPerps.closePosition(currentPositionId)
}
```

**Files to create:**
- `src/lib/perps/position-manager.ts`
- `src/components/position-display.tsx`

---

### 2.4 Auto-Alignment Trading Logic
**Goal:** Map game events to real trades

**Decision Matrix:**
```
Game State              → Trading Action
─────────────────────────────────────────
Alignment > 0.7 + Long  → Open/Add Long Position
Alignment > 0.7 + Short → Open/Add Short Position
Alignment < 0.3         → Close Position
Tower Falls             → Emergency Close Position
High Volatility         → Reduce Position Size
```

**Risk Management:**
- Max position size: 50% of account balance
- Stop loss: -10% from entry
- Take profit: +20% from entry
- Max leverage: 5x (to start conservatively)

**Files to modify:**
- `src/lib/game/game-state.ts` (add perps integration hooks)
- `src/components/game-container.tsx` (trigger trades on game events)

---

### 2.5 UI/UX for Live Trading
**Goal:** Clear interface for real money trading

**Components needed:**
- Wallet connection button (top right)
- Perps account panel (deposit/withdraw)
- Position display (current position, PnL, leverage)
- Trade history log
- Risk settings (max leverage, position size %)
- Emergency "Close All" button

**Safety Features:**
- Confirmation dialogs for all trades
- Display transaction fees upfront
- Show slippage estimates
- "Paper trading mode" toggle (game-only vs real money)

---

## Phase 3: Advanced Features (FUTURE)

### 3.1 Multiple Markets
- Support ETH-PERP, BTC-PERP alongside SOL-PERP
- User selects which market to trade
- Multi-market towers (advanced mode)

### 3.2 Social Features
- Leaderboard (best P&L, longest tower streak)
- Share trades on Twitter/Farcaster
- Copy trading (follow successful traders)

### 3.3 Advanced Strategies
- Grid trading mode
- DCA (dollar-cost averaging) mode
- Mean reversion strategy
- Trend following strategy

---

## Technical Architecture

### Data Flow
```
Pyth Oracle (SOL/USD Price)
  ↓
Aggregator Service (1-second candles)
  ↓
Game Frontend (tower simulation)
  ↓
Auto-Alignment Algorithm (decisions)
  ↓
Jupiter Perps SDK (execute trades)
  ↓
Solana Blockchain (positions on-chain)
```

### Key Packages
```json
{
  "@jup-ag/perpetuals-sdk": "latest",
  "@solana/wallet-adapter": "^0.15.x",
  "@solana/wallet-adapter-react": "^0.15.x",
  "@solana/wallet-adapter-wallets": "^0.19.x",
  "@solana/web3.js": "^1.95.x",
  "@pythnetwork/client": "^2.x"
}
```

---

## Risk Warnings & Legal

**Important Considerations:**
1. **Financial Risk:** Trading perpetuals with leverage can result in total loss
2. **User Responsibility:** Users control their own wallets and funds
3. **No Financial Advice:** Balance is a tool, not investment advice
4. **Regulatory Compliance:** May need disclaimers, terms of service, age verification
5. **Testing:** Extensive testing on devnet before mainnet launch

**Recommended Safeguards:**
- Start with low leverage limits (2x-3x)
- Require explicit user opt-in for real trading
- Display clear risk warnings
- Implement circuit breakers (max loss per day)
- Paper trading mode by default

---

## Success Metrics

**Phase 2 Success = Users can:**
- ✅ Connect Solana wallet
- ✅ Deposit $100-$1000 to Jupiter Perps account
- ✅ Open SOL-PERP position with 2x leverage
- ✅ See real-time P&L update with market
- ✅ Close position and withdraw funds

**Key Metrics to Track:**
- Total Value Locked (TVL) in perps accounts
- Number of active traders
- Win rate of auto-alignment algorithm
- Average position hold time
- User retention (daily/weekly active)

---

## Timeline Estimate

**Phase 2.1-2.2 (Wallet + Account):** 2-3 days
**Phase 2.3-2.4 (Positions + Trading):** 3-4 days
**Phase 2.5 (UI/UX):** 2-3 days
**Testing & Bug Fixes:** 3-5 days

**Total: ~2-3 weeks for MVP real trading**

---

## Next Immediate Steps

1. **Test current setup** with real SOL prices
2. **Install wallet adapter** packages
3. **Create wallet connection UI**
4. **Set up Jupiter Perps devnet account** (test with fake SOL)
5. **Implement position opening/closing** on devnet
6. **Test thoroughly** before mainnet

---

## Questions to Answer

1. **Leverage limits:** Start with 2x max or allow up to 10x?
2. **Default mode:** Paper trading or real trading?
3. **Fee model:** Take % of profits? Subscription? Free?
4. **Target users:** Experienced traders or teaching tool for beginners?
5. **Legal structure:** DAO, company, or just open-source tool?

---

## Resources

- **Jupiter Perps Docs:** https://station.jup.ag/guides/perpetual-exchange
- **Jupiter Perps IDL:** https://github.com/jup-ag/perpetuals
- **Pyth Network:** https://pyth.network/
- **Solana Wallet Adapter:** https://github.com/anza-xyz/wallet-adapter

---

**Current Status:** ✅ Phase 1 Complete - Real market data streaming
**Next Step:** 🚀 Phase 2.1 - Wallet connection integration
