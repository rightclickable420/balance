"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { GameCanvas } from "./game-canvas"
import { PhysicsEngine } from "@/lib/game/physics-engine"
import { MockCandleSource } from "@/lib/data/mock-candle-source"
import { generateStoneShape, normalizePoints } from "@/lib/game/stone-generator"
import { DEFAULT_CONFIG } from "@/lib/config"
import { useGameState, type Stance } from "@/lib/game/game-state"
import { initFeatureState, computeFeatures, type Features } from "@/lib/data/features"
import { featuresToStoneVisual } from "@/lib/game/feature-mapper"
import { stonesToLose } from "@/lib/game/loss"
import { AudioManager } from "@/lib/audio/audio-manager"
import type { Candle, StoneParams } from "@/lib/types"
import { useGestureControls } from "@/hooks/use-gesture-controls"
// import { AudioManager } from "@/lib/audio/audio-manager"

const CANVAS_WIDTH = 800
const CANVAS_HEIGHT = 600
const GROUND_Y = CANVAS_HEIGHT - 50
const HOVER_VERTICAL_OFFSET = 120
const STACK_GAP = -4
const INITIAL_STACK_COUNT = 10
const DESIRED_TOP_SCREEN_Y = 240

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

type StoneBounds = {
  minY: number
  maxY: number
}

type HoverStone = {
  vertices: { x: number; y: number }[]
  x: number
  y: number
  color: string
  targetY: number
  params: StoneParams
  candle: Candle
  bounds: StoneBounds
  baseParams: StoneParams
  spawnedAt: number
  stance: Stance
  features: Features
}

type PlacingStone = HoverStone & {
  startY: number
}

const DEFAULT_STANCE: Stance = "long"

