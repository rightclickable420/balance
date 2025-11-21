# Real Trading Implementation Audit

This document tracks the current state of the “real trading” flow and lists the gaps that must be closed before we can safely let users trade with real funds.

## Workflow Status

| # | Requirement | Status | Evidence / Notes |
|---|-------------|--------|------------------|
| 1 | Let user opt into real trading and configure leverage/strategy | **Blocked** – the setup screen hard-codes `REAL_TRADING_AVAILABLE = false`, so the “Real Trading” card is always disabled and the deposit UI never renders (`src/components/game-setup-screen.tsx:22` and `src/components/game-setup-screen.tsx:627-659`). |
| 2 | Connect Phantom wallet | **Partial** – Phantom-only wallet adapter is wired in `src/components/wallet-provider.tsx:20-33`, but we neither display connection errors nor surface SOL balances outside the setup card. |
| 3 | Create session wallet via signed message | **Partial** – `SessionWallet.generateSession` encrypts the keypair (`src/lib/wallet/session-wallet.ts:88-130`), but registry/recovery UX called out in `SESSION-WALLET-SAFETY-REDESIGN.md` is missing entirely (no UI for multiple sessions, no registry checks). |
| 4 | Deposit SOL into the session wallet | **Blocked** – deposit controls only render when `selectedMode === "real"`, which is impossible while the real-mode toggle is disabled (`src/components/game-setup-screen.tsx:541-586`). |
| 5 | Use session wallet to drive automated Drift trades | **Missing** – `TradingController.onStanceChange` exists (`src/lib/trading/trading-controller.ts:227-320`), but nothing ever calls it (no references outside this file), so no trades are triggered even if real trading were enabled. |
| 6 | Initialize Drift account with our referral link | **Unverified** – we attempt to pass `BALANCE_REFERRER_INFO` and hit the Gateway API (`src/lib/trading/drift-position-manager.ts:114-213`), but we have zero instrumentation/tests to confirm referral attribution per `TEST-REFERRAL-INSTRUCTIONS.md`. |
| 7 | Collect Helius backrun rebates | **Unverified** – `HELIUS_REBATE_ADDRESS` is wired into `txSendOptions` during Drift client construction (`src/lib/trading/drift-position-manager.ts:74-198`), but this only pays out if `NEXT_PUBLIC_SOLANA_RPC_URL` points at a Helius endpoint. We are not checking or enforcing that prerequisite. |
| 8 | Gameplay continues while trades execute | **Partial** – Doom Runner runs, but the UI never surfaces real-vs-mock balance because `useGameState` is not synced during setup, and trading metrics stay empty because trades never fire (`src/components/game-ui.tsx:112-182`). |
| 9 | Session wallet auto-deposits to Drift & trades through it | **Partial** – `initialize()` deposits everything above the 0.002 SOL gas reserve into Drift (`src/lib/trading/drift-position-manager.ts:286-366`), but without actual trade execution this simply strands funds inside Drift. |
| 10 | Auto-close positions and withdraw to the session wallet when user stops | **Missing** – nothing calls `TradingController.cleanup()` or `DriftPositionManager.withdrawCollateral()` when the user exits; the “Back to Setup” button only resets client state (`src/components/game-ui.tsx:492-509`). |
| 11 | Preserve session wallet access until funds are confirmed safe | **Missing** – registry helpers (`src/lib/wallet/session-registry.ts`) are never read, there is no recovery UI (`SESSION-WALLET-SAFETY-REDESIGN.md:188-279` describes `session-recovery-screen.tsx`, but the file does not exist), and `WalletConnectButton` still provides a one-click withdraw that clears backups without checking Drift balances (`src/components/wallet-connect-button.tsx:200-243`). |
| 12 | Withdraw back to the user’s Phantom wallet | **Broken** – the safe withdrawal path in `game-setup-screen.tsx:258-420` is hidden, while the WalletConnect shortcut both skips Drift withdrawals and uses `driftInitialized = false` (constant) so the “close all positions” affordances are dead code (`src/components/wallet-connect-button.tsx:15-80`). Even if we hit the safe path, `DriftPositionManager.withdrawCollateral()` uses the wrong market index and destination (`src/lib/trading/drift-position-manager.ts:522-566`), so Drift funds can’t actually be pulled out. |

## Critical Safety Gaps

- **Session registry is write-only.** `SessionWallet.registerSession`, `updateRegistryBalances`, `markAsWithdrawn`, and `markDriftAccountExists` (`src/lib/wallet/session-wallet.ts:103-359`) are never invoked from the UI. We never read `balance_session_registry`, never show prior sessions, and never block users from continuing if a previous session still holds funds, contradicting the safety plan in `SESSION-WALLET-SAFETY-REDESIGN.md:188-322`.
- **Unsafe withdrawal button.** `WalletConnectButton.handleWithdraw` deletes the encrypted backup immediately after transferring whatever happens to be in the session wallet (`src/components/wallet-connect-button.tsx:200-243`). It never queries Drift funds and sets `sessionActive` to false, so the user loses the only recovery vector even if collateral remains on Drift.
- **Drift withdrawal is wired incorrectly.** `withdrawCollateral()` passes `marketIndex = 0` and `associatedTokenAddress = this.user.userAccountPublicKey` (`src/lib/trading/drift-position-manager.ts:522-566`), but SOL collateral lives at spot market index 1 and Drift expects the user’s actual SOL account (the session wallet) as the destination. The method always throws, meaning `handleWithdraw()` silently skips the Drift pull and leaves collateral stuck.
- **No recovery UI or backup validation.** The backup metadata (`PositionBackup`, timestamps, etc.) are never surfaced because `session-wallet.ts`’s `updatePositionsBackup()` is never called and `WalletConnectButton` never populates `recoveredPositions`. We also do not prompt the user with the “recovery screen” described in `SESSION-WALLET-SAFETY-REDESIGN.md`.
- **Drift safety affordances are inert.** `WalletConnectButton` keeps a `driftInitialized` state but never sets it (`src/components/wallet-connect-button.tsx:15-33`), so emergency close buttons always throw “Drift client not initialized.” At the same time, real-mode teardown never calls `TradingController.forceClose()` or `DriftPositionManager.cleanup()`, so positions remain open when the user bails out (`src/components/game-ui.tsx:492-509`).

