import type { Features } from "@/lib/data/features"
import type { Stance } from "./game-state"

// Utility function (math.ts was removed with Balance game)
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

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

/**
 * Compute comprehensive market direction signal
 * Combines trend strength, volume confirmation, and volatility adjustment
 * Returns value from -1 (bearish) to 1 (bullish)
 */
export const computeMarketDirection = (features: Features): number => {
  // Defensive checks: ensure all feature values are valid numbers
  const safeOrderImbalance = Number.isFinite(features.orderImbalance) ? features.orderImbalance : 0
  const safeMomentum = Number.isFinite(features.momentum) ? features.momentum : 0
  const safeBreadth = Number.isFinite(features.breadth) ? features.breadth : 0
  const safeVolume = Number.isFinite(features.volume) ? features.volume : 0.5
  const safeVolatility = Number.isFinite(features.volatility) ? features.volatility : 0.5

  // Trend Strength: Multi-candle bias weighted more than single-candle momentum
  // orderImbalance = persistent directional bias (most important)
  // momentum = current candle direction
  // breadth = candle quality (body vs wick ratio)
  const trendStrength = clamp(
    safeOrderImbalance * 0.5 +
    safeMomentum * 0.3 +
    safeBreadth * 0.2,
    -1,
    1
  )

  // Volume Confirmation: High volume confirms the move, low volume weakens it
  // volume > 0.5 → multiplier > 1.0 (strengthens signal)
  // volume < 0.5 → multiplier < 1.0 (weakens signal)
  const volumeConfirmation = 0.7 + safeVolume * 0.6 // Range: 0.7 to 1.3

  // Volatility Penalty: High volatility makes signals less reliable
  // volatility = 0 → no penalty (1.0)
  // volatility = 1 → max penalty (0.7)
  const volatilityPenalty = 1.0 - clamp(safeVolatility, 0, 1) * 0.3

  // Combined market direction with confirmations and adjustments
  const marketDirection = trendStrength * volumeConfirmation * volatilityPenalty

  return clamp(marketDirection, -1, 1)
}

/**
 * Compute market conviction - how confident are we in any directional signal?
 * Low conviction = unclear/choppy market → should go flat
 * Returns value from 0 (no conviction) to 1 (high conviction)
 */
export const computeMarketConviction = (features: Features): number => {
  // Strong conviction when:
  // 1. Clear directional signals (high momentum/order imbalance)
  // 2. High volume (market participants agree)
  // 3. Low volatility (stable conditions, not choppy)
  // 4. Good breadth (clean candles, not wicky/indecisive)

  // Defensive checks: ensure all feature values are valid numbers
  const safeMomentum = Number.isFinite(features.momentum) ? features.momentum : 0
  const safeOrderImbalance = Number.isFinite(features.orderImbalance) ? features.orderImbalance : 0
  const safeVolume = Number.isFinite(features.volume) ? features.volume : 0.5
  const safeVolatility = Number.isFinite(features.volatility) ? features.volatility : 0.5
  const safeBreadth = Number.isFinite(features.breadth) ? features.breadth : 0

  const directionalClarity = (Math.abs(safeMomentum) * 0.4 + Math.abs(safeOrderImbalance) * 0.4) / 0.8
  const volumeConviction = safeVolume
  const stabilityFactor = 1.0 - clamp(safeVolatility, 0, 1)
  const candleQuality = Math.abs(safeBreadth) // High breadth = strong bodies

  const conviction = clamp(
    directionalClarity * 0.4 +
    volumeConviction * 0.3 +
    stabilityFactor * 0.2 +
    candleQuality * 0.1,
    0,
    1
  )

  return conviction
}

/**
 * Compute alignment score between market direction and stance
 * Positive = stance aligned with market (good)
 * Negative = stance against market (risky)
 */
export const computeRawAlignment = (features: Features, stance: Stance): number => {
  // Get comprehensive market direction
  const marketDirection = computeMarketDirection(features)

  // Confidence: How strong/clear are the signals?
  // Higher confidence when:
  // - Strong momentum/order imbalance (clear direction)
  // - High regime (clear market state)
  // - Low volatility (stable conditions)
  // - High volume (conviction)
  const confidence = clamp(
    Math.abs(features.momentum) * 0.3 +
      Math.abs(features.orderImbalance) * 0.3 +
      features.volume * 0.2 +
      Math.max(0, features.regime) * 0.1 +
      (1 - clamp(features.volatility, 0, 1)) * 0.1,
    0,
    1,
  )

  // Calculate agreement between stance and market direction
  const stanceDir = stanceDirection(stance)
  const agreement = stance === "flat" ? 0 : marketDirection * stanceDir

  // Final alignment: agreement scaled by confidence
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
