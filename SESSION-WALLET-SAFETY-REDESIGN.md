# Session Wallet Safety Redesign

## Critical Problem

Current implementation has multiple points of failure where users could lose access to funds:
1. Backup check could fail silently
2. Drift balance check could fail
3. Recovery could fail mid-process
4. Session could be cleared prematurely

## New Safety Architecture

### 1. Persistent Session Registry (Never Auto-Delete)

**File**: `src/lib/wallet/session-registry.ts`

```typescript
interface SessionRecord {
  sessionPublicKey: string
  mainWalletPublicKey: string
  createdAt: number
  lastAccessedAt: number
  status: 'active' | 'withdrawn' | 'archived'
  driftAccountExists: boolean
  metadata: {
    initialDeposit: number
    lastKnownBalance: number
    lastKnownDriftBalance: number
  }
}

class SessionRegistry {
  // Store in localStorage with main wallet as index
  // Multiple session records per wallet possible

  registerSession(record: SessionRecord): void
  getSessionsForWallet(mainWalletPubKey: string): SessionRecord[]
  markAsWithdrawn(sessionPubKey: string): void
  updateLastAccessed(sessionPubKey: string): void
}
```

**Purpose**: Keep permanent record of all sessions ever created. Never delete unless user explicitly confirms withdrawal completed.

### 2. Mandatory Recovery Screen

When wallet connects, BEFORE showing setup:
1. Check registry for any sessions associated with this wallet
2. If sessions found, show recovery screen with:
   - List of all session wallets
   - On-chain balance for each
   - Drift account status for each
   - Option to recover or mark as "withdrawn"

**User cannot proceed until they:**
- Recover each session, OR
- Explicitly confirm "I already withdrew this"

### 3. Defensive Session Backup Strategy

**Current approach (unsafe)**:
```typescript
// Bad: Single point of failure
if (sessionWallet.hasBackup()) {
  recover()
}
```

**New approach (defensive)**:
```typescript
// Try multiple recovery strategies
async function recoverSession(mainWalletPubKey: string): Promise<Keypair | null> {
  // Strategy 1: Check localStorage backup
  const localBackup = localStorage.getItem('balance_session_wallet_persistent')
  if (localBackup) {
    try {
      return await attemptRecover(localBackup)
    } catch (e) {
      console.warn('localStorage recovery failed, trying sessionStorage')
    }
  }

  // Strategy 2: Check sessionStorage backup
  const sessionBackup = sessionStorage.getItem('balance_session_wallet_encrypted')
  if (sessionBackup) {
    try {
      return await attemptRecover(sessionBackup)
    } catch (e) {
      console.warn('sessionStorage recovery failed, checking registry')
    }
  }

  // Strategy 3: Check registry for known sessions
  const registry = getSessionRegistry()
  const knownSessions = registry.getSessionsForWallet(mainWalletPubKey)

  if (knownSessions.length > 0) {
    // Show UI asking user which session to recover
    // Provide on-chain balance info to help them decide
    return await showRecoveryUI(knownSessions)
  }

  return null // Truly no sessions found
}
```

### 4. On-Chain Balance Verification

Before allowing any session to be cleared:
```typescript
async function canSafelyClearSession(sessionPubKey: PublicKey): Promise<boolean> {
  // Check 1: Session wallet balance
  const walletBalance = await connection.getBalance(sessionPubKey)
  if (walletBalance > 5000) { // 0.000005 SOL minimum dust
    return false
  }

  // Check 2: Drift account balance (with retry)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const driftManager = getDriftPositionManager()
      if (driftManager.isInitialized) {
        const summary = await driftManager.getPositionSummary()
        if (summary.totalCollateral > 0.5) { // Any meaningful balance
          return false
        }
      }
      break // Success, exit retry loop
    } catch (e) {
      if (attempt === 2) {
        // After 3 attempts, we CANNOT confirm it's safe
        console.error('Cannot verify Drift balance after 3 attempts')
        return false // Safe default: don't clear
      }
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }

  return true
}
```

### 5. Explicit User Confirmation Required

Never silently clear a session. Always require explicit confirmation:

```typescript
async function withdrawAndClear(sessionWallet: SessionWallet) {
  // Step 1: Withdraw from Drift
  const driftWithdrawn = await withdrawFromDrift()

  // Step 2: Withdraw from session wallet
  const sessionWithdrawn = await withdrawFromSessionWallet()

  // Step 3: Verify both are empty
  const safe = await canSafelyClearSession(sessionWallet.publicKey)

  if (!safe) {
    alert(
      'WARNING: Could not verify all funds were withdrawn.\n\n' +
      'Your session wallet backup will be PRESERVED for safety.\n' +
      'Reconnect with the same wallet to access any remaining funds.'
    )
    // Mark as archived but DO NOT clear
    registry.updateStatus(sessionWallet.publicKey, 'archived')
    return
  }

  // Step 4: Ask for explicit confirmation
  const confirmed = window.confirm(
    'All funds withdrawn successfully!\n\n' +
    'Clear session wallet backup?\n\n' +
    'Click OK to permanently delete this session.\n' +
    'Click Cancel to keep the backup (safe option).'
  )

  if (confirmed) {
    sessionWallet.clearSession()
    registry.updateStatus(sessionWallet.publicKey, 'withdrawn')
  } else {
    registry.updateStatus(sessionWallet.publicKey, 'archived')
  }
}
```

