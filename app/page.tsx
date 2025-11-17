"use client"

import { GameContainer } from "../src/components/game-container"
import { GameUI } from "../src/components/game-ui"
import { useIsMobile } from "../src/hooks/use-is-mobile"
import { useGameState } from "../src/lib/game/game-state"

export default function Home() {
  const isMobile = useIsMobile()
  const setupPhase = useGameState((state) => state.setupPhase)

  return (
    <main className="h-screen w-screen overflow-hidden bg-gradient-to-b from-[#0a0a0f] via-[#12121a] to-[#1a1a28] flex items-center justify-center">
      {/* GameContainer handles both setup and Doom Runner rendering */}
      {setupPhase !== "playing" ? (
        <GameContainer />
      ) : (
        /* During gameplay, full viewport with HUD overlay */
        <div className="relative w-full h-full">
          <GameContainer />
          <GameUI isMobile={isMobile} />
        </div>
      )}
    </main>
  )
}
