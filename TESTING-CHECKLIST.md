# Balance Game Testing Checklist

## Pre-Test Setup

- [ ] Prepare a wallet with **0.15 SOL** minimum (for rent + trading + buffer)
- [ ] Ensure you have the referrer wallet ready to check dashboard
- [ ] Open browser DevTools Console (F12) to monitor logs
- [ ] Clear browser cache/storage (to test fresh session creation)

## Phase 1: Session Wallet Creation ✅

**Goal**: Verify session wallet is created and funded correctly

### Steps:
1. Start dev server: `npm run dev`
2. Open app in browser
3. Connect wallet with 0.15 SOL
4. Navigate to setup screen

### Expected Logs:
```
[SessionWallet] No existing session found
[WalletConnect] No session found, waiting for deposit to create one
```

### Checklist:
- [ ] Wallet connects without errors
- [ ] Setup screen shows balance
- [ ] No error messages in console

---

## Phase 2: Session Wallet Funding ✅

**Goal**: Deposit SOL to session wallet

### Steps:
1. Choose **"Real"** trading mode
2. Set leverage (e.g., 5x)
3. Choose strategy (e.g., "Balanced")
4. Click deposit button
5. Enter **0.1 SOL**
6. Sign wallet transaction

### Expected Logs:
```
[SessionWallet] Session wallet created: <ADDRESS>
[Setup] Deposit successful: <TX_SIG>
[Setup] Session wallet balance: 0.1 SOL
```

### Checklist:
- [ ] Signature prompt appears
- [ ] Transaction confirms
- [ ] Session wallet shows 0.1 SOL balance
- [ ] Session wallet address displayed
- [ ] No "invalid secretKey" errors

---

## Phase 3: Drift Account Initialization ✅

**Goal**: Create Drift account with referrer and deposit collateral

### Steps:
1. Click "Start Real Trading"
2. Wait for initialization

### Expected Logs (CRITICAL):
```
[DriftPositionManager] Initializing Drift client with session wallet: <ADDRESS>
[DriftPositionManager] Creating Drift user account...
[DriftPositionManager] 💰 Using Balance referrer for fee sharing:
  Referrer: 7PorzwK9s7idBvKNtQSJQf8goSNfUG1yF6BV8eBSKiGB
  ReferrerStats: 7PorzwK9s7idBvKNtQSJQf8goSNfUG1yF6BV8eBSKiGB
[DriftPositionManager] ✅ User account created with referrer
  Init tx: <TX_SIG>
  View on Solscan: https://solscan.io/tx/<TX_SIG>
[DriftPositionManager] Attempting to link referrer via Gateway API...
[DriftPositionManager] ✅ Referrer linked via Gateway API: <RESULT>
[DriftPositionManager] Session wallet balance: 0.1000 SOL
[DriftPositionManager] Will deposit 0.0980 SOL to Drift (0.002 SOL gas reserve)
[DriftPositionManager] ✅ Deposited 0.0980 SOL: <TX_SIG>
[DriftPositionManager] Updated Drift collateral: 19.60
```

### Checklist:
- [ ] Drift account created without errors
- [ ] Referrer info logged (both addresses)
- [ ] Solscan link provided
- [ ] Gateway API returns success OR warning (either is ok)
- [ ] ~0.098 SOL deposited to Drift
- [ ] Collateral shows ~$19.60 (at $200/SOL)
- [ ] Session wallet retains only 0.002 SOL for gas
- [ ] Game starts successfully

### Common Errors:
- ❌ `DriftClient has no user` → Fixed in latest code
- ❌ `provided secretKey is invalid` → Make sure using same signature message
- ❌ `InsufficientCollateral (total_collateral=0)` → Should be fixed by auto-deposit

---

## Phase 4: First Trade Execution ✅

**Goal**: Verify trades can execute with sufficient collateral

### Steps:
1. Wait for game to start
2. Lean the tower (if manual mode, use WASD keys)
3. Watch for alignment triggers

### Expected Logs (SUCCESS):
```
[TradingController] 📊 Signal: long | Conviction: 0.75 | Price: $198.50
[TradingController] ✅ Signal passes filter (conviction >= 0.65)
[DriftPositionManager] Opening LONG position: $250 at 5x leverage
[DriftPositionManager] Current SOL-PERP price: $198.50
[DriftPositionManager] Placing market order with JIT auction...
[DriftPositionManager] ✅ Position opened: <TX_SIG>
[TradingController] ✅ Trade executed: LONG $250
```

### Expected Logs (FAILURE - OLD):
```
❌ Transaction simulation failed: InsufficientCollateral
   total_collateral=0
```

### Checklist:
- [ ] Trading signals appear in console
- [ ] Conviction scores logged
- [ ] **CRITICAL**: Trade executes without `InsufficientCollateral` error
- [ ] Transaction signature returned
- [ ] Position shown in UI
- [ ] No simulation failures every second

### If Trade Fails:
1. Check console for exact error
2. Verify collateral was deposited: Look for "Updated Drift collateral" log
3. If collateral=0, the auto-deposit failed
4. If collateral>0 but trade fails, may be other issue (margin requirements, etc.)

---

## Phase 5: Referral Verification 🔍

**Goal**: Confirm referrer is properly linked

### Steps:
1. Wait for at least 1-2 trades to execute
2. Note the session wallet address from logs
3. Go to: https://app.drift.trade/
4. Connect wallet: `APADQYNLjWsaKhJR72TpfewzS3RjdwLXrn4xzKxHmqZc`
5. Navigate to: **Overview → Referrals**

