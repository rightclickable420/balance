# Balance Game - Quick Reference Card

## Current Implementation Status

### ✅ Completed & Working
- Session wallet creation with XOR encryption
- Dual storage backup (sessionStorage + localStorage)
- Manual trading strategy (auto-align OFF)
- SOL display in UI (fixed from dollars)
- Trading config display (leverage + strategy)
- Auto-deposit to Drift (0.063 SOL with 0.002 gas reserve)
- Fund safety on withdrawal (checks both session + Drift)
- No timeout-based deletion (backups persist forever)
- Browser close warning when funds present

### 🔍 Testing Required
- ⏳ Trades execute without `InsufficientCollateral` errors
- ⏳ Referral attribution (SDK + Gateway API dual approach)

---

## Key Constants

**Deposit Requirements**:
```
MIN_DEPOSIT:           0.08 SOL
DEFAULT_DEPOSIT:       0.1 SOL
DRIFT_ACCOUNT_RENT:    0.035 SOL (one-time)
MIN_TRADING_COLLATERAL: 0.04 SOL
GAS_RESERVE:           0.002 SOL
```

**Referral Config**:
```
Code:           balance
Wallet:         APADQYNLjWsaKhJR72TpfewzS3RjdwLXrn4xzKxHmqZc
Account:        7PorzwK9s7idBvKNtQSJQf8goSNfUG1yF6BV8eBSKiGB
Link:           https://app.drift.trade/ref/balance
Fee Share:      35% to referrer, 5% user discount
```

**Drift Markets**:
```
Program ID:     dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH
SOL-PERP:       Market index 0
SOL Spot:       Market index 1 (used for deposits)
USDC Spot:      Market index 0
```

---

## Fund Flow (0.1 SOL Deposit)

```
User Wallet
    ↓ 0.1 SOL deposit
Session Wallet (temporary burner)
    ├─ 0.035 SOL → Drift account rent (one-time)
    ├─ 0.063 SOL → Drift collateral (auto-deposited)
    └─ 0.002 SOL → Gas reserve (for withdrawal)

With 5x leverage:
    0.063 SOL × $200/SOL = $12.60
    $12.60 × 5x = $63 position capacity
```

**On Withdrawal**:
```
Drift Account
    ↓ Withdraw collateral
Session Wallet
    ↓ Withdraw to main wallet
User Wallet
    → Receives ~0.095 SOL (minus tx fees)
```

---

## Trading Strategies

| Strategy | Auto-Align | Min Conviction | Description |
|----------|------------|----------------|-------------|
| Manual | OFF | 1.0 | User controls all trades |
| Balanced | ON | 0.65 | Moderate filter, 65%+ signals |
| Aggressive | ON | 0.50 | More trades, 50%+ signals |
| High Conviction | ON | 0.80 | Conservative, 80%+ signals only |

**Conviction Score**: 0.0-1.0 (alignment + velocity + features)

---

## Testing Quick Start

### Full Test (15 min)
```bash
# 1. Show config
node scripts/get-referrer-simple.mjs

# 2. Start app
npm run dev

# 3. Test flow
# → Connect wallet (0.15 SOL)
# → Choose Real mode, 5x leverage, Balanced strategy
# → Deposit 0.1 SOL
# → Start Real Trading
# → Watch console for trades
# → Check referrals: https://app.drift.trade/ → Referrals

# 4. Verify & withdraw
# → Back to Setup
# → Withdraw
# → Confirm funds returned
```

### Expected Results
- ✅ Session wallet created
- ✅ Drift account initialized with referrer
- ✅ 0.063 SOL deposited as collateral
- ✅ Trades execute (no InsufficientCollateral errors)
- 🔍 Referral shows in dashboard (verify)
- ✅ Full withdrawal (~0.095 SOL returned)

---

## Console Log Checkpoints

### ✅ Session Created
```
[SessionWallet] Session wallet created: <ADDRESS>
```

### ✅ Drift Initialized
```
[DriftPositionManager] 💰 Using Balance referrer for fee sharing
[DriftPositionManager] ✅ User account created with referrer
```

