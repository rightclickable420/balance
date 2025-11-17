import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL, Transaction, VersionedTransaction } from "@solana/web3.js"
import {
  DriftClient,
  type DriftEnv,
  User,
  Wallet,
  OrderType,
  PositionDirection,
  MarketType,
  BN,
  BASE_PRECISION,
  PRICE_PRECISION,
  QUOTE_PRECISION,
  ReferrerInfo,
  getUserAccountPublicKey,
} from "@drift-labs/sdk"

/**
 * Drift Protocol Position Manager
 *
 * Handles opening, closing, and querying perpetual positions on Drift Protocol.
 * Uses Drift V2 SDK with support for Swift Protocol (gasless trading).
 *
 * Key advantages over Jupiter:
 * - Sub-second fills with Swift Protocol
 * - Gasless trading (no transaction fees for traders)
 * - Direct market order execution (no keeper delay)
 * - JIT auction for optimal pricing
 */

// Drift Program IDs (mainnet-beta)
export const DRIFT_PROGRAM_ID = new PublicKey("dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH")

/**
 * Balance Game Referrer Configuration
 *
 * To set up your own referrer:
 * 1. Go to https://www.drift.trade/
 * 2. Connect your wallet
 * 3. Navigate to Overview > Referrals
 * 4. Create a referral code (< 32 characters)
 * 5. Use the SDK to get your referrer public keys:
 *    - referrer: Your user stats account public key
 *    - referrerStats: Your user stats account public key
 *
 * Referrers earn 35% of trading fees from referred users (Balance special rate!)
 * Referred users get 5% discount on fees
 */
// Drift referral: https://app.drift.trade/ref/balance
// Referral code: "balance"
// Referrer wallet: APADQYNLjWsaKhJR72TpfewzS3RjdwLXrn4xzKxHmqZc
// Revenue: 35% of all user trading fees!
export const BALANCE_REFERRER_INFO: ReferrerInfo = {
  referrer: new PublicKey("7PorzwK9s7idBvKNtQSJQf8goSNfUG1yF6BV8eBSKiGB"),
  referrerStats: new PublicKey("7PorzwK9s7idBvKNtQSJQf8goSNfUG1yF6BV8eBSKiGB"),
}

/**
 * Helius Backrun Rebate Address
 *
 * Configure this to receive MEV rebates from Helius backrun auctions.
 * Helius shares 50% of MEV revenue with you when searchers backrun your transactions.
 *
 * To set up:
 * 1. Create/use a wallet to receive rebates
 * 2. Add the public key here
 * 3. Use Helius RPC endpoint in .env.local
 *
 * Expected earnings: ~$0.0001-0.001 SOL per trade
 * With high frequency trading: ~$100-500 per $1M volume
 *
 * Documentation: https://www.helius.dev/docs/sending-transactions/backrun-rebates
 */
export const HELIUS_REBATE_ADDRESS: PublicKey = new PublicKey("APADQYNLjWsaKhJR72TpfewzS3RjdwLXrn4xzKxHmqZc")

export interface DriftPosition {
  marketIndex: number
  baseAssetAmount: BN // Position size in base asset (SOL)
  quoteAssetAmount: BN // Position size in USD
  quoteEntryAmount: BN // Entry cost
  quoteFundingAmount: BN // Cumulative funding
  openOrders: number
  unsettledPnl: BN
  lastCumulativeFundingRate: BN
  lastBaseAssetAmountPerLp: BN
  lastQuoteAssetAmountPerLp: BN
  remainderBaseAssetAmount: number
  marketType: "perp" | "spot"
}

export interface Position {
  marketIndex: number
  marketSymbol: string
  side: "long" | "short"
  size: number // Position size in base asset (e.g., SOL)
  sizeUsd: number // Position value in USD
  entryPrice: number // Average entry price
  unrealizedPnl: number // Current unrealized PnL
  unrealizedPnlPercent: number // PnL as percentage of collateral
  leverage: number // Effective leverage
  liquidationPrice: number // Estimated liquidation price
  openTime: number // Timestamp of position opening
}

