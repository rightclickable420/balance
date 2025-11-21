"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useGameState, type Stance } from "@/lib/game/game-state"
import { useAccountState } from "@/lib/game/account-state"
import { GzdoomRunner, type DoomRunnerBridge } from "./gzdoom-runner"
import { computeMarketConviction } from "@/lib/game/alignment"
import { getTradingController, type TradingStrategy } from "@/lib/trading/trading-controller"
import { createCandleSource } from "@/lib/data/candle-source-factory"
import { extractFeatures } from "@/lib/data/features"
import type { CandleSource, Candle } from "@/lib/types"
import { analyzeMultiTimeframe, signalToStance, logMultiTimeframeAnalysis } from "@/lib/trading/multi-timeframe-analysis"
import { ChartPanel } from "./dashboard/chart-panel"

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))
const AGGREGATION_WINDOW = 1 // react every second while keeping historical EMA context
const MIN_AGGREGATED_CANDLES_FOR_FEATURES = 10 // need ~10s of history before trading

type RollingWindowDefinition = {
  name: string
  length: number
  weight: number
}

type SyntheticCandle = {
  open: number
  close: number
  high: number
  low: number
}

type RollingWindowStat = {
  definition: RollingWindowDefinition
  readiness: number
  effectiveWeight: number
  ready: boolean
  candle: SyntheticCandle | null
  bias: number
  strength: number
  score: number
}

type MultiTimeframeSignal = {
  timestamp: number
  score: number
  conviction: number
  readyWeight: number
  windowStats: RollingWindowStat[]
  stanceSuggestion: Stance
}

const ROLLING_WINDOWS: RollingWindowDefinition[] = [
  { name: "5s", length: 5, weight: 0.15 },
  { name: "30s", length: 30, weight: 0.2 },
  { name: "60s", length: 60, weight: 0.25 },
  { name: "300s", length: 300, weight: 0.4 },
]

const TOTAL_WINDOW_WEIGHT = ROLLING_WINDOWS.reduce((sum, cfg) => sum + cfg.weight, 0)
const MIN_EFFECTIVE_WEIGHT_FOR_TRADING = 0.3
const LANE_SIGNAL_THRESHOLD_BY_STRATEGY: Record<TradingStrategy, number> = {
  aggressive: 0.3,
  balanced: 0.45,
  high_conviction: 0.6,
  manual: 0.5,
}
const LANE_CONFIRMATION_MS = 3000
const LANE_COOLDOWN_MS = 5000
const FLAT_CONFIRMATION_MS = 2000

const SIGN = (value: number) => (value > 0 ? 1 : value < 0 ? -1 : 0)

function buildSyntheticCandle(candles: Candle[]): SyntheticCandle {
  if (candles.length === 0) {
    return { open: 0, close: 0, high: 0, low: 0 }
  }
  let high = candles[0].high
  let low = candles[0].low
  for (const candle of candles) {
    if (candle.high > high) high = candle.high
    if (candle.low < low) low = candle.low
  }
  return {
    open: candles[0].open,
    close: candles[candles.length - 1].close,
    high,
    low,
  }
}

function computeBiasFromCandle(candle: SyntheticCandle) {
  const delta = candle.close - candle.open
  const range = Math.max(candle.high - candle.low, 1e-6)
  const bias = SIGN(delta)
  const strength = clamp(Math.abs(delta) / range, 0, 1)
  return { bias, strength }
}

function computeRollingWindows(history: Candle[]): RollingWindowStat[] {
  return ROLLING_WINDOWS.map((definition) => {
    const readiness = Math.min(history.length / definition.length, 1)
    const sliceStart = Math.max(0, history.length - definition.length)
    const windowCandles = history.slice(sliceStart)
    const candle = windowCandles.length > 0 ? buildSyntheticCandle(windowCandles) : null
    const { bias, strength } = candle ? computeBiasFromCandle(candle) : { bias: 0, strength: 0 }
    const score = bias * strength
    return {
      definition,
      readiness,
      effectiveWeight: definition.weight * readiness,
      ready: readiness >= 1,
      candle,
      bias,
      strength,
      score,
    }
  })
}

