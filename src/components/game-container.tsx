"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { GameCanvas } from "./game-canvas"
import { PhysicsEngine } from "@/lib/game/physics-engine"
import { createCandleSource } from "@/lib/data/candle-source-factory"
import {
  makeTrapezoidFromAngles,
  rotatePoint,
  rotatePoints as rotatePointsImmediate,
  type Point,
  type TrapezoidMetrics,
} from "@/lib/game/stone-generator"
import { DEFAULT_CONFIG } from "@/lib/config"
import { useGameState, type Stance } from "@/lib/game/game-state"
import { useAccountState } from "@/lib/game/account-state"
import { initFeatureState, computeFeatures, type Features } from "@/lib/data/features"
import { featuresToStoneVisual, type StoneGeometryInput } from "@/lib/game/feature-mapper"
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
const STONE_CANDLE_WINDOW = 30
const CANDLE_INTERVAL_MS = 1000
const HOVER_TRANSITION_DURATION_MS = 650
const MAX_DIRECTIONAL_OFFSET = Math.PI / 6 // 30 degrees
const MAX_TOWER_TILT = Math.PI / 4 // 45 degrees

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const clampDirectionalOffset = (offset: number) => clamp(offset, -MAX_DIRECTIONAL_OFFSET, MAX_DIRECTIONAL_OFFSET)
const lerpScalar = (a: number, b: number, t: number) => a + (b - a) * t
const lerpAngle = (from: number, to: number, t: number) => {
  let diff = to - from
  while (diff > Math.PI) diff -= Math.PI * 2
  while (diff < -Math.PI) diff += Math.PI * 2
  return from + diff * t
}
const normalizeAngle = (angle: number) => {
  let result = angle % (Math.PI * 2)
  if (result > Math.PI) result -= Math.PI * 2
  if (result < -Math.PI) result += Math.PI * 2
  return result
}
const clampTowerTilt = (angle: number) => clamp(normalizeAngle(angle), -MAX_TOWER_TILT, MAX_TOWER_TILT)
const resolveBaseOrientation = (prevTopAngle: number, desiredOffset: number) => {
  const clampedOffset = clampDirectionalOffset(desiredOffset)
  const baseOrientation = clampTowerTilt(prevTopAngle + clampedOffset)
  const appliedOffset = normalizeAngle(baseOrientation - prevTopAngle)
  return { baseOrientation, appliedOffset }
}
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const hexToRgb = (hex: string): [number, number, number] => {
  const normalized = hex.replace("#", "")
  const value = normalized.length === 6 ? normalized : normalized.padEnd(6, "0")
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return [r, g, b]
}
const rgbToHex = (r: number, g: number, b: number): string =>
  `#${Math.round(r).toString(16).padStart(2, "0")}${Math.round(g).toString(16).padStart(2, "0")}${Math.round(b).toString(16).padStart(2, "0")}`
const lerpColor = (from: string, to: string, t: number): string => {
  const [r1, g1, b1] = hexToRgb(from)
  const [r2, g2, b2] = hexToRgb(to)
  return rgbToHex(lerpScalar(r1, r2, t), lerpScalar(g1, g2, t), lerpScalar(b1, b2, t))
}

type StoneBounds = {
  minY: number
  maxY: number
}

const orientVertices = (local: Point[], angle: number): Point[] => rotatePointsImmediate(local, angle)

const deriveWorldMetrics = (metrics: TrapezoidMetrics, angle: number): StoneWorldMetrics => ({
  bottomMid: rotatePoint(metrics.bottomMidLocal, angle),
  topMid: rotatePoint(metrics.topMidLocal, angle),
  bottomAngle: metrics.bottomAngleLocal + angle,
  topAngle: metrics.topAngleLocal + angle,
  bottomWidth: metrics.bottomWidth,
  topWidth: metrics.topWidth,
  heightLocal: metrics.heightLocal,
})

type StoneWorldMetrics = {
  bottomMid: Point
  topMid: Point
  bottomAngle: number
  topAngle: number
  bottomWidth: number
  topWidth: number
  heightLocal: number
}