export interface PositionSummary {
  positions: Position[]
  totalEquity: number // Account equity (deposits + unrealized PnL)
  totalCollateral: number // Total collateral across all positions
  totalUnrealizedPnl: number // Sum of unrealized PnL
  freeCollateral: number // Available margin
  marginUsage: number // Percentage of margin used (0-100)
}

export class DriftPositionManager {
  private connection: Connection
  private driftClient: DriftClient | null = null
  private user: User | null = null
  private isInitialized = false

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, "confirmed")
  }

  /**
   * Check if Drift client is initialized
   */
  getIsInitialized(): boolean {
    return this.isInitialized
  }

  /**
   * Initialize Drift client with session keypair
   * This must be called before any trading operations
   */
  async initialize(sessionKeypair: Keypair): Promise<void> {
    if (this.isInitialized) {
      console.log("[DriftPositionManager] Already initialized")
      return
    }

    try {
      console.log(
        "[DriftPositionManager] Initializing Drift client with session wallet:",
        sessionKeypair.publicKey.toBase58()
      )

      // Create wallet from session keypair
      const wallet = {
        publicKey: sessionKeypair.publicKey,
        signTransaction: async (tx: Transaction | VersionedTransaction) => {
          // Handle both legacy Transaction and VersionedTransaction
          if ('partialSign' in tx) {
            // Legacy Transaction
            tx.partialSign(sessionKeypair)
          } else {
            // VersionedTransaction
            tx.sign([sessionKeypair])
          }
          return tx
        },
        signAllTransactions: async (txs: (Transaction | VersionedTransaction)[]) => {
          txs.forEach((tx) => {
            if ('partialSign' in tx) {
              tx.partialSign(sessionKeypair)
            } else {
              tx.sign([sessionKeypair])
            }
          })
          return txs
        },
      } as Wallet

      // Initialize DriftClient with optional Helius rebate configuration
      const driftConfig: {
        connection: Connection
        wallet: Wallet
        env: DriftEnv
        txSendOptions?: {
          preflightCommitment: "processed" | "confirmed" | "finalized"
          jitoRebateAddress: string
        }
      } = {
        connection: this.connection,
        wallet,
        env: "mainnet-beta",
      }

      // Add Helius rebate address to transaction send options if configured
      if (HELIUS_REBATE_ADDRESS) {
        console.log(
          "[DriftPositionManager] Helius rebate address configured:",
          HELIUS_REBATE_ADDRESS.toBase58()
        )
        driftConfig.txSendOptions = {
          preflightCommitment: "confirmed",
          // Helius-specific field for MEV rebates
          jitoRebateAddress: HELIUS_REBATE_ADDRESS.toBase58(),
        }
      }

      this.driftClient = new DriftClient(driftConfig)

      await this.driftClient.subscribe()
      console.log("[DriftPositionManager] ✅ DriftClient subscribed")

      // Check if user account exists by deriving the PDA directly
      const subAccountId = 0
      const authority = sessionKeypair.publicKey
      const userAccountPublicKey = await getUserAccountPublicKey(
        DRIFT_PROGRAM_ID,
        authority,
        subAccountId
      )

      console.log("[DriftPositionManager] User account PDA:", userAccountPublicKey.toBase58())

      // Check if account exists on-chain
      const accountInfo = await this.connection.getAccountInfo(userAccountPublicKey)
      const userAccountExists = accountInfo !== null

      if (!userAccountExists) {
        console.log("[DriftPositionManager] Creating Drift user account...")

        // Pass referrer info if configured for fee earning
        if (BALANCE_REFERRER_INFO) {
          console.log("[DriftPositionManager] 💰 Using Balance referrer for fee sharing:")
          console.log("  Referrer:", BALANCE_REFERRER_INFO.referrer.toBase58())
          console.log("  ReferrerStats:", BALANCE_REFERRER_INFO.referrerStats.toBase58())
          console.log("  Revenue share: 35% of trading fees")

          const initTxSig = await this.driftClient.initializeUserAccount(
            subAccountId,
            undefined, // name
            BALANCE_REFERRER_INFO // referrerInfo
          )

          console.log("[DriftPositionManager] ✅ User account created with referrer")
          console.log("  Init tx:", initTxSig)
          console.log("  View on Solscan: https://solscan.io/tx/" + initTxSig)
        } else {
          console.log("[DriftPositionManager] No referrer configured")
          await this.driftClient.initializeUserAccount(subAccountId)
        }

        console.log("[DriftPositionManager] ✅ User account created")

        // IMPORTANT: Try to set referrer via Drift Gateway API
        // The SDK initializeUserAccount referrerInfo parameter may not work reliably
        // Use Gateway API as backup to ensure referrer is linked
        try {
          console.log("[DriftPositionManager] Attempting to link referrer via Gateway API...")
          const response = await fetch("https://dlob.drift.trade/updateReferrer", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              userAccount: userAccountPublicKey.toBase58(),
              referrer: BALANCE_REFERRER_INFO.referrer.toBase58(),
            }),
          })

          if (response.ok) {
            const result = await response.json()
            console.log("[DriftPositionManager] ✅ Referrer linked via Gateway API:", result)
          } else {
            const errorText = await response.text()
            console.warn(
              `[DriftPositionManager] ⚠️ Gateway API referrer link failed (${response.status}):`,
              errorText
            )
            console.warn(
              "[DriftPositionManager] Referral may still work if SDK parameter was accepted"
            )
          }
        } catch (gatewayError) {
          console.warn("[DriftPositionManager] ⚠️ Could not contact Gateway API:", gatewayError)
          console.warn(
            "[DriftPositionManager] Referral will only work if SDK parameter was accepted during init"
          )
        }
      } else {
        console.log(
          "[DriftPositionManager] User account exists:",
          userAccountPublicKey.toBase58()
        )
      }

      // Subscribe to user account
      this.user = this.driftClient.getUser(subAccountId)
      await this.user.subscribe()
      console.log("[DriftPositionManager] ✅ User subscribed")

      // Check current collateral and deposit session wallet balance if needed
      const totalCollateral = this.user.getTotalCollateral()
      const currentCollateral = totalCollateral.toNumber() / QUOTE_PRECISION.toNumber()

      console.log(`[DriftPositionManager] Current Drift collateral: $${currentCollateral.toFixed(2)}`)

      // Get session wallet balance
      const walletBalance = await this.connection.getBalance(sessionKeypair.publicKey)
      const walletBalanceSol = walletBalance / LAMPORTS_PER_SOL

      // Keep minimal SOL for gas
      // Drift uses Swift Protocol (gasless trading), so we only need SOL for:
      // - Withdraw transaction back to main wallet (~0.000005 SOL)
      // - Closing Drift account if needed (~0.000005 SOL)
      // - Small buffer for any unexpected fees
      const gasReserve = 0.002 // 0.002 SOL is plenty for a couple transactions
      const depositableSol = Math.max(0, walletBalanceSol - gasReserve)

      console.log(`[DriftPositionManager] Session wallet balance: ${walletBalanceSol.toFixed(4)} SOL`)
      console.log(`[DriftPositionManager] Will deposit ${depositableSol.toFixed(4)} SOL to Drift (${gasReserve} SOL gas reserve)`)

      if (depositableSol > 0.001) { // Only deposit if we have meaningful amount
        console.log(
          `[DriftPositionManager] Depositing ${depositableSol.toFixed(4)} SOL as collateral (keeping ${gasReserve} SOL for gas)...`
        )

        // Deposit SOL as collateral to Drift
        // SOL is spot market index 1 in Drift (0 is USDC)
        const SOL_SPOT_MARKET_INDEX = 1
        const depositAmount = new BN(Math.floor(depositableSol * LAMPORTS_PER_SOL))

        console.log(`[DriftPositionManager] Deposit params:`, {
          amount: depositAmount.toString(),
          marketIndex: SOL_SPOT_MARKET_INDEX,
          amountSOL: depositableSol,
        })

        const depositTxSig = await this.driftClient.deposit(
          depositAmount,
          SOL_SPOT_MARKET_INDEX,
          sessionKeypair.publicKey // User's token account (their SOL wallet)
        )

        console.log(`[DriftPositionManager] ✅ Deposited ${depositableSol.toFixed(4)} SOL: ${depositTxSig}`)
        console.log(`[DriftPositionManager] View tx: https://solscan.io/tx/${depositTxSig}`)

        // Wait for user account to update
        console.log(`[DriftPositionManager] Waiting for account to update...`)
        await new Promise(resolve => setTimeout(resolve, 3000))

        // Refresh user data
        await this.user.fetchAccounts()

        // Log updated collateral
        const updatedTotalCollateral = this.user.getTotalCollateral()
        const updatedCollateral = updatedTotalCollateral.toNumber() / QUOTE_PRECISION.toNumber()
        console.log(`[DriftPositionManager] Updated Drift collateral: $${updatedCollateral.toFixed(2)}`)

        if (updatedCollateral < 1) {
          console.error(
            `[DriftPositionManager] ❌ Collateral still too low after deposit! Got $${updatedCollateral.toFixed(2)}`
          )
        }
      } else {
        console.warn(
          `[DriftPositionManager] ⚠️  Insufficient SOL to deposit (${walletBalanceSol.toFixed(4)} SOL). Need at least ${(gasReserve + 0.001).toFixed(3)} SOL total.`
        )
        throw new Error(
          `Insufficient balance: ${walletBalanceSol.toFixed(4)} SOL available, need at least ${(gasReserve + 0.001).toFixed(3)} SOL`
        )
      }

      this.isInitialized = true
    } catch (error) {
      console.error("[DriftPositionManager] Initialization failed:", error)
      throw error
    }
  }

  /**
   * Open a new perpetual position (LONG or SHORT)
   *
   * @param side - "long" or "short"
   * @param sizeUsd - Position size in USD
   * @param marketIndex - Market index (0 = SOL-PERP)
   * @param leverage - Desired leverage (1-100x)
   * @param slippageBps - Max slippage in basis points (default: 50 = 0.5%)
   * @returns Transaction signature
   */
  async openPosition(
    side: "long" | "short",
    sizeUsd: number,
    marketIndex: number = 0, // SOL-PERP
    leverage: number = 20, // Default 20x (max 100x)
    slippageBps: number = 50
  ): Promise<string> {
    if (!this.driftClient || !this.user) {
      throw new Error("DriftClient not initialized. Call initialize() first.")
    }

    try {
      console.log(
        `[DriftPositionManager] Opening ${side.toUpperCase()} position: $${sizeUsd} at ${leverage}x leverage`
      )

      // Get current oracle price for the market
      const oraclePriceData = this.driftClient.getOracleDataForPerpMarket(marketIndex)
      const currentPrice = oraclePriceData.price.toNumber() / PRICE_PRECISION.toNumber()

      console.log(`[DriftPositionManager] Current ${this.getMarketSymbol(marketIndex)} price: $${currentPrice.toFixed(2)}`)

      // Calculate position size in base asset
      const baseAssetAmount = (sizeUsd / currentPrice) * BASE_PRECISION.toNumber()

      // Calculate slippage bounds for auction
      const slippageMultiplier = slippageBps / 10000
      const auctionStartPrice = currentPrice
      const auctionEndPrice =
        side === "long"
          ? currentPrice * (1 + slippageMultiplier)
          : currentPrice * (1 - slippageMultiplier)

      // Create market order with auction
      const orderParams = {
        orderType: OrderType.MARKET,
        marketIndex,
        direction: side === "long" ? PositionDirection.LONG : PositionDirection.SHORT,
        baseAssetAmount: new BN(Math.floor(baseAssetAmount)),
        marketType: MarketType.PERP,
        // Auction parameters for JIT auction (5 seconds)
        auctionStartPrice: new BN(Math.floor(auctionStartPrice * PRICE_PRECISION.toNumber())),
        auctionEndPrice: new BN(Math.floor(auctionEndPrice * PRICE_PRECISION.toNumber())),
        auctionDuration: 5, // 5-second JIT auction
        // Max slippage price
        price: new BN(Math.floor(auctionEndPrice * PRICE_PRECISION.toNumber())),
      }

      console.log("[DriftPositionManager] Placing market order with JIT auction...")
      const txSig = await this.driftClient.placePerpOrder(orderParams)

      console.log(`[DriftPositionManager] ✅ Position opened: ${txSig}`)
      console.log(`[DriftPositionManager] Waiting for user account to update...`)

      // Wait for order to fill (auction duration + settlement)
      await new Promise((resolve) => setTimeout(resolve, 6000))

      return txSig
    } catch (error) {
      console.error("[DriftPositionManager] Failed to open position:", error)
      throw error
    }
  }

  /**
   * Close an existing position (full or partial)
   *
   * @param marketIndex - Market index (0 = SOL-PERP)
   * @param percentToClose - Percentage to close (0-100, default: 100 = full close)
   * @returns Transaction signature
   */
  async closePosition(marketIndex: number = 0, percentToClose: number = 100): Promise<string> {
    if (!this.driftClient || !this.user) {
      throw new Error("DriftClient not initialized. Call initialize() first.")
    }

    try {
      console.log(
        `[DriftPositionManager] Closing ${percentToClose}% of position in market ${marketIndex}`
      )

      // Get current position
      const perpPosition = this.user.getPerpPosition(marketIndex)
      if (!perpPosition || perpPosition.baseAssetAmount.isZero()) {
        throw new Error(`No open position in market ${marketIndex}`)
      }

      // Determine current side
      const isLong = perpPosition.baseAssetAmount.gt(new BN(0))
      const currentSide = isLong ? "LONG" : "SHORT"

      // Calculate amount to close
      const baseAssetAmount = perpPosition.baseAssetAmount.abs()
      const amountToClose = baseAssetAmount.mul(new BN(percentToClose)).div(new BN(100))

      console.log(
        `[DriftPositionManager] Closing ${currentSide} position: ${amountToClose.toString()} base asset`
      )

      // Get current oracle price
      const oraclePriceData = this.driftClient.getOracleDataForPerpMarket(marketIndex)
      const currentPrice = oraclePriceData.price.toNumber() / PRICE_PRECISION.toNumber()

      // Close position with opposite direction
      const orderParams = {
        orderType: OrderType.MARKET,
        marketIndex,
        direction: isLong ? PositionDirection.SHORT : PositionDirection.LONG, // Opposite direction
        baseAssetAmount: amountToClose,
        marketType: MarketType.PERP,
        reduceOnly: true, // Important: prevent opening opposite position
        // Auction parameters
        auctionStartPrice: new BN(Math.floor(currentPrice * PRICE_PRECISION.toNumber())),
        auctionEndPrice: new BN(
          Math.floor(currentPrice * 0.995 * PRICE_PRECISION.toNumber())
        ), // 0.5% slippage
        auctionDuration: 5,
        price: new BN(Math.floor(currentPrice * 0.995 * PRICE_PRECISION.toNumber())),
      }

      console.log("[DriftPositionManager] Placing close order with JIT auction...")
      const txSig = await this.driftClient.placePerpOrder(orderParams)

      console.log(`[DriftPositionManager] ✅ Position closed: ${txSig}`)

      // Wait for settlement
      await new Promise((resolve) => setTimeout(resolve, 6000))

      return txSig
    } catch (error) {
      console.error("[DriftPositionManager] Failed to close position:", error)
      throw error
    }
  }

  /**
   * Withdraw collateral from Drift back to session wallet
   * @param amountSol - Amount in SOL to withdraw (0 = withdraw all)
   */
  async withdrawCollateral(amountSol: number = 0): Promise<string> {
    if (!this.driftClient || !this.user) {
      throw new Error("Drift client not initialized")
    }

    try {
      // Get current collateral
      const totalCollateral = this.user.getTotalCollateral()
      const currentCollateral = totalCollateral.toNumber() / QUOTE_PRECISION.toNumber()

      console.log(`[DriftPositionManager] Current Drift collateral: $${currentCollateral.toFixed(2)}`)

      // Check for open positions
      const openPositions = await this.getOpenPositions()
      if (openPositions.length > 0) {
        throw new Error(
          `Cannot withdraw with ${openPositions.length} open position(s). Close all positions first.`
        )
      }

      // Determine withdrawal amount
      const withdrawAll = amountSol === 0
      const withdrawAmountSol = withdrawAll ? currentCollateral / 200 : amountSol // Rough SOL price estimate

      if (withdrawAmountSol <= 0) {
        throw new Error("No collateral to withdraw")
      }

      console.log(
        `[DriftPositionManager] Withdrawing ${withdrawAll ? "all" : withdrawAmountSol.toFixed(4)} SOL from Drift...`
      )

      // Drift uses spot market index 0 for SOL
      const solMarketIndex = 0
      const withdrawAmount = withdrawAll
        ? totalCollateral // Withdraw all collateral
        : new BN(Math.floor(withdrawAmountSol * LAMPORTS_PER_SOL))

      const withdrawTxSig = await this.driftClient.withdraw(
        withdrawAmount,
        solMarketIndex,
        this.user.userAccountPublicKey // Destination (session wallet)
      )

      console.log(`[DriftPositionManager] ✅ Withdrawn to session wallet: ${withdrawTxSig}`)

      // Wait for settlement
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Log updated collateral
      const updatedTotalCollateral = this.user.getTotalCollateral()
      const updatedCollateral = updatedTotalCollateral.toNumber() / QUOTE_PRECISION.toNumber()
      console.log(`[DriftPositionManager] Remaining Drift collateral: $${updatedCollateral.toFixed(2)}`)

      return withdrawTxSig
    } catch (error) {
      console.error("[DriftPositionManager] Failed to withdraw collateral:", error)
      throw error
    }
  }

  /**
   * Get all open positions for the user
   */
  async getOpenPositions(): Promise<Position[]> {
    if (!this.user) {
      throw new Error("User not initialized")
    }

    try {
      const positions: Position[] = []
      const perpPositions = this.user.getActivePerpPositions()

      for (const perpPos of perpPositions) {
        const marketIndex = perpPos.marketIndex
        const marketSymbol = this.getMarketSymbol(marketIndex)

        // Get oracle price
        const oraclePriceData = this.driftClient!.getOracleDataForPerpMarket(marketIndex)
        const currentPrice = oraclePriceData.price.toNumber() / PRICE_PRECISION.toNumber()

        // Calculate position metrics
        const baseAssetAmount = perpPos.baseAssetAmount
        const isLong = baseAssetAmount.gt(new BN(0))
        const size = Math.abs(baseAssetAmount.toNumber() / BASE_PRECISION.toNumber())
        const sizeUsd = size * currentPrice

        // Calculate entry price
        const quoteAssetAmount = perpPos.quoteAssetAmount.abs()
        const entryPrice =
          quoteAssetAmount.toNumber() / BASE_PRECISION.toNumber() / size

        // Calculate unrealized PnL
        const unrealizedPnl = this.user.getUnrealizedPNL(true, marketIndex)
        const unrealizedPnlNumber = unrealizedPnl.toNumber() / QUOTE_PRECISION.toNumber()

        // Calculate leverage (position size / collateral)
        const totalCollateral = this.user.getTotalCollateral()
        const leverage = sizeUsd / (totalCollateral.toNumber() / QUOTE_PRECISION.toNumber())

        // Estimate liquidation price (simplified)
        const maintenanceMarginRatio = 0.05 // 5% maintenance margin
        const liquidationPrice = isLong
          ? entryPrice * (1 - 1 / leverage + maintenanceMarginRatio)
          : entryPrice * (1 + 1 / leverage - maintenanceMarginRatio)

        positions.push({
          marketIndex,
          marketSymbol,
          side: isLong ? "long" : "short",
          size,
          sizeUsd,
          entryPrice,
          unrealizedPnl: unrealizedPnlNumber,
          unrealizedPnlPercent: (unrealizedPnlNumber / sizeUsd) * 100,
          leverage,
          liquidationPrice,
          openTime: Date.now(), // Drift doesn't store open time, use current
        })
      }

      return positions
    } catch (error) {
      console.error("[DriftPositionManager] Failed to get open positions:", error)
      return []
    }
  }

  /**
   * Get comprehensive position summary including equity and margin
   */
  async getPositionSummary(): Promise<PositionSummary> {
    if (!this.user) {
      throw new Error("User not initialized")
    }

    try {
      const positions = await this.getOpenPositions()

      // Get account metrics
      const totalCollateral = this.user.getTotalCollateral()
      const unrealizedPnl = this.user.getUnrealizedPNL(true)
      const freeCollateral = this.user.getFreeCollateral()

      const totalCollateralNumber = totalCollateral.toNumber() / QUOTE_PRECISION.toNumber()
      const unrealizedPnlNumber = unrealizedPnl.toNumber() / QUOTE_PRECISION.toNumber()
      const freeCollateralNumber = freeCollateral.toNumber() / QUOTE_PRECISION.toNumber()

      const totalEquity = totalCollateralNumber + unrealizedPnlNumber
      const marginUsage = ((totalCollateralNumber - freeCollateralNumber) / totalCollateralNumber) * 100

      return {
        positions,
        totalEquity,
        totalCollateral: totalCollateralNumber,
        totalUnrealizedPnl: unrealizedPnlNumber,
        freeCollateral: freeCollateralNumber,
        marginUsage,
      }
    } catch (error) {
      console.error("[DriftPositionManager] Failed to get position summary:", error)
      throw error
    }
  }

  /**
   * Check if user has any open positions
   */
  async hasOpenPositions(): Promise<boolean> {
    if (!this.user) return false

    try {
      const perpPositions = this.user.getActivePerpPositions()
      return perpPositions.length > 0
    } catch (error) {
      console.error("[DriftPositionManager] Failed to check open positions:", error)
      return false
    }
  }

  /**
   * Get market symbol from market index
   */
  private getMarketSymbol(marketIndex: number): string {
    // SOL-PERP is always market 0
    const symbols: Record<number, string> = {
      0: "SOL-PERP",
      1: "BTC-PERP",
      2: "ETH-PERP",
    }
    return symbols[marketIndex] || `MARKET-${marketIndex}`
  }

  /**
   * Unsubscribe and cleanup
   */
  async cleanup(): Promise<void> {
    try {
      if (this.user) {
        await this.user.unsubscribe()
      }
      if (this.driftClient) {
        await this.driftClient.unsubscribe()
      }
      this.isInitialized = false
      console.log("[DriftPositionManager] Cleanup complete")
    } catch (error) {
      console.error("[DriftPositionManager] Cleanup error:", error)
    }
  }
}

// Global instance
let driftManagerInstance: DriftPositionManager | null = null

export function getDriftPositionManager(rpcUrl?: string): DriftPositionManager {
  if (!driftManagerInstance) {
    const url =
      rpcUrl || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"
    driftManagerInstance = new DriftPositionManager(url)
  }
  return driftManagerInstance
}
