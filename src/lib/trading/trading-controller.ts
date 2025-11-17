import { getDriftPositionManager } from "./drift-position-manager"
import { useGameState, type Stance } from "../game/game-state"

/**
 * Trading Controller with Strategy Presets
 *
 * Connects auto-align decision system to real Drift Protocol trades.
 * Manages position lifecycle: open → update → close based on game state.
 *
 * Strategy Modes:
 * - MANUAL: User makes all trading decisions manually
 * - AGGRESSIVE: Trade every signal, maximize action (high fees, low win rate needed)
 * - BALANCED: Filter for decent setups, good risk/reward (moderate fees)
 * - HIGH_CONVICTION: Only take best setups (low fees, needs strong signals)
 */

export type TradingStrategy = "manual" | "aggressive" | "balanced" | "high_conviction"

interface StrategyPreset {
  name: string
  description: string
  minConviction: number // 0-1, minimum conviction to enter trade
  minHoldTimeMs: number // milliseconds to hold before reversing
  minProfitToClose: number // minimum profit (in fees) to close winning position
  stopLossMultiplier: number // close if loss > this × fees
  dynamicSizing: boolean // scale position size with conviction
}

interface TradingConfig {
  enabled: boolean
  strategy: TradingStrategy
  positionSizeUsd: number // Base position size in USD
  leverage: number // 1-100x
  maxSlippageBps: number // Max slippage in basis points (50 = 0.5%)
  marketIndex: number // 0 = SOL-PERP
}

interface ActivePosition {
  marketIndex: number
  side: "long" | "short"
  entryPrice: number
  sizeUsd: number
  openTime: number
}

interface TradingMetrics {
  totalTrades: number
  filteredTrades: number
  totalVolume: number
  estimatedFees: number
  avgHoldTime: number
}

// Strategy presets optimized for different risk profiles
const STRATEGY_PRESETS: Record<TradingStrategy, StrategyPreset> = {
  manual: {
    name: "Manual",
    description: "You control all trades • Auto-align OFF",
    minConviction: 1.0, // Never auto-trade (conviction is always 0-1)
    minHoldTimeMs: 0,
    minProfitToClose: 0,
    stopLossMultiplier: 0,
    dynamicSizing: false,
  },
  aggressive: {
    name: "Aggressive",
    description: "Trade every signal • More action • Higher fees",
    minConviction: 0.4, // Trade almost everything
    minHoldTimeMs: 2000, // 2 seconds minimum hold
    minProfitToClose: 0.5, // Close if profit > 0.5× fees
    stopLossMultiplier: 3, // Stop loss at 3× fees
    dynamicSizing: false, // Fixed position size
  },
  balanced: {
    name: "Balanced",
    description: "Filter weak signals • Good risk/reward • Moderate fees",
    minConviction: 0.6, // Only trade decent setups
    minHoldTimeMs: 5000, // 5 seconds minimum hold
    minProfitToClose: 1.5, // Close if profit > 1.5× fees
    stopLossMultiplier: 2, // Stop loss at 2× fees
    dynamicSizing: true, // Scale with conviction
  },
  high_conviction: {
    name: "High Conviction",
    description: "Only best setups • Low fees • Needs strong signals",
    minConviction: 0.75, // Only trade very clear signals
    minHoldTimeMs: 10000, // 10 seconds minimum hold
    minProfitToClose: 2.0, // Let winners run (close if profit > 2× fees)
    stopLossMultiplier: 1.5, // Tight stop loss at 1.5× fees
    dynamicSizing: true, // Scale heavily with conviction
  },
}

export class TradingController {
  private config: TradingConfig
  private activePosition: ActivePosition | null = null
  private lastStance: Stance = "flat"
  private isProcessing: boolean = false
  private pnlUpdateInterval: NodeJS.Timeout | null = null
  private metrics: TradingMetrics = {
    totalTrades: 0,
    filteredTrades: 0,
    totalVolume: 0,
    estimatedFees: 0,
    avgHoldTime: 0,
  }

