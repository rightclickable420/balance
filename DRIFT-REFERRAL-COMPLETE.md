# Complete Drift Referral Setup - Quick Guide

## Current Status

✅ **Referral link created**: https://app.drift.trade/ref/balance
✅ **Referral code**: `balance`
⏳ **Next step**: Get your user stats account public key

## Quick Setup (3 Steps)

### Step 1: Find Your Referrer Wallet

This is the wallet you used to create the "balance" referral code on Drift.

- Go to https://app.drift.trade/
- Connect your wallet
- Navigate to Overview → Referrals
- You should see your "balance" referral code
- Note down this wallet's public key

### Step 2: Get Your User Stats Account

Run this command (replace `YOUR_WALLET_PUBKEY` with the wallet from Step 1):

```bash
REFERRER_WALLET_PUBKEY=YOUR_WALLET_PUBKEY npx tsx scripts/get-drift-referrer.ts
```

This will output something like:

```
✅ Found Drift referrer info!

User Stats Account: ABC123...XYZ789

📋 Add this to drift-position-manager.ts:

export const BALANCE_REFERRER_INFO: ReferrerInfo = {
  referrer: new PublicKey("ABC123...XYZ789"),
  referrerStats: new PublicKey("ABC123...XYZ789"),
}
```

### Step 3: Update the Code

Open `src/lib/trading/drift-position-manager.ts` and replace:

```typescript
export const BALANCE_REFERRER_INFO: ReferrerInfo | null = null
```

With the output from Step 2:

```typescript
export const BALANCE_REFERRER_INFO: ReferrerInfo = {
  referrer: new PublicKey("YOUR_USER_STATS_ACCOUNT"),
  referrerStats: new PublicKey("YOUR_USER_STATS_ACCOUNT"),
}
```

## Done! 🎉

Now all users will automatically be referred under your "balance" code and you'll earn:
- **15% of their trading fees**
- **Passive income** from all trading volume
- **~$75 per $1M** in user trading volume

Combined with Helius MEV rebates (~$100-500 per $1M), you'll earn **$175-575 per $1M volume**.

## Verification

After deploying, check the browser console when a user starts real trading. You should see:

```
[DriftPositionManager] Using Balance referrer for fee sharing
```

## Earnings Tracking

Monitor your referral earnings on Drift:
1. Go to https://app.drift.trade/
2. Connect your referrer wallet
3. Navigate to Overview → Referrals
4. View your referral stats and earnings

## Alternative: Manual Lookup

If the script doesn't work, you can find your user stats account manually:

1. Get your referrer wallet public key from Drift
2. Use Solscan to view the wallet's accounts
3. Look for a Drift User Stats account (owned by Drift program)
4. The account address is what you need

## Need Help?

- Check that you're using the correct referrer wallet (the one that created the "balance" code)
- Ensure you have the Helius RPC URL configured in `.env.local`
- Make sure you're on mainnet (not devnet)

---

**Referral Link**: https://app.drift.trade/ref/balance
**Expected Revenue**: 15% of fees = ~$75 per $1M volume
**User Benefit**: 5% discount on fees
