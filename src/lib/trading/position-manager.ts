import { Connection, PublicKey, Keypair } from "@solana/web3.js"
import { AnchorProvider, Program, BN, Wallet } from "@coral-xyz/anchor"
import { IDL as JUPITER_PERPETUALS_IDL } from "./jupiter-perpetuals-idl"

/**
 * Jupiter Perpetuals Position Manager
 *
 * Handles querying and managing open trading positions on Jupiter Perps.
 * Used for position recovery after browser crashes/refreshes.
 */

// Jupiter Perpetuals Program ID on Solana mainnet
// Source: https://github.com/julianfssen/jupiter-perps-anchor-idl-parsing
export const JUPITER_PERPS_PROGRAM_ID = new PublicKey(
  "PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu"
)

// JLP Pool Account
export const JLP_POOL = new PublicKey("5BUwFW4nRbftYTDMbgxykoFWqWHPzahFSNAaaaJtVKsq")

// Doves Oracle Program (used by Jupiter Perps for price feeds)
export const DOVES_PROGRAM_ID = new PublicKey("DoVEsk76QybCEHQGzkvYPWLQu9gzNoZZZt3TPiL597e")

export interface Position {
  owner: PublicKey
  pool: PublicKey
  custody: PublicKey
  collateralCustody: PublicKey
  side: "long" | "short"
  price: number // Entry price (6 decimals)
  sizeUsd: number // Leveraged position size in USD
  collateralUsd: number // Collateral amount in USD
  openTime: number // UNIX timestamp
  updateTime: number // UNIX timestamp
  realisedPnlUsd: number // Realized PnL from partial closes
  unrealisedPnlUsd?: number // Calculated unrealized PnL
  publicKey: PublicKey // Position account address
}

export interface PositionRequest {
  owner: PublicKey
  pool: PublicKey
  position: PublicKey
  side: "long" | "short"
  triggerPrice: number // Stop-loss or take-profit trigger
  sizeUsd: number // Amount to close
  requestType: "stop_loss" | "take_profit"
  publicKey: PublicKey
}

/**
 * Derive Position PDA for a given owner and custody accounts
 */
export function derivePositionAddress(
  owner: PublicKey,
  custody: PublicKey,
  collateralCustody: PublicKey,
  side: "long" | "short",
  programId: PublicKey = JUPITER_PERPS_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("position"),
      owner.toBuffer(),
      custody.toBuffer(),
      collateralCustody.toBuffer(),
      Buffer.from(side === "long" ? [1] : [2]),
    ],
    programId
  )
}

export class PositionManager {
  private connection: Connection
  private programId: PublicKey
  private program: Program

  constructor(rpcUrl: string, programId: PublicKey = JUPITER_PERPS_PROGRAM_ID) {
    this.connection = new Connection(rpcUrl, "confirmed")
    this.programId = programId

    // Initialize Anchor program for IDL-based decoding
    // Note: We use a dummy wallet since we're only reading data
    const dummyWallet = {
      publicKey: PublicKey.default,
      signTransaction: async () => { throw new Error("Read-only wallet") },
      signAllTransactions: async () => { throw new Error("Read-only wallet") }
    }
    const provider = new AnchorProvider(this.connection, dummyWallet as any, {})
    this.program = new Program(JUPITER_PERPETUALS_IDL as any, programId, provider)
  }