  constructor(config: Partial<TradingConfig> = {}) {
    this.config = {
      enabled: false,
      strategy: "balanced", // Default to balanced strategy
      positionSizeUsd: 10, // $10 base position size
      leverage: 20, // 20x leverage
      maxSlippageBps: 50, // 0.5% max slippage
      marketIndex: 0, // SOL-PERP
      ...config,
    }
  }

  /**
   * Get current strategy preset
   */
  getStrategyPreset(): StrategyPreset {
    return STRATEGY_PRESETS[this.config.strategy]
  }

  /**
   * Get strategy information for UI display
   */
  getStrategyInfo() {
    const preset = this.getStrategyPreset()
    return {
      strategy: this.config.strategy,
      name: preset.name,
      description: preset.description,
      minConviction: preset.minConviction,
      estimatedTradesPerMin: this.estimateTradesPerMin(),
    }
  }

  /**
   * Estimate trades per minute based on strategy
   */
  private estimateTradesPerMin(): number {
    const preset = this.getStrategyPreset()
    // Rough estimate based on conviction threshold
    if (preset.minConviction < 0.5) return 8 // Aggressive: ~8/min
    if (preset.minConviction < 0.7) return 3 // Balanced: ~3/min
    return 1 // High conviction: ~1/min
  }

  /**
   * Calculate position size based on conviction and strategy
   */
  private calculatePositionSize(conviction: number): number {
    const preset = this.getStrategyPreset()
    const baseSize = this.config.positionSizeUsd

    if (!preset.dynamicSizing) {
      return baseSize
    }

    // Scale position size with conviction above minimum threshold
    // Example: conviction 0.6 → 0.7 → 0.9 with balanced strategy
    // Maps to: min size → 50% → max size
    const convictionRange = 1.0 - preset.minConviction
    const convictionAboveMin = Math.max(0, conviction - preset.minConviction)
    const scale = convictionAboveMin / convictionRange

    const minSize = baseSize * 0.5 // 50% of base
    const maxSize = baseSize * 1.5 // 150% of base

    return Math.round(minSize + (maxSize - minSize) * scale)
  }

  /**
   * Estimate round-trip fees for a position
   */
  private estimateFees(positionSize: number): number {
    const DRIFT_TAKER_FEE = 0.0005 // 0.05% per side
    const SLIPPAGE_EST = 0.0002 // ~0.02% average slippage
    return positionSize * (DRIFT_TAKER_FEE * 2 + SLIPPAGE_EST)
  }

  /**
   * Enable real trading
   */
  enable() {
    this.config.enabled = true
    this.startPnlUpdates()
    console.log("[TradingController] ✅ Real trading enabled", this.config)
  }

  /**
   * Disable real trading
   */
  disable() {
    this.config.enabled = false
    this.stopPnlUpdates()
    console.log("[TradingController] Real trading disabled")
  }

