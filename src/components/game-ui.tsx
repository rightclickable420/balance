"use client"

import { useEffect } from "react"
import { useGameState, type Stance } from "@/lib/game/game-state"
import { useAccountState } from "@/lib/game/account-state"
import type { Features } from "@/lib/data/features"

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

export function GameUI() {
  const {
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
  } = useGameState()
  const balance = useAccountState((state) => state.balance)
  const equity = useAccountState((state) => state.equity)
  const leverage = useAccountState((state) => state.leverage)
  const setLeverage = useAccountState((state) => state.setLeverage)
  const isLiquidated = useAccountState((state) => state.isLiquidated)

  console.log(
    `[v0] GameUI render - stones: ${stonesPlaced}, phase: ${phase}, canDecide: ${canDecide}, stance: ${hoverStance}, energyPhase: ${energyPhase}`,
  )

  // Test if basic JavaScript works (only on client side)
  useEffect(() => {
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      try {
        document.title = `Balance - Stones: ${stonesPlaced}`
        console.log(`[v0] Title set to: Balance - Stones: ${stonesPlaced}`)
      } catch (error) {
        console.error("[v0] Failed to set title:", error)
      }
    }
  }, [stonesPlaced])

  const progressWidth = clamp01(decisionProgress)
  const providerDisplay = (() => {
    const normalized = dataProvider?.toLowerCase() ?? "mock"
    if (normalized === "hyperliquid") return "Hyperliquid"
    if (normalized.startsWith("polygon")) return "Polygon"
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

  return (
    <div className="pointer-events-none">
      {/* Top Bar - Account & Status */}
      <div className="absolute top-0 left-0 right-0 h-20 flex items-center justify-between px-6 bg-gradient-to-b from-black/60 to-transparent backdrop-blur-sm border-b border-white/5">
        {/* Left - Balance & Equity */}
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Balance</div>
            <div className="text-3xl font-black text-foreground tabular-nums tracking-tight leading-none mt-0.5">
              ${balance.toFixed(2)}
            </div>
          </div>

          <div className="h-12 w-px bg-white/10" />

          <div className="flex flex-col">
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Equity</div>
            <div className={`text-3xl font-black tabular-nums tracking-tight leading-none mt-0.5 ${
              equity <= 0 ? 'text-rose-500 animate-pulse' :
              equity < balance * 0.2 ? 'text-rose-400' :
              equity < balance * 0.5 ? 'text-amber-400' :
              'text-foreground'
            }`}>
              ${equity.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Center - Data Source */}
        <div className="flex flex-col items-center">
          <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Data Source</div>
          <div className="text-sm font-black text-accent uppercase tracking-wider mt-1">{providerDisplay}</div>
        </div>

        {/* Right - Stance & Timer */}
        {phase === "hovering" && (
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Position</div>
              <div className={`text-4xl font-black tracking-tight leading-none mt-0.5 ${stanceAccent[hoverStance]}`}>
                {stanceLabels[hoverStance]}
              </div>
            </div>
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
      <div className="absolute left-6 top-28 w-72">
        <div className="bg-card/90 backdrop-blur-md rounded-xl border-2 border-border shadow-2xl p-5">
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
              max="20"
              step="0.5"
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
              <span className={leverage > 10 ? 'text-rose-400/80' : ''}>
                {leverage > 10 ? '⚠ High Risk' : '20x Max'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom - Market Features */}
      {latestFeatures && (
        <div className="absolute bottom-0 left-0 right-0 h-20 flex items-center justify-between px-6 bg-gradient-to-t from-black/60 to-transparent backdrop-blur-sm border-t border-white/5">
          {/* Left: Market Direction Indicator */}
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Market</div>
              <div className="flex items-center gap-2 mt-1">
                <div className={`text-lg font-black ${
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
                  <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Your Position</div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className={`text-lg font-black ${stanceAccent[hoverStance]}`}>
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
                <div key={key} className="flex items-center gap-2 w-16">
                  <div className="h-2.5 w-2.5 rounded-full shadow-lg flex-shrink-0" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="text-[9px] uppercase tracking-widest text-white/50 font-bold leading-none">{label}</div>
                    <div className="text-xs font-black tabular-nums leading-none mt-0.5 w-full text-left" style={{ color }}>
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
              Account Balance: $0.00
            </div>
            <div className="text-lg text-muted-foreground">
              Your position was closed due to insufficient equity
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