function buildMultiTimeframeSignal(history: Candle[]): MultiTimeframeSignal {
  const windowStats = computeRollingWindows(history)
  const readyWeight = windowStats.reduce((sum, stat) => sum + stat.effectiveWeight, 0)
  const weightedScore =
    readyWeight > 0
      ? windowStats.reduce((sum, stat) => sum + stat.effectiveWeight * stat.score, 0) / readyWeight
      : 0
  const stanceSuggestion: Stance =
    weightedScore > 0.05 ? "long" : weightedScore < -0.05 ? "short" : "flat"
  return {
    timestamp: Date.now(),
    score: weightedScore,
    conviction: Math.abs(weightedScore),
    readyWeight,
    windowStats,
    stanceSuggestion,
  }
}

const aggregateCandles = (candles: Candle[]): Candle => {
  if (candles.length === 0) {
    throw new Error("Cannot aggregate empty candle buffer")
  }

  const first = candles[0]
  const last = candles[candles.length - 1]

  let high = first.high
  let low = first.low
  let volume = 0

  for (const candle of candles) {
    high = Math.max(high, candle.high)
    low = Math.min(low, candle.low)
    volume += candle.volume
  }

  return {
    timestamp: last.timestamp,
    open: first.open,
    high,
    low,
    close: last.close,
    volume,
  }
}