## Trading & Automation Gaps

- **No signal plumbing.** Nothing calls `TradingController.onStanceChange` (`src/lib/trading/trading-controller.ts:227-320`). Auto-align decisions update the tower visuals but never reach the trading layer, so even after we enable real mode no positions will open or close.
- **Leverage selection is decorative.** We store `tradingLeverage` in state, yet `DriftPositionManager.openPosition()` ignores the `leverage` argument entirely (`src/lib/trading/drift-position-manager.ts:387-416`). Users believe they are selecting 3x/5x/etc., but we always size trades using the hard-coded `$10` base plus conviction scaling.
- **Game state cleanup does not touch open trades.** The “Back to Setup” button only resets local state (`src/components/game-ui.tsx:492-509`). There is no hook to flatten positions, withdraw collateral, or warn the user that funds remain on Drift when leaving the game.
- **Real-mode UI never reflects balances.** Because setup never calls `useGameState.getState().setSessionWallet`, the HUD only learns about the session balance after `WalletConnectButton`’s polling effect fires (up to 30 s later). During gameplay there is still no display of Drift collateral, open positions, or PnL despite `trading-controller.ts` computing those metrics.

## Monetization Hooks

- **Drift referrals need verification.** The code path that hits `driftClient.initializeUserAccount` with `BALANCE_REFERRER_INFO` and then posts to `https://dlob.drift.trade/updateReferrer` (`src/lib/trading/drift-position-manager.ts:114-213`) has never been exercised end-to-end, so we do not know if the Referral Program sees any referred users. Follow `TEST-REFERRAL-INSTRUCTIONS.md` and log the dashboard delta.
- **Helius rebates require infrastructure.** Passing `jitoRebateAddress` is not enough; we must ensure `NEXT_PUBLIC_SOLANA_RPC_URL` points at a Helius RPC endpoint (per `HELIUS-MEV-REBATES.md`). There is no runtime assertion or UI warning if someone runs against a public RPC, so we may be missing rebates silently.

## Archived Branch Assets

The `balance-game-full` branch still contains utilities that we removed during the Doom Runner refactor but still need conceptually for Drift:

- `src/lib/trading/position-manager.ts` – a full Anchor-based Jupiter Perps position inspector that enumerated on-chain positions for a wallet. We need the Drift equivalent to warn the user if positions remain after a crash.
- `src/lib/trading/perps-utils.ts` – helper math for PnL, liquidation price, and PDA derivation. Porting these patterns to Drift will give us proper liquidation warnings and debt-to-collateral tracking.
- `src/lib/trading/jupiter-perpetuals-idl.ts` – the IDL we used to decode account data. For Drift we should pull in their IDL (or re-use the SDK) to replicate the same recovery tooling.

Bringing back the “query open positions and show them before clearing the session” behavior is mandatory for safety and regression tests.

## Recommended Next Steps

1. **Re-enable real trading behind an explicit feature flag.** Split UI availability from production readiness so we can test flows on devnet/mainnet while still hiding them from end users.
2. **Wire the trading controller into the auto-align loop.** Emit stance changes (price, conviction, unrealized PnL) into `tradingController.onStanceChange()` each second and gate actual Drift calls behind the controller’s filters.
3. **Fix Drift collateral management.** Persist the session wallet public key inside `DriftPositionManager`, correct `withdrawCollateral()` parameters (spot index 1, destination = session wallet), and add retries so withdrawals succeed even after reloads.
4. **Replace the unsafe WalletConnect withdraw button with the vetted flow.** Until Drift withdrawals are verified, either hide that button or route it through the guarded `handleWithdraw()` that checks Drift first.
5. **Implement the session recovery UI and registry checks.** On wallet connect, enumerate `getSessionsForWallet()` and block progression until every historical session is either recovered or explicitly marked withdrawn. Include on-chain balance lookups.
6. **Integrate “close all + withdraw” into teardown.** When the user exits real mode, automatically call `TradingController.cleanup()`, close residual positions, withdraw collateral, update the registry, and prompt the user if anything fails.
7. **Verify monetization hooks.** Run the referral checklist, confirm rebates land in `APADQYNLjWsaKhJR72TpfewzS3RjdwLXrn4xzKxHmqZc`, and document the RPC requirements in `README.md`.
8. **Port the archived position-inspection logic to Drift.** Use the patterns from the `balance-game-full` branch to display active positions (with entry price, collateral, liquidation proximity) inside both the Wallet dialog and the setup flow.

Until the items above are addressed we should consider the entire “real trading” experience **unsafe for user funds** – we have no automated way to close positions, drift collateral cannot be withdrawn, and the UI encourages users to delete the only recoverable key.
