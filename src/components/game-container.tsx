"use client"

import { useCallback } from "react"
import { GameSetupScreen } from "./game-setup-screen"
import { DoomRunnerExperience } from "./doom-runner-experience"
import { useGameState, type GameMode } from "@/lib/game/game-state"
import { useAccountState } from "@/lib/game/account-state"
import { getTradingController } from "@/lib/trading/trading-controller"
import { getDriftPositionManager } from "@/lib/trading/drift-position-manager"
import { getSessionWallet } from "@/lib/wallet/session-wallet"

export function GameContainer() {
  const { setupPhase, startGame } = useGameState()

  // Handler for starting the game from setup screen
  const handleStartGame = useCallback(async (
    mode: GameMode,
    strategy?: import("@/lib/trading/trading-controller").TradingStrategy,
    leverage?: number
  ) => {
    console.log(`[Game] Starting game in ${mode} mode`, { strategy, leverage })

    // Store trading config in game state and sync account state
    if (strategy && leverage) {
      const { setTradingConfig } = useGameState.getState()
      setTradingConfig(leverage, strategy)

      // Sync account state with setup selections
      const { setLeverage, setAutoAlign } = useAccountState.getState()
      setLeverage(leverage)
      // Manual strategy = auto-align OFF, all others = auto-align ON
      setAutoAlign(strategy !== "manual")
      console.log(`[Game] Account state synced: ${leverage}x leverage, auto-align ${strategy !== "manual" ? 'ON' : 'OFF'}`)
    }

    // Configure and initialize trading controller if real mode
    if (mode === "real" && strategy && leverage) {
      const controller = getTradingController()
      controller.updateConfig({
        strategy,
        leverage,
      })
      console.log(`[Game] Trading configured: ${strategy} strategy, ${leverage}x leverage`)

      // Ensure Drift is initialized before starting
      try {
        const sessionWallet = getSessionWallet()
        const keypair = sessionWallet.getKeypair()

        if (!keypair) {
          console.error("[Game] No session wallet keypair found")
          alert("Session wallet not initialized. Please deposit SOL first.")
          return
        }

        const driftManager = getDriftPositionManager()
        console.log("[Game] Initializing Drift Protocol...")
        await driftManager.initialize(keypair)
        console.log("[Game] ✅ Drift Protocol initialized")
      } catch (error) {
        console.error("[Game] Failed to initialize Drift:", error)
        alert("Failed to initialize trading system. Please try again.")
        return
      }
    }

    startGame(mode)
  }, [startGame])

  // If setup is not complete, show the setup screen
  if (setupPhase !== "playing") {
    return <GameSetupScreen onStartGame={handleStartGame} />
  }

  // Render Doom Runner experience
  return (
    <div className="relative h-full w-full touch-none">
      <DoomRunnerExperience />
    </div>
  )
}
