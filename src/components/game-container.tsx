"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Matter from "matter-js"
import { GameCanvas } from "./game-canvas"
import { useGestureControls } from "@/hooks/use-gesture-controls"
import { PhysicsEngine, type Stone } from "@/lib/game/physics-engine"
import {
  makeTrapezoidFromAngles,
  rotatePoint,
  rotatePoints as rotatePointsImmediate,
  type AnchoredTrapezoid,
  type Point,
  type TrapezoidMetrics,
} from "@/lib/game/stone-generator"
import { DEFAULT_CONFIG } from "@/lib/config"
import { useGameState, type Stance } from "@/lib/game/game-state"
import { useAccountState } from "@/lib/game/account-state"
import { initFeatureState, computeFeatures, type Features } from "@/lib/data/features"
import { featuresToStoneVisual, type StoneGeometryInput } from "@/lib/game/feature-mapper"
import { computeRawAlignment, updateAlignment, type AlignmentSample } from "@/lib/game/alignment"
import type { Candle, StoneParams } from "@/lib/types"
import { createCandleSource } from "@/lib/data/candle-source-factory"
import { stonesToLoseFromDrawdown, calculateLossSeverity } from "@/lib/game/loss"

const CANVAS_WIDTH = 800
const CANVAS_HEIGHT = 600
const GROUND_Y = CANVAS_HEIGHT - 50
const HOVER_VERTICAL_OFFSET = 120
const INITIAL_STACK_COUNT = 10
const DESIRED_TOP_SCREEN_Y = 240
const STONE_CANDLE_WINDOW = 30
const PLACEMENT_DURATION_MS = DEFAULT_CONFIG.placementDuration
const TUMBLE_DURATION_MS = 3000 // 3 seconds for loss event physics animation
const SAFE_WINDOW_AFTER_PLACEMENT_MS = 1500 // 1.5s buffer after stone seats
const SAFE_WINDOW_BEFORE_DROP_MS = 1500 // 1.5s buffer before next drop (total 3s buffer)

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const normalizeAngle = (angle: number): number => {
  let result = angle % (Math.PI * 2)
  if (result > Math.PI) result -= Math.PI * 2
  if (result < -Math.PI) result += Math.PI * 2
  return result
}

const clampDirectionalOffset = (offset: number) => clamp(offset, -Math.PI / 6, Math.PI / 6)

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

const normalFromAngle = (angle: number): Point => ({
  x: Math.sin(angle),
  y: -Math.cos(angle),
})

type StackOrientation = {
  angle: number
  normal: Point
  supportPoint: Point
}

const DEFAULT_STACK_ORIENTATION: StackOrientation = {
  angle: 0,
  normal: normalFromAngle(0),
  supportPoint: { x: CANVAS_WIDTH / 2, y: GROUND_Y },
}

type StoneBounds = {
  minY: number
  maxY: number
}

type HoverStone = {
  localVertices: Point[]
  vertices: Point[]
  metricsLocal: TrapezoidMetrics
  anchored: AnchoredTrapezoid
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
  angleFlat: number
  highlightAngle: number
  facetStrength: number
  prevTopAngle: number
}

type PlacingStone = HoverStone & {
  startY: number
  settleTargetAngle: number
}

