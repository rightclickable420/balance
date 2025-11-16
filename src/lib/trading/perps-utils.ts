import { PublicKey, Connection } from "@solana/web3.js"
import { BN } from "@coral-xyz/anchor"
import type { Position } from "./position-manager"

/**
 * Jupiter Perps Utility Functions
 *
 * Helper functions for PDA derivation, PnL calculation, and price conversions
 */

export const JUPITER_PERPS_PROGRAM_ID = new PublicKey(
  "PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu"
)

export const JLP_POOL = new PublicKey("5BUwFW4nRbftYTDMbgxykoFWqWHPzahFSNAaaaJtVKsq")

// SOL Custody (for SOL-based positions)
export const SOL_CUSTODY = new PublicKey("7xS2gz2bTp3fwCC7knJvUWTEU9Tycczu6VhJYKgi1wdz")

// USDC Custody (for collateral)
export const USDC_CUSTODY = new PublicKey("8MZ5Y4pHuwvR3jivAzNDcKw1795RQEqfkJqLW7o9A9r9")

/**
 * Derive Position PDA for a wallet
 */
export function derivePositionPda({
  owner,
  custody,
  collateralCustody,
  side,
}: {
  owner: PublicKey
  custody: PublicKey
  collateralCustody: PublicKey
  side: "long" | "short"
}): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("position"),
      owner.toBuffer(),
      JLP_POOL.toBuffer(),
      custody.toBuffer(),
      collateralCustody.toBuffer(),
      Buffer.from([side === "long" ? 1 : 2]),
    ],
    JUPITER_PERPS_PROGRAM_ID
  )
}

/**
 * Derive Position Request PDA
 */
export function derivePositionRequestPda({
  position,
  counter,
  requestChange,
}: {
  position: PublicKey
  counter: BN
  requestChange: "increase" | "decrease"
}): [PublicKey, number] {
  const requestChangeEnum = requestChange === "increase" ? [1] : [2]

  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("position_request"),
      position.toBuffer(),
      counter.toArrayLike(Buffer, "le", 8),
      Buffer.from(requestChangeEnum),
    ],
    JUPITER_PERPS_PROGRAM_ID
  )
}

/**
 * Calculate Position PnL
 *
 * Formula: PnL = (Position Size USD) × (Price Delta) ÷ (Entry Price)
 * - For long: profit when current price > entry price
 * - For short: profit when current price < entry price
 */
export function calculatePositionPnl(
  position: Position,
  currentPrice: number
): { pnl: number; pnlPercent: number; isProfit: boolean } {
  const entryPrice = position.price
  const sizeUsd = position.sizeUsd
  const side = position.side

  // Calculate price delta
  const priceDelta = currentPrice - entryPrice

  // For shorts, invert the delta
  const effectiveDelta = side === "short" ? -priceDelta : priceDelta

  // Calculate PnL in USD
  const pnl = (sizeUsd * effectiveDelta) / entryPrice

  // Calculate PnL percentage relative to collateral
  const pnlPercent = (pnl / position.collateralUsd) * 100

  const isProfit = pnl > 0

  return { pnl, pnlPercent, isProfit }
}

/**
 * Convert USD value to 6-decimal format used by Jupiter
 */
export function usdToJupiterDecimals(usd: number): BN {
  return new BN(Math.floor(usd * 1_000_000))
}

/**
 * Convert Jupiter 6-decimal format to USD
 */
export function jupiterDecimalsToUsd(value: BN): number {
  return value.toNumber() / 1_000_000
}

/**
 * Calculate liquidation price for a position
 */
export function calculateLiquidationPrice(
  position: Position,
  maintenanceMarginBps: number = 500 // 5% default
): number {
  const leverage = position.sizeUsd / position.collateralUsd
  const maintenanceMargin = maintenanceMarginBps / 10000 // Convert bps to decimal

  if (position.side === "long") {
    // Long liquidation: price drops to point where loss = collateral - maintenance margin
    const maxLossPercent = 1 - maintenanceMargin
    return position.price * (1 - maxLossPercent / leverage)
  } else {
    // Short liquidation: price rises to point where loss = collateral - maintenance margin
    const maxLossPercent = 1 - maintenanceMargin
    return position.price * (1 + maxLossPercent / leverage)
  }
}

/**
 * Check if position is near liquidation
 */
export function isNearLiquidation(
  position: Position,
  currentPrice: number,
  warningThreshold: number = 0.1 // 10% from liquidation
): { isNear: boolean; liquidationPrice: number; distancePercent: number } {
  const liquidationPrice = calculateLiquidationPrice(position)

  const priceDistance = Math.abs(currentPrice - liquidationPrice)
  const distancePercent = priceDistance / currentPrice

  const isNear = distancePercent < warningThreshold

  return {
    isNear,
    liquidationPrice,
    distancePercent,
  }
}

/**
 * Generate random counter for position requests
 */
export function generateRequestCounter(): BN {
  return new BN(Math.floor(Math.random() * 1_000_000_000))
}
