"use client"

import { useEffect } from "react"
import { useGameState, type Stance } from "@/lib/game/game-state"

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

export function GameUI() {
  const { stonesPlaced, canDecide, phase, hoverStance } = useGameState()

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

  return (
    <div className="absolute top-4 left-4 right-4 flex items-start justify-between pointer-events-none">
      {/* Score display */}
      <div className="bg-card/80 backdrop-blur-sm px-4 py-2 rounded-lg border border-border">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">Stones</div>
        <div className="text-2xl font-bold text-foreground tabular-nums">{stonesPlaced}</div>
      </div>

      {/* Decision indicator */}
      <div className="flex flex-col items-end gap-2">
        {phase === "hovering" && (
          <div className="bg-card/80 backdrop-blur-sm px-4 py-2 rounded-lg border border-border text-right">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Stance</div>
            <div className={`text-sm font-semibold ${stanceAccent[hoverStance]}`}>{stanceLabels[hoverStance]}</div>
            <div
              className={`text-[11px] uppercase tracking-wide ${
                canDecide ? "text-accent" : "text-muted-foreground"
              }`}
            >
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
  )
}
