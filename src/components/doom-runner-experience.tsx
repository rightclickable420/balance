"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useGameState, type Stance } from "@/lib/game/game-state"
import { useAccountState } from "@/lib/game/account-state"
import { GzdoomRunner, type DoomRunnerBridge } from "./gzdoom-runner"
import { computeMarketDirection, computeMarketConviction } from "@/lib/game/alignment"
import type { TradingStrategy } from "@/lib/trading/trading-controller"
import { createCandleSource } from "@/lib/data/candle-source-factory"
import { extractFeatures } from "@/lib/data/features"
import type { CandleSource, Candle } from "@/lib/types"

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))

export function DoomRunnerExperience() {
  const { latestFeatures, tradingStrategy } = useGameState()
  const hoverStance = useGameState((state) => state.hoverStance)
  const setHoverStance = useGameState((state) => state.setHoverStance)
  const autoAlign = useAccountState((state) => state.autoAlign)
  const equity = useAccountState((state) => state.equity)
  const balance = useAccountState((state) => state.balance)
  const peakEquity = useAccountState((state) => state.peakEquity)
  const lastPrice = useAccountState((state) => state.lastPrice)

  // Data source refs
  const dataSourceRef = useRef<CandleSource | null>(null)
  const candleHistoryRef = useRef<Candle[]>([])

  const hpPct = useMemo(() => {
    if (!Number.isFinite(equity) || equity <= 0) return 0
    if (!Number.isFinite(peakEquity) || peakEquity <= 0) return 1
    return clamp(equity / peakEquity, 0, 1)
  }, [equity, peakEquity])

  const laneTarget = useMemo(() => {
    switch (hoverStance) {
      case "long":
        return 1
      case "short":
        return -1
      default:
        return 0
    }
  }, [hoverStance])

  const bridgeRef = useRef<DoomRunnerBridge | null>(null)
  const autoModeRef = useRef(false)
  const lastAlignRef = useRef<Stance | null>(null)
  const lastLossRef = useRef<number | null>(null)
  const [engineReady, setEngineReady] = useState(false)
  const pendingCommandsRef = useRef<string[]>([])
  const lastMarketDirectionRef = useRef<number>(0)

  // Balance HUD streak tracking
  const streakBaselineRef = useRef<number>(equity) // Reset point for streak calculation
  const prevEquityRef = useRef<number>(equity)     // For detecting sudden losses

  const sendCommand = useCallback(
    (command: string) => {
      if (engineReady && bridgeRef.current?.isReady()) {
        bridgeRef.current.sendConsoleCommand(command)
      } else {
        pendingCommandsRef.current.push(command)
      }
    },
    [engineReady],
  )

  useEffect(() => {
    if (!engineReady) return
    if (!bridgeRef.current?.isReady()) return
    if (pendingCommandsRef.current.length === 0) return
    for (const cmd of pendingCommandsRef.current) {
      bridgeRef.current.sendConsoleCommand(cmd)
    }
    pendingCommandsRef.current = []
  }, [engineReady])

  useEffect(() => {
    if (engineReady) {
      lastAlignRef.current = null
      lastLossRef.current = null
    } else {
      autoModeRef.current = false
    }
  }, [engineReady])

  // Initialize data feed with polling mechanism
  useEffect(() => {
    console.log("[DoomRunner] Initializing data feed...")
    const dataSource = createCandleSource()
    dataSourceRef.current = dataSource

    const { setDataProvider, setLatestFeatures, addCandleToHistory } = useGameState.getState()
    const { seedPrice } = useAccountState.getState()

    setDataProvider(dataSource.getSource())
    console.log("[DoomRunner] Data source:", dataSource.getSource())

    // Poll data source every 1 second for new candles
    const pollInterval = setInterval(() => {
      try {
        const candle = dataSource.next()

        if (!candle || !Number.isFinite(candle.close)) {
          console.warn("[DoomRunner] Invalid candle received:", candle)
          return
        }

        // Update candle history
        candleHistoryRef.current = [...candleHistoryRef.current, candle].slice(-180) // Keep last 180 candles
        addCandleToHistory(candle)

        // Update price
        seedPrice(candle.close)

        // Extract and update features (need 10 candles for analysis)
        if (candleHistoryRef.current.length >= 10) {
          const features = extractFeatures(candleHistoryRef.current)
          setLatestFeatures(features)

          // Only update PnL once we have enough data for auto-align to make decisions
          // This prevents opening positions before market analysis is ready
          const { updateUnrealizedPnl } = useAccountState.getState()
          const currentStance = useGameState.getState().hoverStance
          updateUnrealizedPnl(candle.close, currentStance)

          console.log("[DoomRunner] Features updated:", {
            momentum: features.momentum.toFixed(3),
            conviction: features.breadth.toFixed(3),
            price: candle.close.toFixed(2),
            stance: currentStance,
          })
        }
      } catch (error) {
        console.error("[DoomRunner] Error polling candle data:", error)
      }
    }, 1000) // Poll every 1 second

    console.log("[DoomRunner] ✅ Data feed polling started (1s interval)")

    return () => {
      console.log("[DoomRunner] Cleaning up data feed...")
      clearInterval(pollInterval)
      dataSourceRef.current = null
    }
  }, []) // Run once on mount

  // Auto-align decision logic - updates stance based on market features and strategy
  useEffect(() => {
    if (!autoAlign || !latestFeatures) {
      // Manual mode or no data - keep current stance
      return
    }

    // Compute market signals
    const direction = computeMarketDirection(latestFeatures)
    const conviction = computeMarketConviction(latestFeatures)

    // Strategy-specific conviction thresholds
    const convictionThreshold = (() => {
      const strategy = tradingStrategy as TradingStrategy
      if (strategy === "manual") {
        return 0.5 // When auto-align is toggled on, treat manual like balanced auto trading
      }
      switch (strategy) {
        case "high_conviction":
          return 0.7 // Only trade on very high conviction
        case "balanced":
          return 0.5 // Default threshold
        case "aggressive":
          return 0.3 // Trade on lower conviction
        default:
          return 0.5
      }
    })()

    // Determine stance based on direction and conviction
    let newStance: Stance = "flat"

    if (conviction >= convictionThreshold) {
      // High conviction - take directional stance
      if (direction > 0.15) {
        newStance = "long"
      } else if (direction < -0.15) {
        newStance = "short"
      }
      // else: weak direction, stay flat
    }
    // else: low conviction, stay flat

    // Update stance if changed
    if (newStance !== hoverStance) {
      console.log(`[AutoAlign] ${hoverStance} → ${newStance} (direction: ${direction.toFixed(2)}, conviction: ${conviction.toFixed(2)}, threshold: ${convictionThreshold.toFixed(2)})`)
      setHoverStance(newStance)
    }
  }, [autoAlign, latestFeatures, tradingStrategy, hoverStance, setHoverStance])

  // Manual trading controls - map keys to stances when auto-align is disabled
  useEffect(() => {
    if (autoAlign || (tradingStrategy as TradingStrategy) !== "manual") {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return
      }

      let nextStance: Stance | null = null
      switch (event.key) {
        case "ArrowUp":
          nextStance = "long"
          break
        case "ArrowDown":
          nextStance = "short"
          break
        case " ":
        case "Spacebar":
          nextStance = "flat"
          break
        default:
          break
      }

      if (!nextStance || nextStance === hoverStance) {
        return
      }

      event.preventDefault()
      setHoverStance(nextStance)

      const { lastPrice: currentPrice, updateUnrealizedPnl } = useAccountState.getState()
      if (Number.isFinite(currentPrice ?? NaN)) {
        updateUnrealizedPnl(currentPrice as number, nextStance)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [autoAlign, hoverStance, setHoverStance, tradingStrategy])

  // Old console command approach - replaced by laneTarget prop
  // useEffect(() => {
  //   if (!engineReady) return
  //   if (autoAlign === autoModeRef.current) return
  //   sendCommand("pukename MR_ToggleAuto")
  //   autoModeRef.current = autoAlign
  // }, [autoAlign, engineReady, sendCommand])

  // useEffect(() => {
  //   if (!engineReady) return
  //   const stance = hoverStance ?? "flat"
  //   if (lastAlignRef.current === stance) return
  //   const alignCode = STANCE_TO_ALIGN[stance]
  //   sendCommand(`pukename MR_SetAlign ${alignCode}`)
  //   lastAlignRef.current = stance
  // }, [engineReady, hoverStance, sendCommand])

  const lossPercent = useMemo(() => {
    return Math.round(clamp(1 - hpPct, 0, 1) * 100)
  }, [hpPct])

  useEffect(() => {
    if (!engineReady) return
    if (lastLossRef.current === lossPercent) return
    sendCommand(`pukename MR_SetLoss ${lossPercent}`)
    lastLossRef.current = lossPercent
  }, [engineReady, lossPercent, sendCommand])

  // Balance HUD update effect - calculate streak and send to Doom engine
  useEffect(() => {
    if (!bridgeRef.current?.isReady()) return

    // Calculate streak gain percentage from baseline
    const baseline = streakBaselineRef.current
    const streakGainPct = baseline > 0 ? Math.round(((equity - baseline) / baseline) * 100) : 0

    // Detect sudden loss (>3% equity drop since last update)
    const prevEquity = prevEquityRef.current
    const equityDropPct = prevEquity > 0 ? ((prevEquity - equity) / prevEquity) * 100 : 0
    const suddenLoss = equityDropPct > 3

    // Auto-reset baseline at 20% gain to start new streak
    if (streakGainPct >= 20) {
      streakBaselineRef.current = equity
    }

    // Update previous equity for next sudden loss check
    prevEquityRef.current = equity

    // Convert market indicators from -1..1 or 0..1 to 0..100 range for display
    const momentum = latestFeatures ? Math.round(((latestFeatures.momentum + 1) / 2) * 100) : 50 // -1..1 → 0..100
    const breadth = latestFeatures ? Math.round(((latestFeatures.breadth + 1) / 2) * 100) : 50 // -1..1 → 0..100
    const volatility = latestFeatures ? Math.round(latestFeatures.volatility * 100) : 50 // 0..1 → 0..100
    const volume = latestFeatures ? Math.round(latestFeatures.volume * 100) : 50 // 0..1 → 0..100

    // Send Balance HUD data to iframe
    const iframe = document.querySelector('iframe[title="GZDoom Runner"]') as HTMLIFrameElement
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage(
        {
          type: "balance-hud-update",
          payload: {
            equity: Math.round(equity),
            balance: Math.round(balance * 100), // Convert to cents for display with decimals
            solPrice: Math.round((lastPrice ?? 0) * 100), // Convert to cents for display with decimals
            streakGainPct: Math.max(0, streakGainPct), // Clamp to 0+ for display
            suddenLoss,
          },
        },
        window.location.origin,
      )
      // Send market indicators separately
      iframe.contentWindow.postMessage(
        {
          type: "market-indicators-update",
          payload: {
            momentum,
            breadth,
            volatility,
            volume,
          },
        },
        window.location.origin,
      )

      // Spawn enemies when market direction changes significantly
      // Convert momentum from 0-100 back to -1..1 for direction calculation
      const currentMomentum = (momentum - 50) / 50 // 0..100 → -1..1

      // Determine market direction: -1 (bearish), 0 (neutral), 1 (bullish)
      const marketDirection = currentMomentum > 0.2 ? 1 : currentMomentum < -0.2 ? -1 : 0

      // Check if direction changed
      if (marketDirection !== lastMarketDirectionRef.current && marketDirection !== 0) {
        lastMarketDirectionRef.current = marketDirection

        // Calculate conviction level (0-4) based on momentum strength for enemy type
        // 0: weakest (Zombieman), 4: strongest (Baron of Hell)
        const convictionLevel = Math.min(4, Math.floor(Math.abs(currentMomentum) * 5))

        // Determine spawn lane: -1 (short/left), 1 (long/right)
        const spawnLane = marketDirection

        // Spawn single enemy in the target lane
        iframe.contentWindow.postMessage(
          {
            type: "enemy-spawn",
            payload: {
              lane: spawnLane,
              enemyType: convictionLevel, // 0-4 for different enemy types
            },
          },
          window.location.origin,
        )
      }
    }
  }, [equity, balance, lastPrice, latestFeatures, engineReady])

  return (
    <div className="relative h-full w-full">
      <GzdoomRunner ref={bridgeRef} onReadyChange={setEngineReady} laneTarget={laneTarget} fireIntent={false} />
    </div>
  )
}