export function DoomRunnerExperience() {
  const { latestFeatures, tradingStrategy } = useGameState()
  const hoverStance = useGameState((state) => state.hoverStance)
  const setHoverStance = useGameState((state) => state.setHoverStance)
  const gameMode = useGameState((state) => state.gameMode)
  const setupPhase = useGameState((state) => state.setupPhase)
  const unrealizedPnl = useGameState((state) => state.unrealizedPnl)
  const driftPositionSide = useGameState((state) => state.driftPositionSide)
  const startingRealBalance = useGameState((state) => state.startingRealBalance)
  const mockStartingBalance = useGameState((state) => state.mockBalance)
  const autoAlign = useAccountState((state) => state.autoAlign)
  const equity = useAccountState((state) => state.equity)
  const balance = useAccountState((state) => state.balance)
  const peakEquity = useAccountState((state) => state.peakEquity)
  const lastPrice = useAccountState((state) => state.lastPrice)

  // Data source refs
  const dataSourceRef = useRef<CandleSource | null>(null)
  const candleHistoryRef = useRef<Candle[]>([])
  const aggregatedHistoryRef = useRef<Candle[]>([])
  const aggregationBufferRef = useRef<Candle[]>([])
  const lastOneSecondCandleRef = useRef<Candle | null>(null)
  const analysisReadyRef = useRef(false)
  const [multiTimeframeSignal, setMultiTimeframeSignal] = useState<MultiTimeframeSignal | null>(null)
  const pendingLaneRef = useRef<{ stance: Stance; startedAt: number } | null>(null)
  const lastLaneSwitchRef = useRef<number>(0)
  const requestedStanceRef = useRef<Stance>(hoverStance)
  const lastEnemySpawnDirectionRef = useRef<number | null>(null)
  const equityBaselineRef = useRef<number>(0)

  const hpPct = useMemo(() => {
    if (!Number.isFinite(equity) || equity <= 0) return 0
    if (!Number.isFinite(peakEquity) || peakEquity <= 0) return 1
    return clamp(equity / peakEquity, 0, 1)
  }, [equity, peakEquity])

  const laneTarget = useMemo(() => {
    switch (driftPositionSide) {
      case "long":
        return 1
      case "short":
        return -1
      default:
        return 0
    }
  }, [driftPositionSide])

  const bridgeRef = useRef<DoomRunnerBridge | null>(null)
  const autoModeRef = useRef(false)
  const lastAlignRef = useRef<Stance | null>(null)
  const lastLossRef = useRef<number | null>(null)
  const [engineReady, setEngineReady] = useState(false)
  const pendingCommandsRef = useRef<string[]>([])
  const tradingController = useMemo(() => getTradingController(), [])

  // Chart visibility state
  const [chartVisible, setChartVisible] = useState(true)

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

  useEffect(() => {
    requestedStanceRef.current = hoverStance
  }, [hoverStance])

  useEffect(() => {
    if (!autoAlign) {
      pendingLaneRef.current = null
    }
  }, [autoAlign])

  useEffect(() => {
    equityBaselineRef.current = 0
  }, [gameMode, setupPhase])

  // Initialize data feed with polling mechanism
  useEffect(() => {
    console.log(`[DoomRunner] Initializing data feed (mode: ${gameMode})`)
    const dataSource = createCandleSource()
    dataSourceRef.current = dataSource
    candleHistoryRef.current = []
    aggregatedHistoryRef.current = []
    aggregationBufferRef.current = []
    analysisReadyRef.current = false

    const { setDataProvider, setLatestFeatures, addCandleToHistory } = useGameState.getState()
    const { seedPrice } = useAccountState.getState()

    const providerLabel = dataSource.getSource()
    setDataProvider(providerLabel)
    console.log("[DoomRunner] Data source:", providerLabel)

    // Fetch historical data to pre-populate candle history
    // This allows trading signals to work immediately instead of waiting 5-15 minutes
    // DISABLED: Pyth historical API has CORS restrictions blocking browser requests
    // MTF will wait 15 minutes for live data to accumulate (reduced from 60 min)
    const ENABLE_HISTORICAL_DATA = false
    ;(async () => {
      if (!ENABLE_HISTORICAL_DATA) {
        console.log("[DoomRunner] Historical data disabled - will build from live data")
        return
      }
      try {
        console.log("[DoomRunner] Fetching 15 min historical data (reduced from 1hr to avoid CORS)...")
        const { initializeHistoricalData } = await import("@/lib/data/historical-candles")

        // Fetch 15 minutes of 1-second candles (900 candles = ~1800 requests)
        // This is enough for 1m, 5m, 15m timeframes to work
        // 1h and 4h timeframes will need to wait for live data accumulation
        const historicalCandles = await initializeHistoricalData({
          durationSeconds: 900, // 15 minutes (reduced from 3600)
          candleIntervalSeconds: 1,
        })

        if (historicalCandles.length > 0) {
          // Pre-populate candle history
          candleHistoryRef.current = historicalCandles.slice(-360) // Keep last 6 minutes

          // Seed price with most recent historical price
          const latestHistorical = historicalCandles[historicalCandles.length - 1]
          seedPrice(latestHistorical.close)

          // Pre-populate aggregated history for features
          // Aggregate historical 1s candles into AGGREGATION_WINDOW candles
          const aggregated: typeof aggregatedHistoryRef.current = []
          for (let i = 0; i < historicalCandles.length; i += AGGREGATION_WINDOW) {
            const chunk = historicalCandles.slice(i, i + AGGREGATION_WINDOW)
            if (chunk.length === AGGREGATION_WINDOW) {
              aggregated.push(aggregateCandles(chunk))
            }
          }
          aggregatedHistoryRef.current = aggregated.slice(-120) // Keep last 2 minutes

          // Compute initial features from historical data
          if (aggregatedHistoryRef.current.length >= MIN_AGGREGATED_CANDLES_FOR_FEATURES) {
            const features = extractFeatures(aggregatedHistoryRef.current)
            setLatestFeatures(features)
            analysisReadyRef.current = true
            console.log("[DoomRunner] ✅ Analysis ready immediately with historical data")
          }

          console.log(
            `[DoomRunner] ✅ Pre-populated ${candleHistoryRef.current.length} historical candles ` +
            `(${aggregatedHistoryRef.current.length} aggregated)`
          )
        }
      } catch (error) {
        console.warn("[DoomRunner] Failed to fetch historical data, will build from live data:", error)
      }
    })()

    // Poll data source every 1 second for new candles
    const pollInterval = setInterval(() => {
      try {
        const candle = dataSource.next()

        if (!candle || !Number.isFinite(candle.close)) {
          console.warn("[DoomRunner] Invalid candle received:", candle)
          return
        }

        lastOneSecondCandleRef.current = candle

        // Update candle history
        candleHistoryRef.current = [...candleHistoryRef.current, candle].slice(-360) // Keep last 360 1s candles
        addCandleToHistory(candle)

        // Update price
        seedPrice(candle.close)

        // Build higher timeframe (5s) candles before computing features
        aggregationBufferRef.current = [...aggregationBufferRef.current, candle]
        const currentStance = useGameState.getState().hoverStance

        let emittedAggregated = false
        if (aggregationBufferRef.current.length >= AGGREGATION_WINDOW) {
          const aggregatedCandle = aggregateCandles(aggregationBufferRef.current)
          aggregatedHistoryRef.current = [...aggregatedHistoryRef.current, aggregatedCandle].slice(-120)
          aggregationBufferRef.current = []
          emittedAggregated = true
          console.log(
            "[DoomRunner] Aggregated candle",
            JSON.stringify({
              open: aggregatedCandle.open.toFixed(2),
              close: aggregatedCandle.close.toFixed(2),
              high: aggregatedCandle.high.toFixed(2),
              low: aggregatedCandle.low.toFixed(2),
              volume: aggregatedCandle.volume.toFixed(2),
            }),
          )
        }

        if (emittedAggregated && aggregatedHistoryRef.current.length >= MIN_AGGREGATED_CANDLES_FOR_FEATURES) {
          const features = extractFeatures(aggregatedHistoryRef.current)
          setLatestFeatures(features)
          analysisReadyRef.current = true

          console.log("[DoomRunner] Features updated:", {
            momentum: features.momentum.toFixed(3),
            conviction: features.breadth.toFixed(3),
            price: candle.close.toFixed(2),
            stance: currentStance,
          })
        }

        if (analysisReadyRef.current) {
          const { updateUnrealizedPnl } = useAccountState.getState()
          updateUnrealizedPnl(candle.close, currentStance)
        }

        const nextSignal = buildMultiTimeframeSignal(candleHistoryRef.current)

        // Run MTF technical analysis if we have enough historical data
        const candleCount = candleHistoryRef.current.length
        const analysisReady = analysisReadyRef.current

        // Debug: Log candle count periodically
        if (Date.now() % 10000 < 1000) {
          console.log(`[MTF-Debug] Candles: ${candleCount}, Analysis Ready: ${analysisReady}, Need: 900+ (reduced from 3600)`)
        }

        // Reduced from 3600 to 900 (15 minutes) since we're only fetching 15 min of historical data
        // MTF will work with short/medium term (1m, 5m, 15m) but long-term (1h, 4h, 1d) will be limited
        if (candleCount >= 900 && analysisReady) {
          try {
            const mtfSignal = analyzeMultiTimeframe(candleHistoryRef.current, {
              requireTrendAlignment: true,
              minConviction: 0.6
            })

            const mtfStance = signalToStance(mtfSignal)
            const rwStance = nextSignal.stanceSuggestion

            // Both systems must agree for high-conviction trades
            if (rwStance === mtfStance && mtfSignal.conviction >= 0.6) {
              // Systems agree - use higher conviction
              const combinedConviction = Math.max(nextSignal.conviction, mtfSignal.conviction)
              nextSignal.conviction = combinedConviction
              nextSignal.stanceSuggestion = mtfStance

              // Log MTF analysis every 60 seconds for monitoring
              if (Date.now() % 60000 < 1000) {
                console.log(`[MTF] ✅ AGREEMENT: Both systems want ${mtfStance.toUpperCase()} (conviction: ${(mtfSignal.conviction * 100).toFixed(1)}%)`)
                console.log(`[MTF] Trends: ${mtfSignal.trend.short} (short) | ${mtfSignal.trend.medium} (medium) | ${mtfSignal.trend.long} (long) | Aligned: ${mtfSignal.trend.aligned}`)
                console.log(`[MTF] Near support: ${mtfSignal.levels.nearSupport.near}, Near resistance: ${mtfSignal.levels.nearResistance.near}`)
              }
            } else {
              // Systems disagree - stay flat for safety
              console.log(`[MTF] ⚠️ DISAGREEMENT: RW wants ${rwStance} (${(nextSignal.conviction * 100).toFixed(1)}%), MTF wants ${mtfStance} (${(mtfSignal.conviction * 100).toFixed(1)}%) → FLAT`)
              nextSignal.stanceSuggestion = "flat"
              nextSignal.conviction = 0.3
            }
          } catch (error) {
            console.warn("[MTF] Analysis failed:", error)
            // Fall back to rolling window signal
          }
        }

        setMultiTimeframeSignal(nextSignal)
      } catch (error) {
        console.error("[DoomRunner] Error polling candle data:", error)
      }
    }, 1000) // Poll every 1 second

    console.log("[DoomRunner] ✅ Data feed polling started (1s interval)")

    return () => {
      console.log("[DoomRunner] Cleaning up data feed...")
      clearInterval(pollInterval)
      dataSourceRef.current = null
      candleHistoryRef.current = []
      aggregatedHistoryRef.current = []
      aggregationBufferRef.current = []
      analysisReadyRef.current = false
      lastEnemySpawnDirectionRef.current = null
      lastOneSecondCandleRef.current = null
    }
  }, [gameMode])

  // Auto-align decision logic - driven by multi-timeframe conviction
  useEffect(() => {
    if (!autoAlign || !multiTimeframeSignal) {
      return
    }

    const strategy = tradingStrategy as TradingStrategy
    const threshold =
      LANE_SIGNAL_THRESHOLD_BY_STRATEGY[strategy] ?? LANE_SIGNAL_THRESHOLD_BY_STRATEGY.manual
    const allowTrading = multiTimeframeSignal.readyWeight >= MIN_EFFECTIVE_WEIGHT_FOR_TRADING

    let desired: Stance = "flat"
    if (allowTrading && multiTimeframeSignal.conviction >= threshold) {
      desired = multiTimeframeSignal.score > 0 ? "long" : "short"
    }

    if (!allowTrading) {
      desired = "flat"
    }

    if (desired === requestedStanceRef.current) {
      pendingLaneRef.current = null
      return
    }

    const now = multiTimeframeSignal.timestamp
    if (!pendingLaneRef.current || pendingLaneRef.current.stance !== desired) {
      pendingLaneRef.current = { stance: desired, startedAt: now }
    }

    const minDuration = desired === "flat" ? FLAT_CONFIRMATION_MS : LANE_CONFIRMATION_MS
    if (
      now - pendingLaneRef.current.startedAt >= minDuration &&
      now - lastLaneSwitchRef.current >= LANE_COOLDOWN_MS
    ) {
      console.log(
        `[MultiTF] ${requestedStanceRef.current} → ${desired} (conviction=${multiTimeframeSignal.conviction.toFixed(
          2,
        )}, readyWeight=${multiTimeframeSignal.readyWeight.toFixed(2)})`,
      )
      setHoverStance(desired)
      requestedStanceRef.current = desired
      lastLaneSwitchRef.current = now
      pendingLaneRef.current = null
    }
  }, [autoAlign, multiTimeframeSignal, tradingStrategy, setHoverStance])

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

  // Initialize equity baseline once when starting balance is available
  useEffect(() => {
    if (equityBaselineRef.current > 0) return // Already initialized

    if (gameMode === "real" && startingRealBalance > 0) {
      equityBaselineRef.current = startingRealBalance
      streakBaselineRef.current = startingRealBalance
      console.log(`[DoomRunner] Equity baseline initialized: $${startingRealBalance.toFixed(2)} (real)`)
    } else if (gameMode === "mock" && mockStartingBalance > 0) {
      equityBaselineRef.current = mockStartingBalance
      streakBaselineRef.current = mockStartingBalance
      console.log(`[DoomRunner] Equity baseline initialized: $${mockStartingBalance.toFixed(2)} (mock)`)
    }
  }, [gameMode, startingRealBalance, mockStartingBalance])

  // Balance HUD update effect - calculate equity change and send to Doom engine
  useEffect(() => {
    if (!bridgeRef.current?.isReady()) return

    // Get baseline (must be initialized before we can calculate percentage)
    const equityBaseline =
      gameMode === "real"
        ? (startingRealBalance > 0 ? startingRealBalance : equityBaselineRef.current)
        : (mockStartingBalance > 0 ? mockStartingBalance : equityBaselineRef.current)

    // Skip update if baseline not available yet
    if (equityBaseline <= 0) {
      console.warn('[DoomRunner] Skipping HUD update - equity baseline not initialized')
      return
    }

    // Calculate equity change as PERCENTAGE CHANGE from starting balance
    // Example: $100 start → $105 now = +5% (not 105%)
    const equityChangePct = ((equity - equityBaseline) / equityBaseline) * 100

    // Clamp to reasonable range: -99% to +899% (allow for big wins, prevent display overflow)
    const equityHudValue = Math.round(clamp(equityChangePct, -99, 899))

    // Calculate streak gain from rolling baseline
    const streakBaseline = streakBaselineRef.current > 0 ? streakBaselineRef.current : equityBaseline
    const streakGainPct = Math.round(((equity - streakBaseline) / streakBaseline) * 100)

    // Detect sudden loss (>3% equity drop since last update)
    const prevEquity = prevEquityRef.current > 0 ? prevEquityRef.current : equity
    const equityDropPct = ((prevEquity - equity) / prevEquity) * 100
    const suddenLoss = equityDropPct > 3

    // Auto-reset streak baseline at 20% gain to start new streak
    if (streakGainPct >= 20) {
      console.log(`[DoomRunner] Streak reset at +${streakGainPct}% (equity: $${equity.toFixed(2)}, baseline: $${equityBaseline.toFixed(2)})`)
      streakBaselineRef.current = equity
    }

    // Update previous equity for next sudden loss check
    prevEquityRef.current = equity

    // Log for debugging
    if (equityChangePct !== 0) {
      console.log(`[DoomRunner] Equity: $${equity.toFixed(2)} / $${equityBaseline.toFixed(2)} = ${equityChangePct >= 0 ? '+' : ''}${equityChangePct.toFixed(2)}% → HUD: ${equityHudValue}`)
    }

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
            equity: equityHudValue,
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

      const recentDirection = lastOneSecondCandleRef.current
        ? SIGN(lastOneSecondCandleRef.current.close - lastOneSecondCandleRef.current.open)
        : 0
      if (recentDirection !== 0) {
        if (lastEnemySpawnDirectionRef.current === null) {
          lastEnemySpawnDirectionRef.current = recentDirection
        } else if (recentDirection !== lastEnemySpawnDirectionRef.current) {
          const signalConviction = multiTimeframeSignal?.conviction ?? 0
          const readyRatio =
            multiTimeframeSignal && TOTAL_WINDOW_WEIGHT > 0
              ? multiTimeframeSignal.readyWeight / TOTAL_WINDOW_WEIGHT
              : 0
          const unlockedTier = Math.min(4, Math.floor(readyRatio * 4))
          const convictionTier = Math.min(4, Math.floor(signalConviction * 5))
          const enemyType = Math.max(unlockedTier, convictionTier)

          iframe.contentWindow.postMessage(
            {
              type: "enemy-spawn",
              payload: {
                lane: recentDirection,
                enemyType,
              },
            },
            window.location.origin,
          )

          lastEnemySpawnDirectionRef.current = recentDirection
        }
      }
    }
  }, [
    equity,
    balance,
    lastPrice,
    latestFeatures,
    engineReady,
    gameMode,
    multiTimeframeSignal,
    startingRealBalance,
    mockStartingBalance,
  ])

  useEffect(() => {
    if (gameMode !== "real") return
    if (setupPhase !== "playing") return
    if (!latestFeatures) return
    if (!tradingController.isEnabled()) return
    if (!Number.isFinite(lastPrice ?? NaN)) return

    // Use MTF conviction if available, otherwise fall back to rolling window conviction
    const rwConviction = computeMarketConviction(latestFeatures)
    const mtfConviction = multiTimeframeSignal?.conviction ?? rwConviction
    const conviction = multiTimeframeSignal ? mtfConviction : rwConviction

    console.log(`[DoomRunner] Conviction: MTF=${mtfConviction.toFixed(2)}, RW=${rwConviction.toFixed(2)}, Using=${conviction.toFixed(2)}`)

    tradingController
      .onStanceChange(hoverStance, lastPrice as number, conviction, unrealizedPnl)
      .catch((error) => {
        console.error("[DoomRunner] Failed to sync stance with trading controller:", error)
      })
  }, [
    gameMode,
    hoverStance,
    latestFeatures,
    lastPrice,
    setupPhase,
    tradingController,
    unrealizedPnl,
    multiTimeframeSignal,
  ])

  const toggleChartVisibility = useCallback(() => {
    setChartVisible((prev) => !prev)
  }, [])

  return (
    <div className="relative h-full w-full">
      <GzdoomRunner ref={bridgeRef} onReadyChange={setEngineReady} laneTarget={laneTarget} fireIntent={false} />
      <ChartPanel visible={chartVisible} onToggleVisibility={toggleChartVisibility} />
    </div>
  )
}
