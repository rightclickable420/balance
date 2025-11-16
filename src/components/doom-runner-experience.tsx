"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useGameState, type Stance } from "@/lib/game/game-state"
import { useAccountState } from "@/lib/game/account-state"
import { GzdoomRunner, type DoomRunnerBridge } from "./gzdoom-runner"

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))
const STANCE_TO_ALIGN: Record<Stance, 0 | 1 | 2> = {
  flat: 0,
  long: 1,
  short: 2,
}

export function DoomRunnerExperience({ isMobile = false }: { isMobile?: boolean }) {
  const {
    decisionProgress,
    energyPhase,
    energyBudget,
    alignmentVelocity,
    phase,
    score,
    stonesPlaced,
    dataProvider,
    latestFeatures,
  } = useGameState()
  const setSetupPhase = useGameState((state) => state.setSetupPhase)
  const setExperienceMode = useGameState((state) => state.setExperienceMode)
  const resetGame = useGameState((state) => state.reset)
  const hoverStance = useGameState((state) => state.hoverStance)
  const autoAlign = useAccountState((state) => state.autoAlign)
  const equity = useAccountState((state) => state.equity)
  const balance = useAccountState((state) => state.balance)
  const peakEquity = useAccountState((state) => state.peakEquity)
  const lastPrice = useAccountState((state) => state.lastPrice)
  const resetAccount = useAccountState((state) => state.reset)
  const setAutoAlignToggle = useAccountState((state) => state.setAutoAlign)

  const hpPct = useMemo(() => {
    if (!Number.isFinite(equity) || equity <= 0) return 0
    if (!Number.isFinite(peakEquity) || peakEquity <= 0) return 1
    return clamp(equity / peakEquity, 0, 1)
  }, [equity, peakEquity])

  const beatProgress = clamp(decisionProgress ?? 0)
  const alignmentMomentum = Number.isFinite(alignmentVelocity) ? alignmentVelocity : 0
  const laneTarget = useMemo(() => {
    switch (hoverStance) {
      case "long":
        return 1
      case "short":
        return -1
      default:
        return 0
    }
  }, [hoverStance])

  const bridgeRef = useRef<DoomRunnerBridge | null>(null)
  const autoModeRef = useRef(false)
  const lastAlignRef = useRef<Stance | null>(null)
  const lastSigmaRef = useRef<number | null>(null)
  const lastLossRef = useRef<number | null>(null)
  const [engineReady, setEngineReady] = useState(false)
  const pendingCommandsRef = useRef<string[]>([])
  const lastMarketDirectionRef = useRef<number>(0)

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
      lastSigmaRef.current = null
      lastLossRef.current = null
    } else {
      autoModeRef.current = false
    }
  }, [engineReady])

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

  const sigmaPercent = useMemo(() => {
    const normalized = clamp(Math.abs(alignmentMomentum) / 1.5, 0, 1)
    return Math.round(normalized * 100)
  }, [alignmentMomentum])

  const lossPercent = useMemo(() => {
    return Math.round(clamp(1 - hpPct, 0, 1) * 100)
  }, [hpPct])

  // Old console command approach - no longer needed
  // useEffect(() => {
  //   if (!engineReady) return
  //   if (lastSigmaRef.current === sigmaPercent) return
  //   sendCommand(`pukename MR_SetSigma ${sigmaPercent}`)
  //   lastSigmaRef.current = sigmaPercent
  // }, [engineReady, sigmaPercent, sendCommand])

  useEffect(() => {
    if (!engineReady) return
    if (lastLossRef.current === lossPercent) return
    sendCommand(`pukename MR_SetLoss ${lossPercent}`)
    lastLossRef.current = lossPercent
  }, [engineReady, lossPercent, sendCommand])

  // Balance HUD update effect - calculate streak and send to Doom engine
  useEffect(() => {
    if (!bridgeRef.current?.isReady()) return

    // Calculate streak gain percentage from baseline
    const baseline = streakBaselineRef.current
    const streakGainPct = baseline > 0 ? Math.round(((equity - baseline) / baseline) * 100) : 0

    // Detect sudden loss (>3% equity drop since last update)
    const prevEquity = prevEquityRef.current
    const equityDropPct = prevEquity > 0 ? ((prevEquity - equity) / prevEquity) * 100 : 0
    const suddenLoss = equityDropPct > 3

    // Auto-reset baseline at 20% gain to start new streak
    if (streakGainPct >= 20) {
      streakBaselineRef.current = equity
    }

    // Update previous equity for next sudden loss check
    prevEquityRef.current = equity

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
            equity: Math.round(equity),
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

      // Spawn enemies when market direction changes significantly
      // Convert momentum from 0-100 back to -1..1 for direction calculation
      const currentMomentum = (momentum - 50) / 50 // 0..100 → -1..1

      // Determine market direction: -1 (bearish), 0 (neutral), 1 (bullish)
      const marketDirection = currentMomentum > 0.2 ? 1 : currentMomentum < -0.2 ? -1 : 0

      // Check if direction changed
      if (marketDirection !== lastMarketDirectionRef.current && marketDirection !== 0) {
        lastMarketDirectionRef.current = marketDirection

        // Calculate conviction level (0-4) based on momentum strength for enemy type
        // 0: weakest (Zombieman), 4: strongest (Baron of Hell)
        const convictionLevel = Math.min(4, Math.floor(Math.abs(currentMomentum) * 5))

        // Determine spawn lane: -1 (short/left), 1 (long/right)
        const spawnLane = marketDirection

        // Spawn single enemy in the target lane
        iframe.contentWindow.postMessage(
          {
            type: "enemy-spawn",
            payload: {
              lane: spawnLane,
              enemyType: convictionLevel, // 0-4 for different enemy types
            },
          },
          window.location.origin,
        )
      }
    }
  }, [equity, balance, lastPrice, latestFeatures, engineReady])

  const handleBackToSetup = useCallback(() => {
    bridgeRef.current?.shutdown()
    setAutoAlignToggle(false)
    resetAccount()
    resetGame()
    setExperienceMode("balance")
    setSetupPhase("in_setup")
  }, [resetAccount, resetGame, setAutoAlignToggle, setExperienceMode, setSetupPhase])

  return (
    <div className="relative h-full w-full">
      <GzdoomRunner ref={bridgeRef} onReadyChange={setEngineReady} laneTarget={laneTarget} fireIntent={false} />
    </div>
  )
}
