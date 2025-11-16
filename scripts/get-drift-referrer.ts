/**
 * Script to get Drift referrer public keys
 *
 * Run this script after connecting to Drift with your referrer wallet to get the
 * user stats account public key needed for BALANCE_REFERRER_INFO
 */

import { Connection, PublicKey } from "@solana/web3.js"
import { DriftClient, Wallet } from "@drift-labs/sdk"

const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"
const REFERRAL_CODE = "balance"

async function getReferrerInfo() {
  console.log("🔍 Looking up Drift referrer info for code:", REFERRAL_CODE)
  console.log("RPC:", RPC_URL)

  const connection = new Connection(RPC_URL, "confirmed")

  // You need to provide your referrer wallet public key
  // This is the wallet you used to create the referral code at https://app.drift.trade/
  const REFERRER_WALLET = process.env.REFERRER_WALLET_PUBKEY

  if (!REFERRER_WALLET) {
    console.error("❌ Please set REFERRER_WALLET_PUBKEY environment variable")
    console.log("\nUsage:")
    console.log("  REFERRER_WALLET_PUBKEY=YourWalletPublicKey tsx scripts/get-drift-referrer.ts")
    console.log("\nThis should be the public key of the wallet you used to create the 'balance' referral code")
    process.exit(1)
  }

  try {
    const referrerWalletPubkey = new PublicKey(REFERRER_WALLET)
    console.log("📍 Referrer wallet:", referrerWalletPubkey.toBase58())

    // Create a dummy wallet (we don't need to sign anything)
    const dummyWallet: Wallet = {
      publicKey: referrerWalletPubkey,
      signTransaction: async (tx) => tx,
      signAllTransactions: async (txs) => txs,
    }

    const driftClient = new DriftClient({
      connection,
      wallet: dummyWallet,
      env: "mainnet-beta",
    })

    await driftClient.subscribe()

    // Get user stats account for the referrer wallet
    const userStatsAccountPublicKey = driftClient.getUserStatsAccountPublicKey()

    console.log("\n✅ Found Drift referrer info!")
    console.log("\nUser Stats Account:", userStatsAccountPublicKey.toBase58())

    console.log("\n📋 Add this to drift-position-manager.ts:\n")
    console.log("export const BALANCE_REFERRER_INFO: ReferrerInfo = {")
    console.log(`  referrer: new PublicKey("${userStatsAccountPublicKey.toBase58()}"),`)
    console.log(`  referrerStats: new PublicKey("${userStatsAccountPublicKey.toBase58()}"),`)
    console.log("}")

    console.log("\n💰 Earnings: 15% of all user trading fees")
    console.log("🎁 User discount: 5% off trading fees")

    await driftClient.unsubscribe()
  } catch (error) {
    console.error("❌ Error:", error)
    process.exit(1)
  }
}

getReferrerInfo()