### Expected Results (SUCCESS):
```
Referral Code: balance
Referred Users: 1 new user
Total Volume: $500+
Your Earnings: ~$0.87 (35% of $2.50 fees)

Recent Referrals:
- <SESSION_WALLET_ADDRESS> - $500 volume - Active
```

### Expected Results (FAILURE):
```
Referral Code: balance
Referred Users: 0
Total Volume: $0
```

### Checklist:
- [ ] Session wallet appears in "Referred Users"
- [ ] Trading volume attributed to referrer
- [ ] Fee earnings show (35% share)
- [ ] Referral created timestamp matches test time

### If Referral Not Working:
1. Check init transaction on Solscan for referrer accounts
2. Check Gateway API log - did it succeed or fail?
3. Try Option 2 from TEST-REFERRAL-INSTRUCTIONS.md (web link test)
4. Contact Drift support with transaction details

---

## Phase 6: Session Recovery 🔄

**Goal**: Verify session persists across refreshes

### Steps:
1. While trading is active, refresh the page (F5)
2. Reconnect same wallet
3. Check if session is recovered

### Expected Logs:
```
[SessionWallet] Attempting to recover session...
[SessionWallet] ✅ Session recovered successfully
[WalletConnect] Using existing session from setup: <ADDRESS>
```

### Checklist:
- [ ] No signature prompt (session recovered automatically)
- [ ] Same session wallet address
- [ ] Trading continues without creating new account
- [ ] Balance preserved

---

## Phase 7: Withdrawal & Cleanup ✅

**Goal**: Successfully withdraw funds and verify no loss

### Steps:
1. Click "Back to Setup" button
2. Click "Withdraw" button
3. Confirm transaction

### Expected Logs:
```
[Withdraw] Checking Drift account for funds...
[Withdraw] Drift has $19.20 - withdrawing to session wallet first
[DriftPositionManager] Withdrew 0.096 SOL from Drift: <TX_SIG>
[WalletConnect] Session wallet balance: 0.098 SOL
[WalletConnect] Withdraw transaction sent: <TX_SIG>
[WalletConnect] Withdraw confirmed
[SessionWallet] ✅ Session cleared
```

### Checklist:
- [ ] Drift funds withdrawn first (if any positions closed)
- [ ] Session wallet funds withdrawn to main wallet
- [ ] Session cleared only after successful withdrawal
- [ ] No SOL lost or trapped in session/Drift accounts
- [ ] Main wallet receives ~0.095 SOL back (after fees)

### If Funds Lost:
- Session backup should still exist in localStorage
- Check browser console for backup: `localStorage.getItem('balance_session_wallet_persistent')`
- Use recovery flow to restore session and retry withdrawal

---

## Summary Results

### Test Run Date: __________

| Phase | Status | Notes |
|-------|--------|-------|
| Session Creation | ⬜ Pass / ⬜ Fail | |
| Session Funding | ⬜ Pass / ⬜ Fail | |
| Drift Init | ⬜ Pass / ⬜ Fail | Collateral: _____ |
| First Trade | ⬜ Pass / ⬜ Fail | Error: _____ |
| Referral | ⬜ Pass / ⬜ Fail | Shows in dashboard: ⬜ |
| Recovery | ⬜ Pass / ⬜ Fail | |
| Withdrawal | ⬜ Pass / ⬜ Fail | SOL recovered: _____ |

### Critical Success Metrics:
- [ ] **No InsufficientCollateral errors** (Phase 4)
- [ ] **Referral shows in dashboard** (Phase 5)
- [ ] **No SOL lost** (Phase 7)

### Known Issues from Previous Tests:
- ✅ **FIXED**: InsufficientCollateral (added auto-deposit)
- ✅ **FIXED**: Session wallet fund loss (added Drift balance check)
- ✅ **FIXED**: Timeout fund loss (removed auto-deletion)
- 🔍 **TESTING**: Referral attribution (dual SDK + API approach)

---

## Quick Reference

**Referrer Wallet**: `APADQYNLjWsaKhJR72TpfewzS3RjdwLXrn4xzKxHmqZc`
**Referrer Account**: `7PorzwK9s7idBvKNtQSJQf8goSNfUG1yF6BV8eBSKiGB`
**Referral Link**: https://app.drift.trade/ref/balance
**Referral Code**: `balance`

**Expected Costs**:
- Drift account rent: ~0.035 SOL (one-time)
- Trading collateral: ~0.063 SOL (recovered on withdrawal)
- Gas reserve: 0.002 SOL (for withdrawal tx)
- Transaction fees: ~0.001 SOL (total for all txs)
- **Total required**: 0.1 SOL
- **Expected recovery**: ~0.095 SOL

**Testing Scripts**:
```bash
# Show referrer config
node scripts/get-referrer-simple.mjs

# Check referrer account on-chain (requires Solana CLI)
./scripts/check-referrer-onchain.sh
```

**Documentation**:
- Detailed referral testing: [TEST-REFERRAL-INSTRUCTIONS.md](./TEST-REFERRAL-INSTRUCTIONS.md)
- Perps roadmap: [PERPS-ROADMAP.md](./PERPS-ROADMAP.md)
- Realtime data setup: [REALTIME-DATA-SETUP.md](./REALTIME-DATA-SETUP.md)