  /**
   * Query all open positions for a wallet address
   *
   * This fetches all Position accounts owned by the user on Jupiter Perps.
   * Used for recovery after browser crash/refresh.
   */
  async getPositionsForWallet(walletAddress: PublicKey): Promise<Position[]> {
    try {
      console.log(`[PositionManager] Querying positions for wallet: ${walletAddress.toBase58()}`)

      // Get all Position accounts for this owner
      // Position accounts use a PDA derived from the owner's pubkey
      const accounts = await this.connection.getProgramAccounts(this.programId, {
        filters: [
          {
            memcmp: {
              offset: 8, // Skip 8-byte discriminator
              bytes: walletAddress.toBase58(),
            },
          },
        ],
      })

      console.log(`[PositionManager] Found ${accounts.length} position accounts`)

      // Parse position data using Anchor IDL
      const positions: Position[] = []

      for (const account of accounts) {
        try {
          // Decode using Anchor's coder
          const decoded = this.program.coder.accounts.decode("position", account.account.data)

          // Filter out closed positions (sizeUsd = 0)
          // Note: Jupiter doesn't actually close position accounts, they just set sizeUsd to 0
          if (!decoded.sizeUsd || decoded.sizeUsd.eqn(0)) {
            console.log(`[PositionManager] Skipping closed position: ${account.pubkey.toBase58()}`)
            continue
          }

          // Convert Side enum: { none: {}, long: {}, short: {} }
          let side: "long" | "short" = "long"
          if (decoded.side.short !== undefined) {
            side = "short"
          } else if (decoded.side.long !== undefined) {
            side = "long"
          }

          // Convert BN values to numbers
          // Jupiter uses 6 decimals for USD values (1 USD = 1_000_000)
          const position: Position = {
            owner: decoded.owner,
            pool: decoded.pool,
            custody: decoded.custody,
            collateralCustody: decoded.collateralCustody,
            side,
            price: decoded.price.toNumber() / 1_000_000, // 6 decimals
            sizeUsd: decoded.sizeUsd.toNumber() / 1_000_000, // 6 decimals
            collateralUsd: decoded.collateralUsd.toNumber() / 1_000_000, // 6 decimals
            openTime: decoded.openTime.toNumber(),
            updateTime: decoded.updateTime.toNumber(),
            realisedPnlUsd: decoded.realisedPnlUsd.toNumber() / 1_000_000, // 6 decimals (i64)
            publicKey: account.pubkey,
          }

          positions.push(position)
          console.log(
            `[PositionManager] Parsed position: ${side.toUpperCase()} $${position.sizeUsd.toFixed(2)}`
          )
        } catch (error) {
          console.error(
            `[PositionManager] Failed to parse position ${account.pubkey.toBase58()}:`,
            error
          )
        }
      }

      console.log(`[PositionManager] Found ${positions.length} open positions`)
      return positions
    } catch (error) {
      console.error("[PositionManager] Failed to query positions:", error)
      return []
    }
  }

  /**
   * Get a specific position by its PDA
   */
  async getPosition(positionAddress: PublicKey): Promise<Position | null> {
    try {
      const accountInfo = await this.connection.getAccountInfo(positionAddress)

      if (!accountInfo) {
        console.log(`[PositionManager] Position not found: ${positionAddress.toBase58()}`)
        return null
      }

      // Decode using Anchor
      const decoded = this.program.coder.accounts.decode("position", accountInfo.data)

      // Check if position is closed
      if (!decoded.sizeUsd || decoded.sizeUsd.eqn(0)) {
        console.log(`[PositionManager] Position is closed: ${positionAddress.toBase58()}`)
        return null
      }

      // Convert Side enum
      let side: "long" | "short" = "long"
      if (decoded.side.short !== undefined) {
        side = "short"
      } else if (decoded.side.long !== undefined) {
        side = "long"
      }

      return {
        owner: decoded.owner,
        pool: decoded.pool,
        custody: decoded.custody,
        collateralCustody: decoded.collateralCustody,
        side,
        price: decoded.price.toNumber() / 1_000_000,
        sizeUsd: decoded.sizeUsd.toNumber() / 1_000_000,
        collateralUsd: decoded.collateralUsd.toNumber() / 1_000_000,
        openTime: decoded.openTime.toNumber(),
        updateTime: decoded.updateTime.toNumber(),
        realisedPnlUsd: decoded.realisedPnlUsd.toNumber() / 1_000_000,
        publicKey: positionAddress,
      }
    } catch (error) {
      console.error(`[PositionManager] Failed to fetch position:`, error)
      return null
    }
  }

