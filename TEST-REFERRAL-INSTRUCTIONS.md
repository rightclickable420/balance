# Testing Drift Referral Implementation

## The Question

Does passing `ReferrerInfo` to `driftClient.initializeUserAccount()` actually link the user to our referral?

## Test Plan

### Option 1: Direct Test in App (Recommended)

1. **Start the dev server**:
   ```bash
   npm run dev
   ```

2. **Open the app** in your browser

3. **Create a test session wallet**:
   - Connect a wallet with ~0.1 SOL
   - Choose "Real" trading mode
   - Deposit 0.065 SOL minimum

4. **Start trading**:
   - The session wallet will be created
   - Drift account will be initialized with `BALANCE_REFERRER_INFO`
   - Check browser console for:
     ```
     [DriftPositionManager] Using Balance referrer for fee sharing
     [DriftPositionManager] ✅ User account created
     ```

5. **Make one trade**:
   - Let it place at least one trade
   - This generates some fee volume

6. **Check your Drift dashboard**:
   - Go to: https://app.drift.trade/
   - Connect wallet: `APADQYNLjWsaKhJR72TpfewzS3RjdwLXrn4xzKxHmqZc`
   - Navigate to: **Overview → Referrals**
   - Look for:
     - New referred user (the session wallet address)
     - Trading volume
     - Your earned fees (35% of their fees)

### Option 2: Manual SDK Test

Create a separate test with a wallet that has SOL:

1. **Create test wallet**:
   ```bash
   solana-keygen new -o test-wallet.json
   ```

2. **Fund it**:
   ```bash
   # Send ~0.1 SOL to the address
   solana transfer <TEST_WALLET_ADDRESS> 0.1 --allow-unfunded-recipient
   ```

3. **Use Drift UI to test**:
   - Go to https://app.drift.trade/ref/balance
   - Connect the test wallet
   - Make a small trade ($10)
   - Check if it shows up in your referrals

## What We're Testing

### If Referral Works ✅

You'll see in your Drift referral dashboard:
- Session wallet address listed as referred user
- Trading volume attributed to you
- Fee earnings (35% of their fees)

**This means**: Our implementation is correct! The hardcoded `BALANCE_REFERRER_INFO` works.

### If Referral Doesn't Work ❌

You won't see the session wallet in your referrals.

**This means**: We need a different approach:

#### Alternative 1: Update Existing Accounts
Some protocols allow updating referrer after account creation. Check Drift SDK for:
```typescript
driftClient.updateUserReferrer(referrerInfo)
```

#### Alternative 2: Web-based Attribution
Users must click through the referral link first:
- Show users: "Start here: https://app.drift.trade/ref/balance"
- Drift tracks them via cookie/session
- Then they use Balance app
- Attribution happens on Drift's backend

#### Alternative 3: Drift Gateway API
Use Drift's Gateway API to programmatically set referrers:
```bash
curl -X POST https://gateway.drift.trade/referral
```

## Expected Results

### Console Logs (Success)

```
[DriftPositionManager] Initializing Drift client with session wallet: <ADDRESS>
[DriftPositionManager] Creating Drift user account...
[DriftPositionManager] Using Balance referrer for fee sharing
[DriftPositionManager] ✅ User account created
```

### Drift Dashboard (Success)

**Referrals Tab**:
```
Referral Code: balance
Referred Users: 1
Total Volume: $300
Your Earnings: $0.52 (35% of $1.50 fees)

Recent Referrals:
- <SESSION_WALLET_ADDRESS> - $300 volume - Active
```

### Transaction Explorer (Verify)

Check the initialization transaction:
1. Find tx signature from console logs
2. Go to: https://explorer.solana.com/tx/<SIGNATURE>
3. Look in the transaction data for referrer account references
4. Should see: `7PorzwK9s7idBvKNtQSJQf8goSNfUG1yF6BV8eBSKiGB`

## Debugging

If you don't see the referral:

1. **Check the Drift program logs**:
   - View the init transaction on Solscan
   - Look for any referrer-related errors
   - Check if referrer account was actually passed

2. **Verify referrer account exists**:
   ```bash
   solana account 7PorzwK9s7idBvKNtQSJQf8goSNfUG1yF6BV8eBSKiGB
   ```

3. **Check Drift docs/Discord**:
   - Ask: "How to programmatically set referrer during initializeUserAccount?"
   - They may have specific requirements

4. **Test the web link separately**:
   - Use a different wallet
   - Go to https://app.drift.trade/ref/balance FIRST
   - Then trade on Drift UI
   - See if that shows up in referrals
   - This confirms your referrer setup is valid

## Timeline

- **Immediate**: Console logs show referrer was passed
- **1-5 minutes**: Drift account created, viewable on-chain
- **5-15 minutes**: Should appear in referral dashboard
- **After first trade**: Volume and fees should update

## Next Steps After Test

### If It Works ✅
- Document that the method is verified
- Deploy to production
- Monitor first real users
- Update documentation with confirmation

### If It Doesn't Work ❌
- Contact Drift support with:
  - Transaction signature
  - Session wallet address
  - Referrer account: `7PorzwK9s7idBvKNtQSJQf8goSNfUG1yF6BV8eBSKiGB`
  - Ask for correct implementation
- Implement alternative method based on their guidance
- Consider hybrid: web link + programmatic

## Questions to Ask Drift

If the test fails, contact Drift with:

1. "Does passing `referrerInfo` to `initializeUserAccount()` set the referrer?"
2. "How do I programmatically set a referrer for user accounts created via SDK?"
3. "Can referrer be updated after account creation?"
4. "What's the correct way to implement referrals in a non-web app?"

---

**Test Status**: ⏳ Ready to run
**Expected Time**: 15 minutes
**Cost**: ~0.01 SOL for account rent + fees