  /**
   * Check if trading is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<TradingConfig>) {
    this.config = { ...this.config, ...newConfig }
    console.log("[TradingController] Config updated", this.config)
  }

  /**
   * Handle stance change from auto-align system with strategy filtering
   * This is called every second when the AI makes a decision
   *
   * @param newStance - New trading stance (long/short/flat)
   * @param currentPrice - Current market price
   * @param conviction - Market conviction (0-1, from computeMarketConviction)
   * @param unrealizedPnl - Current unrealized PnL (optional, for fee-aware exits)
   */
  async onStanceChange(
    newStance: Stance,
    currentPrice: number,
    conviction: number = 1.0,
    unrealizedPnl?: number
  ): Promise<void> {
    if (!this.config.enabled) {
      // Trading disabled - just update state
      this.lastStance = newStance
      return
    }

    if (this.isProcessing) {
      console.log("[TradingController] Already processing, skipping...")
      return
    }

    // No change in stance
    if (newStance === this.lastStance) {
      return
    }

    const preset = this.getStrategyPreset()

    console.log(
      `[TradingController] Stance changed: ${this.lastStance} → ${newStance} @ $${currentPrice.toFixed(2)} (conviction: ${(conviction * 100).toFixed(0)}%)`
    )

    // FILTER 1: Conviction threshold for new positions
    if (newStance !== "flat" && conviction < preset.minConviction) {
      console.log(
        `[Filter] ❌ Conviction too low: ${(conviction * 100).toFixed(0)}% < ${(preset.minConviction * 100).toFixed(0)}%`
      )
      this.metrics.filteredTrades++
      return
    }

    // FILTER 2: Minimum hold time before reversing
    if (this.activePosition) {
      const holdTime = Date.now() - this.activePosition.openTime
      if (holdTime < preset.minHoldTimeMs) {
        console.log(
          `[Filter] ❌ Hold time too short: ${(holdTime / 1000).toFixed(1)}s < ${(preset.minHoldTimeMs / 1000).toFixed(1)}s`
        )
        this.metrics.filteredTrades++
        return
      }

      // FILTER 3: Fee-aware profit taking
      if (unrealizedPnl !== undefined) {
        const estimatedFees = this.estimateFees(this.activePosition.sizeUsd)
        const minProfitToClose = estimatedFees * preset.minProfitToClose
        const stopLoss = -estimatedFees * preset.stopLossMultiplier

        // Don't close winners too early
        if (unrealizedPnl > 0 && unrealizedPnl < minProfitToClose && newStance === "flat") {
          console.log(
            `[Filter] ❌ Profit too small to close: $${unrealizedPnl.toFixed(2)} < $${minProfitToClose.toFixed(2)} (${preset.minProfitToClose}× fees)`
          )
          this.metrics.filteredTrades++
          return
        }

        // Stop loss: close if losing more than threshold
        if (unrealizedPnl < stopLoss) {
          console.log(
            `[Filter] ⚠️ Stop loss triggered: $${unrealizedPnl.toFixed(2)} < $${stopLoss.toFixed(2)}`
          )
          // Force close - don't filter this
        }
      }
    }

    // Passed all filters - execute trade
    console.log(`[Filter] ✅ Trade approved (${this.config.strategy} strategy)`)

    this.isProcessing = true

    try {

      // Close existing position if we have one
      if (this.activePosition) {
        await this.closeCurrentPosition()
      }

      // Open new position if stance is LONG or SHORT
      if (newStance === "long" || newStance === "short") {
        await this.openNewPosition(newStance, currentPrice, conviction)
      }

      this.lastStance = newStance
    } catch (error) {
      console.error("[TradingController] Failed to handle stance change:", error)
      // Don't throw - continue game even if trade fails
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Open a new position with dynamic sizing
   */
  private async openNewPosition(
    side: "long" | "short",
    currentPrice: number,
    conviction: number
  ): Promise<void> {
    try {
      // Calculate position size based on conviction and strategy
      const positionSize = this.calculatePositionSize(conviction)

      console.log(
        `[TradingController] Opening ${side.toUpperCase()} position: $${positionSize} @ ${this.config.leverage}x (conviction: ${(conviction * 100).toFixed(0)}%)`
      )

      const driftManager = getDriftPositionManager()

      const txSig = await driftManager.openPosition(
        side,
        positionSize,
        this.config.marketIndex,
        this.config.leverage,
        this.config.maxSlippageBps
      )

      // Store position info
      this.activePosition = {
        marketIndex: this.config.marketIndex,
        side,
        entryPrice: currentPrice,
        sizeUsd: positionSize,
        openTime: Date.now(),
      }

      // Update metrics
      this.metrics.totalTrades++
      this.metrics.totalVolume += positionSize
      this.metrics.estimatedFees += this.estimateFees(positionSize)

      // Update game state
      useGameState.setState({
        openPositionSize: positionSize,
      })

      console.log(`[TradingController] ✅ Position opened: ${txSig}`)
    } catch (error) {
      console.error("[TradingController] Failed to open position:", error)
      throw error
    }
  }

  /**
   * Close current position
   */
  private async closeCurrentPosition(): Promise<void> {
    if (!this.activePosition) return

    try {
      console.log(
        `[TradingController] Closing ${this.activePosition.side.toUpperCase()} position...`
      )

      const driftManager = getDriftPositionManager()

      // Get final PnL before closing
      const positions = await driftManager.getOpenPositions()
      const currentPosition = positions.find((p) => p.marketIndex === this.activePosition!.marketIndex)

      if (currentPosition) {
        // Add realized PnL to total
        useGameState.getState().addRealizedPnl(currentPosition.unrealizedPnl)
        console.log(
          `[TradingController] Position PnL: ${currentPosition.unrealizedPnl > 0 ? "+" : ""}$${currentPosition.unrealizedPnl.toFixed(2)}`
        )
      }

      const txSig = await driftManager.closePosition(this.activePosition.marketIndex, 100)

      console.log(`[TradingController] ✅ Position closed: ${txSig}`)

      // Clear active position
      this.activePosition = null

      // Update game state
      useGameState.setState({
        openPositionSize: 0,
        unrealizedPnl: 0,
      })
    } catch (error) {
      console.error("[TradingController] Failed to close position:", error)
      throw error
    }
  }

  /**
   * Force close current position (for emergencies)
   */
  async forceClose(): Promise<void> {
    if (!this.activePosition) {
      console.log("[TradingController] No active position to close")
      return
    }

    await this.closeCurrentPosition()
  }

  /**
   * Start polling for PnL updates
   * Updates game state every 1 second with current unrealized PnL
   */
  private startPnlUpdates() {
    if (this.pnlUpdateInterval) return

    this.pnlUpdateInterval = setInterval(async () => {
      if (!this.activePosition) return

      try {
        const driftManager = getDriftPositionManager()
        const positions = await driftManager.getOpenPositions()

        const currentPosition = positions.find((p) => p.marketIndex === this.activePosition!.marketIndex)

        if (currentPosition) {
          // Update game state with current unrealized PnL
          useGameState.setState({
            unrealizedPnl: currentPosition.unrealizedPnl,
          })
        }
      } catch (error) {
        console.error("[TradingController] Failed to update PnL:", error)
      }
    }, 1000) // Update every second

    console.log("[TradingController] Started PnL updates")
  }

  /**
   * Stop PnL updates
   */
  private stopPnlUpdates() {
    if (this.pnlUpdateInterval) {
      clearInterval(this.pnlUpdateInterval)
      this.pnlUpdateInterval = null
      console.log("[TradingController] Stopped PnL updates")
    }
  }

  /**
   * Get current position info
   */
  getCurrentPosition(): ActivePosition | null {
    return this.activePosition
  }

  /**
   * Get trading metrics for display
   */
  getMetrics(): TradingMetrics & { strategy: string } {
    const avgHoldTime =
      this.metrics.totalTrades > 0
        ? (Date.now() - (this.activePosition?.openTime || Date.now())) / this.metrics.totalTrades
        : 0

    return {
      ...this.metrics,
      avgHoldTime,
      strategy: this.getStrategyPreset().name,
    }
  }

  /**
   * Reset metrics (e.g., when starting new game)
   */
  resetMetrics() {
    this.metrics = {
      totalTrades: 0,
      filteredTrades: 0,
      totalVolume: 0,
      estimatedFees: 0,
      avgHoldTime: 0,
    }
  }

  /**
   * Cleanup - close position and stop updates
   */
  async cleanup(): Promise<void> {
    this.stopPnlUpdates()

    if (this.activePosition) {
      console.log("[TradingController] Cleanup: closing active position...")
      await this.forceClose()
    }

    console.log("[TradingController] Cleanup complete")
  }
}

// Export strategy presets for UI
export { STRATEGY_PRESETS }

// Global trading controller instance
let tradingControllerInstance: TradingController | null = null

export function getTradingController(): TradingController {
  if (!tradingControllerInstance) {
    tradingControllerInstance = new TradingController({
      positionSizeUsd: 10, // $10 positions
      leverage: 20, // 20x leverage
      maxSlippageBps: 50, // 0.5% slippage
    })
  }
  return tradingControllerInstance
}
