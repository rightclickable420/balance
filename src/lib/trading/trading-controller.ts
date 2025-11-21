import { getDriftPositionManager } from "./drift-position-manager"
import { detectMarketRegime } from "./market-regime"
import { useGameState, type Stance } from "../game/game-state"
import { useAccountState } from "../game/account-state"
import { getSessionWallet } from "../wallet/session-wallet"
import { toast } from "sonner"

/**
 * Trading Controller with Strategy Presets
 *
 * Connects auto-align decision system to real Drift Protocol trades.
 * Manages position lifecycle: open → update → close based on game state.
 *
 * Strategy Modes:
 * - MANUAL: User makes all trading decisions manually
 * - AGGRESSIVE (Sicko Mode): Trade every signal, maximize action (high fees, low win rate needed)
 * - BALANCED (Degen Mode): Filter for decent setups, good risk/reward (moderate fees)
 * - HIGH_CONVICTION (Midcurve): Only take best setups (low fees, needs strong signals)
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
  totalHoldTime: number
  winCount: number
  lossCount: number
  totalWinPnl: number
  totalLossPnl: number
  feeSavings: number
}

interface TradingMetricsSnapshot {
  strategy: string
  totalTrades: number
  filteredTrades: number
  totalVolume: number
  totalFees: number
  avgHoldTime: number
  winRate: number
  avgWinSize: number
  avgLossSize: number
  feeSavings: number
}

// Strategy presets optimized for different risk profiles
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
// Removed: AGGRESSIVE_MAX_POSITION_USD - now using simple percentage-based sizing
const FLAT_CONFIRMATION_MS = 2000

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
    name: "Sicko Mode",
    description: "Maximum chaos • You WILL lose money • Don't use this",
    minConviction: 0.45, // Reduced from 0.60 - allow more trades (was filtering too much)
    minHoldTimeMs: 5000, // Reduced from 8000 - 5 seconds (was too long)
    minProfitToClose: 1.0, // Reduced from 1.5 - take profits sooner
    stopLossMultiplier: 6, // Reduced from 8 - tighter but still reasonable
    dynamicSizing: true, // Scale with conviction + microstructure
  },
  balanced: {
    name: "Degen Mode",
    description: "For true degenerates only • Prepare to get rekt • Seriously don't",
    minConviction: 0.70, // Changed from 0.60 - higher conviction threshold
    minHoldTimeMs: 15000, // Changed from 5000 - 15 seconds minimum hold
    minProfitToClose: 2.0, // Changed from 1.5 - close if profit > 2× fees
    stopLossMultiplier: 10, // Changed from 2 - much wider stop (was too tight)
    dynamicSizing: true, // Scale with conviction
  },
  high_conviction: {
    name: "Midcurve",
    description: "Thinks they're smart • Also loses money • Just use manual",
    minConviction: 0.85, // Changed from 0.75 - only trade very clear signals
    minHoldTimeMs: 30000, // Changed from 9000 - 30 seconds minimum hold
    minProfitToClose: 3.0, // Changed from 2.0 - let winners run (close if profit > 3× fees)
    stopLossMultiplier: 12, // Changed from 1.5 - wide stop (was way too tight)
    dynamicSizing: true, // Scale heavily with conviction
  },
}

const CHOPPY_THRESHOLD_OFFSET = 0.10 // Reduced from 0.20 - was filtering too aggressively
const CHOPPY_MIN_THRESHOLD = 0.55 // Reduced from 0.70 - allow trading in moderate chop
const CHOPPY_MAX_THRESHOLD = 0.80 // Reduced from 0.85 - more reasonable ceiling
const CHOPPY_DYNAMIC_SIZE_PENALTY = 0.6
const CHOPPY_STATIC_SIZE_PENALTY = 0.75

const getChoppyConvictionThreshold = (preset: StrategyPreset) =>
  Math.min(
    CHOPPY_MAX_THRESHOLD,
    Math.max(CHOPPY_MIN_THRESHOLD, preset.minConviction + CHOPPY_THRESHOLD_OFFSET)
  )

export class TradingController {
  private config: TradingConfig
  private activePosition: ActivePosition | null = null
  private lastStance: Stance = "flat"
  private flatSignalStart: number | null = null
  private isProcessing: boolean = false
  private pnlUpdateInterval: NodeJS.Timeout | null = null
  private isPaused: boolean = false
  private metrics: TradingMetrics = {
    totalTrades: 0,
    filteredTrades: 0,
    totalVolume: 0,
    estimatedFees: 0,
    totalHoldTime: 0,
    winCount: 0,
    lossCount: 0,
    totalWinPnl: 0,
    totalLossPnl: 0,
    feeSavings: 0,
  }
  private cachedCollateral = 100 // Cache collateral for position sizing
  private lastCollateralUpdate = 0

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
    if (preset.minConviction < 0.5) return 8 // Sicko Mode (aggressive): ~8/min
    if (preset.minConviction < 0.7) return 3 // Degen Mode (balanced): ~3/min
    return 1 // Midcurve (high conviction): ~1/min
  }

  /**
   * Update cached collateral value from Drift
   * Called periodically to keep position sizing accurate
   */
  private async updateCachedCollateral(): Promise<void> {
    try {
      const driftManager = getDriftPositionManager()
      const summary = await driftManager.getPositionSummary()
      if (summary && summary.totalCollateral > 0) {
        this.cachedCollateral = summary.totalCollateral
        this.lastCollateralUpdate = Date.now()
        console.log(`[TradingController] Updated collateral cache: $${this.cachedCollateral.toFixed(2)}`)
      }
    } catch (error) {
      console.warn("[TradingController] Failed to update collateral cache:", error)
    }
  }

  /**
   * Calculate position size based on conviction and strategy
   * Uses simple percentage of total collateral
   */
  private calculatePositionSize(conviction: number): number {
    const preset = this.getStrategyPreset()

    // Use cached collateral value (updated async periodically)
    const totalCollateral = this.cachedCollateral

    // Simple percentage-based sizing
    // Max size = 10% of collateral (at max conviction)
    // Min size = 5% of collateral (at min conviction)
    // Note: Drift requires minimum 0.01 SOL position (~$2.50 at $250/SOL)
    const MAX_POSITION_PERCENT = 0.10 // 10% max
    const MIN_POSITION_PERCENT = 0.05 // 5% min (increased from 2% to meet Drift minimums)
    const ABSOLUTE_MIN_SIZE = 2.5 // $2.50 minimum to meet Drift's 0.01 SOL requirement

    if (!preset.dynamicSizing) {
      // Fixed sizing at midpoint (7.5% of collateral)
      const fixedSize = totalCollateral * 0.075
      return Math.max(Math.round(fixedSize), ABSOLUTE_MIN_SIZE)
    }

    // Scale linearly between min and max based on conviction
    // conviction 0.5 → 5% of collateral
    // conviction 0.9 → 10% of collateral
    const convictionRange = 1.0 - preset.minConviction
    const convictionAboveMin = Math.max(0, conviction - preset.minConviction)
    const convictionScale = convictionAboveMin / convictionRange

    const sizePercent = MIN_POSITION_PERCENT + (MAX_POSITION_PERCENT - MIN_POSITION_PERCENT) * convictionScale
    let positionSize = totalCollateral * sizePercent

    // Enforce absolute minimum to meet Drift protocol requirements
    positionSize = Math.max(positionSize, ABSOLUTE_MIN_SIZE)

    console.log(
      `[TradingController] Position sizing: conviction=${conviction.toFixed(2)}, ` +
      `collateral=$${totalCollateral.toFixed(2)}, percent=${(sizePercent * 100).toFixed(1)}%, ` +
      `size=$${positionSize.toFixed(2)}`
    )

    return Math.round(positionSize)
  }

  /**
   * Determine slippage + auction duration for a trade
   */
  private getExecutionProfile(
    conviction: number,
    isFlip: boolean,
    orderSizeUsd: number
  ): { slippageBps: number; auctionDurationSeconds: number } {
    const largeOrder = orderSizeUsd > 50
    if (isFlip && largeOrder) {
      return { slippageBps: 70, auctionDurationSeconds: 1 }
    }

    if (conviction >= 0.9) {
      return { slippageBps: 25, auctionDurationSeconds: 2 }
    }

    if (conviction >= 0.8) {
      return { slippageBps: 35, auctionDurationSeconds: 1 }
    }

    if (conviction >= 0.7) {
      return { slippageBps: 45, auctionDurationSeconds: 1 }
    }

    return { slippageBps: 60, auctionDurationSeconds: 1 }
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
   * Track when we intentionally skip a trade (estimated fee savings)
   */
  private trackFilteredTrade(estimatedSizeUsd: number) {
    const size = Math.max(0, estimatedSizeUsd)
    this.metrics.filteredTrades++
    if (size > 0) {
      this.metrics.feeSavings += this.estimateFees(size)
    }
  }

  async ensureAllPositionsClosed(context: string = "unspecified"): Promise<void> {
    try {
      const sessionWallet = getSessionWallet()
      const keypair = sessionWallet.getKeypair()
      if (!keypair) {
        console.warn("[TradingController] ensureAllPositionsClosed skipped (no session wallet)")
        return
      }
      const driftManager = getDriftPositionManager()
      await driftManager.initialize(keypair, { skipDeposit: true })
      const openPositions = await driftManager.getOpenPositions()
      if (openPositions.length === 0) {
        await driftManager.cleanup()
        return
      }
      console.log(
        `[TradingController] ${context}: Closing ${openPositions.length} remaining Drift position(s)`
      )
      for (const position of openPositions) {
        await driftManager.closePosition(position.marketIndex, 100)
      }
      this.activePosition = null
      useGameState.setState({
        openPositionSize: 0,
        driftPositionSide: "flat",
      })
      await driftManager.cleanup()
    } catch (error) {
      console.error("[TradingController] Failed to ensure all positions closed:", error)
    }
  }

  // Removed: applyAggressiveSizing() - now using simple percentage-based sizing

  /**
   * Enable real trading
   */
  async enable() {
    this.isPaused = false
    this.config.enabled = true

    // Update collateral cache immediately when starting
    await this.updateCachedCollateral()

    this.startPnlUpdates()
    console.log("[TradingController] ✅ Real trading enabled", this.config)
  }

  /**
   * Disable real trading
   */
  disable() {
    this.config.enabled = false
    this.stopPnlUpdates()
    this.isPaused = false
    this.flatSignalStart = null
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

  isTradingPaused(): boolean {
    return this.isPaused
  }

  async pauseTrading(): Promise<void> {
    if (this.isPaused) {
      console.log("[TradingController] pauseTrading ignored (already paused)")
      return
    }

    this.isPaused = true
    console.log("[TradingController] Pausing live execution...")

    try {
      if (this.activePosition) {
        await this.closeCurrentPosition()
      }
      await this.ensureAllPositionsClosed("pauseTrading")
      toast.info("Live trading paused — standing flat")
    } catch (error) {
      this.isPaused = false
      console.error("[TradingController] Failed to pause trading:", error)
      toast.error("Failed to pause live trading. Check console for details.")
      throw error
    }
  }

  resumeTrading(): void {
    if (!this.isPaused) {
      return
    }
    this.isPaused = false
    this.lastStance = "flat"
    console.log("[TradingController] Resuming live execution")
    toast.success("Live trading resumed")
  }

  /**
   * Handle stance change from auto-align system with strategy filtering
   * This is called every second when the AI makes a decision
   *
   * @param newStance - New trading stance (long/short/flat)
   * @param currentPrice - Current market price
   * @param conviction - Market conviction (0-1, from computeMarketConviction)
   * @param unrealizedPnl - Current unrealized PnL (optional, for fee-aware exits)
   * @param gameMode - Game mode (mock/real) - mock mode bypasses confirmation delays
   */
  async onStanceChange(
    newStance: Stance,
    currentPrice: number,
    conviction: number = 1.0,
    unrealizedPnl?: number,
    gameMode?: "mock" | "real"
  ): Promise<void> {
    if (!this.config.enabled) {
      // Trading disabled - just update state
      this.lastStance = newStance
      this.flatSignalStart = newStance === "flat" ? Date.now() : null
      return
    }

    if (this.isProcessing) {
      console.log("[TradingController] Already processing, skipping...")
      return
    }

    if (this.isPaused) {
      if (newStance !== "flat") {
        console.log("[TradingController] Live execution paused → ignoring stance change")
        this.trackFilteredTrade(this.calculatePositionSize(conviction))
      }
      this.lastStance = "flat"
      return
    }

    const preset = this.getStrategyPreset()
    const now = Date.now()
    if (newStance === "flat") {
      this.flatSignalStart = this.flatSignalStart ?? now
    } else {
      this.flatSignalStart = null
    }
    const choppyConvictionThreshold = getChoppyConvictionThreshold(preset)

    const { candleHistory } = useGameState.getState()
    const marketRegime = detectMarketRegime(candleHistory)
    const isChoppy = marketRegime === "choppy"
    const allowChoppyTrade = isChoppy && conviction >= choppyConvictionThreshold

    if (isChoppy && !allowChoppyTrade) {
      console.log("[TradingController] Regime=choppy → forcing flat mode")
      if (this.activePosition) {
        this.isProcessing = true
        try {
          await this.closeCurrentPosition()
          this.lastStance = "flat"
        } catch (error) {
          console.error("[TradingController] Failed to flatten during choppy regime:", error)
        } finally {
          this.isProcessing = false
        }
      }

      if (newStance !== "flat") {
        this.trackFilteredTrade(this.calculatePositionSize(conviction))
      }
      return
    } else if (isChoppy && allowChoppyTrade) {
      console.log(
        `[TradingController] Regime=choppy but conviction ${(conviction * 100).toFixed(0)}% ≥ ${(
          choppyConvictionThreshold * 100
        ).toFixed(0)}% → executing with reduced size`
      )
    }

    // No change in stance
    if (newStance === this.lastStance) {
      return
    }

    console.log(
      `[TradingController] Stance changed: ${this.lastStance} → ${newStance} @ $${currentPrice.toFixed(2)} (conviction: ${(conviction * 100).toFixed(0)}%)`
    )

    // Skip flat confirmation delay for mock trading
    if (
      gameMode !== "mock" &&
      newStance === "flat" &&
      this.lastStance !== "flat" &&
      this.activePosition &&
      this.flatSignalStart !== null &&
      now - this.flatSignalStart < FLAT_CONFIRMATION_MS
    ) {
      console.log(
        `[Filter] ⏳ Flat signal too brief (${((now - this.flatSignalStart) / 1000).toFixed(2)}s < ${(FLAT_CONFIRMATION_MS / 1000).toFixed(2)}s) [real mode]`
      )
      this.trackFilteredTrade(this.activePosition.sizeUsd)
      return
    }

    // FILTER 1: Conviction threshold for new positions
    if (newStance !== "flat" && conviction < preset.minConviction) {
      console.log(
        `[Filter] ❌ Conviction too low: ${(conviction * 100).toFixed(0)}% < ${(preset.minConviction * 100).toFixed(0)}%`
      )
      this.trackFilteredTrade(this.calculatePositionSize(conviction))
      return
    }

    // FILTER 2: Risk management - check stop loss and take profit
    if (this.activePosition && unrealizedPnl !== undefined) {
      const holdTime = Date.now() - this.activePosition.openTime
      const estimatedFees = this.estimateFees(this.activePosition.sizeUsd)
      const stopLoss = -estimatedFees * preset.stopLossMultiplier
      const takeProfit = estimatedFees * preset.minProfitToClose

      // Check stop loss
      if (unrealizedPnl <= stopLoss) {
        console.log(
          `[Filter] 🛑 STOP LOSS: $${unrealizedPnl.toFixed(2)} <= $${stopLoss.toFixed(2)} (${(estimatedFees * preset.stopLossMultiplier).toFixed(2)} loss)`
        )
        // Force close regardless of new stance
        this.isProcessing = true
        try {
          await this.closeCurrentPosition()
          this.lastStance = "flat"
        } catch (error) {
          console.error("[TradingController] Stop loss close failed:", error)
        } finally {
          this.isProcessing = false
        }
        return
      }

      // Check take profit
      if (unrealizedPnl >= takeProfit) {
        console.log(
          `[Filter] 🎯 TAKE PROFIT: $${unrealizedPnl.toFixed(2)} >= $${takeProfit.toFixed(2)} (${(estimatedFees * preset.minProfitToClose).toFixed(2)} profit)`
        )
        // Force close regardless of new stance
        this.isProcessing = true
        try {
          await this.closeCurrentPosition()
          this.lastStance = "flat"
        } catch (error) {
          console.error("[TradingController] Take profit close failed:", error)
        } finally {
          this.isProcessing = false
        }
        return
      }

      // If stance is going flat but we haven't hit SL/TP and hold time hasn't passed, ignore it
      if (newStance === "flat" && holdTime < preset.minHoldTimeMs) {
        const exitReason = `Position is ${unrealizedPnl >= 0 ? "winning" : "losing"} ($${unrealizedPnl.toFixed(2)}) but within SL/TP range`
        console.log(
          `[Filter] ⏱️ Ignoring FLAT signal - ${exitReason}. Hold time: ${(holdTime / 1000).toFixed(1)}s < ${(preset.minHoldTimeMs / 1000).toFixed(1)}s`
        )
        this.trackFilteredTrade(this.activePosition.sizeUsd)
        return
      }

      // Check minimum hold time before allowing reversals (not applicable to flat exits after min hold)
      if (newStance !== "flat" && newStance !== this.activePosition.side && holdTime < preset.minHoldTimeMs) {
        console.log(
          `[Filter] ❌ Hold time too short for reversal: ${(holdTime / 1000).toFixed(1)}s < ${(preset.minHoldTimeMs / 1000).toFixed(1)}s`
        )
        this.trackFilteredTrade(this.activePosition.sizeUsd)
        return
      }
    }

    // Passed all filters - execute trade
    console.log(`[Filter] ✅ Trade approved (${this.config.strategy} strategy)`)

    this.isProcessing = true

    try {
      if (newStance === "flat") {
        if (this.activePosition) {
          await this.closeCurrentPosition()
        }
        this.lastStance = "flat"
        return
      }

      let targetSizeUsd = this.calculatePositionSize(conviction)
      if (isChoppy && allowChoppyTrade) {
        const penalty = preset.dynamicSizing
          ? CHOPPY_DYNAMIC_SIZE_PENALTY
          : CHOPPY_STATIC_SIZE_PENALTY
        targetSizeUsd = Math.max(1, Math.round(targetSizeUsd * penalty))
      }
      await this.rebalancePosition(newStance, targetSizeUsd, currentPrice, conviction)
      this.lastStance = newStance
    } catch (error) {
      console.error("[TradingController] Failed to handle stance change:", error)
      // Don't throw - continue game even if trade fails
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Rebalance current position (single transaction flip / resize)
   */
  private async rebalancePosition(
    targetSide: "long" | "short",
    targetSizeUsd: number,
    currentPrice: number,
    conviction: number
  ): Promise<void> {
    let pendingToastId: string | number | null = null
    try {
      // Update collateral cache before sizing (throttled to once per 10 seconds)
      const now = Date.now()
      if (now - this.lastCollateralUpdate > 10000) {
        await this.updateCachedCollateral()
      }

      const driftManager = getDriftPositionManager()
      const currentExposureUsd = this.activePosition
        ? this.activePosition.sizeUsd * (this.activePosition.side === "long" ? 1 : -1)
        : 0
      const targetExposureUsd = targetSizeUsd * (targetSide === "long" ? 1 : -1)
      const deltaExposureUsd = targetExposureUsd - currentExposureUsd

      if (Math.abs(deltaExposureUsd) < 0.5) {
        console.log("[TradingController] Position already aligned with target - skipping")
        const openTime =
          this.activePosition && this.activePosition.side === targetSide
            ? this.activePosition.openTime
            : Date.now()
        this.activePosition = {
          marketIndex: this.config.marketIndex,
          side: targetSide,
          entryPrice: currentPrice,
          sizeUsd: targetSizeUsd,
          openTime,
        }
        useGameState.setState({ openPositionSize: targetSizeUsd })
        return
      }

      const increasedExposure = Math.max(0, Math.abs(targetExposureUsd) - Math.abs(currentExposureUsd))
      if (increasedExposure > 0) {
        const requiredCollateral =
          this.config.leverage === 0 ? increasedExposure : increasedExposure / this.config.leverage
        const freeCollateral = driftManager.getFreeCollateral()
        if (freeCollateral < requiredCollateral) {
          console.warn(
            `[TradingController] Skipping trade: need $${requiredCollateral.toFixed(2)} collateral, have $${freeCollateral.toFixed(2)}`
          )
          this.trackFilteredTrade(increasedExposure)
          return
        }
      }

      const direction: "long" | "short" = deltaExposureUsd > 0 ? "long" : "short"
      const orderSize = Math.abs(deltaExposureUsd)
      const isFlip = Boolean(this.activePosition && this.activePosition.side !== targetSide)

      const executionProfile = this.getExecutionProfile(conviction, isFlip, orderSize)

      console.log(
        `[TradingController] Rebalancing via ${direction.toUpperCase()} order: $${orderSize.toFixed(
          2
        )} → target ${targetSide.toUpperCase()} $${targetSizeUsd.toFixed(2)}`
      )

      const orderLabel = `${targetSide === "long" ? "LONG" : "SHORT"} $${targetSizeUsd.toFixed(
        2
      )} @ ${this.config.leverage}x`
      pendingToastId = toast.loading(`[Live] Opening ${orderLabel}...`)

      let txSig: string
      try {
        txSig = await driftManager.openPosition(
          direction,
          orderSize,
          this.config.marketIndex,
          this.config.leverage,
          executionProfile.slippageBps,
          executionProfile.auctionDurationSeconds
        )
      } catch (orderError) {
        toast.error("Live trade failed while opening. Check console for details.", {
          id: pendingToastId ?? undefined,
        })
        pendingToastId = null
        throw orderError
      }

      const openTime =
        this.activePosition && this.activePosition.side === targetSide
          ? this.activePosition.openTime
          : Date.now()

      this.activePosition = {
        marketIndex: this.config.marketIndex,
        side: targetSide,
        entryPrice: currentPrice,
        sizeUsd: targetSizeUsd,
        openTime,
      }

      this.metrics.totalTrades++
      this.metrics.totalVolume += orderSize
      this.metrics.estimatedFees += this.estimateFees(orderSize)

      useGameState.setState({
        openPositionSize: targetSizeUsd,
      })

      console.log(`[TradingController] ✅ Position rebalanced: ${txSig}`)
      toast.success(`[Live] Filled ${orderLabel} (${txSig.slice(0, 8)}...)`, {
        id: pendingToastId ?? undefined,
      })
      pendingToastId = null
    } catch (error) {
      console.error("[TradingController] Failed to rebalance position:", error)
      if (pendingToastId !== null) {
        toast.error("Live trade failed. Check console for details.", {
          id: pendingToastId,
        })
        pendingToastId = null
      } else {
        toast.error("Live trade failed. Check console for details.")
      }
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
      toast.info(`[Live] Closing ${this.activePosition.side.toUpperCase()} position...`)

      const driftManager = getDriftPositionManager()

      // Get final PnL before closing
      const positions = await driftManager.getOpenPositions()
      const currentPosition = positions.find((p) => p.marketIndex === this.activePosition!.marketIndex)

      const holdTime = Date.now() - this.activePosition.openTime
      this.metrics.totalHoldTime += holdTime

      if (currentPosition) {
        const pnl = currentPosition.unrealizedPnl
        console.log(
          `[TradingController] Position PnL: ${pnl > 0 ? "+" : ""}$${pnl.toFixed(2)}`
        )
        if (pnl > 0) {
          this.metrics.winCount++
          this.metrics.totalWinPnl += pnl
        } else if (pnl < 0) {
          this.metrics.lossCount++
          this.metrics.totalLossPnl += Math.abs(pnl)
        }
      }

      const txSig = await driftManager.closePosition(this.activePosition.marketIndex, 100)

      console.log(`[TradingController] ✅ Position closed: ${txSig}`)
      const pnlDisplay =
        currentPosition?.unrealizedPnl ?? 0
      toast.success(
        `[Live] Closed ${this.activePosition.side.toUpperCase()} ${
          pnlDisplay >= 0 ? "+" : "-"
        }$${Math.abs(pnlDisplay).toFixed(2)} (${txSig.slice(0, 8)}...)`
      )

      // Clear active position
      this.activePosition = null

      // Update game state
      useGameState.setState({
        openPositionSize: 0,
        unrealizedPnl: 0,
      })
    } catch (error) {
      console.error("[TradingController] Failed to close position:", error)
      toast.error("Failed to close live position. Check console for details.")
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
   * Start polling Drift for account + PnL updates every second
   */
  private startPnlUpdates() {
    if (this.pnlUpdateInterval) return

    this.pnlUpdateInterval = setInterval(async () => {
      if (!this.config.enabled) return

      try {
        const driftManager = getDriftPositionManager()
        if (!driftManager.getIsInitialized()) {
          return
        }

        const summary = await driftManager.getPositionSummary()
        const setDriftSummary = useGameState.getState().setDriftSummary
        const activeSide: Stance =
          summary.totalPositionSizeUsd > 0.01 && summary.positions.length > 0
            ? (summary.positions[0].side === "long" ? "long" : "short")
            : "flat"

        setDriftSummary({
          collateralUsd: summary.totalCollateral,
          equityUsd: summary.totalEquity,
          unrealizedPnlUsd: summary.totalUnrealizedPnl,
          freeCollateralUsd: summary.freeCollateral,
          marginUsage: summary.marginUsage,
          openPositionSizeUsd: summary.totalPositionSizeUsd,
          positionSide: activeSide,
        })

        if (useGameState.getState().gameMode === "real") {
          useAccountState.getState().syncWithRealAccount(
            summary.totalCollateral,
            summary.totalEquity,
            summary.totalUnrealizedPnl
          )
        }

        if (this.activePosition && summary.positions.length === 0) {
          this.activePosition = null
          useGameState.setState({
            openPositionSize: 0,
            unrealizedPnl: 0,
          })
        }
      } catch (error) {
        console.error("[TradingController] Failed to refresh Drift summary:", error)
      }
    }, 1000)

    console.log("[TradingController] Started Drift account updates")
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
  getMetrics(): TradingMetricsSnapshot {
    const avgHoldTime =
      this.metrics.totalTrades > 0 ? this.metrics.totalHoldTime / this.metrics.totalTrades : 0
    const totalClosed = this.metrics.winCount + this.metrics.lossCount
    const winRate = totalClosed > 0 ? this.metrics.winCount / totalClosed : 0
    const avgWinSize =
      this.metrics.winCount > 0 ? this.metrics.totalWinPnl / this.metrics.winCount : 0
    const avgLossSize =
      this.metrics.lossCount > 0 ? this.metrics.totalLossPnl / this.metrics.lossCount : 0

    return {
      strategy: this.getStrategyPreset().name,
      totalTrades: this.metrics.totalTrades,
      filteredTrades: this.metrics.filteredTrades,
      totalVolume: this.metrics.totalVolume,
      totalFees: this.metrics.estimatedFees,
      avgHoldTime,
      winRate,
      avgWinSize,
      avgLossSize,
      feeSavings: this.metrics.feeSavings,
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
      totalHoldTime: 0,
      winCount: 0,
      lossCount: 0,
      totalWinPnl: 0,
      totalLossPnl: 0,
      feeSavings: 0,
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
    await this.ensureAllPositionsClosed("cleanup")

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