type HoverStone = {
  localVertices: Point[]
  vertices: Point[]
  metricsLocal: TrapezoidMetrics
  metricsWorld: StoneWorldMetrics
  geometry: StoneGeometryInput
  strength: number
  baseOrientation: number
  updatesApplied: number
  maxUpdates: number
  x: number
  y: number
  color: string
  targetY: number
  params: StoneParams
  candle: Candle
  bounds: StoneBounds
  spawnedAt: number
  stance: Stance
  features: Features

  angle: number
  angleLong: number
  angleShort: number
  prevTopAngle: number
  highlightAngle: number
  facetStrength: number
}

type PlacingStone = HoverStone & {
  startY: number
}

type HoverTransitionSnapshot = {
  geometry: StoneGeometryInput
  strength: number
  baseOrientation: number
  color: string
  facetStrength: number
  angle: number
  angleLong: number
  angleShort: number
  y: number
  prevTopAngle: number
  stance: Stance
}

type HoverTransitionTarget = {
  geometry: StoneGeometryInput
  strength: number
  color: string
  facetStrength: number
  params: StoneParams
  candle: Candle
  features: Features
  directionalOffset: number
}

type HoverTransition = {
  from: HoverTransitionSnapshot
  target: HoverTransitionTarget
  landingSurface: number
  elapsed: number
  duration: number
}

const DEFAULT_STANCE: Stance = "long"

