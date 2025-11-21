# Drift Real-Trading Integration Plan

Last updated: 2025-11-17

This document consolidates the current state of our Drift integration, the canonical workflow described in Drift's own documentation, and the gaps we still need to close before real-money trading is safe to ship.

## 1. Reference Requirements (Drift docs)

Source: [drift-labs/v2-teacher `source/index.html.md`](https://github.com/drift-labs/v2-teacher/blob/master/source/index.html.md)

| Topic | Drift guidance |
| --- | --- |
| **Account initialization** | `driftClient.initializeUserAccount(subAccountId, name, referrerInfo)` creates the on-chain user and accepts an optional `referrerInfo` struct (`referrer`, `referrerStats`). A new account costs ~0.035 SOL rent and each additional sub-account increments the ID. |
| **Deposits** | `driftClient.deposit(amount, marketIndex, associatedTokenAccount)` moves SOL/USDC collateral into spot markets. Market indexes are fixed (`SOL` spot = 1, `USDC` = 0). Deposits require the user's ATA or, for SOL, the wallet public key. |
| **Withdrawals** | `driftClient.withdraw(amount, marketIndex, associatedTokenAccount)` exits collateral back into the user's wallet. Withdrawals can leave the market in a borrow-only state; callers should use `reduceOnly=true` to block accidental borrows. |
| **Leverage & margin** | Per `user.getTotalCollateral`, `getMarginRequirement`, and `getLeverage`, Drift enforces initial vs maintenance ratios. New positions must satisfy the initial check; maintenance controls liquidations. |
| **Order flow** | Perp markets (SOL-PERP = index 0) support MARKET/LIMIT/TRIGGER/ORACLE orders, all of which can use JIT auctions. Atomic place-and-take orders require top-maker info from the DLOB API (`https://dlob.drift.trade/topMakers`). |
| **Referrals & rebates** | Drift exposes referral rewards (see `_orderbook_dlobserver.md` tables) and errors `DidNotReceiveExpectedReferrer`/`CouldNotDeserializeReferrer`. Linking requires both the SDK parameter and, when necessary, the HTTP `updateReferrer` endpoint. |

## 2. Current Implementation Review

| Area | Reference | Findings |
| --- | --- | --- |
| **Session → Drift bootstrap** | `src/components/game-setup-screen.tsx`, `src/lib/trading/drift-position-manager.ts` | Session wallets are created/recovered safely; they call `driftManager.initialize()` when the user starts real mode. We do not persist the session wallet public key inside `DriftPositionManager`, so later withdrawals cannot derive the correct SOL account. |
| **Referrer linkage** | `drift-position-manager.ts:96-197` | We pass `BALANCE_REFERRER_INFO` to `initializeUserAccount` and call `https://dlob.drift.trade/updateReferrer`. There is no confirmation step (no `user.getUserStatsAccountPublicKey` fetch or dashboard check), so we cannot prove the referral stuck. |
| **Collateral deposit** | `drift-position-manager.ts:277-369` | After init we read the session-wallet SOL balance, reserve 0.002 SOL for gas, and deposit the rest into spot market index **1** (SOL). This matches Drift docs but we never record `setDriftAccountExists` or update the session registry with Drift balances. |
| **Trading execution** | `drift-position-manager.ts:372-533`, `trading-controller.ts` | We open MARKET orders with 5 s auctions and hard-coded slippage (50 bps). Position sizing ignores Drift's free-collateral check; we never throttle when `user.getFreeCollateral()` is zero, so `openPosition()` will throw `InsufficientCollateral` if the strategy tries to stack trades. |
| **UI start/stop** | `game-container.tsx`, `game-ui.tsx` | `GameUI` calls `tradingController.enable()` whenever `gameMode === "real"`; there is no explicit "Start trading" confirmation, nor do we disable trading before the user hits the global "Back to setup" button. Closing the tab with open positions leaves them running server-side. |
| **Withdrawal path** | `drift-position-manager.ts:522-566` | `withdrawCollateral` mistakenly uses spot market index **0** and sends funds to `user.userAccountPublicKey` instead of the session wallet. There is no `reduceOnly` guard, no `await user.fetchAccounts()` refresh, and no registry update. |
| **WalletConnect sidebar** | `wallet-connect-button.tsx` | Emergency "Withdraw" is now removed, but we still display stale registry entries and there is no entry point for "Close positions" unless Drift is already initialized. |

## 3. Gap Analysis & Work Plan

### 3.1 Account + Referral
1. **Persist session wallet key in Drift manager** so we can derive the correct SOL account later. Store it after `initialize()` succeeds and clear it in `cleanup()`.
2. **Verify referral linkage**: after successful `initializeUserAccount`, fetch `driftClient.getUserStatsAccountPublicKey()` and assert its `referrer` matches `BALANCE_REFERRER_INFO`. Log discrepancies and block trading until the referral sticks.
3. **User stats polling**: expose a helper that prints the referral status in the console so QA can confirm before letting traders continue.

### 3.2 Collateral Lifecycle
1. **Deposit bookkeeping**: after each `driftClient.deposit` call, update the session registry entry (`sessionWallet.updateRegistryBalances(driftBalance)`) and store a timestamp.
2. **Reduce-only withdrawals**: rewrite `withdrawCollateral` to:
   - fetch `this.sessionWalletPublicKey` (persisted earlier),
   - call `driftClient.withdraw(amount, SOL_SPOT_MARKET_INDEX, sessionWalletPubkey, true)`,
   - loop until `user.getTotalCollateral()` returns ~0 or bail with an error.
3. **Close-perp-first**: before withdrawing collateral, call `user.getActivePerpPositions()` and close each via a `reduceOnly` MARKET order at 100 % size. Wait for settlement.

### 3.3 Trading Compatibility
1. **Free-collateral guard**: before each `openPosition` we should fetch `user.getFreeCollateral()` and skip trades when it falls below `(positionSize / leverage)` per Drift's initial-margin requirement.
2. **Dynamic slippage & auction duration**: map our strategy urgency (`aggressive`, `balanced`, `high_conviction`) to slippage values recommended by Drift (# of bps) and to `auctionDuration`. Document defaults in config.
3. **Order type support**: add support for limit + trigger orders so we can implement take-profit/stop-loss logic once the auto-align engine matures.

### 3.4 UI Start/Stop
1. **Explicit “Start Trading” step**: after the user deposits, show a checklist summarizing the selected strategy, leverage, and a “Start trading on Drift” confirmation. Don’t call `driftManager.initialize()` until they confirm.
2. **Graceful stop button**: expose “Stop real trading” in the sidebar. When clicked, pause new orders, call `tradingController.cleanup()`, withdraw collateral, and return the user to setup mode only after all funds are back in the session wallet.
3. **Crash recovery**: on reconnect, check the registry for archived/active sessions that still have Drift collateral (`lastKnownDriftBalance > 0`). If found, surface a blocking banner letting the user trigger “Recover & Close Positions”.

### 3.5 Safe Withdrawal & Registry
1. **Fix `withdrawCollateral`** per §3.2 and mark the registry entry `archived` only after both Drift and session-wallet balances hit zero.
2. **Remove historical clutter**: withdrawn entries now default to hidden via the “Show withdrawn” toggle. When we migrate the registry schema, keep only a compact history (timestamp, tx sig, total volume) to avoid cluttering the UI.
3. **Automated tests**: add a headless test in `TESTING-CHECKLIST.md` that runs through deposit → initialize → open mock trade → close → withdraw, verifying that `sessionRegistry` shows zero balances at the end.

## 4. Step-by-step Blueprint

This is the canonical flow we should follow every time we spin up a new real-trading session. Each step cites the relevant Drift documentation or existing code that we must align with.

### 4.1 Session Wallet & Drift Account

1. **Recover/create session wallet** (app code)  
   - Prompt Phantom to sign `SESSION_WALLET_SIGNATURE_MESSAGE`.  
   - Store encrypted key in both session/localStorage.  
   - Register in `session-registry` (`status = active`).  
   - Confirm no unresolved sessions remain before continuing.

2. **Initialize Drift client** (`driftClient.subscribe()`—see v2-teacher “Client Initialization”)  
   - Persist `sessionWalletPublicKey` inside `DriftPositionManager` for later withdrawals.  
   - Subscribe to `user` and `userStats` accounts immediately after initialization.

3. **Create user account with referral** (`source/index.html.md`, “User Initialization”)  
   - Call `driftClient.initializeUserAccount(subAccountId, undefined, BALANCE_REFERRER_INFO)`.  
   - Verify the returned `userAccount` has `referrer = our referrer pubkey`.  
   - As a fallback, POST to `https://dlob.drift.trade/updateReferrer` and re-verify.  
   - Log a blocking error if `user.getUserStatsAccountPublicKey()` does not record the referrer (`DidNotReceiveExpectedReferrer` error code 6068).

4. **Record metadata**  
   - Call `sessionWallet.markDriftAccountExists()` and `updateRegistryBalances(0, driftCollateralUsd)` so the registry knows this wallet owns a Drift account.  
   - Store the new `userAccountPublicKey` in local state for reuse.

### 4.2 Deposits & Risk Guards

1. **Determine deposit amount** (Drift docs “Depositing”)  
   - Query `connection.getBalance(sessionWallet)` and reserve 0.002 SOL for rent/fees.  
   - Deposit the remainder into spot market index 1 (SOL) via `driftClient.deposit`.  
   - Use `driftClient.convertToSpotPrecision` when converting SOL inputs to lamports.  
   - Wait for `user.fetchAccounts()` → update `sessionRegistry` with both `lastKnownSessionBalance` and `lastKnownDriftBalance`.

2. **Enable trading only after deposit succeeds**  
   - Show a confirmation dialog (“Start trading on Drift”) summarizing leverage/strategy.  
   - Disable the “Start Trading” button unless the registry reports ≥ MIN_TRADING_COLLATERAL inside Drift.

3. **Risk checks before each order**  
   - Pull `user.getFreeCollateral(MarginCategory.INITIAL)` and `user.getLeverage()` prior to calling `openPosition`.  
   - Skip trades when `freeCollateral < (positionSize / leverage)` or when `leverage > strategy.maxLeverage`.  
   - Map strategies → order parameters:  
     | Strategy | Max leverage | Slippage bps | Auction duration | Notes |  
     | --- | --- | --- | --- | --- |  
     | aggressive | 10x | 75 | 3s | More frequent, higher fee burden |  
     | balanced | 5x | 50 | 5s | Default |  
     | high_conviction | 3x | 30 | 8s | Only trade on high conviction |  
   - Incorporate `user.getOpenOrders()` so we don’t stack multiple positions erroneously.

4. **Order submission**  
   - Use MARKET orders with reduce-only flag when closing positions; use LIMIT/ORACLE orders for advanced strategies once we integrate the DLOB place-and-take helper (`_examples.md`).  
   - Log Solscan URLs for every order tx to aid debugging.

### 4.3 Teardown & Recovery

1. **Stop button workflow**  
   - Provide an explicit “Stop real trading” control in `GameUI`.  
   - On click: pause new trades, call `tradingController.forceClose()`, and surface progress (“Closing positions…”, “Withdrawing collateral…”).

2. **Close positions**  
   - Loop over `user.getActivePerpPositions()` and issue reduce-only `placePerpOrder` calls with 100% size.  
   - Wait for each close tx to confirm and call `user.fetchAccounts()` afterward.

3. **Withdraw collateral** (Drift docs “Withdrawing”)  
   - After confirming there are no active perps, call `driftClient.withdraw(amount, SOL_SPOT_MARKET_INDEX, sessionWalletPubkey, true)`.  
   - Continue withdrawing until `user.getTotalCollateral()` < $0.10 or we hit a `MarketWithdrawPaused` error (code 6149).  
   - Update the registry with the final Drift + session balances.

4. **Return to setup mode**  
   - Once collateral is back in the session wallet, set registry status to `archived` (keeping the keypair intact).  
   - Show a summary (“Session wallet: 0.1000 SOL • Drift: $0.00 • Referrer linked ✓”).  
   - Only after confirmation should we drop back to the mock trading setup.

5. **Crash recovery**  
   - On app launch, scan the registry for any entries with `status !== withdrawn` and `lastKnownDriftBalance > 0`.  
   - If found, short-circuit the setup wizard with a blocking banner (“Recover session ABC… first”).  
   - Offer buttons to “Reopen session” (auto-recover and initialize Drift) and “Mark as resolved” (only after verifying via Solscan that collateral is zero).

### 4.4 Real-time Drift HUD Updates

1. **Account subscription or polling**
   - Drift’s SDK supports real-time account subscriptions; the `user.subscribe()` call we already make can emit account changes. Whenever possible, tap into that subscription (e.g. via an event or periodic `user.fetchAccounts()` call inside the subscriber) so we react as soon as positions update.
   - If subscriptions aren’t feasible in the browser, fall back to a throttle-controlled poll (`setInterval` at ~1 s) that runs **only when real trading is enabled**. Guard against overlapping requests.
2. **Derive display metrics**
   - Call `getPositionSummary()` once per tick to obtain `totalCollateral`, `totalEquity`, `totalUnrealizedPnl`, `freeCollateral`, `marginUsage`, and the open positions list.
   - Call `user.getTokenAmount(SOL_SPOT_MARKET_INDEX)` to see how much SOL collateral remains and track the session-wallet SOL separately (only changes when we deposit/withdraw).
   - Capture Drift’s `oraclePrice` (via `getOracleDataForPerpMarket`) if we need to convert SOL balances to USD for the HUD.
3. **Update Zustand state**
   - Push `totalCollateral` into `driftCollateralUsd` (HUD “balance” in USD) while leaving `sessionWalletBalance` to mirror the SOL session wallet for deposit UI.
   - Map `totalEquity` into `equity` and `totalUnrealizedPnl` into both `unrealizedPnl` and `driftUnrealizedPnlUsd`; reset `startingRealBalance` to zero whenever collateral hits zero so a fresh deposit sets a new baseline.
   - Store `freeCollateral` and `marginUsage` for optional warnings/badges in the HUD.
   - Update `openPositionSize` and `unrealizedPnl` from Drift rather than the mock ledger to keep the Doom Runner HUD accurate.
4. **Frequency guidance**:
   - Matching our stance cadence (1 s updates) is sufficient; this is also what Drift’s keeper bots (`keeper-bots-v2`) use for UI/pricing loops.
   - If we observe rate-limit issues, expand the interval (e.g. 1.5–2 s) or rely more heavily on the built-in account subscription to avoid raw RPC polling.

## 5. Next Implementation Tasks

1. **Wire the plan into `drift-position-manager.ts`** (persist session pubkey, verify referral, add free-collateral guard, fix `withdrawCollateral`).  
2. **Update the UI** (confirmation modal, stop button, recovery banner, progress indicators).  
3. **Automate tests** (scripted devnet run or mock harness) to validate the entire flow.  
4. **Document real-world rehearsals** (tx signatures, referral dashboard screenshots) to prove the ref link and rebate pipeline work before inviting users.
