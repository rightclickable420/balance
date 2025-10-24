import type { Features } from "@/lib/data/features"
import type { Stance } from "./game-state"
import { clamp } from "./math"

const ALIGNMENT_DECAY = 0.92
const ALIGNMENT_GAIN = 0.35
const ALIGNMENT_VELOCITY_DECAY = 0.85
const MAX_ALIGNMENT_DELTA = 0.15
const EPS = 1e-6

const stanceDirection = (stance: Stance): number => {
  switch (stance) {
    case "long":
      return 1
    case "short":
      return -1
    default:
      return 0
  }
}

export interface AlignmentSample {
  score: number
  velocity: number
  timestamp: number
}

export const computeRawAlignment = (features: Features, stance: Stance): number => {
  const directionSignal = clamp(features.momentum * 0.6 + features.orderImbalance * 0.3 + features.breadth * 0.1, -1, 1)
  const confidence = clamp(
    Math.abs(features.momentum) * 0.4 +
      Math.abs(features.orderImbalance) * 0.3 +
      Math.max(0, features.regime) * 0.2 +
      (1 - clamp(features.volatility, 0, 1)) * 0.1,
    0,
    1,
  )
  const stanceDir = stanceDirection(stance)
  const agreement = stance === "flat" ? 0 : directionSignal * stanceDir
  return clamp(agreement * confidence, -1, 1)
}

export const updateAlignment = (
  previous: AlignmentSample,
  rawAlignment: number,
  now: number,
): AlignmentSample => {
  if (!Number.isFinite(rawAlignment)) {
    return previous
  }
  const delta = clamp(rawAlignment - previous.score, -MAX_ALIGNMENT_DELTA, MAX_ALIGNMENT_DELTA)
  const targetScore = previous.score * ALIGNMENT_DECAY + delta * ALIGNMENT_GAIN
  const velocity = (targetScore - previous.score) * ALIGNMENT_VELOCITY_DECAY
  const clampedScore = clamp(targetScore, -1, 1)
  const updatedVelocity = Math.abs(velocity) < EPS ? 0 : clamp(velocity, -1, 1)
  return {
    score: clampedScore,
    velocity: updatedVelocity,
    timestamp: now,
  }
}
