"use client"

import { useEffect } from "react"
import { useGameState, type Stance } from "@/lib/game/game-state"
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
  const { stonesPlaced, canDecide, phase, hoverStance, latestFeatures, decisionProgress } = useGameState()

  console.log(
    `[v0] GameUI render - stones: ${stonesPlaced}, phase: ${phase}, canDecide: ${canDecide}, stance: ${hoverStance}`,
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

  return (
    <div className="pointer-events-none">
      <div className="absolute top-4 left-4 right-4 flex items-start justify-between">
      {/* Score display */}
      <div className="bg-card/80 backdrop-blur-sm px-4 py-2 rounded-lg border border-border">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">Stones</div>
        <div className="text-2xl font-bold text-foreground tabular-nums">{stonesPlaced}</div>
      </div>

      {/* Decision indicator */}
      <div className="flex flex-col items-end gap-2">
        {phase === "hovering" && (
          <div className="bg-card/80 backdrop-blur-sm px-4 py-2 rounded-lg border border-border text-right w-44">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Stance</div>
            <div className={`text-sm font-semibold ${stanceAccent[hoverStance]}`}>{stanceLabels[hoverStance]}</div>
            <div className="mt-1 h-1 w-full rounded-full bg-white/10 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-100 ease-out ${
                  canDecide ? "bg-accent" : "bg-muted-foreground/40"
                }`}
                style={{ width: `${progressWidth * 100}%` }}
              />
            </div>
            <div className={`mt-1 text-[11px] uppercase tracking-wide ${canDecide ? "text-accent" : "text-muted-foreground"}`}>
              {canDecide ? "Decision Window" : "Locked"}
            </div>
          </div>
        )}
        {phase === "placing" && (
          <div className="bg-card/60 backdrop-blur-sm px-4 py-1.5 rounded-lg border border-border text-xs text-muted-foreground uppercase tracking-wide">
            Dropping
          </div>
        )}
      </div>
      </div>

      {latestFeatures && (
        <div className="absolute bottom-6 left-4 flex gap-1">
          {featureDescriptors.map(({ key, label, variant }) => {
            const value = latestFeatures[key]
            const color = variant === "signed" ? signedColor(value) : magnitudeColor(value)
            return (
              <div key={key} className="flex flex-col items-center text-[10px] uppercase tracking-wider text-white/60">
                <div className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                <div>{label}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
