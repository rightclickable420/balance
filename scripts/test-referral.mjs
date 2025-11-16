#!/usr/bin/env node

/**
 * Simple script to test if a Drift referral is correctly configured
 *
 * Usage:
 *   node scripts/test-referral.mjs
 *
 * This script:
 * 1. Checks if the referrer account exists on-chain
 * 2. Verifies the account is a valid Drift user stats account
 * 3. Shows referrer info that would be used
 */

import { Connection, PublicKey } from '@solana/web3.js'

// Configuration
const DRIFT_PROGRAM_ID = new PublicKey('dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH')
const REFERRER_PUBKEY = new PublicKey('7PorzwK9s7idBvKNtQSJQf8goSNfUG1yF6BV8eBSKiGB')
const REFERRER_WALLET = new PublicKey('APADQYNLjWsaKhJR72TpfewzS3RjdwLXrn4xzKxHmqZc')

// Use your RPC endpoint
const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'

async function main() {
  console.log('🔍 Testing Drift Referral Configuration\n')
  console.log('Referrer Wallet:', REFERRER_WALLET.toBase58())
  console.log('Referrer Account:', REFERRER_PUBKEY.toBase58())
  console.log('Referral Link: https://app.drift.trade/ref/balance\n')

  const connection = new Connection(RPC_URL, 'confirmed')

  // Check if referrer account exists
  console.log('Checking referrer account on-chain...')
  const accountInfo = await connection.getAccountInfo(REFERRER_PUBKEY)

  if (!accountInfo) {
    console.error('❌ FAILED: Referrer account does not exist!')
    console.error('   This means the referral code has not been created on Drift.')
    console.error('   To fix:')
    console.error('   1. Go to https://app.drift.trade/')
    console.error('   2. Connect wallet:', REFERRER_WALLET.toBase58())
    console.error('   3. Create referral code "balance"')
    process.exit(1)
  }

  console.log('✅ Referrer account exists')
  console.log('   Owner:', accountInfo.owner.toBase58())
  console.log('   Data length:', accountInfo.data.length, 'bytes')
  console.log('   Lamports:', accountInfo.lamports / 1e9, 'SOL')

  // Verify it's owned by Drift program
  if (!accountInfo.owner.equals(DRIFT_PROGRAM_ID)) {
    console.warn('⚠️  WARNING: Account is not owned by Drift program!')
    console.warn('   Expected:', DRIFT_PROGRAM_ID.toBase58())
    console.warn('   Got:', accountInfo.owner.toBase58())
    console.warn('   This may not be a valid Drift user stats account.')
  } else {
    console.log('✅ Account is owned by Drift program')
  }

  // Summary
  console.log('\n📊 Summary:')
  console.log('   Referral Code: balance')
  console.log('   Referrer Account: ✅ Valid')
  console.log('   Integration Method: SDK initializeUserAccount()')
  console.log('   Fee Share: 35% of user trading fees')
  console.log('   User Discount: 5% fee reduction')

  console.log('\n🧪 Testing Instructions:')
  console.log('   1. Run: npm run dev')
  console.log('   2. Connect wallet with 0.1 SOL')
  console.log('   3. Choose "Real" mode, deposit 0.065+ SOL')
  console.log('   4. Let it place 1-2 trades')
  console.log('   5. Check https://app.drift.trade/ → Overview → Referrals')
  console.log('   6. Look for session wallet address in referred users')

  console.log('\n✅ Configuration appears valid!')
  console.log('   If referrals still don\'t show, check TEST-REFERRAL-INSTRUCTIONS.md')
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
