"use client"

import { useCallback } from "react"
import { GameSetupScreen } from "./game-setup-screen"
import { DoomRunnerExperience } from "./doom-runner-experience"
import { useGameState, type GameMode, type Stance } from "@/lib/game/game-state"
import { useAccountState } from "@/lib/game/account-state"
import { getTradingController } from "@/lib/trading/trading-controller"
import { getDriftPositionManager } from "@/lib/trading/drift-position-manager"
import { getSessionWallet } from "@/lib/wallet/session-wallet"

interface GameContainerProps {
  isMobile?: boolean
}

export function GameContainer({ isMobile = false }: GameContainerProps) {
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

  if (isMobile) {
    return (
      <div className="flex h-full w-full flex-col items-center gap-3 overflow-hidden px-4 py-4">
        <div className="w-full max-w-md flex-none">
          <MobileTopBar />
        </div>
        <div className="w-full max-w-md flex-1">
          <div className="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl" style={{ aspectRatio: "16 / 9" }}>
            <div className="absolute inset-0">
              <DoomRunnerExperience />
            </div>
          </div>
        </div>
        <div className="w-full max-w-md flex-none">
          <MobileStanceControls />
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full touch-none">
      <DoomRunnerExperience />
    </div>
  )
}

function MobileStanceControls() {
  const autoAlign = useAccountState((state) => state.autoAlign)
  const hoverStance = useGameState((state) => state.hoverStance)
  const setHoverStance = useGameState((state) => state.setHoverStance)

  const handleChange = (stance: Stance) => {
    if (autoAlign) return
    if (stance === hoverStance) return
    setHoverStance(stance)
    const { lastPrice, updateUnrealizedPnl } = useAccountState.getState()
    if (Number.isFinite(lastPrice ?? NaN)) {
      updateUnrealizedPnl(lastPrice as number, stance)
    }
  }

  const stanceOptions: Array<{ label: string; value: Stance; accent: string }> = [
    { label: "Short ↓", value: "short", accent: "from-rose-500 to-rose-600" },
    { label: "Flat •", value: "flat", accent: "from-slate-500 to-slate-600" },
    { label: "Long ↑", value: "long", accent: "from-emerald-500 to-emerald-600" },
  ]

  return (
    <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/60 p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">Manual Control</p>
          <p className="text-sm text-white/80">
            {autoAlign ? "Auto-align enabled" : "Tap a lane to steer the Slayer"}
          </p>
        </div>
        <div
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            autoAlign ? "bg-emerald-500/10 text-emerald-200" : "bg-amber-500/10 text-amber-200"
          }`}
        >
          {autoAlign ? "Auto" : "Manual"}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {stanceOptions.map((option) => {
          const isActive = hoverStance === option.value
          return (
            <button
              key={option.value}
              disabled={autoAlign}
              onClick={() => handleChange(option.value)}
              className={`rounded-xl px-3 py-4 text-center text-sm font-semibold text-white transition-all ${
                isActive
                  ? `bg-gradient-to-r ${option.accent} shadow-lg shadow-black/40`
                  : "bg-white/5 text-white/70"
              } ${autoAlign && !isActive ? "opacity-40" : ""}`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      {autoAlign && (
        <p className="mt-3 text-center text-xs text-white/60">
          Disable auto-align to take manual control.
        </p>
      )}
    </div>
  )
}

function MobileTopBar() {
  const { hoverStance, tradingStrategy, tradingLeverage, gameMode, dataProvider } = useGameState()
  const autoAlign = useAccountState((state) => state.autoAlign)
  const setAutoAlign = useAccountState((state) => state.setAutoAlign)
  const balance = useAccountState((state) => state.balance)
  const equity = useAccountState((state) => state.equity)
  const session = useGameState((state) => state.sessionWalletBalance)

  const providerLabel = (() => {
    const normalized = dataProvider?.toLowerCase() ?? "mock"
    if (normalized === "hyperliquid") return "Hyperliquid"
    if (normalized.startsWith("polygon")) return "Polygon"
    if (normalized === "realtime") return "Real-Time SOL"
    if (normalized === "pyth") return "Pyth Hermes"
    if (normalized === "default") return "Live"
    return "Mock Data"
  })()

  const handleReset = () => {
    const { reset } = useGameState.getState()
    reset()
  }

  return (
    <div className="rounded-3xl border border-white/15 bg-black/70 p-4 text-white shadow-xl backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          onClick={handleReset}
          className="rounded-full border border-rose-500/50 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-rose-200"
        >
          ← Setup
        </button>
        <div className="rounded-full border border-white/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.4em] text-white/70">
          {providerLabel}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">Strategy</p>
          <p className="text-base font-semibold text-white">
            {tradingStrategy} · {tradingLeverage}x
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">Stance</p>
          <p className="text-xl font-black text-white">{hoverStance}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-white/80">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">Balance</p>
          <p className="font-semibold">${balance.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">Equity</p>
          <p className="font-semibold">${equity.toFixed(2)}</p>
        </div>
        {gameMode === "real" && (
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">Session</p>
            <p className="font-semibold">{session.toFixed(3)} SOL</p>
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <button
          onClick={() => setAutoAlign(!autoAlign)}
          className={`rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-widest ${
            autoAlign ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-200"
          }`}
        >
          Auto Align · {autoAlign ? "ON" : "OFF"}
        </button>
      </div>
    </div>
  )
}
