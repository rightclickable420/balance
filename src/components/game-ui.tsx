"use client"

import { useEffect, useState } from "react"
import { useGameState, type GameMode, type Stance } from "@/lib/game/game-state"
import { useAccountState } from "@/lib/game/account-state"
import type { Features } from "@/lib/data/features"
import { WalletConnectButton } from "./wallet-connect-button"
import { getTradingController } from "@/lib/trading/trading-controller"

const stanceLabels: Record<Stance, string> = {
  long: "Long",
  short: "Short",
  flat: "Flat",
}

const stanceAccent: Record<Stance, string> = {
  long: "text-emerald-300",
  short: "text-sky-300",
  flat: "text-amber-300",
}

const phaseAccent: Record<"calm" | "building" | "critical", string> = {
  calm: "text-emerald-300",
  building: "text-amber-300",
  critical: "text-rose-300",
}

const phaseBar: Record<"calm" | "building" | "critical", string> = {
  calm: "bg-emerald-400/70",
  building: "bg-amber-300/70",
  critical: "bg-rose-400/70",
}

const phaseLabels: Record<"calm" | "building" | "critical", string> = {
  calm: "Calm",
  building: "Building",
  critical: "Critical",
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

const signedColor = (value: number) => {
  const v = clamp01((value + 1) / 2)
  const hue = 200 - v * 180
  const saturation = 60
  const lightness = 52 + (1 - Math.abs(value)) * 12
  return `hsl(${hue}deg ${saturation}% ${lightness}%)`
}

const magnitudeColor = (value: number) => {
  const v = clamp01(value)
  const hue = 45 - v * 25
  const saturation = 70
  const lightness = 60 - v * 25
  return `hsl(${hue}deg ${saturation}% ${lightness}%)`
}

const featureDescriptors: Array<{ key: keyof Features; label: string; variant: "signed" | "magnitude" } > = [
  { key: "momentum", label: "Mom", variant: "signed" },
  { key: "orderImbalance", label: "Order", variant: "signed" },
  { key: "breadth", label: "Breadth", variant: "signed" },
  { key: "volatility", label: "Vol", variant: "magnitude" },
  { key: "volume", label: "Volu", variant: "magnitude" },
  { key: "regime", label: "Reg", variant: "magnitude" },
]

interface GameUIProps {
  isMobile?: boolean
}

export function GameUI({ isMobile = false }: GameUIProps = {}) {
  // IMPORTANT: All hooks must be called BEFORE any conditional returns
  const {
    setupPhase,
    experienceMode,
    stonesPlaced,
    canDecide,
    phase,
    hoverStance,
    latestFeatures,
    decisionProgress,
    dataProvider,
    energyPhase,
    energyBudget,
    stabilizerStrength,
    disturberStrength,
    alignmentScore,
    alignmentVelocity,
    openPositionSize,
    unrealizedPnl,
    realizedPnl,
  } = useGameState()

  // Additional state selectors
  const currentCandle = useGameState((state) => state.currentCandle)
  const gameMode = useGameState((state) => state.gameMode)
  const sessionWalletBalance = useGameState((state) => state.sessionWalletBalance)
  const startingRealBalance = useGameState((state) => state.startingRealBalance)
  const mockBalance = useGameState((state) => state.mockBalance)
  const tradingLeverage = useGameState((state) => state.tradingLeverage)
  const tradingStrategy = useGameState((state) => state.tradingStrategy)

  const mockAccountBalance = useAccountState((state) => state.balance)
  const mockEquity = useAccountState((state) => state.equity)
  const leverage = useAccountState((state) => state.leverage)
  const setLeverage = useAccountState((state) => state.setLeverage)
  const autoAlign = useAccountState((state) => state.autoAlign)
  const setAutoAlign = useAccountState((state) => state.setAutoAlign)
  const isLiquidated = useAccountState((state) => state.isLiquidated)

  const [realTradingEnabled, setRealTradingEnabled] = useState(false)
  const [tradingMetrics, setTradingMetrics] = useState<ReturnType<typeof tradingController.getMetrics> | null>(null)

  const tradingController = getTradingController()

  // Calculate derived values (before early return)
  const balance = gameMode === "real" ? sessionWalletBalance : mockAccountBalance
  const equity = gameMode === "real" ? sessionWalletBalance + unrealizedPnl : mockEquity
  const startingBalance = gameMode === "real" ? startingRealBalance : mockBalance
  const totalPnl = balance - startingBalance

  // Auto-enable real trading when in real mode
  useEffect(() => {
    if (setupPhase !== "playing") return // Skip effects during setup
    if (gameMode === "real" && !realTradingEnabled) {
      tradingController.enable()
      setRealTradingEnabled(true)
      console.log("[GameUI] Real trading auto-enabled")
    } else if (gameMode === "mock" && realTradingEnabled) {
      tradingController.disable()
      setRealTradingEnabled(false)
      console.log("[GameUI] Real trading auto-disabled (mock mode)")
    }
  }, [gameMode, realTradingEnabled, tradingController, setupPhase])

  // Update trading metrics every second when real trading is enabled
  useEffect(() => {
    if (setupPhase !== "playing") return // Skip effects during setup
    if (!realTradingEnabled) {
      setTradingMetrics(null)
      return
    }

    const updateMetrics = () => {
      setTradingMetrics(tradingController.getMetrics())
    }

    updateMetrics() // Initial update
    const interval = setInterval(updateMetrics, 1000)

    return () => clearInterval(interval)
  }, [realTradingEnabled, tradingController, setupPhase])

  // Test if basic JavaScript works (only on client side)
  useEffect(() => {
    if (setupPhase !== "playing") return // Skip effects during setup
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      try {
        document.title = `Doom Runner - Stones: ${stonesPlaced}`
        console.log(`[GameUI] Title set to: Doom Runner - Stones: ${stonesPlaced}`)
      } catch (error) {
        console.error("[GameUI] Failed to set title:", error)
      }
    }
  }, [stonesPlaced, setupPhase])

  // Early return AFTER all hooks
  if (setupPhase !== "playing") {
    return null
  }

  console.log(
    `[GameUI] render - stones: ${stonesPlaced}, phase: ${phase}, canDecide: ${canDecide}, stance: ${hoverStance}, energyPhase: ${energyPhase}`,
  )

  const handleToggleRealTrading = () => {
    if (realTradingEnabled) {
      tradingController.disable()
      setRealTradingEnabled(false)
    } else {
      tradingController.enable()
      setRealTradingEnabled(true)
    }
  }

  const progressWidth = clamp01(decisionProgress)
  const providerDisplay = (() => {
    const normalized = dataProvider?.toLowerCase() ?? "mock"
    if (normalized === "hyperliquid") return "Hyperliquid"
    if (normalized.startsWith("polygon")) return "Polygon"
    if (normalized === "realtime") return "Real-Time SOL"
    if (normalized === "default") return "Live"
    return "Mock Data"
  })()
  const dropLabel =
    hoverStance === "flat"
      ? "Flat stance skips this stone"
      : canDecide
        ? "Auto drop armed"
        : "Dropping"
  const dropTone =
    hoverStance === "flat"
      ? "text-amber-300"
      : canDecide
        ? "text-accent"
        : "text-muted-foreground"
  const stabilityWidth = clamp01(energyBudget)
  const alignmentTone = alignmentScore >= 0 ? "text-emerald-300" : "text-rose-300"
  const alignmentLabel = alignmentScore >= 0 ? "Favorable" : "Against"

  if (experienceMode === "doomrunner") {
    return (
      <DoomRunnerHUD
        isMobile={isMobile}
        balance={balance}
        equity={equity}
        hoverStance={hoverStance}
        providerDisplay={providerDisplay}
        autoAlign={autoAlign}
        onToggleAutoAlign={() => setAutoAlign(!autoAlign)}
        realTradingEnabled={realTradingEnabled}
        onToggleRealTrading={handleToggleRealTrading}
        tradingLeverage={tradingLeverage}
        tradingStrategy={tradingStrategy}
        gameMode={gameMode}
        totalPnl={totalPnl}
      />
    )
  }

  if (isMobile) {
    // Mobile-optimized layout with expanded side panel and bottom controls

    return (
      <div className="pointer-events-none">
        {/* Top Bar - Account Info */}
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/90 to-transparent backdrop-blur-sm px-4 py-3 z-20">
          {/* Stop Button - Mobile */}
          <button
            onClick={() => {
              const { reset } = useGameState.getState()
              reset()
            }}
            className="pointer-events-auto mb-3 px-3 py-1.5 bg-gradient-to-r from-rose-600/90 to-rose-500/90 hover:from-rose-500 hover:to-rose-400 rounded-lg border border-rose-400/30 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-rose-500/20 transition-all duration-200 active:scale-95"
          >
            ← Setup
          </button>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Balance</div>
                <div className="text-2xl font-black text-white tabular-nums leading-none mt-0.5">
                  {balance.toFixed(3)} SOL
                </div>
              </div>
              <div className="h-10 w-px bg-white/20" />
              <div className="flex flex-col">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Equity</div>
                <div className={`text-2xl font-black tabular-nums leading-none mt-0.5 ${
                  equity <= 0 ? 'text-rose-500' :
                  equity < balance * 0.2 ? 'text-rose-400' :
                  equity < balance * 0.5 ? 'text-amber-400' :
                  'text-white'
                }`}>
                  {equity.toFixed(3)} SOL
                </div>
              </div>
            </div>

            {phase === "hovering" && (
              <div className={`text-3xl font-black tracking-tight ${stanceAccent[hoverStance]}`}>
                {stanceLabels[hoverStance]}
              </div>
            )}
          </div>
        </div>

        {/* Vertically Centered Side Panel - Market Indicators */}
        {latestFeatures && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 flex flex-col gap-2.5 bg-black/75 backdrop-blur-lg rounded-xl p-3 border border-white/20 shadow-2xl">
            {/* Market Direction */}
            <div className="flex flex-col items-center gap-1">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold">Market</div>
              <div className={`text-xl font-black ${
                latestFeatures.momentum > 0.1 ? 'text-emerald-400' :
                latestFeatures.momentum < -0.1 ? 'text-rose-400' :
                'text-amber-400'
              }`}>
                {latestFeatures.momentum > 0.1 ? '↑' :
                 latestFeatures.momentum < -0.1 ? '↓' :
                 '→'}
              </div>
            </div>

            <div className="h-px w-full bg-white/20" />

            {/* Feature Indicators with Labels */}
            {featureDescriptors.map(({ key, label, variant }) => {
              const value = latestFeatures[key]
              const color = variant === "signed" ? signedColor(value) : magnitudeColor(value)
              return (
                <div key={key} className="flex flex-col items-center gap-1">
                  <div className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold">{label}</div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full shadow-lg" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
                    <div className="text-xs font-black tabular-nums" style={{ color }}>{value.toFixed(2)}</div>
                  </div>
                </div>
              )
            })}

            <div className="h-px w-full bg-white/20" />

            {/* Stability Indicator */}
            <div className="flex flex-col items-center gap-1">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold">Stability</div>
              <div className="w-full h-8 bg-white/10 rounded-full overflow-hidden relative">
                <div
                  className={`absolute bottom-0 w-full transition-all duration-200 ${phaseBar[energyPhase]}`}
                  style={{ height: `${clamp01(energyBudget) * 100}%` }}
                />
              </div>
              <div className={`text-[10px] font-black ${phaseAccent[energyPhase]}`}>
                {phaseLabels[energyPhase]}
              </div>
            </div>
          </div>
        )}

        {/* Bottom Controls Panel */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/90 to-transparent backdrop-blur-lg px-5 py-4 pb-8 pointer-events-auto">
          {/* Auto-Align Toggle */}
          <div className="flex items-center justify-between mb-3 pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Auto-Align</div>
              <div className={`text-[10px] font-bold ${autoAlign ? 'text-emerald-400' : 'text-gray-500'}`}>
                {autoAlign ? 'ON' : 'OFF'}
              </div>
            </div>
            <button
              onClick={() => setAutoAlign(!autoAlign)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                autoAlign ? 'bg-emerald-500' : 'bg-gray-600'
              }`}
            >
              <div
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-lg transition-transform ${
                  autoAlign ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* Leverage Control */}
          <div className="flex flex-col gap-2 mb-4">
            <div className="flex items-baseline justify-between">
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Leverage</div>
              <div className={`text-3xl font-black tabular-nums ${
                leverage <= 5 ? 'text-emerald-400' :
                leverage <= 10 ? 'text-amber-400' :
                'text-rose-400'
              }`}>
                {leverage.toFixed(1)}x
              </div>
            </div>
            <input
              type="range"
              min="1"
              max="100"
              step="1"
              value={leverage}
              onChange={(e) => setLeverage(parseFloat(e.target.value))}
              className="w-full h-4 rounded-full appearance-none cursor-pointer bg-white/10
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-8 [&::-webkit-slider-thumb]:h-8
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent
                [&::-webkit-slider-thumb]:shadow-xl [&::-webkit-slider-thumb]:shadow-accent/50
                [&::-moz-range-thumb]:w-8 [&::-moz-range-thumb]:h-8 [&::-moz-range-thumb]:rounded-full
                [&::-moz-range-thumb]:bg-accent [&::-moz-range-thumb]:border-0
                [&::-moz-range-thumb]:shadow-xl [&::-moz-range-thumb]:shadow-accent/50"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground uppercase font-bold">
              <span>1x Safe</span>
              <span className={leverage > 20 ? 'text-rose-400 font-black text-xs' : ''}>
                {leverage > 20 ? '⚠ High Risk' : '100x Max'}
              </span>
            </div>
          </div>

          {/* Alignment Info */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Alignment</div>
              <div className={`text-lg font-black ${alignmentTone}`}>
                {alignmentLabel} {alignmentScore.toFixed(2)}
              </div>
            </div>
            <div className="flex flex-col items-end">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Data Source</div>
              <div className="text-sm font-black text-accent uppercase">{providerDisplay}</div>
              {currentCandle ? (
                <div className="text-lg font-black text-emerald-400 mt-0.5 tracking-tight">
                  ${currentCandle.close.toFixed(2)}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground mt-0.5">Waiting...</div>
              )}
            </div>
          </div>
        </div>

        {/* Liquidation Overlay */}
        {isLiquidated && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 backdrop-blur-md pointer-events-none z-50">
            <div className="flex flex-col items-center gap-3 px-4 text-center">
              <div className="text-4xl font-black text-rose-500 uppercase tracking-widest animate-pulse">
                LIQUIDATED
              </div>
              <div className="text-base text-rose-400 uppercase tracking-wider">
                Account Balance: 0.000 SOL
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Desktop layout
  return (
    <div className="pointer-events-none">
      {/* Top Bar - Account & Status */}
      <div className="absolute top-0 left-0 right-0 h-20 flex items-center justify-between px-6 bg-gradient-to-b from-black/60 to-transparent backdrop-blur-sm border-b border-white/5">
        {/* Left - Balance & Equity */}
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Balance</div>
            <div className="text-3xl font-black text-white tabular-nums tracking-tight leading-none mt-0.5">
              {balance.toFixed(3)} SOL
            </div>
          </div>

          <div className="h-12 w-px bg-white/10" />

          <div className="flex flex-col">
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Equity</div>
            <div className={`text-3xl font-black tabular-nums tracking-tight leading-none mt-0.5 ${
              equity <= 0 ? 'text-rose-500 animate-pulse' :
              equity < balance * 0.2 ? 'text-rose-400' :
              equity < balance * 0.5 ? 'text-amber-400' :
              'text-white'
            }`}>
              {equity.toFixed(3)} SOL
            </div>
          </div>
        </div>

        {/* Center - Data Source & Price */}
        <div className="flex flex-col items-center">
          <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Data Source</div>
          <div className="text-sm font-black text-accent uppercase tracking-wider mt-1">{providerDisplay}</div>
          {currentCandle ? (
            <div className="text-2xl font-black text-emerald-400 mt-1 tracking-tight">
              ${currentCandle.close.toFixed(2)}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground mt-1">Waiting for data...</div>
          )}
        </div>

        {/* Right - Timer only (stance moved to bottom left) */}
        {phase === "hovering" && (
          <div className="flex items-center gap-4">
            <div className="w-32 flex flex-col gap-1.5">
              <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-100 ease-out ${
                    canDecide ? "bg-accent shadow-lg shadow-accent/50" : "bg-muted-foreground/40"
                  }`}
                  style={{ width: `${progressWidth * 100}%` }}
                />
              </div>
              <div className={`text-[10px] uppercase tracking-widest font-bold text-right ${dropTone}`}>{dropLabel}</div>
            </div>
          </div>
        )}

        {phase === "placing" && (
          <div className="text-2xl text-accent uppercase tracking-widest font-black animate-pulse">
            Dropping
          </div>
        )}
      </div>

      {/* Left Panel - Stability & Alignment */}
      <div className="absolute left-6 top-28 w-80">
        <div className="bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] p-5 hover:border-white/20 transition-all duration-300">
          {/* Stop Button */}
          <button
            onClick={() => {
              const { reset } = useGameState.getState()
              reset()
            }}
            className="pointer-events-auto w-full mb-4 px-4 py-2.5 bg-gradient-to-r from-rose-600/90 to-rose-500/90 hover:from-rose-500 hover:to-rose-400 rounded-xl border border-rose-400/30 text-white font-bold text-sm uppercase tracking-wider shadow-lg shadow-rose-500/20 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          >
            ← Back to Setup
          </button>

          {/* Trading Configuration Display */}
          {gameMode === "real" && (
            <>
              <div className="mb-4 p-3 bg-cyan-900/20 border border-cyan-600/30 rounded-xl">
                <div className="flex items-baseline justify-between mb-2">
                  <div className="text-[10px] text-cyan-300/70 uppercase tracking-widest font-bold">Strategy</div>
                  <div className="text-sm text-cyan-300 font-black uppercase tracking-wide">
                    {tradingStrategy === "manual" ? "Manual" :
                     tradingStrategy === "aggressive" ? "Aggressive" :
                     tradingStrategy === "high_conviction" ? "High Conv." :
                     "Balanced"}
                  </div>
                </div>
                <div className="flex items-baseline justify-between">
                  <div className="text-[10px] text-cyan-300/70 uppercase tracking-widest font-bold">Leverage</div>
                  <div className={`text-lg font-black tabular-nums ${
                    tradingLeverage <= 5 ? 'text-emerald-400' :
                    tradingLeverage <= 10 ? 'text-amber-400' :
                    'text-rose-400'
                  }`}>
                    {tradingLeverage.toFixed(1)}x
                  </div>
                </div>
              </div>
              <div className="h-px w-full bg-white/10 mb-4" />
            </>
          )}

          <div className="flex items-baseline justify-between mb-3">
            <div className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Stability</div>
            <div className={`text-2xl font-black tracking-tight ${phaseAccent[energyPhase]}`}>
              {phaseLabels[energyPhase]}
            </div>
          </div>

          <div className="h-2.5 w-full rounded-full bg-white/10 overflow-hidden mb-4">
            <div
              className={`h-full rounded-full transition-all duration-200 ease-out ${phaseBar[energyPhase]}`}
              style={{ width: `${stabilityWidth * 100}%` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="flex flex-col">
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Stabilizer</div>
              <div className="text-xl font-black text-emerald-400 tabular-nums">{stabilizerStrength.toFixed(2)}</div>
            </div>
            <div className="flex flex-col">
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Disturber</div>
              <div className="text-xl font-black text-rose-400 tabular-nums">{disturberStrength.toFixed(2)}</div>
            </div>
          </div>

          <div className="h-px w-full bg-white/10 my-4" />

          <div className="flex items-baseline justify-between">
            <div className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Alignment</div>
            <div className="flex items-baseline gap-2">
              <span className={`text-xl font-black ${alignmentTone}`}>{alignmentLabel}</span>
              <span className={`text-2xl font-black tabular-nums ${alignmentTone}`}>{alignmentScore.toFixed(2)}</span>
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground font-medium mt-1 text-right">
            Δ {alignmentVelocity.toFixed(3)}
          </div>

          <div className="h-px w-full bg-white/10 my-4" />

          {/* Leverage Slider */}
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <div className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Leverage</div>
              <div className={`text-3xl font-black tabular-nums ${
                leverage <= 5 ? 'text-emerald-400' :
                leverage <= 10 ? 'text-amber-400' :
                'text-rose-400'
              }`}>
                {leverage.toFixed(1)}x
              </div>
            </div>
            <input
              type="range"
              min="1"
              max="100"
              step="1"
              value={leverage}
              onChange={(e) => setLeverage(parseFloat(e.target.value))}
              className="pointer-events-auto w-full h-2.5 rounded-full appearance-none cursor-pointer bg-white/10
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent
                [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-accent/50
                [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-all
                [&::-webkit-slider-thumb]:hover:scale-110
                [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full
                [&::-moz-range-thumb]:bg-accent [&::-moz-range-thumb]:border-0
                [&::-moz-range-thumb]:shadow-lg [&::-moz-range-thumb]:shadow-accent/50
                [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:transition-all
                [&::-moz-range-thumb]:hover:scale-110"
            />
            <div className="flex justify-between text-[9px] text-muted-foreground/60 uppercase tracking-widest font-bold">
              <span>1x Safe</span>
              <span className={leverage > 20 ? 'text-rose-400/80' : ''}>
                {leverage > 20 ? '⚠ High Risk' : '100x Max'}
              </span>
            </div>
          </div>

          <div className="h-px w-full bg-white/10 my-4" />

          {/* Auto-Align Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Auto-Align</div>
              <div className={`text-[10px] font-bold ${autoAlign ? 'text-emerald-400' : 'text-gray-500'}`}>
                {autoAlign ? 'ON' : 'OFF'}
              </div>
            </div>
            <button
              onClick={() => setAutoAlign(!autoAlign)}
              className={`pointer-events-auto relative w-14 h-7 rounded-full transition-colors ${
                autoAlign ? 'bg-emerald-500' : 'bg-gray-600'
              }`}
            >
              <div
                className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-lg transition-transform ${
                  autoAlign ? 'translate-x-7' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <div className="h-px w-full bg-white/10 my-4" />

          {/* Real Trading Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Real Trading</div>
              <div className={`text-[10px] font-bold ${realTradingEnabled ? 'text-rose-400' : 'text-gray-500'}`}>
                {realTradingEnabled ? 'LIVE' : 'OFF'}
              </div>
            </div>
            <button
              onClick={handleToggleRealTrading}
              className={`pointer-events-auto relative w-14 h-7 rounded-full transition-colors ${
                realTradingEnabled ? 'bg-rose-500' : 'bg-gray-600'
              }`}
            >
              <div
                className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-lg transition-transform ${
                  realTradingEnabled ? 'translate-x-7' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* Real Trading Stats */}
          {realTradingEnabled && (
            <div className="mt-3 pt-3 border-t border-white/10">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Position</div>
                  <div className={`text-lg font-black tabular-nums ${openPositionSize > 0 ? 'text-emerald-400' : 'text-gray-500'}`}>
                    ${openPositionSize.toFixed(2)}
                  </div>
                </div>
                <div className="flex flex-col">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Unrealized</div>
                  <div className={`text-lg font-black tabular-nums ${
                    unrealizedPnl > 0 ? 'text-emerald-400' : unrealizedPnl < 0 ? 'text-rose-400' : 'text-gray-500'
                  }`}>
                    {unrealizedPnl >= 0 ? '+' : ''}${unrealizedPnl.toFixed(2)}
                  </div>
                </div>
                <div className="flex flex-col col-span-2">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Realized PnL</div>
                  <div className={`text-2xl font-black tabular-nums ${
                    realizedPnl > 0 ? 'text-emerald-400' : realizedPnl < 0 ? 'text-rose-400' : 'text-gray-500'
                  }`}>
                    {realizedPnl >= 0 ? '+' : ''}${realizedPnl.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Trading Metrics */}
              {tradingMetrics && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Strategy</div>
                    <div className="text-xs text-cyan-400 font-bold">{tradingMetrics.strategy}</div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    <div className="flex flex-col">
                      <span className="text-muted-foreground uppercase tracking-wider">Trades</span>
                      <span className="text-white font-bold tabular-nums">{tradingMetrics.totalTrades}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-muted-foreground uppercase tracking-wider">Filtered</span>
                      <span className="text-amber-400 font-bold tabular-nums">{tradingMetrics.filteredTrades}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-muted-foreground uppercase tracking-wider">Fees</span>
                      <span className="text-rose-400 font-bold tabular-nums">${tradingMetrics.estimatedFees.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="mt-2 text-[9px] text-gray-500">
                    Volume: ${tradingMetrics.totalVolume.toFixed(0)} •
                    Saved: {tradingMetrics.filteredTrades > 0 ? ` ${((tradingMetrics.filteredTrades / (tradingMetrics.totalTrades + tradingMetrics.filteredTrades)) * 100).toFixed(0)}%` : ' 0%'}
                  </div>
                </div>
              )}

              <div className="mt-2 p-2 bg-rose-900/20 border border-rose-600/30 rounded">
                <div className="text-[9px] text-rose-200 uppercase font-bold">
                  ⚠️ Live Drift Protocol trades
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom - Market Features */}
      {latestFeatures && (
        <div className="absolute bottom-0 left-0 right-0 h-28 flex items-center justify-between px-6 bg-gradient-to-t from-black/60 to-transparent backdrop-blur-sm border-t border-white/5">
          {/* Left: Market Direction Indicator */}
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <div className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Market</div>
              <div className="flex items-center gap-2 mt-1">
                <div className={`text-2xl font-black ${
                  latestFeatures.momentum > 0.1 ? 'text-emerald-400' :
                  latestFeatures.momentum < -0.1 ? 'text-rose-400' :
                  'text-amber-400'
                }`}>
                  {latestFeatures.momentum > 0.1 ? '↑ BULLISH' :
                   latestFeatures.momentum < -0.1 ? '↓ BEARISH' :
                   '→ NEUTRAL'}
                </div>
              </div>
            </div>
            {phase === "hovering" && hoverStance !== "flat" && (
              <>
                <div className="h-8 w-px bg-white/10" />
                <div className="flex flex-col">
                  <div className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Your Position</div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className={`text-2xl font-black ${stanceAccent[hoverStance]}`}>
                      {hoverStance === "long" ? '↑ LONG' : '↓ SHORT'}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Right: Market Features */}
          <div className="flex items-center gap-6">
            {featureDescriptors.map(({ key, label, variant }) => {
              const value = latestFeatures[key]
              const color = variant === "signed" ? signedColor(value) : magnitudeColor(value)
              return (
                <div key={key} className="flex items-center gap-2 w-20">
                  <div className="h-3 w-3 rounded-full shadow-lg flex-shrink-0" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-widest text-white/50 font-bold leading-none">{label}</div>
                    <div className="text-sm font-black tabular-nums leading-none mt-0.5 w-full text-left" style={{ color }}>
                      {value >= 0 ? '\u00A0' : ''}{value.toFixed(2)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Liquidation Overlay */}
      {isLiquidated && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md pointer-events-none z-50">
          <div className="flex flex-col items-center gap-6 animate-pulse">
            <div className="text-8xl font-black text-rose-500 uppercase tracking-widest">
              LIQUIDATED
            </div>
            <div className="text-2xl text-rose-400 uppercase tracking-wider">
              Account Balance: 0.000 SOL
            </div>
            <div className="text-lg text-muted-foreground">
              Your position was closed due to insufficient equity
            </div>
          </div>
        </div>
      )}

      {/* Wallet Connect Button (Top Right - Fixed to viewport) */}
      <div className="fixed top-6 right-6 pointer-events-auto z-50">
        <WalletConnectButton />
      </div>
    </div>
  )
}

interface DoomRunnerHudProps {
  isMobile?: boolean
  balance: number
  equity: number
  hoverStance: Stance
  providerDisplay: string
  autoAlign: boolean
  onToggleAutoAlign: () => void
  realTradingEnabled: boolean
  onToggleRealTrading: () => void
  tradingLeverage: number
  tradingStrategy: string
  gameMode: GameMode
  totalPnl: number
}

function DoomRunnerHUD({
  isMobile,
  balance,
  equity,
  hoverStance,
  providerDisplay,
  autoAlign,
  onToggleAutoAlign,
  realTradingEnabled,
  onToggleRealTrading,
  tradingLeverage,
  tradingStrategy,
  gameMode,
  totalPnl,
}: DoomRunnerHudProps) {
  const stanceColor = stanceAccent[hoverStance]
  const paddingClass = isMobile ? "px-4 py-4" : "px-8 py-6"

  const handleReset = () => {
    const { reset } = useGameState.getState()
    reset()
  }

  return (
    <div className="pointer-events-none">
      <div className={`absolute top-0 left-0 right-0 z-30 ${paddingClass}`}>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-purple-500/30 bg-black/60 px-4 py-3 backdrop-blur">
          {/* Left: Setup button and data source */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-white/80">
            <button
              onClick={handleReset}
              className="pointer-events-auto rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1 text-rose-100 transition hover:bg-rose-500/20"
            >
              ← Setup
            </button>
            <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.4em] text-white/60">
              {providerDisplay}
            </span>
          </div>

          {/* Center: Stance */}
          <div className="flex flex-col items-center">
            <div className="text-xs uppercase tracking-widest text-white/40">Stance</div>
            <div className={`text-lg font-bold ${stanceColor}`}>{stanceLabels[hoverStance]}</div>
          </div>

          {/* Right: Strategy, Balance, Equity, PnL */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-white/70">
            <div className="flex flex-col items-end">
              <div className="text-xs uppercase tracking-widest text-white/40">Strategy</div>
              <div className="text-white font-semibold">
                {tradingStrategy} · {tradingLeverage}x
              </div>
            </div>
            <div className="h-6 w-px bg-white/20" />
            <span>Balance <strong className="text-white">${balance.toFixed(2)}</strong></span>
            <span>Equity <strong className="text-white">${equity.toFixed(2)}</strong></span>
            <span>PnL <strong className={totalPnl >= 0 ? "text-emerald-300" : "text-rose-300"}>
              {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
            </strong></span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={onToggleAutoAlign}
            className={`pointer-events-auto rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-widest transition ${
              autoAlign
                ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                : "border-amber-400/40 bg-amber-500/10 text-amber-200"
            }`}
          >
            Auto Align · {autoAlign ? "ON" : "OFF"}
          </button>

          {gameMode === "real" && (
            <button
              onClick={onToggleRealTrading}
              className={`pointer-events-auto rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-widest transition ${
                realTradingEnabled
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                  : "border-white/20 bg-white/5 text-white/60"
              }`}
            >
              Live Execution · {realTradingEnabled ? "Enabled" : "Standby"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