export function GameContainer() {
  const engineRef = useRef<PhysicsEngine | null>(null)
  const candleSourceRef = useRef(new MockCandleSource())
  const audioRef = useRef<AudioManager>(new AudioManager())
  const animationFrameRef = useRef<number>()
  const lastTimeRef = useRef<number>(Date.now())
  const dropTimerRef = useRef<NodeJS.Timeout | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const marketAlignmentTimeRef = useRef<number>(0)
  const stoneSequenceRef = useRef<number>(0)
  const dropStartTimeRef = useRef<number>(Date.now())
  const nextDropAtRef = useRef<number | null>(null)
  const stackSurfaceYRef = useRef<number>(GROUND_Y)
  const stackTopYRef = useRef<number>(GROUND_Y)
  const towerOffsetTargetRef = useRef<number>(0)
  const towerOffsetInitializedRef = useRef<boolean>(false)
  const hoverModulationTimerRef = useRef<number>(0)
  const decisionDeadlineRef = useRef<number | null>(null)
  const decisionDurationRef = useRef<number>(0)
  const featureStateRef = useRef(initFeatureState())
  const lastFeaturesRef = useRef<Features | null>(null)

  const [renderTrigger, setRenderTrigger] = useState(0)
  const [testCounter, setTestCounter] = useState(0)
  const [hoverStoneState, setHoverStoneState] = useState<HoverStone | null>(null)
  const hoverStoneRef = useRef<HoverStone | null>(null)
  const [placingStoneState, setPlacingStoneState] = useState<PlacingStone | null>(null)
  const placingStoneRef = useRef<PlacingStone | null>(null)

  const setHoverStone = useCallback(
    (value: HoverStone | null | ((prev: HoverStone | null) => HoverStone | null)) => {
      setHoverStoneState((prev) => {
        const next =
          typeof value === "function"
            ? (value as (prev: HoverStone | null) => HoverStone | null)(prev)
            : value
        hoverStoneRef.current = next
        return next
      })
    },
    [],
  )

  const setPlacingStone = useCallback(
    (value: PlacingStone | null | ((prev: PlacingStone | null) => PlacingStone | null)) => {
      setPlacingStoneState((prev) => {
        const next =
          typeof value === "function"
            ? (value as (prev: PlacingStone | null) => PlacingStone | null)(prev)
            : value
        placingStoneRef.current = next
        return next
      })
    },
    [],
  )

  const clearDropTimer = useCallback(() => {
    if (dropTimerRef.current) {
      clearTimeout(dropTimerRef.current)
      dropTimerRef.current = null
    }
  }, [])

  const hoverStone = hoverStoneState
  const placingStone = placingStoneState

  const {
    phase,
    setPhase,
    setDropStartTime,
    setPhysicsActive,
    marketAlignment,
    setMarketAlignment,
    setPlacementProgress,
    debugMode,
    setDebugMode,
    timeScale,
    setTimeScale,
    stonesPlaced,
    incrementStonesPlaced,
    canDecide,
    setCanDecide,
    setHoverStance,
  } = useGameState()

  const getHoverModulatedParams = useCallback(
    (baseParams: StoneParams, elapsedMs: number, alignment: number): StoneParams => {
      const t = elapsedMs / 700
      const wave = Math.sin(t)
      const pulse = Math.sin(elapsedMs / 220 + baseParams.seed * 0.01)
      const volatility = clamp(0.5 + 0.3 * wave + 0.2 * pulse, 0, 1)
      const biasShift = alignment * 0.5

      const convexity = clamp(baseParams.convexity - volatility * 0.3, 0.1, 1)
      const jaggedness = clamp(baseParams.jaggedness + volatility * 0.4, 0, 1)
      const radiusScale = clamp(1 + (volatility - 0.5) * 0.15, 0.85, 1.15)
      const baseBias = clamp(baseParams.baseBias + biasShift + (volatility - 0.5) * 0.6, -1, 1)

      return {
        ...baseParams,
        convexity,
        jaggedness,
        baseBias,
        radius: clamp(baseParams.radius * radiusScale, 30, 70),
      }
    },
    [],
  )

  const isDecisionActive = useCallback(() => {
    const { phase: currentPhase, canDecide: currentCanDecide } = useGameState.getState()
    if (currentPhase !== "hovering" || !currentCanDecide) {
      return false
    }
    const deadline = decisionDeadlineRef.current
    if (!deadline) {
      return false
    }
    if (Date.now() >= deadline) {
      setCanDecide(false)
      return false
    }
    return true
  }, [setCanDecide])

  const syncTowerOffset = useCallback(() => {
    const top = stackTopYRef.current
    const desiredOffset = DESIRED_TOP_SCREEN_Y - top
    towerOffsetTargetRef.current = desiredOffset
    if (!towerOffsetInitializedRef.current) {
      useGameState.setState({ towerOffset: desiredOffset })
      towerOffsetInitializedRef.current = true
    }
  }, [])

  const computeBounds = useCallback((vertices: { x: number; y: number }[]): StoneBounds => {
    let minY = Infinity
    let maxY = -Infinity
    for (const { y } of vertices) {
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    return { minY, maxY }
  }, [])

  const computeVisualFromCandle = useCallback((candle: Candle) => {
    const { features, state } = computeFeatures(featureStateRef.current, candle)
    featureStateRef.current = state
    lastFeaturesRef.current = features
    const { params, color } = featuresToStoneVisual(features, candle.timestamp)
    return { params, color, features }
  }, [])

  const handleFlip = useCallback(() => {
    const hover = hoverStoneRef.current
    if (!hover) return
    if (!isDecisionActive()) return

    const nextStance: Stance = hover.stance === "short" ? "long" : "short"
    const alignment = useGameState.getState().marketAlignment
    const elapsed = Date.now() - hover.spawnedAt
    const flippedBase = { ...hover.baseParams, baseBias: -hover.baseParams.baseBias }
    const modulatedParams = getHoverModulatedParams(flippedBase, elapsed, alignment)
    const vertices = normalizePoints(generateStoneShape(modulatedParams))
    const bounds = computeBounds(vertices)
    const landingSurface = stackSurfaceYRef.current
    const targetY = landingSurface - bounds.maxY
    const hoverY = targetY - HOVER_VERTICAL_OFFSET

    const updated: HoverStone = {
      ...hover,
      stance: nextStance,
      baseParams: flippedBase,
      params: modulatedParams,
      vertices,
      bounds,
      targetY,
      y: hoverY,
    }

    setHoverStone(updated)
    setHoverStance(nextStance)
  }, [computeBounds, getHoverModulatedParams, isDecisionActive, setHoverStance, setHoverStone])

  const handleDiscard = useCallback(() => {
    const hover = hoverStoneRef.current
    if (!hover) return
    if (!isDecisionActive()) return
    if (hover.stance === "flat") return

    const updated: HoverStone = {
      ...hover,
      stance: "flat",
    }

    setHoverStone(updated)
    setHoverStance("flat")
  }, [isDecisionActive, setHoverStance, setHoverStone])

  const recalcStackFromPhysics = useCallback(() => {
    const engine = engineRef.current
    if (!engine) return

    const stones = engine.getStones()
    if (stones.length === 0) {
      stackTopYRef.current = GROUND_Y
      stackSurfaceYRef.current = GROUND_Y
      syncTowerOffset()
      return
    }

    let top = Infinity
    for (const stone of stones) {
      let minY = Infinity
      for (const vertex of stone.vertices) {
        if (vertex.y < minY) minY = vertex.y
      }
      const stoneTop = stone.body.position.y + minY
      if (stoneTop < top) {
        top = stoneTop
      }
    }

    stackTopYRef.current = top
    stackSurfaceYRef.current = top - STACK_GAP
    syncTowerOffset()
  }, [syncTowerOffset])

  const prepopulateStack = useCallback(() => {
    const engine = engineRef.current
    if (!engine) return

    let surface = GROUND_Y
    let top = surface

    for (let i = 0; i < INITIAL_STACK_COUNT; i++) {
      const candle = candleSourceRef.current.next()
      const { params, color } = computeVisualFromCandle(candle)
      const vertices = normalizePoints(generateStoneShape(params))
      const bounds = computeBounds(vertices)

      const targetY = surface - bounds.maxY

      engine.addStone(vertices, params, CANVAS_WIDTH / 2, targetY, color)

      top = targetY + bounds.minY
      surface = top - STACK_GAP

      stoneSequenceRef.current += 1
    }

    stackTopYRef.current = top
    stackSurfaceYRef.current = surface

    useGameState.setState({ stonesPlaced: INITIAL_STACK_COUNT, phase: "stable" })
    syncTowerOffset()
  }, [computeBounds, computeVisualFromCandle, syncTowerOffset])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "l" || e.key === "L") {
        const newDebugMode = !debugMode
        setDebugMode(newDebugMode)
        setTimeScale(newDebugMode ? 60 : 1)
        console.log(`[v0] Debug mode ${newDebugMode ? "enabled" : "disabled"} - timeScale: ${newDebugMode ? 60 : 1}x`)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [debugMode, setDebugMode, setTimeScale])

  // Initialize physics engine and audio
  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return
    try {
      console.log("[v0] Starting game container initialization")
      engineRef.current = new PhysicsEngine(CANVAS_WIDTH, CANVAS_HEIGHT, DEFAULT_CONFIG.gravity)

      // Audio temporarily disabled for debugging
      // const initAudio = async () => {
      //   try {
      //     await audioRef.current.initialize()
      //     console.log("[v0] Audio initialized successfully")
      //   } catch (error) {
      //     console.error("[v0] Audio initialization failed:", error)
      //   }
      //   document.removeEventListener("click", initAudio)
      //   document.removeEventListener("keydown", initAudio)
      // }
      // document.addEventListener("click", initAudio)
      // document.addEventListener("keydown", initAudio)

      const gameLoop = () => {
        const now = Date.now()
        const deltaTime = now - lastTimeRef.current
        lastTimeRef.current = now

        if (engineRef.current) {
          const {
            physicsActive: currentPhysicsActive,
            phase: currentPhase,
            stonesPlaced: currentStonesPlaced,
            timeScale: currentTimeScale,
            towerOffset: currentTowerOffset,
            canDecide: currentCanDecide,
          } = useGameState.getState()

          if (currentPhase === "hovering" && currentCanDecide) {
            const deadline = decisionDeadlineRef.current
            if (deadline && now >= deadline) {
              setCanDecide(false)
            }
          }

          const targetOffset = towerOffsetTargetRef.current
          if (Math.abs(targetOffset - currentTowerOffset) > 0.1) {
            const lerpFactor = Math.min(1, deltaTime / 200)
            const newOffset = currentTowerOffset + (targetOffset - currentTowerOffset) * lerpFactor
            useGameState.setState({ towerOffset: newOffset })
          }

          if (currentPhysicsActive) {
            engineRef.current.update(deltaTime)
          }

          // Update render periodically
          if (Math.random() < 0.1) {
            setRenderTrigger((prev) => prev + 1)
          }

          // Test counter to verify React is working
          setTestCounter((prev) => prev + 1)

          marketAlignmentTimeRef.current += deltaTime / 1000
          const newAlignment = Math.sin(marketAlignmentTimeRef.current * 0.1) * 0.5
          setMarketAlignment(newAlignment)

          if (currentPhase === "stable" && currentStonesPlaced > 0) {
            const latestFeatures = lastFeaturesRef.current
            if (latestFeatures) {
              const pendingStance = placingStoneRef.current?.stance ?? hoverStoneRef.current?.stance ?? DEFAULT_STANCE
              const loseCount = stonesToLose(latestFeatures, pendingStance, currentStonesPlaced)
              if (loseCount > 0) {
                triggerLossEvent(latestFeatures, pendingStance, loseCount)
              }
            }
          }

          const activeHoverStone = hoverStoneRef.current

          if (currentPhase === "hovering" && activeHoverStone) {
            if (now - hoverModulationTimerRef.current > 120) {
              const elapsed = now - activeHoverStone.spawnedAt
              const modulatedParams = getHoverModulatedParams(activeHoverStone.baseParams, elapsed, newAlignment)
              const modulatedVertices = normalizePoints(generateStoneShape(modulatedParams))
              const modulatedBounds = computeBounds(modulatedVertices)
              const landingSurface = stackSurfaceYRef.current
              const modulatedTargetY = landingSurface - modulatedBounds.maxY
              const hoverY = modulatedTargetY - HOVER_VERTICAL_OFFSET

              setHoverStone((prev) => {
                if (!prev) return prev
                return {
                  ...prev,
                  params: modulatedParams,
                  vertices: modulatedVertices,
                  bounds: modulatedBounds,
                  targetY: modulatedTargetY,
                  y: hoverY,
                }
              })

              hoverModulationTimerRef.current = now
            }
          }

          const activePlacingStone = placingStoneRef.current

          if (currentPhase === "placing" && activePlacingStone) {
            const elapsed = now - dropStartTimeRef.current
            const duration = DEFAULT_CONFIG.placementDuration / currentTimeScale
            const progress = Math.min(elapsed / duration, 1)
            setPlacementProgress(progress)

            // Easing function (ease-in-out)
            const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2

            // Update placing stone position
            const currentY =
              activePlacingStone.startY + (activePlacingStone.targetY - activePlacingStone.startY) * eased
            setPlacingStone((prev) => (prev ? { ...prev, y: currentY } : prev))

            // When placement complete, add to stable stack
            if (progress >= 1) {
              finalizePlacement()
            }
          }
        }

        animationFrameRef.current = requestAnimationFrame(gameLoop)
      }

      animationFrameRef.current = requestAnimationFrame(gameLoop)

      prepopulateStack()
      prepareHoverStone()

      const audioManager = audioRef.current

      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current)
        }
        clearDropTimer()
        audioManager?.dispose()
        // document.removeEventListener("click", initAudio)
        // document.removeEventListener("keydown", initAudio)
      }
    } catch (error) {
      console.error("[v0] Game container initialization failed:", error)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const beginPlacementFromHover = useCallback(() => {
    const hover = hoverStoneRef.current
    if (!hover) {
      console.warn("[v0] Attempted to drop without a hover stone prepared")
      return
    }

    setCanDecide(false)
    decisionDeadlineRef.current = null

    setHoverStone(null)

    stoneSequenceRef.current += 1
    console.log(
      `[v0] Dropping stone #${stoneSequenceRef.current} from hover at (${hover.x}, ${hover.y}) -> target ${hover.targetY}`,
    )

    const placing: PlacingStone = {
      ...hover,
      startY: hover.y,
      y: hover.y,
    }

    setPlacingStone(placing)

    dropStartTimeRef.current = Date.now()
    setDropStartTime(dropStartTimeRef.current)
    setPhase("placing")
    setPlacementProgress(0)

    const cadence = DEFAULT_CONFIG.dropCadence / timeScale
    const scheduledAt = nextDropAtRef.current ?? dropStartTimeRef.current
    nextDropAtRef.current = scheduledAt + cadence

    const { debugMode: currentDebugMode } = useGameState.getState()
    if (currentDebugMode) {
      const priceChange = ((hover.candle.close - hover.candle.open) / hover.candle.open) * 100
      console.log(
        `[v0] Spawn #${stoneSequenceRef.current} - simulated price ${priceChange > 0 ? "+" : ""}${priceChange.toFixed(1)}%`,
      )
    }
  }, [setCanDecide, setDropStartTime, setPhase, setPlacementProgress, setPlacingStone, setHoverStone, timeScale])

  const armNextDrop = useCallback(() => {
    if (phase !== "hovering") return
    if (!hoverStoneRef.current) return
    if (dropTimerRef.current) return

    const cadence = DEFAULT_CONFIG.dropCadence / timeScale
    const now = Date.now()

    if (nextDropAtRef.current === null) {
      nextDropAtRef.current = now + cadence
    } else if (nextDropAtRef.current < now) {
      while (nextDropAtRef.current < now) {
        nextDropAtRef.current += cadence
      }
    }

    const triggerAt = nextDropAtRef.current ?? now
    const delay = Math.max(0, triggerAt - now)

    console.log(`[v0] Arming next drop in ${delay}ms (scheduled at ${new Date(triggerAt).toISOString()})`)

    dropTimerRef.current = setTimeout(() => {
      dropTimerRef.current = null
      beginPlacementFromHover()
    }, delay)
  }, [phase, timeScale, beginPlacementFromHover])

  const prepareHoverStone = useCallback(() => {
    const landingSurface = stackSurfaceYRef.current

    const candle = candleSourceRef.current.next()
    const { params: stoneParams, color, features } = computeVisualFromCandle(candle)
    const vertices = normalizePoints(generateStoneShape(stoneParams))
    const bounds = computeBounds(vertices)

    const targetY = landingSurface - bounds.maxY
    const hoverY = targetY - HOVER_VERTICAL_OFFSET
    const spawnedAt = Date.now()

    const hover: HoverStone = {
      vertices,
      x: CANVAS_WIDTH / 2,
      y: hoverY,
      color,
      targetY,
      params: stoneParams,
      candle,
      bounds,
      baseParams: stoneParams,
      spawnedAt,
      stance: DEFAULT_STANCE,
      features,
    }

    const cadence = DEFAULT_CONFIG.dropCadence / timeScale
    const decisionDuration = cadence * DEFAULT_CONFIG.decisionWindow

    decisionDurationRef.current = decisionDuration
    decisionDeadlineRef.current = spawnedAt + decisionDuration
    hoverModulationTimerRef.current = spawnedAt

    setHoverStone(hover)
    setPhase("hovering")
    setDropStartTime(null)
    setPlacementProgress(0)
    setCanDecide(true)
    setHoverStance("long")

    console.log(
      `[v0] Prepared hover stone #${stoneSequenceRef.current + 1} at (${hover.x}, ${hover.y}) targeting ${targetY}`,
    )

    syncTowerOffset()
    armNextDrop()
  }, [
    computeBounds,
    computeVisualFromCandle,
    setCanDecide,
    setDropStartTime,
    setHoverStance,
    setHoverStone,
    setPhase,
    setPlacementProgress,
    syncTowerOffset,
    armNextDrop,
    timeScale,
  ])

  useEffect(() => {
    if (phase === "hovering") {
      armNextDrop()
    } else {
      clearDropTimer()
    }
  }, [phase, armNextDrop, clearDropTimer])

  useEffect(() => {
    if (phase !== "hovering") return
    if (!hoverStoneRef.current) return
    const cadence = DEFAULT_CONFIG.dropCadence / timeScale
    nextDropAtRef.current = Date.now() + cadence
    clearDropTimer()
    armNextDrop()
  }, [timeScale, phase, armNextDrop, clearDropTimer])

  useGestureControls(containerRef, { onFlip: handleFlip, onDiscard: handleDiscard })

  const finalizePlacement = () => {
    const stoneToFinalize = placingStoneRef.current
    if (!stoneToFinalize || !engineRef.current) {
      console.log("[v0] Cannot finalize placement - missing stone or engine")
      return
    }

    if (stoneToFinalize.stance === "flat") {
      console.log("[v0] Finalizing discard - stone will not enter stack")
      setPlacingStone(null)
      setPhase("stable")
      prepareHoverStone()
      return
    }

    // Add stone to physics engine but keep physics disabled
    const finalY = stoneToFinalize.targetY

    engineRef.current.addStone(
      stoneToFinalize.vertices,
      stoneToFinalize.params,
      stoneToFinalize.x,
      finalY,
      stoneToFinalize.color,
    )

    stackTopYRef.current = finalY + stoneToFinalize.bounds.minY
    stackSurfaceYRef.current = stackTopYRef.current - STACK_GAP

    setPlacingStone(null)
    setPhase("stable")

    const { stonesPlaced: currentStonesPlaced } = useGameState.getState()
    incrementStonesPlaced()

    syncTowerOffset()

    console.log(`[v0] Stone finalized - tower height: ${currentStonesPlaced + 1}`)

    prepareHoverStone()
  }

  const triggerLossEvent = (features: Features, stance: Stance, loseCount: number) => {
    if (!engineRef.current) return

    if (loseCount <= 0) {
      console.log("[v0] Loss check: no stones to remove")
      return
    }

    setPhase("loss")
    setPhysicsActive(true)
    setCanDecide(false)
    decisionDeadlineRef.current = null

    const allStones = engineRef.current.getStones()
    const stonesToRemove = Math.min(loseCount, allStones.length)

    console.log(`[v0] Loss event - removing ${stonesToRemove} stones due to misalignment`)

    for (let i = 0; i < stonesToRemove && i < allStones.length; i++) {
      const stone = allStones[i]
      stone.body.force = { x: (Math.random() - 0.5) * 0.1, y: -0.2 }
    }

    audioRef.current.playTumble()

    setTimeout(() => {
      setPhysicsActive(false)
      setPhase("stable")
      console.log("[v0] Loss event complete - returning to stable mode")
      recalcStackFromPhysics()
      if (!hoverStoneRef.current && !placingStoneRef.current) {
        prepareHoverStone()
      }
    }, 3000)
  }

  const decisionProgress = (() => {
    if (!hoverStone) return 0
    const deadline = decisionDeadlineRef.current
    const duration = decisionDurationRef.current
    if (!deadline || duration <= 0) return 0
    return clamp((deadline - Date.now()) / duration, 0, 1)
  })()

  return (
    <div ref={containerRef} className="relative touch-none">
      <GameCanvas
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        engineRef={engineRef}
        renderTrigger={renderTrigger}
        hoverStone={hoverStone}
        hoverCanDecide={canDecide}
        decisionProgress={decisionProgress}
        placingStone={placingStone}
      />
      {debugMode && (
        <div className="absolute top-4 right-4 bg-black/80 text-white px-3 py-2 rounded text-sm font-mono">
          <div>Debug Mode: ON</div>
          <div>TimeScale: {timeScale}x</div>
          <div>Stones: {stonesPlaced}</div>
          <div>Alignment: {marketAlignment.toFixed(2)}</div>
          <div>Phase: {phase}</div>
          <div>Test Counter: {testCounter}</div>
        </div>
      )}
    </div>
  )
}