### 6. Recovery UI Component

**File**: `src/components/session-recovery-screen.tsx`

Shows when wallet connects and has previous sessions:

```
┌─────────────────────────────────────────────┐
│  Session Wallet Recovery                    │
├─────────────────────────────────────────────┤
│                                             │
│  We found 2 session wallets from previous  │
│  sessions. Please review each one:          │
│                                             │
│  ┌───────────────────────────────────────┐ │
│  │ Session 1                             │ │
│  │ Created: Jan 15, 2025 2:30 PM        │ │
│  │ Last accessed: Jan 15, 2025 3:45 PM  │ │
│  │                                       │ │
│  │ Session Wallet: 0.065 SOL ✓          │ │
│  │ Drift Account: $12.50 ✓              │ │
│  │                                       │ │
│  │ [Recover & Withdraw]  [Mark Cleared] │ │
│  └───────────────────────────────────────┘ │
│                                             │
│  ┌───────────────────────────────────────┐ │
│  │ Session 2                             │ │
│  │ Created: Jan 10, 2025 10:00 AM       │ │
│  │ Last accessed: Jan 10, 2025 11:30 AM │ │
│  │                                       │ │
│  │ Session Wallet: 0.000 SOL            │ │
│  │ Drift Account: Checking...           │ │
│  │                                       │ │
│  │ [Recover & Withdraw]  [Mark Cleared] │ │
│  └───────────────────────────────────────┘ │
│                                             │
│  ⚠️ You must recover or confirm cleared    │
│     for all sessions before continuing      │
│                                             │
└─────────────────────────────────────────────┘
```

### 7. Implementation Priority

**Phase 1 (Immediate - Prevent Loss)**:
1. ✅ Never auto-delete backups (already done)
2. ✅ Add session registry to track all sessions
3. ✅ Check registry on wallet connect
4. ✅ Show recovery UI if sessions found

**Phase 2 (Enhanced Safety)**:
1. ✅ Add retry logic for Drift balance checks
2. ✅ Require explicit confirmation before clearing
3. ✅ Add "archived" status for uncertain sessions

**Phase 3 (User Experience)**:
1. ✅ Add session wallet explorer/manager
2. ✅ Show historical sessions
3. ✅ Allow bulk operations

## Code Changes Required

### 1. Create Session Registry

**New file**: `src/lib/wallet/session-registry.ts`

### 2. Update Session Wallet

**File**: `src/lib/wallet/session-wallet.ts`

Add:
- `registerInRegistry()` - call when creating/recovering session
- Never call `clearSession()` without registry update

### 3. Update Setup Screen

**File**: `src/components/game-setup-screen.tsx`

Add:
- Check registry on mount
- Show recovery screen if needed
- Update registry on all operations

### 4. Create Recovery Screen

**New file**: `src/components/session-recovery-screen.tsx`

### 5. Update Withdrawal Flow

**File**: `src/components/game-setup-screen.tsx`

Change withdrawal to:
1. Withdraw from Drift (with retry)
2. Withdraw from session wallet
3. Verify both empty (with retry)
4. Update registry
5. Ask for explicit clear confirmation
6. ONLY clear if user confirms AND verification passed

## Safety Guarantees

With this system:
1. ✅ Sessions never silently deleted
2. ✅ User sees all previous sessions on connect
3. ✅ Multiple recovery attempts before failing
4. ✅ On-chain verification before clearing
5. ✅ Explicit user confirmation required
6. ✅ Safe default: preserve backup if uncertain
7. ✅ Audit trail of all sessions

## Backward Compatibility

For existing users with backups:
1. On first connect, migrate existing backup to registry
2. Show recovery screen
3. Allow them to withdraw or confirm cleared

## Testing Checklist

- [ ] User deposits, refreshes → recovers successfully
- [ ] User deposits, closes tab, reopens → recovers successfully
- [ ] Drift balance check fails → session preserved
- [ ] Session wallet check fails → session preserved
- [ ] User explicitly withdraws → can choose to clear or keep
- [ ] Multiple sessions → all shown in recovery UI
- [ ] Registry survives browser close
- [ ] Registry survives cache clear (use multiple storage locations)

## Emergency Recovery Procedure

If user loses access despite all safeguards:
1. Check localStorage: `balance_session_wallet_persistent`
2. Check sessionStorage: `balance_session_wallet_encrypted`
3. Check registry: `balance_session_registry`
4. Provide recovery tool that lists all known session public keys
5. User can check balances on Solana Explorer
6. Contact support with main wallet + session wallet addresses