### ✅ Collateral Deposited
```
[DriftPositionManager] Will deposit 0.0630 SOL to Drift (0.002 SOL gas reserve)
[DriftPositionManager] ✅ Deposited 0.0630 SOL: <TX_SIG>
[DriftPositionManager] Updated Drift collateral: 12.60
```

### ✅ Trade Executed
```
[DriftPositionManager] Opening LONG position: $250 at 5x leverage
[DriftPositionManager] ✅ Position opened: <TX_SIG>
```

### ❌ Error to Watch For
```
❌ Transaction simulation failed: InsufficientCollateral
   → Should NOT appear (fixed with auto-deposit)
```

---

## File Locations

**Core Trading**:
- Position Manager: `src/lib/trading/drift-position-manager.ts`
- Trading Controller: `src/lib/trading/trading-controller.ts`

**Session Wallet**:
- Session Wallet: `src/lib/wallet/session-wallet.ts`
- Wallet Connect Button: `src/components/wallet-connect-button.tsx`

**UI Components**:
- Game UI: `src/components/game-ui.tsx`
- Game Container: `src/components/game-container.tsx`
- Setup Screen: `src/components/game-setup-screen.tsx`

**State Management**:
- Game State: `src/lib/game/game-state.ts`
- Account State: `src/lib/game/account-state.ts`

**Documentation**:
- Testing Checklist: `TESTING-CHECKLIST.md`
- Referral Testing: `TEST-REFERRAL-INSTRUCTIONS.md`
- Recent Fixes: `RECENT-FIXES-SUMMARY.md`
- This Reference: `QUICK-REFERENCE.md`

---

## Common Issues & Fixes

### Issue: InsufficientCollateral errors
**Status**: Should be fixed ✅
**Solution**: Auto-deposit implemented
**Verify**: Check "Updated Drift collateral" log

### Issue: Referrals not showing
**Status**: Testing required 🔍
**Debug**: Check SDK init logs + Gateway API response
**Fallback**: Contact Drift support with tx signature

### Issue: Funds lost after withdrawal
**Status**: Should be fixed ✅
**Solution**: Drift balance checked before clearing session
**Verify**: Session preserved if Drift has >$0.50

### Issue: Double signature prompts
**Status**: Fixed ✅
**Solution**: Unified SESSION_WALLET_SIGNATURE_MESSAGE constant

### Issue: Session not recovering
**Status**: Should work ✅
**Verify**: Check localStorage for backup
**Key**: `balance_session_wallet_persistent`

---

## Safety Checklist

Before deploying to production:

- [ ] Test full flow with fresh wallet
- [ ] Verify trades execute (no InsufficientCollateral)
- [ ] Confirm referrals show in Drift dashboard
- [ ] Test withdrawal returns correct amount
- [ ] Test session recovery after refresh
- [ ] Verify browser close warning appears
- [ ] Test error handling (insufficient SOL, etc.)
- [ ] Check transaction fees are reasonable
- [ ] Verify no console errors during normal flow

---

## Environment Variables

Required in `.env.local`:
```bash
NEXT_PUBLIC_SOLANA_RPC_URL=<your_helius_or_quicknode_url>
```

Recommended RPC providers:
- Helius (backrun rebates enabled)
- QuickNode
- Triton

**Do NOT use**:
- Public RPC (rate limited)
- `api.mainnet-beta.solana.com` (too slow)

---

## Support & Resources

**Drift Protocol**:
- Dashboard: https://app.drift.trade/
- Docs: https://docs.drift.trade/
- Discord: https://discord.gg/drift

**Solana**:
- Explorer: https://explorer.solana.com/
- Solscan: https://solscan.io/
- Docs: https://docs.solana.com/

**Testing Scripts**:
```bash
# Show referrer config
node scripts/get-referrer-simple.mjs

# Check referrer on-chain (requires Solana CLI)
./scripts/check-referrer-onchain.sh
```

---

**Last Updated**: November 2024
**Next Action**: Run full test using [TESTING-CHECKLIST.md](./TESTING-CHECKLIST.md)
**Priority**: Verify Phase 4 (trading) and Phase 5 (referrals)
