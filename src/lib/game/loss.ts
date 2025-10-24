import { clamp } from "./math"

// Loss thresholds based on % of balance lost
const LOSS_THRESHOLD_START = 0.05 // 5% loss triggers first stone
const LOSS_THRESHOLD_MAX = 0.25 // 25% loss triggers max stones (before liquidation)
const MAX_STONES_TO_LOSE = 4 // Never lose more than 4 stones at once
const LIQUIDATION_THRESHOLD = 0.90 // 90% loss = liquidation (lose all stones)

/**
 * Calculate how many stones to lose based on actual P&L drawdown
 * @param currentBalance Current account balance
 * @param startingBalance Starting balance (to calculate % loss)
 * @param stackCount Current number of stones in the stack
 * @returns Number of stones to lose (0 if no loss, stackCount if liquidated)
 */
export const stonesToLoseFromDrawdown = (
  currentBalance: number,
  startingBalance: number,
  stackCount: number
): number => {
  if (stackCount <= 0 || startingBalance <= 0) return 0

  // Calculate % of balance lost
  const balanceLost = startingBalance - currentBalance
  const lossPercentage = balanceLost / startingBalance

  // No loss or profit - no stones lost
  if (lossPercentage <= 0) return 0

  // Liquidation check - lost 90%+ of balance
  if (lossPercentage >= LIQUIDATION_THRESHOLD) {
    return stackCount // Lose all stones
  }

  // No loss event until 5% drawdown
  if (lossPercentage < LOSS_THRESHOLD_START) return 0

  // Scale between 5% and 25% loss
  // 5% = 1 stone, 25% = 4 stones
  const scaledLoss = (lossPercentage - LOSS_THRESHOLD_START) / (LOSS_THRESHOLD_MAX - LOSS_THRESHOLD_START)
  const stonesToLose = Math.ceil(scaledLoss * MAX_STONES_TO_LOSE)

  // Cap at max stones to lose or total stack count
  return clamp(stonesToLose, 0, Math.min(MAX_STONES_TO_LOSE, stackCount))
}

/**
 * Calculate severity of loss for physics force application
 * @param lossPercentage Percentage of balance lost (0-1)
 * @returns Severity multiplier (0-1)
 */
export const calculateLossSeverity = (currentBalance: number, startingBalance: number): number => {
  if (startingBalance <= 0) return 0
  const lossPercentage = (startingBalance - currentBalance) / startingBalance
  return clamp(lossPercentage / LOSS_THRESHOLD_MAX, 0, 1)
}