export function GameContainer() {
  const engineRef = useRef<PhysicsEngine | null>(null)
  const candleSourceRef = useRef(createCandleSource())
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
  const lastTopAngleRef = useRef<number>(0)
  const hoverTransitionRef = useRef<HoverTransition | null>(null)

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
    setLatestFeatures,
    setDecisionProgress,
    setDataProvider,
  } = useGameState()

  const isDecisionActive = useCallback(() => {
    return useGameState.getState().phase === "hovering"
  }, [])

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

  const cloneHoverSnapshot = useCallback((stone: HoverStone): HoverTransitionSnapshot => {
    return {
      geometry: { ...stone.geometry },
      strength: stone.strength,
      baseOrientation: stone.baseOrientation,
      color: stone.color,
      facetStrength: stone.facetStrength,
      angle: stone.angle,
      angleLong: stone.angleLong,
      angleShort: stone.angleShort,
      y: stone.y,
      prevTopAngle: stone.prevTopAngle,
      stance: stone.stance,
    }
  }, [])

  const consumeNextCandleVisual = useCallback(() => {
    const candle = candleSourceRef.current.next()
    const provider = candleSourceRef.current.getSource()
    setDataProvider(provider)
    const { features, state } = computeFeatures(featureStateRef.current, candle)
    featureStateRef.current = state
    lastFeaturesRef.current = features
    const { params, color, facetStrength, geometry, strength } = featuresToStoneVisual(features, candle.timestamp)
    return { candle, params, color, features, facetStrength, geometry, strength }
  }, [setDataProvider])

  const consumeCandleWindow = useCallback(
    (count: number) => {
      let visual: ReturnType<typeof consumeNextCandleVisual> | null = null
      for (let i = 0; i < count; i++) {
        visual = consumeNextCandleVisual()
      }
      if (!visual) {
        throw new Error("Failed to consume candle window")
      }
      return visual
    },
    [consumeNextCandleVisual],
  )

  const handleFlip = useCallback(() => {
    const hover = hoverStoneRef.current
    if (!hover) return
    if (!isDecisionActive()) return

    const nextStance: Stance = hover.stance === "short" ? "long" : "short"
    const nextAngle = nextStance === "short" ? hover.angleShort : hover.angleLong
    const rotated = orientVertices(hover.localVertices, nextAngle)
    const metricsWorld = deriveWorldMetrics(hover.metricsLocal, nextAngle)
    const bounds = computeBounds(rotated)
    const landingSurface = stackSurfaceYRef.current
    const targetY = landingSurface - bounds.maxY
    const hoverY = targetY - HOVER_VERTICAL_OFFSET

    const updated: HoverStone = {
      ...hover,
      stance: nextStance,
      angle: nextAngle,
      angleLong: hover.angleLong,
      angleShort: hover.angleShort,
      vertices: rotated,
      metricsWorld,
      bounds,
      targetY,
      y: hoverY,
      highlightAngle: metricsWorld.topAngle,
    }

    setHoverStone(updated)
    setHoverStance(nextStance)

    if (hoverTransitionRef.current) {
      hoverTransitionRef.current = {
        ...hoverTransitionRef.current,
        from: cloneHoverSnapshot(updated),
        elapsed: 0,
      }
    }
  }, [cloneHoverSnapshot, computeBounds, isDecisionActive, setHoverStance, setHoverStone])

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
    setDecisionProgress(0.2)
  }, [isDecisionActive, setDecisionProgress, setHoverStance, setHoverStone])

  const recalcStackFromPhysics = useCallback(() => {
    const engine = engineRef.current
    if (!engine) return

    const stones = engine.getStones()
    if (stones.length === 0) {
      stackTopYRef.current = GROUND_Y
      stackSurfaceYRef.current = GROUND_Y
      lastTopAngleRef.current = 0
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
    lastTopAngleRef.current = 0
    syncTowerOffset()
  }, [syncTowerOffset])

  const prepopulateStack = useCallback(() => {
    const engine = engineRef.current
    if (!engine) return

    const accountStore = useAccountState.getState()
    accountStore.reset()

    let surface = GROUND_Y
    let top = surface
    let prevTopAngle = 0

    for (let i = 0; i < INITIAL_STACK_COUNT; i++) {
      const visual = consumeCandleWindow(STONE_CANDLE_WINDOW)
      const trapezoid = makeTrapezoidFromAngles({
        widthBottom: visual.geometry.widthBottom,
        height: visual.geometry.height,
        taper: visual.geometry.taper,
        round: visual.geometry.round,
        betaGlobal: prevTopAngle + visual.geometry.beta,
        tauGlobal: prevTopAngle + visual.geometry.tau,
        prevTopAngleGlobal: prevTopAngle,
        segments: 5,
      })

      const localVertices = trapezoid.local
      const { baseOrientation } = resolveBaseOrientation(prevTopAngle, visual.geometry.beta)
      const angleLong = baseOrientation - trapezoid.metrics.bottomAngleLocal
      const vertices = orientVertices(localVertices, angleLong)
      const metricsWorld = deriveWorldMetrics(trapezoid.metrics, angleLong)
      const highlightAngle = clampTowerTilt(metricsWorld.topAngle)
      const bounds = computeBounds(vertices)

      const targetY = surface - bounds.maxY

      engine.addStone(vertices, visual.params, CANVAS_WIDTH / 2, targetY, visual.color, highlightAngle)

      top = targetY + bounds.minY
      surface = top - STACK_GAP
      prevTopAngle = highlightAngle

      stoneSequenceRef.current += 1
    }

    stackTopYRef.current = top
    stackSurfaceYRef.current = surface
    lastTopAngleRef.current = prevTopAngle

    useGameState.setState({ stonesPlaced: INITIAL_STACK_COUNT, phase: "stable" })
    syncTowerOffset()
  }, [computeBounds, consumeCandleWindow, syncTowerOffset])

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
          } = useGameState.getState()

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

          const latestFeatures = lastFeaturesRef.current
          if (currentPhase !== "loss" && currentStonesPlaced > 0 && latestFeatures) {
            const pendingStance = placingStoneRef.current?.stance ?? hoverStoneRef.current?.stance ?? DEFAULT_STANCE
            const loseCount = stonesToLose(latestFeatures, pendingStance, currentStonesPlaced)
            if (loseCount > 0) {
              const momentumMag = Math.abs(latestFeatures.momentum)
              const orderMag = Math.abs(latestFeatures.orderImbalance)
              const volatilityMag = Math.max(0, latestFeatures.volatility)
              const featureSeverity = clamp(momentumMag * 0.6 + orderMag * 0.3 + volatilityMag * 0.1, 0, 1)
              const stackSeverity = clamp(loseCount / Math.max(currentStonesPlaced, 1), 0, 1)
              const severity = clamp(featureSeverity * 0.75 + stackSeverity * 0.25, 0, 1)
              triggerLossEvent(pendingStance, loseCount, severity)
            }
          }

          const activeHoverStone = hoverStoneRef.current

          if (currentPhase === "hovering" && activeHoverStone) {
            const candleInterval = CANDLE_INTERVAL_MS / Math.max(0.1, currentTimeScale)
            if (
              now - hoverModulationTimerRef.current >= candleInterval &&
              activeHoverStone.updatesApplied < activeHoverStone.maxUpdates
            ) {
              hoverModulationTimerRef.current = now

              const visual = consumeNextCandleVisual()
              const landingSurface = stackSurfaceYRef.current
              const desiredOffset = clampDirectionalOffset(visual.geometry.beta)
              const stanceForAccount = activeHoverStone.stance
              useAccountState.getState().registerCandle(visual.candle, stanceForAccount)

              hoverTransitionRef.current = {
                from: cloneHoverSnapshot(activeHoverStone),
                target: {
                  geometry: visual.geometry,
                  strength: visual.strength,
                  color: visual.color,
                  facetStrength: visual.facetStrength,
                  params: visual.params,
                  candle: visual.candle,
                  features: visual.features,
                  directionalOffset: desiredOffset,
                },
                landingSurface,
                elapsed: 0,
                duration: HOVER_TRANSITION_DURATION_MS,
              }

              setHoverStone((prev) =>
                prev
                  ? {
                      ...prev,
                      params: visual.params,
                      candle: visual.candle,
                      features: visual.features,
                      updatesApplied: Math.min(prev.updatesApplied + 1, prev.maxUpdates),
                    }
                  : prev,
              )

              setLatestFeatures(visual.features)
            }
          }

          const transition = hoverTransitionRef.current
          const hoverForTransition = hoverStoneRef.current

          if (currentPhase === "hovering" && transition && hoverForTransition) {
            transition.elapsed = Math.min(transition.elapsed + deltaTime, transition.duration)
            const progress =
              transition.duration <= 0 ? 1 : Math.max(0, Math.min(1, transition.elapsed / transition.duration))
            const eased = easeInOut(progress)
            const { from, target, landingSurface } = transition

            const geometry: StoneGeometryInput = {
              widthBottom: lerpScalar(from.geometry.widthBottom, target.geometry.widthBottom, eased),
              height: lerpScalar(from.geometry.height, target.geometry.height, eased),
              taper: lerpScalar(from.geometry.taper, target.geometry.taper, eased),
              round: lerpScalar(from.geometry.round, target.geometry.round, eased),
              beta: lerpAngle(from.geometry.beta, target.geometry.beta, eased),
              tau: lerpAngle(from.geometry.tau, target.geometry.tau, eased),
            }

            const trapezoid = makeTrapezoidFromAngles({
              widthBottom: geometry.widthBottom,
              height: geometry.height,
              taper: geometry.taper,
              round: geometry.round,
              betaGlobal: from.prevTopAngle + geometry.beta,
              tauGlobal: from.prevTopAngle + geometry.tau,
              prevTopAngleGlobal: from.prevTopAngle,
              segments: 5,
            })

            const fromDirectional = normalizeAngle(from.baseOrientation - from.prevTopAngle)
            const targetOffset = clampDirectionalOffset(target.directionalOffset)
            const blendedOffset = lerpAngle(fromDirectional, targetOffset, eased)
            const { baseOrientation: targetBaseOrientation } = resolveBaseOrientation(from.prevTopAngle, blendedOffset)
            const angleLongTarget = targetBaseOrientation - trapezoid.metrics.bottomAngleLocal
            const angleLong = lerpAngle(from.angleLong, angleLongTarget, eased)
            const angleShortTarget = angleLongTarget + Math.PI
            const angleShort = lerpAngle(from.angleShort, angleShortTarget, eased)
            const stance = hoverForTransition.stance
            const startAngle = stance === "short" ? from.angleShort : from.angleLong
            const desiredAngle = stance === "short" ? angleShortTarget : angleLongTarget
            const angle = lerpAngle(startAngle, desiredAngle, eased)

            const localVerts = trapezoid.local
            const vertices = orientVertices(localVerts, angle)
            const metricsWorld = deriveWorldMetrics(trapezoid.metrics, angle)
            const highlightAngle = clampTowerTilt(metricsWorld.topAngle)
            const metricsWorldAdjusted = { ...metricsWorld, topAngle: highlightAngle }
            const bounds = computeBounds(vertices)
            const targetY = landingSurface - bounds.maxY
            const hoverY = targetY - HOVER_VERTICAL_OFFSET
            const y = lerpScalar(from.y, hoverY, eased)

            const strength = lerpScalar(from.strength, target.strength, eased)
            const color = lerpColor(from.color, target.color, eased)
            const facetStrength = lerpScalar(from.facetStrength, target.facetStrength, eased)
            const baseOrientation = clampTowerTilt(angleLong + trapezoid.metrics.bottomAngleLocal)

            setHoverStone((prev) => {
              if (!prev) return prev
              return {
                ...prev,
                localVertices: localVerts,
                vertices,
                metricsLocal: trapezoid.metrics,
                metricsWorld: metricsWorldAdjusted,
                geometry,
                strength,
                baseOrientation,
                color,
                targetY,
                y,
                params: target.params,
                candle: target.candle,
                bounds,
                features: target.features,
                angle,
                angleLong,
                angleShort,
                highlightAngle,
                facetStrength,
              }
            })

            if (progress >= 1) {
              hoverTransitionRef.current = null
            }
          } else if (!hoverForTransition) {
            hoverTransitionRef.current = null
          } else if (transition && currentPhase !== "hovering") {
            hoverTransitionRef.current = null
          }

          const activePlacingStone = placingStoneRef.current

          if (currentPhase === "placing" && activePlacingStone) {
            const elapsed = now - dropStartTimeRef.current
            const duration = DEFAULT_CONFIG.placementDuration / currentTimeScale
            const progress = Math.min(elapsed / duration, 1)
            setPlacementProgress(progress)

            // Easing function (ease-in-out)
            const eased = easeInOut(progress)

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
    setDecisionProgress(0)
    decisionDeadlineRef.current = null

    setHoverStone(null)
    hoverTransitionRef.current = null

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
  }, [setCanDecide, setDecisionProgress, setDropStartTime, setPhase, setPlacementProgress, setPlacingStone, setHoverStone, timeScale])

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
    hoverTransitionRef.current = null

    const visual = consumeNextCandleVisual()
    const prevTopAngle = lastTopAngleRef.current
    const accountStore = useAccountState.getState()
    if (accountStore.lastPrice === null) {
      accountStore.seedPrice(visual.candle.open)
    }
    const stanceForAccount = useGameState.getState().hoverStance
    accountStore.registerCandle(visual.candle, stanceForAccount)

    const trapezoid = makeTrapezoidFromAngles({
      widthBottom: visual.geometry.widthBottom,
      height: visual.geometry.height,
      taper: visual.geometry.taper,
      round: visual.geometry.round,
      betaGlobal: prevTopAngle + visual.geometry.beta,
      tauGlobal: prevTopAngle + visual.geometry.tau,
      prevTopAngleGlobal: prevTopAngle,
      segments: 5,
    })

    const localVertices = trapezoid.local
    const { baseOrientation } = resolveBaseOrientation(prevTopAngle, visual.geometry.beta)
    const angleLong = baseOrientation - trapezoid.metrics.bottomAngleLocal
    const angleShort = angleLong + Math.PI
    const angle = angleLong
    const vertices = orientVertices(localVertices, angle)
    const metricsWorldRaw = deriveWorldMetrics(trapezoid.metrics, angle)
    const highlightAngle = clampTowerTilt(metricsWorldRaw.topAngle)
    const metricsWorld = { ...metricsWorldRaw, topAngle: highlightAngle }
    const bounds = computeBounds(vertices)

    const targetY = landingSurface - bounds.maxY
    const hoverY = targetY - HOVER_VERTICAL_OFFSET
    const spawnedAt = Date.now()

    const hover: HoverStone = {
      localVertices,
      vertices,
      metricsLocal: trapezoid.metrics,
      metricsWorld,
      geometry: visual.geometry,
      strength: visual.strength,
      baseOrientation,
      updatesApplied: 1,
      maxUpdates: STONE_CANDLE_WINDOW,
      x: CANVAS_WIDTH / 2,
      y: hoverY,
      color: visual.color,
      targetY,
      params: visual.params,
      candle: visual.candle,
      bounds,
      spawnedAt,
      stance: DEFAULT_STANCE,
      features: visual.features,
      angle,
      angleLong,
      angleShort,
      prevTopAngle,
      highlightAngle,
      facetStrength: visual.facetStrength,
    }

    const cadence = DEFAULT_CONFIG.dropCadence / timeScale
    const decisionDuration = cadence * DEFAULT_CONFIG.decisionWindow

    decisionDurationRef.current = decisionDuration
    decisionDeadlineRef.current = spawnedAt + decisionDuration
    hoverModulationTimerRef.current = spawnedAt

    setLatestFeatures(visual.features)
    setHoverStone(hover)
    setPhase("hovering")
    setDropStartTime(null)
    setPlacementProgress(0)
    setCanDecide(true)
    setHoverStance(DEFAULT_STANCE)
    setDecisionProgress(1)

    console.log(
      `[v0] Prepared hover stone #${stoneSequenceRef.current + 1} at (${hover.x}, ${hover.y}) targeting ${targetY}`,
    )

    syncTowerOffset()
    armNextDrop()
  }, [
    computeBounds,
    consumeNextCandleVisual,
    setCanDecide,
    setDecisionProgress,
    setLatestFeatures,
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
      setDecisionProgress(0)
      prepareHoverStone()
      return
    }

    // Add stone to physics engine but keep physics disabled
    const finalY = stoneToFinalize.targetY

    const finalizedHighlightAngle = clampTowerTilt(stoneToFinalize.highlightAngle)
    engineRef.current.addStone(
      stoneToFinalize.vertices,
      stoneToFinalize.params,
      stoneToFinalize.x,
      finalY,
      stoneToFinalize.color,
      finalizedHighlightAngle,
    )

    stackTopYRef.current = finalY + stoneToFinalize.bounds.minY
    stackSurfaceYRef.current = stackTopYRef.current - STACK_GAP
    lastTopAngleRef.current = finalizedHighlightAngle

    setPlacingStone(null)
    setPhase("stable")

    const { stonesPlaced: currentStonesPlaced } = useGameState.getState()
    incrementStonesPlaced()

    syncTowerOffset()

    console.log(`[v0] Stone finalized - tower height: ${currentStonesPlaced + 1}`)

    prepareHoverStone()
  }

  const triggerLossEvent = (stance: Stance, loseCount: number, severity: number) => {
    if (!engineRef.current) return

    if (loseCount <= 0) {
      console.log("[v0] Loss check: no stones to remove")
      return
    }

    hoverTransitionRef.current = null
    setHoverStone(null)
    setPlacingStone(null)

    setPhase("loss")
    setPhysicsActive(true)
    setCanDecide(false)
    setDecisionProgress(0)
    decisionDeadlineRef.current = null

    const allStones = engineRef.current.getStones()
    const stonesToRemove = Math.min(loseCount, allStones.length)

    const penalty = useAccountState.getState().applyLossPenalty(stonesToRemove, severity)
    console.log(
      `[v0] Loss event - removing ${stonesToRemove} stones due to misalignment (severity: ${severity.toFixed(2)}, penalty: ${penalty.toFixed(2)})`,
    )

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

  useEffect(() => {
    setDecisionProgress(decisionProgress)
  }, [decisionProgress, setDecisionProgress])


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