  /**
   * Query all open PositionRequest accounts (stop-loss/take-profit orders)
   */
  async getPositionRequestsForWallet(walletAddress: PublicKey): Promise<PositionRequest[]> {
    try {
      console.log(
        `[PositionManager] Querying position requests for wallet: ${walletAddress.toBase58()}`
      )

      const accounts = await this.connection.getProgramAccounts(this.programId, {
        filters: [
          {
            memcmp: {
              offset: 8, // Skip discriminator
              bytes: walletAddress.toBase58(),
            },
          },
        ],
      })

      console.log(`[PositionManager] Found ${accounts.length} position request accounts`)

      // TODO: Parse using IDL
      const requests: PositionRequest[] = []
      return requests
    } catch (error) {
      console.error("[PositionManager] Failed to query position requests:", error)
      return []
    }
  }

  /**
   * Check if wallet has any open positions
   * Quick check without full parsing
   */
  async hasOpenPositions(walletAddress: PublicKey): Promise<boolean> {
    try {
      const accounts = await this.connection.getProgramAccounts(this.programId, {
        filters: [
          {
            memcmp: {
              offset: 8,
              bytes: walletAddress.toBase58(),
            },
          },
        ],
        dataSlice: { offset: 0, length: 0 }, // Only fetch account keys, not data
      })

      return accounts.length > 0
    } catch (error) {
      console.error("[PositionManager] Failed to check for open positions:", error)
      return false
    }
  }

  /**
   * Close a position (market order)
   *
   * NOTE: This requires the session keypair to sign the transaction
   */
  async closePosition(
    position: Position,
    closeSize: number, // USD amount to close (use position.sizeUsd for full close)
    signerKeypair: any // Keypair from session wallet
  ): Promise<string> {
    try {
      console.log(
        `[PositionManager] Closing position ${position.publicKey.toBase58()} for $${closeSize}`
      )

      // TODO: Build close position transaction using Jupiter Perps instructions
      // This requires the Jupiter Perps IDL and Anchor program interface

      // Placeholder
      throw new Error("Close position not yet implemented - requires Jupiter Perps IDL")
    } catch (error) {
      console.error("[PositionManager] Failed to close position:", error)
      throw error
    }
  }

  /**
   * Create a stop-loss order for a position
   */
  async createStopLoss(
    position: Position,
    triggerPrice: number, // Price at which to close
    closeSize: number, // USD amount to close
    signerKeypair: any
  ): Promise<string> {
    try {
      console.log(
        `[PositionManager] Creating stop-loss for position ${position.publicKey.toBase58()} at $${triggerPrice}`
      )

      // TODO: Build PositionRequest instruction

      throw new Error("Create stop-loss not yet implemented - requires Jupiter Perps IDL")
    } catch (error) {
      console.error("[PositionManager] Failed to create stop-loss:", error)
      throw error
    }
  }

  /**
   * Create a take-profit order for a position
   */
  async createTakeProfit(
    position: Position,
    triggerPrice: number,
    closeSize: number,
    signerKeypair: any
  ): Promise<string> {
    try {
      console.log(
        `[PositionManager] Creating take-profit for position ${position.publicKey.toBase58()} at $${triggerPrice}`
      )

      // TODO: Build PositionRequest instruction

      throw new Error("Create take-profit not yet implemented - requires Jupiter Perps IDL")
    } catch (error) {
      console.error("[PositionManager] Failed to create take-profit:", error)
      throw error
    }
  }
}

// Global position manager instance
let positionManagerInstance: PositionManager | null = null

export function getPositionManager(rpcUrl?: string): PositionManager {
  if (!positionManagerInstance) {
    const url = rpcUrl || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"
    positionManagerInstance = new PositionManager(url)
  }
  return positionManagerInstance
}
