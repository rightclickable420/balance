import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL, Transaction, VersionedTransaction } from "@solana/web3.js"
import { ACCOUNT_SIZE, NATIVE_MINT, getAssociatedTokenAddress, getAssociatedTokenAddressSync } from "@solana/spl-token"
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
const SOL_SPOT_MARKET_INDEX = 1

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

const INVALID_AUCTION_ERROR_CODES = ["InvalidOrderAuction", "0x17a6"]
const isInvalidAuctionError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false
  }
  const message = error.message || ""
  return INVALID_AUCTION_ERROR_CODES.some((code) => message.includes(code))
}

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
  totalPositionSizeUsd: number // Sum of absolute open position notionals
  solPriceUsd: number // Current SOL oracle price
}

export class DriftPositionManager {
  private connection: Connection
  private driftClient: DriftClient | null = null
  private user: User | null = null
  private isInitialized = false
  private isClientSubscribed = false
  private isUserSubscribed = false
  private sessionAuthority: PublicKey | null = null
  private userAccountPubKey: PublicKey | null = null
  private userStatsAccountPubKey: PublicKey | null = null
  private summaryListener: (() => void) | null = null

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, "confirmed")
  }

  private ensureSessionAuthority(): PublicKey {
    if (!this.sessionAuthority) {
      throw new Error("Session wallet authority not set")
    }
    return this.sessionAuthority
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
  async initialize(sessionKeypair: Keypair, options?: { skipDeposit?: boolean }): Promise<void> {
    // If user and client exist but unsubscribed (after cleanup), re-subscribe them
    if (this.user && this.driftClient) {
      console.log("[DriftPositionManager] Re-initializing - ensuring subscriptions are active")

      try {
        // Force re-subscription regardless of flags (they might be stale after cleanup)
        if (!this.isClientSubscribed) {
          console.log("[DriftPositionManager] Re-subscribing DriftClient...")
          await this.driftClient.subscribe()
          this.isClientSubscribed = true
        }
        if (!this.isUserSubscribed) {
          console.log("[DriftPositionManager] Re-subscribing User...")
          await this.user.subscribe()
          this.isUserSubscribed = true
        }

        // Fetch latest account data after re-subscription
        await this.user.fetchAccounts()

        // CRITICAL: Wait for user account subscriber to be fully ready
        // The subscribe() call returns before the WebSocket is fully synced
        console.log("[DriftPositionManager] Waiting for user account subscriber to sync...")
        await new Promise(resolve => setTimeout(resolve, 1000)) // Give WebSocket time to sync

        // Mark as initialized again
        this.isInitialized = true
        this.sessionAuthority = sessionKeypair.publicKey

        console.log("[DriftPositionManager] ✅ Re-initialization complete, subscriptions active")

        // IMPORTANT: Check if we should deposit even during re-initialization
        // This handles the case where user has existing stuck collateral but wants to add more funds
        if (!options?.skipDeposit) {
          console.log("[DriftPositionManager] Checking if additional deposit is needed during re-initialization...")

          // Calculate depositable amount (same logic as full initialization)
          const walletBalance = await this.connection.getBalance(sessionKeypair.publicKey)
          const walletBalanceSol = walletBalance / LAMPORTS_PER_SOL

          // Reserve SOL for gas, safety, and wrapping
          const gasReserveSol = 0.05
          const safetyBufferSol = 0.01
          const wrapBufferSol = 0.01
          const requiredLamports = (gasReserveSol + safetyBufferSol + wrapBufferSol) * LAMPORTS_PER_SOL

          // Check if WSOL ATA exists, if not we need rent reserve
          let rentReserveLamports = 0
          const wsolMint = new PublicKey("So11111111111111111111111111111111111111112")
          const wsolAta = getAssociatedTokenAddressSync(wsolMint, sessionKeypair.publicKey)
          const wsolAtaInfo = await this.connection.getAccountInfo(wsolAta)
          if (!wsolAtaInfo) {
            rentReserveLamports = 2039280 // Rent for WSOL ATA creation
          }

          const depositableLamports = walletBalance - requiredLamports - rentReserveLamports
          const depositableSol = depositableLamports / LAMPORTS_PER_SOL

          console.log(`[DriftPositionManager] Session wallet balance: ${walletBalanceSol.toFixed(4)} SOL`)
          console.log(`[DriftPositionManager] Depositable: ${depositableSol.toFixed(4)} SOL`)

          if (depositableLamports > 0 && depositableSol > 0.001) {
            console.log(
              `[DriftPositionManager] Depositing ${depositableSol.toFixed(4)} SOL as additional collateral...`
            )

            const depositAmount = new BN(Math.floor(depositableLamports))
            const depositTxSig = await this.driftClient.deposit(
              depositAmount,
              SOL_SPOT_MARKET_INDEX,
              sessionKeypair.publicKey
            )

            console.log(`[DriftPositionManager] ✅ Deposited ${depositableSol.toFixed(4)} SOL: ${depositTxSig}`)
            console.log(`[DriftPositionManager] View tx: https://solscan.io/tx/${depositTxSig}`)

            // Wait and refresh
            await new Promise(resolve => setTimeout(resolve, 3000))
            await this.user.fetchAccounts()

            const updatedTotalCollateral = this.user.getTotalCollateral()
            const updatedCollateral = updatedTotalCollateral.toNumber() / QUOTE_PRECISION.toNumber()
            console.log(`[DriftPositionManager] Updated Drift collateral: $${updatedCollateral.toFixed(2)}`)
          } else {
            console.log(
              `[DriftPositionManager] No additional deposit needed (${depositableSol.toFixed(4)} SOL available after reserves)`
            )
          }
        }

        return
      } catch (error) {
        console.error("[DriftPositionManager] Re-subscription failed, will reinitialize from scratch:", error)
        // Fall through to full initialization
        this.user = null
        this.driftClient = null
        this.isUserSubscribed = false
        this.isClientSubscribed = false
        this.isInitialized = false
      }
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

      if (!this.isClientSubscribed) {
        await this.driftClient.subscribe()
        this.isClientSubscribed = true
        console.log("[DriftPositionManager] ✅ DriftClient subscribed")
      }

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
      if (!this.isUserSubscribed) {
        await this.user.subscribe()
        this.isUserSubscribed = true
        console.log("[DriftPositionManager] ✅ User subscribed")
      }

      // CRITICAL: Wait for user account subscriber to be fully ready
      // The subscribe() call returns before the WebSocket is fully synced
      console.log("[DriftPositionManager] Waiting for user account subscriber to sync...")
      await new Promise(resolve => setTimeout(resolve, 1000)) // Give WebSocket time to sync

      this.sessionAuthority = sessionKeypair.publicKey
      this.userAccountPubKey = userAccountPublicKey
      this.userStatsAccountPubKey = this.driftClient.getUserStatsAccountPublicKey()
      await this.verifyReferrerLink()

      // Check current collateral and deposit session wallet balance if needed
      const totalCollateral = this.user.getTotalCollateral()
      const currentCollateral = totalCollateral.toNumber() / QUOTE_PRECISION.toNumber()

      console.log(`[DriftPositionManager] Current Drift collateral: $${currentCollateral.toFixed(2)}`)

      // Get session wallet balance
      const walletBalanceLamports = await this.connection.getBalance(sessionKeypair.publicKey)
      const walletBalanceSol = walletBalanceLamports / LAMPORTS_PER_SOL

      // Determine if the wrapped SOL ATA exists (first-time deposit needs rent)
      const wsolAta = await getAssociatedTokenAddress(NATIVE_MINT, sessionKeypair.publicKey)
      const ataInfo = await this.connection.getAccountInfo(wsolAta)
      const rentReserveLamports = ataInfo
        ? 0
        : await this.connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE)

      // Keep minimal SOL for gas plus rent for ATA creation when needed
      const gasReserveLamports = Math.floor(0.002 * LAMPORTS_PER_SOL)
      const gasReserveSol = gasReserveLamports / LAMPORTS_PER_SOL
      const safetyBufferLamports = Math.floor(0.005 * LAMPORTS_PER_SOL) // keep ~0.005 SOL for unexpected rent/fees
      const safetyBufferSol = safetyBufferLamports / LAMPORTS_PER_SOL
      const wrapBufferLamports = Math.floor(0.01 * LAMPORTS_PER_SOL) // extra SOL the WSOL wrapper needs
      const wrapBufferSol = wrapBufferLamports / LAMPORTS_PER_SOL
      const requiredLamports =
        gasReserveLamports + rentReserveLamports + safetyBufferLamports + wrapBufferLamports
      const depositableLamports = walletBalanceLamports - requiredLamports
      const depositableSol = depositableLamports / LAMPORTS_PER_SOL

      console.log(`[DriftPositionManager] Session wallet balance: ${walletBalanceSol.toFixed(4)} SOL`)
      if (rentReserveLamports > 0) {
        console.log(
          `[DriftPositionManager] Reserving ${(rentReserveLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL for WSOL ATA rent`
        )
      }
      console.log(
        `[DriftPositionManager] Will deposit ${Math.max(depositableSol, 0).toFixed(4)} SOL to Drift (${gasReserveSol.toFixed(
          4
        )} SOL gas reserve, ${safetyBufferSol.toFixed(4)} SOL safety buffer, ${wrapBufferSol.toFixed(4)} SOL wrap buffer)`
      )

      if (!options?.skipDeposit && depositableLamports > 0 && depositableSol > 0.001) { // Only deposit if we have meaningful amount
        console.log(
          `[DriftPositionManager] Depositing ${depositableSol.toFixed(4)} SOL as collateral (keeping ${gasReserveSol.toFixed(4)} SOL for gas)...`
        )

        // Deposit SOL as collateral to Drift
        const depositAmount = new BN(Math.floor(depositableLamports))

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
      } else if (!options?.skipDeposit) {
        console.warn(
          `[DriftPositionManager] ⚠️  Insufficient SOL to deposit (${walletBalanceSol.toFixed(4)} SOL). Need at least ${((requiredLamports + 0.001 * LAMPORTS_PER_SOL) / LAMPORTS_PER_SOL).toFixed(3)} SOL total.`
        )
        throw new Error(
          `Insufficient balance: ${walletBalanceSol.toFixed(4)} SOL available, need at least ${((requiredLamports + 0.001 * LAMPORTS_PER_SOL) / LAMPORTS_PER_SOL).toFixed(3)} SOL`
        )
      } else {
        console.log(
          `[DriftPositionManager] Skipping deposit during resume (wallet balance ${walletBalanceSol.toFixed(4)} SOL).`
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
    slippageBps: number = 50,
    auctionDurationSeconds: number = 5
  ): Promise<string> {
    if (!this.driftClient || !this.user) {
      throw new Error("DriftClient not initialized. Call initialize() first.")
    }

    try {
      const requiredCollateral = leverage === 0 ? sizeUsd : sizeUsd / leverage
      const freeCollateralUsd = this.getFreeCollateral()

      console.log(
        `[DriftPositionManager] Position check: sizeUsd=$${sizeUsd.toFixed(2)}, ` +
        `leverage=${leverage}x, requiredCollateral=$${requiredCollateral.toFixed(4)}, ` +
        `freeCollateral=$${freeCollateralUsd.toFixed(2)}`
      )

      if (freeCollateralUsd < requiredCollateral) {
        throw new Error(
          `Insufficient free collateral. Need $${requiredCollateral.toFixed(4)}, have $${freeCollateralUsd.toFixed(2)}`
        )
      }

      console.log(
        `[DriftPositionManager] Opening ${side.toUpperCase()} position: $${sizeUsd.toFixed(2)} collateral (${(sizeUsd * leverage).toFixed(2)} notional) at ${leverage}x leverage`
      )

      // Get current oracle price for the market
      const oraclePriceData = this.driftClient.getOracleDataForPerpMarket(marketIndex)
      const currentPrice = oraclePriceData.price.toNumber() / PRICE_PRECISION.toNumber()

      console.log(`[DriftPositionManager] Current ${this.getMarketSymbol(marketIndex)} price: $${currentPrice.toFixed(2)}`)

      // Calculate position size in base asset
      // sizeUsd is the collateral amount, multiply by leverage to get notional position size
      const notionalPositionUsd = sizeUsd * leverage
      const baseAssetAmount = (notionalPositionUsd / currentPrice) * BASE_PRECISION.toNumber()

      console.log(
        `[DriftPositionManager] Position calculation: collateral=$${sizeUsd.toFixed(2)}, ` +
        `leverage=${leverage}x, notional=$${notionalPositionUsd.toFixed(2)}, ` +
        `baseAsset=${(baseAssetAmount / BASE_PRECISION.toNumber()).toFixed(4)} SOL`
      )

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
        auctionDuration: auctionDurationSeconds,
        // Max slippage price
        price: new BN(Math.floor(auctionEndPrice * PRICE_PRECISION.toNumber())),
      }

      console.log("[DriftPositionManager] Placing market order with JIT auction...")
      const txSig = await this.driftClient.placePerpOrder(orderParams)

      console.log(`[DriftPositionManager] ✅ Position opened: ${txSig}`)
      console.log(`[DriftPositionManager] Waiting for user account to update...`)

      // Wait for order to fill (auction duration + settlement)
      await new Promise((resolve) => setTimeout(resolve, Math.max(auctionDurationSeconds * 1000 + 1000, 4000)))

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
      const direction = isLong ? PositionDirection.SHORT : PositionDirection.LONG
      const slippageBps = 60 // 0.6% pricing buffer to allow fills
      const slippageMultiplier = slippageBps / 10000
      const pricePrecision = PRICE_PRECISION.toNumber()

      const computeAuctionBounds = (price: number) => {
        const delta = price * slippageMultiplier
        if (direction === PositionDirection.SHORT) {
          const start = price + delta * 0.5
          const end = price - delta
          return {
            auctionStart: start,
            auctionEnd: end,
            limit: end,
          }
        }
        const start = price - delta * 0.5
        const end = price + delta
        return {
          auctionStart: start,
          auctionEnd: end,
          limit: end,
        }
      }

      const { auctionStart, auctionEnd, limit } = computeAuctionBounds(currentPrice)

      const orderParams = {
        orderType: OrderType.MARKET,
        marketIndex,
        direction, // Opposite direction
        baseAssetAmount: amountToClose,
        marketType: MarketType.PERP,
        reduceOnly: true, // Important: prevent opening opposite position
        auctionStartPrice: new BN(Math.floor(auctionStart * pricePrecision)),
        auctionEndPrice: new BN(Math.floor(auctionEnd * pricePrecision)),
        auctionDuration: 1,
        price: new BN(Math.floor(limit * pricePrecision)),
      }

      console.log("[DriftPositionManager] Placing close order with JIT auction...")
      let txSig: string
      try {
        txSig = await this.driftClient.placePerpOrder(orderParams)
      } catch (orderError) {
        if (isInvalidAuctionError(orderError)) {
          console.warn(
            "[DriftPositionManager] Auction bounds invalid when closing. Retrying with static price..."
          )
          const fallbackPriceBn = new BN(Math.floor(currentPrice * pricePrecision))
          txSig = await this.driftClient.placePerpOrder({
            ...orderParams,
            auctionStartPrice: fallbackPriceBn,
            auctionEndPrice: fallbackPriceBn,
            auctionDuration: 1,
            price: fallbackPriceBn,
          })
        } else {
          throw orderError
        }
      }

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
   * Cancel all open orders
   * @returns Number of orders cancelled
   */
  async cancelAllOrders(): Promise<number> {
    if (!this.driftClient || !this.user) {
      throw new Error("Drift client not initialized")
    }

    try {
      await this.user.fetchAccounts()

      const userAccount = this.user.getUserAccount()
      const openOrders = userAccount.orders.filter(o => o.status === 0) // 0 = Open status

      if (openOrders.length === 0) {
        console.log("[DriftPositionManager] No open orders to cancel")
        return 0
      }

      console.log(`[DriftPositionManager] Cancelling ${openOrders.length} open order(s)...`)

      let cancelledCount = 0
      for (const order of openOrders) {
        try {
          const txSig = await this.driftClient.cancelOrder(order.orderId)
          console.log(`[DriftPositionManager] ✅ Cancelled order ${order.orderId}: ${txSig}`)
          cancelledCount++
        } catch (error) {
          console.error(`[DriftPositionManager] ❌ Failed to cancel order ${order.orderId}:`, error)
        }
      }

      // Wait for cancellations to settle
      if (cancelledCount > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000))
        await this.user.fetchAccounts()
      }

      console.log(`[DriftPositionManager] Cancelled ${cancelledCount}/${openOrders.length} order(s)`)
      return cancelledCount
    } catch (error) {
      console.error("[DriftPositionManager] Failed to cancel orders:", error)
      throw error
    }
  }

  /**
   * Settle PnL for all markets
   * This forces settlement of any unsettled funding payments or PnL
   */
  async settleAllPnL(): Promise<number> {
    if (!this.driftClient || !this.user) {
      throw new Error("Drift client not initialized")
    }

    try {
      await this.user.fetchAccounts()

      const userAccount = this.user.getUserAccount()
      const perpPositions = userAccount.perpPositions.filter(p => p.marketIndex !== 65535)

      if (perpPositions.length === 0) {
        console.log("[DriftPositionManager] No perp positions to settle")
        return 0
      }

      console.log(`[DriftPositionManager] Attempting to settle PnL for ${perpPositions.length} market(s)...`)

      let settledCount = 0
      const userAccountPubkey = await this.user.getUserAccountPublicKey()

      for (const position of perpPositions) {
        try {
          console.log(`[DriftPositionManager] Settling PnL for market ${position.marketIndex}...`)
          const txSig = await this.driftClient.settlePNL(
            userAccountPubkey,
            userAccount,
            position.marketIndex
          )
          console.log(`[DriftPositionManager] ✅ Settled market ${position.marketIndex}: ${txSig}`)
          settledCount++
        } catch (error) {
          // Settlement might fail if already settled or no PnL to settle
          console.warn(`[DriftPositionManager] Settlement for market ${position.marketIndex} not needed or failed:`, error)
        }
      }

      // Wait for settlements to finalize
      if (settledCount > 0) {
        console.log(`[DriftPositionManager] Waiting for ${settledCount} settlement(s) to finalize...`)
        await new Promise(resolve => setTimeout(resolve, 3000))
        await this.user.fetchAccounts()
      }

      console.log(`[DriftPositionManager] Settled ${settledCount}/${perpPositions.length} market(s)`)
      return settledCount
    } catch (error) {
      console.error("[DriftPositionManager] Failed to settle PnL:", error)
      // Don't throw - settlement failure shouldn't block withdrawal attempt
      return 0
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
      // Refresh account first
      await this.user.fetchAccounts()

      // Cancel any open orders first (they lock collateral)
      const cancelledOrders = await this.cancelAllOrders()
      if (cancelledOrders > 0) {
        console.log(`[DriftPositionManager] Cancelled ${cancelledOrders} open order(s) before withdrawal`)
      }

      // Settle any unsettled PnL (this can unlock small amounts of locked margin)
      const settledMarkets = await this.settleAllPnL()
      if (settledMarkets > 0) {
        console.log(`[DriftPositionManager] Settled PnL for ${settledMarkets} market(s) before withdrawal`)
      }

      // Check for open positions
      const openPositions = await this.getOpenPositions()
      if (openPositions.length > 0) {
        const positionDetails = openPositions.map(p =>
          `${p.marketSymbol} ${p.side.toUpperCase()} $${p.sizeUsd.toFixed(2)} (PnL: ${p.unrealizedPnl >= 0 ? '+' : ''}$${p.unrealizedPnl.toFixed(2)})`
        ).join(', ')

        throw new Error(
          `Cannot withdraw with ${openPositions.length} open position(s):\n${positionDetails}\n\nClose all positions first.`
        )
      }

      // Check free collateral
      const freeCollateral = this.user.getFreeCollateral()
      const freeCollateralNumber = freeCollateral.toNumber() / QUOTE_PRECISION.toNumber()

      if (freeCollateralNumber <= 0.01) {
        const totalCollateral = this.user.getTotalCollateral()
        const totalCollateralNumber = totalCollateral.toNumber() / QUOTE_PRECISION.toNumber()
        const usedCollateral = totalCollateralNumber - freeCollateralNumber

        // Get margin requirements to diagnose what's using the collateral
        const initialMarginReq = this.user.getInitialMarginRequirement()
        const maintenanceMarginReq = this.user.getMaintenanceMarginRequirement()
        const initialMarginReqNumber = initialMarginReq.toNumber() / QUOTE_PRECISION.toNumber()
        const maintenanceMarginReqNumber = maintenanceMarginReq.toNumber() / QUOTE_PRECISION.toNumber()

        // Check all perp positions including settled ones
        const userAccount = this.user.getUserAccount()
        const allPerpPositions = userAccount.perpPositions.filter(p => p.marketIndex !== 65535)

        // Check for open orders (these lock collateral even without open positions!)
        const openOrders = userAccount.orders.filter(o => o.status === 0) // 0 = Open status
        const openOrdersCount = openOrders.length

        console.error(
          `[DriftPositionManager] Collateral breakdown:\n` +
          `  Total: $${totalCollateralNumber.toFixed(2)}\n` +
          `  Free: $${freeCollateralNumber.toFixed(2)}\n` +
          `  Initial margin req: $${initialMarginReqNumber.toFixed(2)}\n` +
          `  Maintenance margin req: $${maintenanceMarginReqNumber.toFixed(2)}\n` +
          `  Perp positions in use: ${allPerpPositions.length}\n` +
          `  Open positions detected: ${openPositions.length}\n` +
          `  Open orders: ${openOrdersCount}`
        )

        // Log details of all perp position slots
        allPerpPositions.forEach((pos, idx) => {
          console.error(
            `  Perp slot ${idx}: market=${pos.marketIndex} (${this.getMarketSymbol(pos.marketIndex)}), ` +
            `base=${pos.baseAssetAmount.toString()}, quote=${pos.quoteAssetAmount.toString()}`
          )
        })

        // Log open orders if any
        if (openOrdersCount > 0) {
          console.error(`\n  Open orders:`)
          openOrders.forEach((order, idx) => {
            console.error(
              `    Order ${idx}: market=${order.marketIndex}, ` +
              `type=${order.orderType}, direction=${order.direction}, ` +
              `baseAssetAmount=${order.baseAssetAmount.toString()}, ` +
              `price=${order.price.toString()}, status=${order.status}`
            )
          })
        }

        // SPECIAL CASE: If account is completely flat (no positions, no orders, all slots empty)
        // but margin requirement is still showing, this is likely a Drift state issue.
        // Attempt withdrawal anyway and let on-chain validation decide.
        if (openPositions.length === 0 && openOrdersCount === 0) {
          const hasAnyNonZeroPositions = allPerpPositions.some(
            p => !p.baseAssetAmount.eq(new BN(0)) || !p.quoteAssetAmount.eq(new BN(0))
          )

          if (!hasAnyNonZeroPositions) {
            console.warn(
              `[DriftPositionManager] ⚠️ Account appears completely flat but margin is locked.\n` +
              `This may be a Drift state calculation issue.\n` +
              `Attempting withdrawal anyway - let on-chain validation decide...`
            )
            // Continue to withdrawal attempt below instead of throwing
          } else {
            throw new Error(
              `Insufficient free collateral to withdraw.\n\n` +
              `Total collateral: $${totalCollateralNumber.toFixed(2)}\n` +
              `Used by positions/margin: $${usedCollateral.toFixed(2)}\n` +
              `Free to withdraw: $${freeCollateralNumber.toFixed(2)}\n` +
              `Initial margin req: $${initialMarginReqNumber.toFixed(2)}\n` +
              `Maintenance margin req: $${maintenanceMarginReqNumber.toFixed(2)}\n\n` +
              `Detected ${openPositions.length} open position(s) and ${openOrdersCount} open order(s).\n` +
              (openOrdersCount > 0 ? `Open orders lock collateral - cancel them to free collateral.\n` : ``) +
              `Check console for detailed position slot and order info.`
            )
          }
        } else {
          throw new Error(
            `Insufficient free collateral to withdraw.\n\n` +
            `Total collateral: $${totalCollateralNumber.toFixed(2)}\n` +
            `Used by positions/margin: $${usedCollateral.toFixed(2)}\n` +
            `Free to withdraw: $${freeCollateralNumber.toFixed(2)}\n` +
            `Initial margin req: $${initialMarginReqNumber.toFixed(2)}\n` +
            `Maintenance margin req: $${maintenanceMarginReqNumber.toFixed(2)}\n\n` +
            `Detected ${openPositions.length} open position(s) and ${openOrdersCount} open order(s).\n` +
            (openOrdersCount > 0 ? `Open orders lock collateral - cancel them to free collateral.\n` : ``) +
            `Check console for detailed position slot and order info.`
          )
        }
      }

      const tokenAmountLamports = this.user.getTokenAmount(SOL_SPOT_MARKET_INDEX)
      if (tokenAmountLamports.lte(new BN(0))) {
        throw new Error("No SOL collateral to withdraw")
      }

      const sessionAuthority = this.ensureSessionAuthority()
      const withdrawAll = amountSol === 0
      let withdrawLamports = withdrawAll
        ? tokenAmountLamports
        : new BN(Math.floor(amountSol * LAMPORTS_PER_SOL))

      if (withdrawLamports.gt(tokenAmountLamports)) {
        withdrawLamports = tokenAmountLamports
      }

      // SPECIAL CASE: If account is flat but has tiny margin requirement,
      // leave a small buffer ($0.01) to account for rounding/funding payment dust
      const totalCollateral = this.user.getTotalCollateral()
      const initialMarginReq = this.user.getInitialMarginRequirement()
      const marginDeficit = initialMarginReq.sub(totalCollateral)

      if (marginDeficit.gt(new BN(0)) && marginDeficit.lt(new BN(100000))) { // < $0.10
        const bufferAmount = marginDeficit.add(new BN(10000)) // Add margin deficit + $0.01 buffer
        const bufferLamports = bufferAmount.mul(new BN(LAMPORTS_PER_SOL)).div(QUOTE_PRECISION)

        if (withdrawLamports.gt(bufferLamports)) {
          const originalWithdrawSol = withdrawLamports.toNumber() / LAMPORTS_PER_SOL
          withdrawLamports = withdrawLamports.sub(bufferLamports)
          const adjustedWithdrawSol = withdrawLamports.toNumber() / LAMPORTS_PER_SOL
          const bufferSol = bufferLamports.toNumber() / LAMPORTS_PER_SOL

          console.warn(
            `[DriftPositionManager] ⚠️ Account has tiny margin deficit (${(marginDeficit.toNumber() / QUOTE_PRECISION.toNumber()).toFixed(4)} USD).\n` +
            `Leaving ${bufferSol.toFixed(4)} SOL buffer in Drift to satisfy margin requirement.\n` +
            `Withdrawing ${adjustedWithdrawSol.toFixed(4)} SOL instead of ${originalWithdrawSol.toFixed(4)} SOL.`
          )
        }
      }

      const withdrawAmountSol = withdrawLamports.toNumber() / LAMPORTS_PER_SOL

      console.log(
        `[DriftPositionManager] Withdrawing ${withdrawAll ? "all" : withdrawAmountSol.toFixed(4)} SOL from Drift...`
      )

      const withdrawTxSig = await this.driftClient.withdraw(
        withdrawLamports,
        SOL_SPOT_MARKET_INDEX,
        sessionAuthority,
        true // reduce-only
      )

      console.log(`[DriftPositionManager] ✅ Withdrawn to session wallet: ${withdrawTxSig}`)

      await new Promise((resolve) => setTimeout(resolve, 2000))
      await this.user.fetchAccounts()

      const updatedLamports = this.user.getTokenAmount(SOL_SPOT_MARKET_INDEX)
      console.log(
        `[DriftPositionManager] Remaining SOL collateral: ${(updatedLamports.toNumber() / LAMPORTS_PER_SOL).toFixed(4)} SOL`
      )

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
      // Double-check subscription is active before querying
      if (!this.isUserSubscribed) {
        console.warn("[DriftPositionManager] User not subscribed, cannot get positions")
        return []
      }

      // CRITICAL: Fetch latest account data from chain before reading positions
      console.log("[DriftPositionManager] Fetching latest account data before reading positions...")
      await this.user.fetchAccounts()
      console.log("[DriftPositionManager] ✅ Account data fetched")

      const positions: Position[] = []

      // Get ALL perp positions (not just active ones with open size)
      // This includes positions with baseAssetAmount = 0 that may still have unsettled PnL or margin
      const userAccount = this.user.getUserAccount()
      const allPerpPositions = userAccount.perpPositions

      console.log(`[DriftPositionManager] Total perp position slots: ${allPerpPositions.length}`)

      // Filter for positions that are actually open (marketIndex !== 65535 which is unused marker)
      const perpPositions = allPerpPositions.filter(p => p.marketIndex !== 65535)

      console.log(`[DriftPositionManager] Perp positions in use: ${perpPositions.length}`)
      console.log(`[DriftPositionManager] getActivePerpPositions() comparison: ${this.user.getActivePerpPositions().length} active`)

      for (const perpPos of perpPositions) {
        const marketIndex = perpPos.marketIndex
        const marketSymbol = this.getMarketSymbol(marketIndex)

        // Get oracle price
        const oraclePriceData = this.driftClient!.getOracleDataForPerpMarket(marketIndex)
        const currentPrice = oraclePriceData.price.toNumber() / PRICE_PRECISION.toNumber()

        // Calculate position metrics
        const baseAssetAmount = perpPos.baseAssetAmount
        const quoteAssetAmount = perpPos.quoteAssetAmount

        console.log(`[DriftPositionManager] Examining ${marketSymbol} position: baseAssetAmount=${baseAssetAmount.toString()}, quoteAssetAmount=${quoteAssetAmount.toString()}`)

        // Skip positions with zero base asset (no actual position open)
        if (baseAssetAmount.eq(new BN(0))) {
          console.log(`[DriftPositionManager] Skipping ${marketSymbol} - zero baseAssetAmount (settled position)`)
          continue
        }

        const isLong = baseAssetAmount.gt(new BN(0))
        const size = Math.abs(baseAssetAmount.toNumber() / BASE_PRECISION.toNumber())
        const sizeUsd = size * currentPrice

        // Calculate entry price
        const absQuoteAssetAmount = quoteAssetAmount.abs()
        const entryPrice =
          absQuoteAssetAmount.toNumber() / BASE_PRECISION.toNumber() / size

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

        const side = isLong ? "long" : "short"
        const position: Position = {
          marketIndex,
          marketSymbol,
          side,
          size,
          sizeUsd,
          entryPrice,
          unrealizedPnl: unrealizedPnlNumber,
          unrealizedPnlPercent: (unrealizedPnlNumber / sizeUsd) * 100,
          leverage,
          liquidationPrice,
          openTime: Date.now(), // Drift doesn't store open time, use current
        }

        console.log(`[DriftPositionManager] Found position: ${marketSymbol} ${side.toUpperCase()} $${sizeUsd.toFixed(2)} (PnL: ${unrealizedPnlNumber >= 0 ? '+' : ''}$${unrealizedPnlNumber.toFixed(2)})`)
        positions.push(position)
      }

      console.log(`[DriftPositionManager] Returning ${positions.length} total position(s)`)
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
      const unrealizedPnl = this.user.getUnrealizedPNL(true)
      const freeCollateral = this.user.getFreeCollateral()
      const solOracleData = this.driftClient!.getOracleDataForPerpMarket(0)
      const solPriceUsd = solOracleData.price.toNumber() / PRICE_PRECISION.toNumber()
      const solLamports = this.user.getTokenAmount(SOL_SPOT_MARKET_INDEX)
      const solAmount = solLamports.toNumber() / LAMPORTS_PER_SOL
      const totalCollateralNumber = solAmount * solPriceUsd
      const unrealizedPnlNumber = unrealizedPnl.toNumber() / QUOTE_PRECISION.toNumber()
      const freeCollateralNumber = freeCollateral.toNumber() / QUOTE_PRECISION.toNumber()

      const totalEquity = totalCollateralNumber + unrealizedPnlNumber
      const marginUsage = totalCollateralNumber === 0
        ? 0
        : ((totalCollateralNumber - freeCollateralNumber) / totalCollateralNumber) * 100
      const totalPositionSizeUsd = positions.reduce((sum, position) => sum + Math.abs(position.sizeUsd), 0)

      return {
        positions,
        totalEquity,
        totalCollateral: totalCollateralNumber,
        totalUnrealizedPnl: unrealizedPnlNumber,
        freeCollateral: freeCollateralNumber,
        marginUsage,
        totalPositionSizeUsd,
        solPriceUsd,
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
   * Get free collateral (USD) available for trading
   */
  getFreeCollateral(): number {
    if (!this.user) {
      return 0
    }

    try {
      const freeCollateral = this.user.getFreeCollateral()
      return freeCollateral.toNumber() / QUOTE_PRECISION.toNumber()
    } catch (error) {
      console.error("[DriftPositionManager] Failed to get free collateral:", error)
      return 0
    }
  }

  /**
   * Get current leverage reported by Drift
   */
  getUserLeverage(): number {
    if (!this.user) {
      return 0
    }

    try {
      return this.user.getLeverage()
    } catch (error) {
      console.error("[DriftPositionManager] Failed to get leverage:", error)
      return 0
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
      if (this.user && this.isUserSubscribed) {
        await this.user.unsubscribe()
        this.isUserSubscribed = false
      }
      if (this.driftClient && this.isClientSubscribed) {
        await this.driftClient.unsubscribe()
        this.isClientSubscribed = false
      }

      // Mark as not initialized but keep objects for re-subscription
      this.isInitialized = false
      this.sessionAuthority = null
      this.userAccountPubKey = null
      this.userStatsAccountPubKey = null

      console.log("[DriftPositionManager] Cleanup complete - objects retained for re-subscription")
    } catch (error) {
      console.error("[DriftPositionManager] Cleanup error:", error)
      // On error, fully reset to force clean initialization next time
      this.user = null
      this.driftClient = null
      this.isUserSubscribed = false
      this.isClientSubscribed = false
      this.isInitialized = false
    }
  }

  private async verifyReferrerLink(): Promise<void> {
    if (!this.driftClient || !BALANCE_REFERRER_INFO) return

    try {
      const userStatsPubkey = this.driftClient.getUserStatsAccountPublicKey()
      this.userStatsAccountPubKey = userStatsPubkey
      const account = await this.driftClient.program.account.userStats.fetch(userStatsPubkey) as unknown as { referrer?: { equals: (other: PublicKey) => boolean; toBase58: () => string } }
      if (account?.referrer && typeof account.referrer.equals === 'function' && account.referrer.equals(BALANCE_REFERRER_INFO.referrer)) {
        console.log("[DriftPositionManager] ✅ Referrer verified on-chain")
      } else {
        console.warn(
          "[DriftPositionManager] ⚠️ Referrer mismatch:",
          account?.referrer && typeof account.referrer.toBase58 === 'function' ? account.referrer.toBase58() : 'unknown',
          "≠",
          BALANCE_REFERRER_INFO.referrer.toBase58()
        )
      }
    } catch (error) {
      console.warn("[DriftPositionManager] ⚠️ Could not verify referrer:", error)
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