type StoneWorldMetrics = {
  bottomMid: Point
  topMid: Point
  bottomAngle: number
  topAngle: number
  bottomWidth: number
  topWidth: number
  heightLocal: number
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

const computeBounds = (vertices: Point[]): StoneBounds => {
  let minY = Infinity
  let maxY = -Infinity
  for (const { y } of vertices) {
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { minY, maxY }
}

const computeBodyTop = (stone: Stone): number => {
  let top = Infinity
  for (const vertex of stone.body.vertices ?? []) {
    if (vertex.y < top) top = vertex.y
  }
  return top
}

const computeAnchoredOffset = (
  anchor: AnchoredTrapezoid,
  body: Matter.Body,
  cosBody: number,
  sinBody: number,
  cosAnchor: number,
  sinAnchor: number,
  point: Point,
): Point => {
  // Note: anchor coordinates use y-up (mathematical), but canvas uses y-down (screen)
  // Transform: flip Y, negate angle
  // Standard rotation matrix for angle θ: [cos(θ) -sin(θ); sin(θ) cos(θ)]
  // For angle -θ (flipped): [cos(θ) sin(θ); -sin(θ) cos(θ)]
  const anchorY = -point.y
  const rotatedX = point.x * cosAnchor + anchorY * sinAnchor + anchor.transform.translation.x
  const rotatedY = -point.x * sinAnchor + anchorY * cosAnchor + anchor.transform.translation.y
  return {
    x: rotatedX * cosBody - rotatedY * sinBody,
    y: rotatedX * sinBody + rotatedY * cosBody,
  }
}

const computeAnchoredWorldPoint = (
  anchor: AnchoredTrapezoid,
  body: Matter.Body,
  point: Point,
): Point => {
  const cosBody = Math.cos(body.angle ?? 0)
  const sinBody = Math.sin(body.angle ?? 0)
  const anchorRotation = anchor.transform.rotation ?? 0
  const cosAnchor = Math.cos(anchorRotation)
  const sinAnchor = Math.sin(anchorRotation)
  const offset = computeAnchoredOffset(anchor, body, cosBody, sinBody, cosAnchor, sinAnchor, point)
  return {
    x: body.position.x + offset.x,
    y: body.position.y + offset.y,
  }
}

const solvePlacement = (
  anchor: AnchoredTrapezoid,
  bodyAngle: number,
  support: StackOrientation,
): { position: Point } => {
  const anchorRotation = anchor.transform.rotation ?? 0
  const cosBody = Math.cos(bodyAngle)
  const sinBody = Math.sin(bodyAngle)
  const cosAnchor = Math.cos(anchorRotation)
  const sinAnchor = Math.sin(anchorRotation)
  const offset = computeAnchoredOffset(anchor, {} as unknown as Matter.Body, cosBody, sinBody, cosAnchor, sinAnchor, {
    x: 0,
    y: 0,
  })
  return {
    position: {
      x: support.supportPoint.x - offset.x,
      y: support.supportPoint.y - offset.y,
    },
  }
}

const deriveSupportFrame = (stone: Stone | null): StackOrientation => {
  if (!stone || !stone.anchor) {
    return DEFAULT_STACK_ORIENTATION
  }
  const anchor = stone.anchor
  // Use the stored topAngle if available to avoid cumulative drift
  // This is the exact angle we set when placing the stone, not recomputed
  const angle = typeof stone.topAngle === 'number'
    ? stone.topAngle
    : normalizeAngle((stone.body.angle ?? 0) + (-(anchor.transform.rotation ?? 0)) + (-(anchor.metrics.topAngle ?? 0)))

  const topMid =
    anchor.metrics.topMid ??
    ({
      x: 0,
      y: anchor.metrics.height ?? 0,
    } as Point)
  const supportPoint = computeAnchoredWorldPoint(anchor, stone.body, topMid)
  return {
    angle,
    normal: normalFromAngle(angle),
    supportPoint,
  }
}

const seatStoneOnSupport = (
  stone: Stone | null,
  support: StackOrientation | null,
  isFlipped: boolean = false
) => {
  if (!stone || !stone.anchor || !support) return
  const anchor = stone.anchor

  // support.angle is in world (canvas) coordinates
  // The anchor stores angles in y-up coords, so we negate them
  const anchorRotation = -(anchor.transform.rotation ?? 0)
  const topAngleInAnchor = -(anchor.metrics.topAngle ?? 0)
  const bottomAngleInAnchor = -(anchor.metrics.bottomAngle ?? 0)

  // Calculate body angle: align the BOTTOM face (whichever is physically on bottom) with support
  // For normal (long/flat): use the geometric bottom
  // For flipped (short): the geometric TOP is now the physical bottom
  const bottomFaceAngle = isFlipped ? topAngleInAnchor : bottomAngleInAnchor
  const targetBodyAngle = normalizeAngle(support.angle - anchorRotation - bottomFaceAngle)

  Matter.Body.setAngle(stone.body, targetBodyAngle)
  Matter.Body.setAngularVelocity(stone.body, 0)
  stone.isFlipped = isFlipped

  // Calculate and store the exact top angle to prevent drift accumulation
  // For normal: geometric top is physical top
  // For flipped: geometric bottom is physical top
  const topFaceAngle = isFlipped ? bottomAngleInAnchor : topAngleInAnchor
  const exactTopAngle = normalizeAngle(targetBodyAngle + anchorRotation + topFaceAngle)
  stone.topAngle = exactTopAngle

  // Now position the body so the bottom center sits on the support point
  const bottomCenter = computeAnchoredWorldPoint(anchor, stone.body, { x: 0, y: 0 })
  const deltaX = support.supportPoint.x - bottomCenter.x
  const deltaY = support.supportPoint.y - bottomCenter.y

  if (Math.abs(deltaX) > 1e-5 || Math.abs(deltaY) > 1e-5) {
    Matter.Body.setPosition(stone.body, {
      x: stone.body.position.x + deltaX,
      y: stone.body.position.y + deltaY,
    })
  }

  Matter.Body.setVelocity(stone.body, { x: 0, y: 0 })
  Matter.Body.setAngularVelocity(stone.body, 0)
  stone.supportTargetX = support.supportPoint.x
}

const resolveBaseOrientation = (prevTopAngle: number, desiredOffset: number) => {
  const clampedOffset = clampDirectionalOffset(desiredOffset)
  const baseOrientation = normalizeAngle(prevTopAngle + clampedOffset)
  const appliedOffset = normalizeAngle(baseOrientation - prevTopAngle)
  return { baseOrientation, appliedOffset }
}

const DEFAULT_STANCE: Stance = "long"

export function GameContainer() {
  const engineRef = useRef<PhysicsEngine | null>(null)
  const candleSourceRef = useRef(createCandleSource())
  const alignmentSampleRef = useRef<AlignmentSample>({
    score: 0,
    velocity: 0,
    timestamp: Date.now(),
  })
  const featureStateRef = useRef(initFeatureState())
  const lastFeaturesRef = useRef<Features | null>(null)
  const lastTopAngleRef = useRef(0)
  const stackOrientationRef = useRef<StackOrientation>(DEFAULT_STACK_ORIENTATION)
  const supportFrameRef = useRef<StackOrientation>(DEFAULT_STACK_ORIENTATION)
  const topStoneRef = useRef<Stone | null>(null)
  const stackTopYRef = useRef(GROUND_Y)
  const stackSurfaceYRef = useRef(GROUND_Y)
  const towerOffsetTargetRef = useRef(0)
  const towerOffsetInitializedRef = useRef(false)
  const hoverTransitionRef = useRef<{
    start: HoverStone
    target: HoverStone
    elapsed: number
    duration: number
  } | null>(null)
  const hoverModulationTimerRef = useRef(0)
  const decisionDeadlineRef = useRef<number | null>(null)
  const decisionDurationRef = useRef(0)
  const animationFrameRef = useRef<number>()
  const lastFrameTimeRef = useRef(Date.now())
  const nextDropAtRef = useRef<number | null>(null)
  const dropTimerRef = useRef<NodeJS.Timeout | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const stoneSequenceRef = useRef(0)
  const initializedRef = useRef(false)
  const lastLossCheckBalanceRef = useRef<number | null>(null)
  const lossEventActiveRef = useRef(false)
  const stonesLostInDrawdownRef = useRef(0) // Track cumulative stones lost in current drawdown
  const pendingLossEventRef = useRef<{ stance: Stance; loseCount: number; severity: number } | null>(null)
  const lastStonePlacementTimeRef = useRef<number>(0) // Track when last stone was placed

  const [hoverStoneState, setHoverStoneState] = useState<HoverStone | null>(null)
  const [placingStoneState, setPlacingStoneState] = useState<PlacingStone | null>(null)
  const hoverStoneRef = useRef<HoverStone | null>(null)
  const placingStoneRef = useRef<PlacingStone | null>(null)

  const [renderTrigger, setRenderTrigger] = useState(0)
  const prepareHoverStoneRef = useRef<() => void>(() => {})
  const finalizePlacementRef = useRef<() => void>(() => {})
  const beginPlacementFromHoverRef = useRef<() => void>(() => {})

  const {
    phase,
    setPhase,
    canDecide,
    setCanDecide,
    setPlacementProgress,
    setHoverStance,
    hoverStance,
    setDropStartTime,
    setDecisionProgress,
    setLatestFeatures,
    setMarketAlignment,
    setAlignmentScore,
    setForceStrengths,
    setEnergyState,
    setPhysicsActive,
    setTowerOffset,
    timeScale,
    setDataProvider,
    incrementStonesPlaced,
    stonesPlaced,
    alignmentScore,
    energyPhase,
    energyBudget,
    stabilizerStrength,
    disturberStrength,
    decisionProgress,
  } = useGameState()

  const accountState = useAccountState()

  const setHoverStone = useCallback(
    (value: HoverStone | null | ((prev: HoverStone | null) => HoverStone | null)) => {
      setHoverStoneState((prev) => {
        const next = typeof value === "function" ? (value as (p: HoverStone | null) => HoverStone | null)(prev) : value
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
          typeof value === "function" ? (value as (p: PlacingStone | null) => PlacingStone | null)(prev) : value
        placingStoneRef.current = next
        return next
      })
    },
    [],
  )

  const syncTowerOffset = useCallback(() => {
    const top = stackTopYRef.current
    const desiredOffset = DESIRED_TOP_SCREEN_Y - top
    towerOffsetTargetRef.current = desiredOffset
    if (!towerOffsetInitializedRef.current) {
      setTowerOffset(desiredOffset)
      towerOffsetInitializedRef.current = true
    }
  }, [setTowerOffset])

  const updateStackReferences = useCallback(
    (stone: Stone | null) => {
      topStoneRef.current = stone
      const orientation = deriveSupportFrame(stone)
      stackOrientationRef.current = orientation
      supportFrameRef.current = orientation
      if (stone) {
        stackTopYRef.current = computeBodyTop(stone)
        stackSurfaceYRef.current = orientation.supportPoint.y
      } else {
        stackTopYRef.current = GROUND_Y
        stackSurfaceYRef.current = GROUND_Y
      }
      syncTowerOffset()
      lastTopAngleRef.current = orientation.angle
    },
    [syncTowerOffset],
  )

  const consumeNextCandleVisual = useCallback((stance: Stance = "flat") => {
    const candle = candleSourceRef.current.next()
    const provider = candleSourceRef.current.getSource()
    setDataProvider(provider)
    const evaluation = computeFeatures(featureStateRef.current, candle)
    featureStateRef.current = evaluation.state
    lastFeaturesRef.current = evaluation.features
    const visual = featuresToStoneVisual(evaluation.features, candle.timestamp, stance)
    return { candle, evaluation, visual }
  }, [setDataProvider])

  const applyAlignmentSample = useCallback(
    (features: Features, stance: Stance) => {
      const now = Date.now()
      const raw = computeRawAlignment(features, stance)
      const previous = alignmentSampleRef.current
      const updated = updateAlignment(previous, raw, now)
      alignmentSampleRef.current = updated
      setAlignmentScore(updated.score, updated.velocity, updated.timestamp)
      setMarketAlignment(updated.score)
    },
    [setAlignmentScore, setMarketAlignment],
  )

  const resetForceIndicators = useCallback(() => {
    setForceStrengths(0, 0, 0)
    setEnergyState(0, "calm", 0)
  }, [setEnergyState, setForceStrengths])

  const recalcStackFromPhysics = useCallback(() => {
    const engine = engineRef.current
    if (!engine) return
    const stones = engine.getStones()
    if (stones.length === 0) {
      updateStackReferences(null)
      return
    }
    const topStone = stones.reduce<Stone | null>((highest, candidate) => {
      if (!candidate) return highest
      if (!highest) return candidate
      return computeBodyTop(candidate) < computeBodyTop(highest) ? candidate : highest
    }, null)
    updateStackReferences(topStone)
  }, [updateStackReferences])

  const clearDropTimer = useCallback(() => {
    if (dropTimerRef.current) {
      clearTimeout(dropTimerRef.current)
      dropTimerRef.current = null
    }
  }, [])

  const beginPlacementFromHover = useCallback(() => {
    const hover = hoverStoneRef.current
    if (!hover || !engineRef.current) return

    // Don't place stones during active loss events to prevent gaps
    if (lossEventActiveRef.current) {
      console.log('[Placement] Blocked - loss event in progress')
      // Reschedule the drop for after the loss event completes
      const retryDelay = 500 // Check again in 500ms
      setTimeout(() => {
        if (!lossEventActiveRef.current && hoverStoneRef.current) {
          beginPlacementFromHover()
        }
      }, retryDelay)
      return
    }

    // If there's an active flip transition, complete it immediately before placing
    if (hoverTransitionRef.current) {
      const finalHover = hoverTransitionRef.current.target
      hoverStoneRef.current = finalHover
      setHoverStone(finalHover)
      hoverTransitionRef.current = null
    }

    // Get the final hover state (after completing any transition)
    const finalHover = hoverStoneRef.current
    if (!finalHover) return

    hoverStoneRef.current = null
    setHoverStone(null)
    stoneSequenceRef.current += 1

    const placing: PlacingStone = {
      ...finalHover,
      startY: finalHover.y,
      settleTargetAngle: finalHover.angle,
    }
    setPlacingStone(placing)
    placingStoneRef.current = placing
    setPhase("placing")
    setDropStartTime(Date.now())
    setPlacementProgress(0)
    setCanDecide(false)
    setDecisionProgress(0)
  }, [setCanDecide, setDecisionProgress, setDropStartTime, setHoverStone, setPhase, setPlacementProgress, setPlacingStone])

  const armNextDrop = useCallback(() => {
    if (phase !== "hovering") {
      clearDropTimer()
      return
    }
    if (!hoverStoneRef.current) return
    clearDropTimer()
    const cadence = DEFAULT_CONFIG.dropCadence / Math.max(0.1, timeScale)
    const now = Date.now()

    // Initialize or advance the next drop time
    if (nextDropAtRef.current === null) {
      // First stone: schedule for cadence from now
      nextDropAtRef.current = now + cadence
    } else if (nextDropAtRef.current <= now) {
      // We're past the scheduled time (e.g., after a long placement)
      // Schedule the next drop from now, not from the missed time
      nextDropAtRef.current = now + cadence
    }

    const delay = Math.max(0, nextDropAtRef.current - now)
    dropTimerRef.current = setTimeout(() => {
      dropTimerRef.current = null
      // Advance to next scheduled time
      const dropTime = nextDropAtRef.current ?? Date.now()
      nextDropAtRef.current = dropTime + cadence
      setCanDecide(false)
      beginPlacementFromHover()
    }, delay)
  }, [phase, timeScale, clearDropTimer, setCanDecide, beginPlacementFromHover])

  const updateForceIndicators = useCallback(
    (alignment: number) => {
      const stabilizer = alignment > 0 ? clamp(alignment, 0, 1) : 0
      const disturber = alignment < 0 ? clamp(-alignment, 0, 1) : 0
      setForceStrengths(stabilizer, disturber, Math.sign(alignment))
    },
    [setForceStrengths],
  )

  const prepareHoverStone = useCallback(() => {
    const engine = engineRef.current
    if (!engine) return

    const initialStance = DEFAULT_STANCE  // Initial stance for new hover stone
    const { candle, evaluation, visual } = consumeNextCandleVisual(initialStance)
    setLatestFeatures(evaluation.features)
    // Don't register P&L yet - user can still change stance during hover
    // P&L will be registered when stone is finalized

    const support = stackOrientationRef.current
    const prevTopAngle = support.angle

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
    const { baseOrientation: longBase } = resolveBaseOrientation(prevTopAngle, visual.geometry.beta - support.angle * 0.6)
    const longAngle = normalizeAngle(longBase - trapezoid.metrics.bottomAngleLocal)
    const shortAngle = normalizeAngle(longAngle + Math.PI)
    const { baseOrientation: flatBase } = resolveBaseOrientation(prevTopAngle, 0)
    const flatAngle = normalizeAngle(flatBase - trapezoid.metrics.bottomAngleLocal)

    const hoverInitialStance = hoverStance ?? DEFAULT_STANCE
    const initialAngle = hoverInitialStance === "short" ? shortAngle : hoverInitialStance === "flat" ? flatAngle : longAngle
    const vertices = orientVertices(localVertices, initialAngle)
    const metricsWorld = deriveWorldMetrics(trapezoid.metrics, initialAngle)
    const highlightAngle = normalizeAngle(metricsWorld.topAngle)
    const bounds = computeBounds(vertices)
    const placement = solvePlacement(trapezoid.anchored, initialAngle, support)
    // Hover stone spawns at a fixed screen position above the desired tower top
    // DESIRED_TOP_SCREEN_Y is where we want the tower top, hover appears above it
    const hoverScreenY = DESIRED_TOP_SCREEN_Y - HOVER_VERTICAL_OFFSET
    // Convert screen Y to world Y by removing the current tower offset
    const currentTowerOffset = towerOffsetTargetRef.current
    const hoverWorldY = hoverScreenY - currentTowerOffset

    const hoverStone: HoverStone = {
      localVertices,
      vertices,
      metricsLocal: trapezoid.metrics,
      anchored: trapezoid.anchored,
      metricsWorld,
      geometry: visual.geometry,
      strength: visual.strength,
      baseOrientation: initialAngle,
      updatesApplied: 1,
      maxUpdates: STONE_CANDLE_WINDOW,
      x: placement.position.x,
      y: hoverWorldY,
      color: visual.color,
      targetY: placement.position.y,
      params: visual.params,
      candle,
      bounds,
      spawnedAt: Date.now(),
      stance: hoverInitialStance,
      features: evaluation.features,
      angle: initialAngle,
      angleLong: longAngle,
      angleShort: shortAngle,
      angleFlat: flatAngle,
      highlightAngle,
      facetStrength: visual.facetStrength,
      prevTopAngle,
    }

    hoverTransitionRef.current = null
    hoverStoneRef.current = hoverStone
    setHoverStone(hoverStone)
    setPhase("hovering")
    setCanDecide(true)
    setDecisionProgress(1)
    setDropStartTime(null)
    decisionDurationRef.current = DEFAULT_CONFIG.dropCadence * DEFAULT_CONFIG.decisionWindow
    decisionDeadlineRef.current = hoverStone.spawnedAt + decisionDurationRef.current
    hoverModulationTimerRef.current = hoverStone.spawnedAt
    applyAlignmentSample(evaluation.features, hoverInitialStance)
    updateForceIndicators(alignmentSampleRef.current.score)
    syncTowerOffset()
    armNextDrop()
  }, [
    accountState,
    alignmentSampleRef,
    applyAlignmentSample,
    armNextDrop,
    consumeNextCandleVisual,
    hoverStance,
    setCanDecide,
    setDecisionProgress,
    setDropStartTime,
    setHoverStone,
    setLatestFeatures,
    setPhase,
    syncTowerOffset,
    updateForceIndicators,
  ])

  const finalizePlacement = useCallback(() => {
    const placing = placingStoneRef.current
    const engine = engineRef.current
    if (!placing || !engine) return

    // Record when this stone was placed for loss event timing
    lastStonePlacementTimeRef.current = Date.now()

    const supportFrame = supportFrameRef.current
    const addedStone = engine.addStone({
      vertices: placing.vertices,
      params: placing.params,
      x: placing.x,
      y: placing.targetY,
      color: placing.color,
      topAngle: placing.highlightAngle,
      anchor: placing.anchored,
      supportTargetX: supportFrame.supportPoint.x,
    })
    // Register P&L with the FINAL stance (after user's decision)
    if (placing.candle) {
      accountState.registerCandle(placing.candle, placing.stance)
    }

    // Precisely seat the stone on the support frame
    // Pass stance to determine if stone is flipped (short = flipped)
    const isFlipped = placing.stance === "short"
    engine.setStoneStatic(addedStone, true)
    seatStoneOnSupport(addedStone, supportFrame, isFlipped)
    Matter.Sleeping.set(addedStone.body, true)

    updateStackReferences(addedStone)
    stackSurfaceYRef.current = supportFrame.supportPoint.y

    setPlacingStone(null)
    placingStoneRef.current = null
    incrementStonesPlaced()
    setPhase("stable")
    setPlacementProgress(1)
    prepareHoverStone()
  }, [
    incrementStonesPlaced,
    prepareHoverStone,
    setPhase,
    setPlacementProgress,
    setPlacingStone,
    updateStackReferences,
  ])

  const triggerLossEvent = useCallback(
    (stance: Stance, loseCount: number, severity: number) => {
      const engine = engineRef.current
      if (!engine || loseCount <= 0) return

      const now = Date.now()

      // Check if we're in a safe window:
      // 1. More than 5s since last placement (stone has settled)
      const timeSinceLastPlacement = now - lastStonePlacementTimeRef.current
      const safeAfterPlacement = timeSinceLastPlacement >= SAFE_WINDOW_AFTER_PLACEMENT_MS

      // 2. More than 5s until next drop (won't interfere with incoming stone)
      // Also need to ensure tumble completes before next drop
      const timeUntilNextDrop = nextDropAtRef.current ? nextDropAtRef.current - now : Infinity
      const safeBeforeDrop = timeUntilNextDrop >= (SAFE_WINDOW_BEFORE_DROP_MS + TUMBLE_DURATION_MS)

      if (!safeAfterPlacement || !safeBeforeDrop) {
        // Not in safe window - queue the loss event for later
        const reason = !safeAfterPlacement
          ? `${((SAFE_WINDOW_AFTER_PLACEMENT_MS - timeSinceLastPlacement) / 1000).toFixed(1)}s until safe after placement`
          : `${((timeUntilNextDrop - SAFE_WINDOW_BEFORE_DROP_MS - TUMBLE_DURATION_MS) / 1000).toFixed(1)}s until safe before next drop`
        console.log(`[Loss Event] Delaying ${loseCount} stones (${reason})`)
        pendingLossEventRef.current = { stance, loseCount, severity }
        return
      }

      console.log(`[Loss Event] Losing ${loseCount} stones, severity: ${severity.toFixed(2)}`)

      lossEventActiveRef.current = true // Mark loss event as active
      pendingLossEventRef.current = null // Clear any pending event

      // Activate physics for tumbling stones
      setPhysicsActive(true)

      const stones = engine.getStones()
      if (stones.length === 0) {
        lossEventActiveRef.current = false
        setPhysicsActive(false)
        return
      }

      // Sort stones by height (top stones first)
      const sorted = [...stones].sort((a, b) => computeBodyTop(a) - computeBodyTop(b))
      const drops = sorted.slice(0, Math.min(loseCount, sorted.length))
      const survivors = sorted.slice(drops.length)

      console.log(`[Loss Event] Stack: ${stones.length}, Dropping: ${drops.length}, Survivors: ${survivors.length}`)

      // Keep survivors static and asleep
      for (const survivor of survivors) {
        engine.setStoneStatic(survivor, true)
        Matter.Sleeping.set(survivor.body, true)
      }

      // Wake up and launch stones that will tumble off
      for (const stone of drops) {
        engine.setStoneStatic(stone, false)
        Matter.Sleeping.set(stone.body, false)
        // Set velocity directly for immediate launch effect
        const direction = Math.random() > 0.5 ? 1 : -1
        const velocityX = direction * (5 + Math.random() * 3) * (1 + severity)
        const velocityY = -3 * (1 + severity)
        const angularVel = direction * (0.1 + Math.random() * 0.1) * severity
        Matter.Body.setVelocity(stone.body, { x: velocityX, y: velocityY })
        Matter.Body.setAngularVelocity(stone.body, angularVel)
        console.log(`[Loss Event] Stone ${stone.id}: vX=${velocityX.toFixed(2)}, vY=${velocityY.toFixed(2)}, aV=${angularVel.toFixed(3)}`)
      }

      // After tumble animation, remove stones and regenerate if needed
      setTimeout(() => {
        console.log(`[Loss Event] Removing ${drops.length} stones after tumble`)

        for (const stone of drops) {
          engine.removeStone(stone)
        }

        // Recalculate stack and update stone count
        recalcStackFromPhysics()
        let newStoneCount = engine.getStones().length

        // Regenerate stones at bottom of stack to maintain minimum height
        const MIN_STACK_COUNT = INITIAL_STACK_COUNT
        if (newStoneCount < MIN_STACK_COUNT) {
          const stonesToAdd = MIN_STACK_COUNT - newStoneCount
          console.log(`[Loss Event] Regenerating ${stonesToAdd} stones at bottom to maintain minimum stack`)

          // Add flat stones to the bottom of the stack
          // Get the bottom-most stone to stack below it
          const existingStones = engine.getStones()
          let baseY = GROUND_Y
          if (existingStones.length > 0) {
            // Find the lowest stone
            const lowestStone = existingStones.reduce((lowest, stone) => {
              const stoneBottom = stone.body.position.y + (stone.body.bounds.max.y - stone.body.position.y)
              const lowestBottom = lowest.body.position.y + (lowest.body.bounds.max.y - lowest.body.position.y)
              return stoneBottom > lowestBottom ? stone : lowest
            })
            baseY = lowestStone.body.position.y + (lowestStone.body.bounds.max.y - lowestStone.body.position.y)
          }

          for (let i = 0; i < stonesToAdd; i++) {
            const { visual } = consumeNextCandleVisual("flat")
            const trapezoid = makeTrapezoidFromAngles({
              widthBottom: visual.geometry.widthBottom,
              height: visual.geometry.height,
              taper: visual.geometry.taper,
              round: visual.geometry.round,
              betaGlobal: visual.geometry.beta,
              tauGlobal: visual.geometry.tau,
              prevTopAngleGlobal: 0,
              segments: 5,
            })

            // Stack stones downward from base
            const yPos = baseY + (i * trapezoid.metrics.heightLocal) + trapezoid.metrics.heightLocal / 2
            const stone = engine.addStone({
              vertices: trapezoid.local,
              params: visual.params,
              x: CANVAS_WIDTH / 2,
              y: yPos,
              color: visual.color,
              topAngle: normalizeAngle(trapezoid.anchored.transform.rotation + trapezoid.anchored.metrics.topAngle),
              anchor: trapezoid.anchored,
              supportTargetX: CANVAS_WIDTH / 2,
            })

            engine.setStoneStatic(stone, true)
            Matter.Sleeping.set(stone.body, true)
          }

          recalcStackFromPhysics()
          newStoneCount = engine.getStones().length
        }

        useGameState.setState({ stonesPlaced: newStoneCount })

        // Turn off physics and clear the loss event flag
        setPhysicsActive(false)
        lossEventActiveRef.current = false

        console.log(`[Loss Event] Complete: ${newStoneCount} stones remain`)
      }, TUMBLE_DURATION_MS)
    },
    [recalcStackFromPhysics, setPhysicsActive, consumeNextCandleVisual],
  )

  const dropTimerCleanup = useCallback(() => {
    if (dropTimerRef.current) {
      clearTimeout(dropTimerRef.current)
      dropTimerRef.current = null
    }
  }, [])

  const handleFlip = useCallback(() => {
    const hover = hoverStoneRef.current
    if (!hover || !canDecide || hoverTransitionRef.current) return // Don't flip during transition

    const nextStance: Stance = hover.stance === "short" ? "long" : "short"
    const nextAngle = nextStance === "short" ? hover.angleShort : hover.angleLong
    const rotated = orientVertices(hover.localVertices, nextAngle)
    const metricsWorld = deriveWorldMetrics(hover.metricsLocal, nextAngle)
    const highlightAngle = normalizeAngle(metricsWorld.topAngle)
    const placement = solvePlacement(hover.anchored, nextAngle, stackOrientationRef.current)
    // Keep hover at fixed screen position
    const hoverScreenY = DESIRED_TOP_SCREEN_Y - HOVER_VERTICAL_OFFSET
    const currentTowerOffset = towerOffsetTargetRef.current
    const hoverWorldY = hoverScreenY - currentTowerOffset
    const bounds = computeBounds(rotated)

    const targetHover: HoverStone = {
      ...hover,
      stance: nextStance,
      angle: nextAngle,
      vertices: rotated,
      metricsWorld,
      highlightAngle,
      bounds,
      targetY: placement.position.y,
      x: placement.position.x,
      y: hoverWorldY,
    }

    // Animate the flip with a smooth transition
    hoverTransitionRef.current = {
      start: hover,
      target: targetHover,
      elapsed: 0,
      duration: 300, // 300ms flip animation
    }

    setHoverStance(nextStance)
    if (lastFeaturesRef.current) {
      applyAlignmentSample(lastFeaturesRef.current, nextStance)
      updateForceIndicators(alignmentSampleRef.current.score)
    }

    // Update unrealized P&L with new stance
    if (hover.candle && Number.isFinite(hover.candle.close)) {
      accountState.updateUnrealizedPnl(hover.candle.close, nextStance)
    }
  }, [applyAlignmentSample, canDecide, setHoverStance, updateForceIndicators])

  const handleDiscard = useCallback(() => {
    const hover = hoverStoneRef.current
    if (!hover || !canDecide) return
    const neutralAngle = hover.angleFlat
    const rotated = orientVertices(hover.localVertices, neutralAngle)
    const metricsWorld = deriveWorldMetrics(hover.metricsLocal, neutralAngle)
    const highlightAngle = normalizeAngle(metricsWorld.topAngle)
    const placement = solvePlacement(hover.anchored, neutralAngle, stackOrientationRef.current)
    // Keep hover at fixed screen position
    const hoverScreenY = DESIRED_TOP_SCREEN_Y - HOVER_VERTICAL_OFFSET
    const currentTowerOffset = towerOffsetTargetRef.current
    const hoverWorldY = hoverScreenY - currentTowerOffset
    const bounds = computeBounds(rotated)
    const updated: HoverStone = {
      ...hover,
      stance: "flat",
      angle: neutralAngle,
      vertices: rotated,
      metricsWorld,
      highlightAngle,
      bounds,
      targetY: placement.position.y,
      x: placement.position.x,
      y: hoverWorldY,
    }
    hoverStoneRef.current = updated
    setHoverStone(updated)
    setHoverStance("flat")
    if (lastFeaturesRef.current) {
      applyAlignmentSample(lastFeaturesRef.current, "flat")
      updateForceIndicators(alignmentSampleRef.current.score)
    }

    // Flat stance has no P&L (neutral position)
    accountState.updateUnrealizedPnl(hover.candle?.close ?? 0, "flat")
  }, [applyAlignmentSample, canDecide, setHoverStance, setHoverStone, updateForceIndicators])

  // Direct stance setters for keyboard controls
  const handleSetStance = useCallback((targetStance: Stance) => {
    const hover = hoverStoneRef.current
    if (!hover || !canDecide || hoverTransitionRef.current) return
    if (hover.stance === targetStance) return // Already in this stance

    const targetAngle = targetStance === "short" ? hover.angleShort :
                        targetStance === "flat" ? hover.angleFlat :
                        hover.angleLong

    const rotated = orientVertices(hover.localVertices, targetAngle)
    const metricsWorld = deriveWorldMetrics(hover.metricsLocal, targetAngle)
    const highlightAngle = normalizeAngle(metricsWorld.topAngle)
    const placement = solvePlacement(hover.anchored, targetAngle, stackOrientationRef.current)
    const hoverScreenY = DESIRED_TOP_SCREEN_Y - HOVER_VERTICAL_OFFSET
    const currentTowerOffset = towerOffsetTargetRef.current
    const hoverWorldY = hoverScreenY - currentTowerOffset
    const bounds = computeBounds(rotated)

    const targetHover: HoverStone = {
      ...hover,
      stance: targetStance,
      angle: targetAngle,
      vertices: rotated,
      metricsWorld,
      highlightAngle,
      bounds,
      targetY: placement.position.y,
      x: placement.position.x,
      y: hoverWorldY,
    }

    // Animate the stance change
    hoverTransitionRef.current = {
      start: hover,
      target: targetHover,
      elapsed: 0,
      duration: 300,
    }

    setHoverStance(targetStance)
    if (lastFeaturesRef.current) {
      applyAlignmentSample(lastFeaturesRef.current, targetStance)
      updateForceIndicators(alignmentSampleRef.current.score)
    }

    // Update unrealized P&L with new stance
    if (hover.candle && Number.isFinite(hover.candle.close)) {
      accountState.updateUnrealizedPnl(hover.candle.close, targetStance)
    }
  }, [applyAlignmentSample, canDecide, setHoverStance, updateForceIndicators])

  const handleSetLong = useCallback(() => handleSetStance("long"), [handleSetStance])
  const handleSetShort = useCallback(() => handleSetStance("short"), [handleSetStance])
  const handleSetFlat = useCallback(() => handleSetStance("flat"), [handleSetStance])

  useGestureControls(containerRef, {
    onFlip: handleFlip,
    onDiscard: handleDiscard,
    onSetLong: handleSetLong,
    onSetShort: handleSetShort,
    onSetFlat: handleSetFlat,
  })

  useEffect(() => {
    prepareHoverStoneRef.current = prepareHoverStone
  }, [prepareHoverStone])

  useEffect(() => {
    finalizePlacementRef.current = finalizePlacement
  }, [finalizePlacement])

  useEffect(() => {
    beginPlacementFromHoverRef.current = beginPlacementFromHover
  }, [beginPlacementFromHover])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
      dropTimerCleanup()
    }
  }, [dropTimerCleanup])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (initializedRef.current) return
    initializedRef.current = true

    const engine = new PhysicsEngine(CANVAS_WIDTH, CANVAS_HEIGHT, DEFAULT_CONFIG.gravity)
    engineRef.current = engine
    resetForceIndicators()

    const prepopulateStack = () => {
      accountState.reset()
      let support = DEFAULT_STACK_ORIENTATION
      for (let i = 0; i < INITIAL_STACK_COUNT; i++) {
        const { visual } = consumeNextCandleVisual("flat")  // Initial stack uses flat stance
        const trapezoid = makeTrapezoidFromAngles({
          widthBottom: visual.geometry.widthBottom,
          height: visual.geometry.height,
          taper: visual.geometry.taper,
          round: visual.geometry.round,
          betaGlobal: support.angle,
          tauGlobal: support.angle,
          prevTopAngleGlobal: support.angle,
          segments: 5,
        })
        const localVertices = trapezoid.local
        const { baseOrientation } = resolveBaseOrientation(support.angle, 0)
        const bodyAngle = normalizeAngle(baseOrientation - trapezoid.metrics.bottomAngleLocal)
        const vertices = orientVertices(localVertices, bodyAngle)
        const metricsWorld = deriveWorldMetrics(trapezoid.metrics, bodyAngle)
        const highlightAngle = normalizeAngle(metricsWorld.topAngle)
        const placement = solvePlacement(trapezoid.anchored, bodyAngle, support)
        const stone = engine.addStone({
          vertices,
          params: visual.params,
          x: placement.position.x,
          y: placement.position.y,
          color: visual.color,
          topAngle: highlightAngle,
          anchor: trapezoid.anchored,
          supportTargetX: support.supportPoint.x,
        })
        engine.setStoneStatic(stone, true)
        seatStoneOnSupport(stone, support, false) // Initial stack uses flat/normal orientation
        Matter.Sleeping.set(stone.body, true)
        support = deriveSupportFrame(stone)
      }
      recalcStackFromPhysics()
      useGameState.setState({ stonesPlaced: INITIAL_STACK_COUNT })
      setPhase("stable")
      syncTowerOffset()
      setRenderTrigger((v) => v + 1)
    }

    prepopulateStack()
    prepareHoverStoneRef.current()

    const step = () => {
      const now = Date.now()
      lastFrameTimeRef.current = now
      const state = useGameState.getState()
      const currentPhase = state.phase
      const currentTimeScale = state.timeScale
      const currentCanDecide = state.canDecide
      const dropStartTime = state.dropStartTime ?? now

      if (placingStoneRef.current && currentPhase === "placing") {
        const placing = placingStoneRef.current
        const duration = PLACEMENT_DURATION_MS / Math.max(0.1, currentTimeScale)
        const progress = clamp((now - dropStartTime) / duration, 0, 1)
        const eased = easeInOut(progress)
        const currentY = placing.startY + (placing.targetY - placing.startY) * eased
        const currentAngle = normalizeAngle(
          placing.angle + (placing.settleTargetAngle - placing.angle) * easeInOut(progress),
        )
        const rotated = orientVertices(placing.localVertices, currentAngle)
        const metricsWorld = deriveWorldMetrics(placing.metricsLocal, currentAngle)
        const highlightAngle = normalizeAngle(metricsWorld.topAngle)
        setPlacingStone((prev) =>
          prev
            ? {
                ...prev,
                y: currentY,
                angle: currentAngle,
                vertices: rotated,
                metricsWorld,
                highlightAngle,
              }
            : prev,
        )
        setPlacementProgress(progress)
        if (progress >= 1) {
          finalizePlacementRef.current()
        }
      }

      if (decisionDeadlineRef.current && currentPhase === "hovering") {
        const remaining = clamp((decisionDeadlineRef.current - now) / Math.max(decisionDurationRef.current, 1), 0, 1)
        setDecisionProgress(remaining)
        if (remaining <= 0 && currentCanDecide && hoverStoneRef.current) {
          setCanDecide(false)
          beginPlacementFromHoverRef.current()
        }
      }

      // Check for pending loss events and trigger if we're in safe window
      if (pendingLossEventRef.current && !lossEventActiveRef.current) {
        const timeSinceLastPlacement = now - lastStonePlacementTimeRef.current
        if (timeSinceLastPlacement >= SAFE_WINDOW_AFTER_PLACEMENT_MS) {
          const pending = pendingLossEventRef.current
          console.log(`[Loss Event] Triggering pending loss event (${pending.loseCount} stones)`)
          triggerLossEvent(pending.stance, pending.loseCount, pending.severity)
        }
      }

      // Smooth tower offset animation
      const currentOffset = state.towerOffset
      const targetOffset = towerOffsetTargetRef.current
      if (Math.abs(targetOffset - currentOffset) > 0.5) {
        const easingSpeed = 0.08
        const newOffset = currentOffset + (targetOffset - currentOffset) * easingSpeed
        setTowerOffset(newOffset)
      } else if (targetOffset !== currentOffset) {
        setTowerOffset(targetOffset)
      }

      // Force frequent renders when physics is active for smooth tumbling animation
      // Otherwise, only render occasionally to save resources
      const currentPhysicsActive = state.physicsActive
      if (currentPhysicsActive) {
        // Step the physics simulation forward
        const deltaTime = 1000 / 60 // 60fps = ~16.67ms per frame
        engine.update(deltaTime)
        setRenderTrigger((v) => v + 1) // Always update when physics active
      } else if (Math.random() < 0.1) {
        setRenderTrigger((v) => v + 1) // 10% chance otherwise
      }

      animationFrameRef.current = requestAnimationFrame(step)
    }

    animationFrameRef.current = requestAnimationFrame(step)

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
      dropTimerCleanup()
      initializedRef.current = false
      engine.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerLossEvent])

  useEffect(() => {
    if (phase === "hovering") {
      armNextDrop()
    } else {
      clearDropTimer()
    }
  }, [phase, armNextDrop, clearDropTimer])

  useEffect(() => {
    if (phase !== "hovering") return
    // Update hover stone every 1 second to represent streaming data within the 30s candle
    const MODULATION_INTERVAL = 1000

    const modulateHover = () => {
      const hover = hoverStoneRef.current
      if (!hover) return

      const now = Date.now()
      const elapsed = now - hoverModulationTimerRef.current

      if (elapsed >= MODULATION_INTERVAL && hover.updatesApplied < hover.maxUpdates) {
        const { candle, evaluation, visual } = consumeNextCandleVisual(hover.stance)
        setLatestFeatures(evaluation.features)

        // Update alignment with new features and current stance
        lastFeaturesRef.current = evaluation.features
        applyAlignmentSample(evaluation.features, hover.stance)
        updateForceIndicators(alignmentSampleRef.current.score)

        // Update unrealized P&L with the latest price and current stance
        if (candle && Number.isFinite(candle.close)) {
          accountState.updateUnrealizedPnl(candle.close, hover.stance)
        }

        if (!hoverTransitionRef.current) {
          const support = stackOrientationRef.current
          const prevTopAngle = support.angle

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

          const { baseOrientation: longBase } = resolveBaseOrientation(
            prevTopAngle,
            visual.geometry.beta - support.angle * 0.6,
          )
          const longAngle = normalizeAngle(longBase - trapezoid.metrics.bottomAngleLocal)
          const shortAngle = normalizeAngle(longAngle + Math.PI)
          const { baseOrientation: flatBase } = resolveBaseOrientation(prevTopAngle, 0)
          const flatAngle = normalizeAngle(flatBase - trapezoid.metrics.bottomAngleLocal)

          const targetStance = hover.stance
          const targetAngle =
            targetStance === "short" ? shortAngle : targetStance === "flat" ? flatAngle : longAngle

          const targetVertices = orientVertices(trapezoid.local, targetAngle)
          const targetMetricsWorld = deriveWorldMetrics(trapezoid.metrics, targetAngle)
          const targetHighlightAngle = normalizeAngle(targetMetricsWorld.topAngle)
          const targetBounds = computeBounds(targetVertices)
          const targetPlacement = solvePlacement(trapezoid.anchored, targetAngle, support)
          // Keep hover at fixed screen position
          const targetHoverScreenY = DESIRED_TOP_SCREEN_Y - HOVER_VERTICAL_OFFSET
          const targetCurrentTowerOffset = towerOffsetTargetRef.current
          const targetHoverWorldY = targetHoverScreenY - targetCurrentTowerOffset

          const targetHover: HoverStone = {
            ...hover,
            localVertices: trapezoid.local,
            vertices: targetVertices,
            metricsLocal: trapezoid.metrics,
            anchored: trapezoid.anchored,
            metricsWorld: targetMetricsWorld,
            geometry: visual.geometry,
            strength: visual.strength,
            angle: targetAngle,
            angleLong: longAngle,
            angleShort: shortAngle,
            angleFlat: flatAngle,
            highlightAngle: targetHighlightAngle,
            facetStrength: visual.facetStrength,
            x: targetPlacement.position.x,
            y: targetHoverWorldY,
            targetY: targetPlacement.position.y,
            color: visual.color,
            params: visual.params,
            candle,
            bounds: targetBounds,
            features: evaluation.features,
            updatesApplied: hover.updatesApplied + 1,
          }

          hoverTransitionRef.current = {
            start: hover,
            target: targetHover,
            elapsed: 0,
            duration: 180,
          }
        }

        hoverModulationTimerRef.current = now
      }

      if (hoverTransitionRef.current) {
        const transition = hoverTransitionRef.current
        transition.elapsed += 16
        const t = clamp(transition.elapsed / transition.duration, 0, 1)
        const eased = easeInOut(t)
        const next = transition.target
        const from = transition.start

        const interpLocalVertices = from.localVertices.map((fv, idx) => {
          const tv = next.localVertices[idx] ?? fv
          return {
            x: fv.x + (tv.x - fv.x) * eased,
            y: fv.y + (tv.y - fv.y) * eased,
          }
        })

        const currentAngle = from.angle + normalizeAngle(next.angle - from.angle) * eased
        const interpVertices = orientVertices(interpLocalVertices, currentAngle)
        const interpMetricsWorld = deriveWorldMetrics(
          {
            ...from.metricsLocal,
            bottomAngleLocal:
              from.metricsLocal.bottomAngleLocal +
              normalizeAngle(next.metricsLocal.bottomAngleLocal - from.metricsLocal.bottomAngleLocal) * eased,
            topAngleLocal:
              from.metricsLocal.topAngleLocal +
              normalizeAngle(next.metricsLocal.topAngleLocal - from.metricsLocal.topAngleLocal) * eased,
          },
          currentAngle,
        )

        const geometry: StoneGeometryInput = {
          widthBottom: from.geometry.widthBottom + (next.geometry.widthBottom - from.geometry.widthBottom) * eased,
          height: from.geometry.height + (next.geometry.height - from.geometry.height) * eased,
          taper: from.geometry.taper + (next.geometry.taper - from.geometry.taper) * eased,
          round: from.geometry.round + (next.geometry.round - from.geometry.round) * eased,
          beta: from.geometry.beta + (next.geometry.beta - next.geometry.beta) * eased,
          tau: from.geometry.tau + (next.geometry.tau - next.geometry.tau) * eased,
        }

        setHoverStone((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            localVertices: interpLocalVertices,
            vertices: interpVertices,
            metricsWorld: interpMetricsWorld,
            geometry,
            color: next.color,
            strength: from.strength + (next.strength - from.strength) * eased,
            facetStrength: from.facetStrength + (next.facetStrength - from.facetStrength) * eased,
            angle: currentAngle,
            x: from.x + (next.x - from.x) * eased,
            y: from.y + (next.y - from.y) * eased,
            bounds: computeBounds(interpVertices),
          }
        })

        if (t >= 1) {
          hoverStoneRef.current = next
          setHoverStone(next)
          hoverTransitionRef.current = null
        }
      }
    }

    const interval = setInterval(modulateHover, 16)
    return () => clearInterval(interval)
  }, [phase, consumeNextCandleVisual, setLatestFeatures, setHoverStone, applyAlignmentSample, updateForceIndicators])

  // Check for loss events based on equity drawdown (includes unrealized P&L)
  // Subscribe to equity changes from account state
  const equity = useAccountState((state) => state.equity)
  const peakEquity = useAccountState((state) => state.peakEquity)

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    if (phase !== "hovering" && phase !== "stable") return // Only check between placements, not during loss/placing
    if (stonesPlaced === 0) return // Can't lose stones if we don't have any
    if (lossEventActiveRef.current) return // Don't trigger another loss event while one is active

    // Only check if equity has changed since last check to prevent infinite loops
    if (lastLossCheckBalanceRef.current === equity) return
    lastLossCheckBalanceRef.current = equity

    console.log(`[Loss Check] Equity: $${equity.toFixed(2)}, Peak: $${peakEquity.toFixed(2)}, Drawdown: ${((1 - equity/peakEquity) * 100).toFixed(1)}%`)

    // Check if equity has recovered - if so, reset the stones lost counter
    const currentDrawdown = (peakEquity - equity) / peakEquity
    if (currentDrawdown < 0.05) {
      // Equity recovered above 5% drawdown threshold - reset counter
      stonesLostInDrawdownRef.current = 0
    }

    // Check if we've hit a loss threshold based on peak-to-current equity drawdown
    const loseCount = stonesToLoseFromDrawdown(equity, peakEquity, stonesPlaced)

    // Only trigger if we need to lose MORE stones than we've already lost
    const stonesToLoseNow = Math.max(0, loseCount - stonesLostInDrawdownRef.current)

    if (stonesToLoseNow > 0) {
      const severity = calculateLossSeverity(equity, peakEquity)
      console.log(`[Loss Event Triggered] Total should lose: ${loseCount}, Already lost: ${stonesLostInDrawdownRef.current}, Losing now: ${stonesToLoseNow}, Severity: ${severity.toFixed(2)}`)

      // Track that we're losing these stones
      stonesLostInDrawdownRef.current += stonesToLoseNow

      // Trigger the visual tumble effect
      // NOTE: We don't call applyLossPenalty() because loss events are triggered by
      // unrealized P&L (equity drop), not by closing positions. The balance should
      // only change when positions are actually closed, not when stones tumble off.
      triggerLossEvent(hoverStance ?? DEFAULT_STANCE, stonesToLoseNow, severity)
    }
  }, [phase, stonesPlaced, triggerLossEvent, hoverStance, equity, peakEquity, accountState])

  return (
    <div ref={containerRef} className="relative touch-none">
      <GameCanvas
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        engineRef={engineRef}
        renderTrigger={renderTrigger}
        hoverStone={hoverStoneState}
        hoverCanDecide={canDecide}
        decisionProgress={decisionProgress}
        placingStone={placingStoneState}
        energyPhase={energyPhase}
        energyRatio={energyBudget}
        stabilizerStrength={stabilizerStrength}
        disturberStrength={disturberStrength}
      />
    </div>
  )
}
