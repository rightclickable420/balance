"use client"

import { useEffect } from "react"
import { useGameState } from "@/lib/game/game-state"

export function GameUI() {
  const { stonesPlaced, canDecide, phase } = useGameState()

  console.log(`[v0] GameUI render - stones: ${stonesPlaced}, phase: ${phase}, canDecide: ${canDecide}`)

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
      {phase === "placing" && (
        <div
          className={`bg-card/80 backdrop-blur-sm px-4 py-2 rounded-lg border transition-colors ${
            canDecide ? "border-accent text-accent" : "border-border text-muted-foreground"
          }`}
        >
          <div className="text-xs uppercase tracking-wide">{canDecide ? "Decide" : "Locked"}</div>
        </div>
      )}
    </div>
  )
}
