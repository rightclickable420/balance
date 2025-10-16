"use client"

import { useGameState } from "@/lib/game/game-state"

export function GameUI() {
  const { stonesPlaced, canDecide, phase } = useGameState()

  return (
    <div className="absolute top-4 left-4 right-4 flex items-start justify-between pointer-events-none">
      {/* Score display */}
      <div className="bg-card/80 backdrop-blur-sm px-4 py-2 rounded-lg border border-border">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">Stones</div>
        <div className="text-2xl font-bold text-foreground tabular-nums">{stonesPlaced}</div>
      </div>

      {/* Decision indicator */}
      {phase === "falling" && (
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
