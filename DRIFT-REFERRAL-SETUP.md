# Drift Referral Setup for Balance Game

This guide will help you set up your Drift referrer to earn 15% of trading fees from all Balance game users.

**Your referral link**: https://app.drift.trade/ref/balance
**Referral code**: `balance`

## Benefits

- **You earn**: 15% of all trading fees from users playing Balance
- **Users get**: 5% discount on their trading fees
- **Win-win monetization**: Passive income from user trading activity

## Setup Steps

### 1. Create Your Drift Referral Account

1. Go to [https://www.drift.trade/](https://www.drift.trade/)
2. Connect your main wallet (the wallet you want to receive referral rewards)
3. Navigate to **Overview** → **Referrals**
4. Click **"Create my referral link"**
5. Choose a referral code (less than 32 characters, e.g., "balance" or "balancegame")
6. Click **"Create"**

### 2. Get Your Referrer Public Keys

You need to find your User Stats account public key. There are two ways:

#### Option A: Using Drift SDK (Recommended)

Create a script `scripts/get-referrer-info.ts`:

```typescript
import { DriftClient, Wallet } from "@drift-labs/sdk"
import { Connection, PublicKey } from "@solana/web3.js"
import { AnchorProvider } from "@coral-xyz/anchor"

async function getReferrerInfo() {
  // Your main wallet public key (the one you used to create the referral)
  const YOUR_WALLET_PUBKEY = new PublicKey("YOUR_WALLET_ADDRESS_HERE")

  const connection = new Connection("https://api.mainnet-beta.solana.com")

  // Create a dummy wallet for read-only access
  const wallet: Wallet = {
    publicKey: YOUR_WALLET_PUBKEY,
    signTransaction: async (tx) => tx,
    signAllTransactions: async (txs) => txs,
  }

  const driftClient = new DriftClient({
    connection,
    wallet,
    env: "mainnet-beta",
  })

  await driftClient.subscribe()

  // Get user stats public key
  const userStatsPublicKey = driftClient.getUserStatsAccountPublicKey()

  console.log("\n=== Your Drift Referrer Info ===")
  console.log("Referrer Public Key:", userStatsPublicKey.toBase58())
  console.log("Referrer Stats Public Key:", userStatsPublicKey.toBase58())
  console.log("\nAdd this to drift-position-manager.ts:")
  console.log(`
export const BALANCE_REFERRER_INFO: ReferrerInfo = {
  referrer: new PublicKey("${userStatsPublicKey.toBase58()}"),
  referrerStats: new PublicKey("${userStatsPublicKey.toBase58()}"),
}
  `)

  await driftClient.unsubscribe()
}

getReferrerInfo().catch(console.error)
```

Run it:
```bash
npx ts-node scripts/get-referrer-info.ts
```

#### Option B: Using Drift Explorer

1. Go to [Drift Explorer](https://app.drift.trade/)
2. Connect your wallet
3. Look at your account details in the UI
4. Your User Stats account is shown in the account info

### 3. Update the Code

Once you have your referrer public keys, update `/src/lib/trading/drift-position-manager.ts`:

```typescript
export const BALANCE_REFERRER_INFO: ReferrerInfo = {
  referrer: new PublicKey("YOUR_USER_STATS_PUBKEY"),
  referrerStats: new PublicKey("YOUR_USER_STATS_PUBKEY"),
}
```

Replace both instances of `"YOUR_USER_STATS_PUBKEY"` with your actual User Stats public key.

### 4. Verify It's Working

When users create their first Drift account through Balance:

1. Check the console logs for: `"Using Balance referrer for fee sharing"`
2. After users trade, you can view your referral earnings at https://www.drift.trade/overview

## Referral Earnings

- **Earn 15%** of all trading fees from referred users
- Fees are automatically distributed to your wallet
- Track earnings in real-time on the Drift app
- No minimum payout threshold

## Important Notes

- The referrer is set when a user **first creates** their Drift account
- Existing Drift users won't be counted as referrals
- Referral rewards are paid in USDC
- You need to create the referral code on Drift first, then get the public keys

## Testing

Before deploying to production:

1. Test on devnet first if possible
2. Create a test session wallet
3. Verify the referrer is correctly set in the logs
4. Make a small test trade
5. Check that the referral appears in your Drift dashboard

## Questions?

- [Drift Documentation](https://docs.drift.trade/referral-link)
- [Drift Discord](https://discord.com/invite/drift)
- [Drift Twitter](https://twitter.com/DriftProtocol)
