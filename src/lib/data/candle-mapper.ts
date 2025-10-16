import type { Candle, StoneParams } from "../types"

/**
 * Pure function: maps a single candle to stone parameters
 * Deterministic - same candle always produces same stone
 */
export function candleToStone(candle: Candle): StoneParams {
  const { open, high, low, close, volume } = candle

  // Derived terms
  const range = high - low
  const body = Math.abs(close - open)
  const upperWick = high - Math.max(open, close)
  const lowerWick = Math.min(open, close) - low

  // Normalized metrics (0-1 range with guards)
  const bodyRatio = range > 0 ? Math.min(1, body / range) : 0.5
  const wickiness = range > 0 ? Math.min(1, (upperWick + lowerWick) / range) : 0.3
  const momentum = (close - open) / (range || 1) // -1 to 1
  const volNorm = Math.min(1, volume / 1000000) // arbitrary normalization

  // Stone parameters (per spec formulas)
  const convexity = 0.65 + 0.25 * bodyRatio
  const jaggedness = 0.3 + 0.4 * wickiness
  const density = 0.8 + 0.4 * volNorm // kg/m²
  const friction = 0.6 + 0.2 * wickiness
  const restitution = 0.1 + 0.15 * (1 - bodyRatio)
  const baseBias = -momentum // flip swaps which side is flatter
  const radius = 40 + 20 * bodyRatio // 40-60px base size

  // Use timestamp as seed for deterministic generation
  const seed = candle.timestamp

  return {
    convexity: clamp(convexity, 0, 1),
    jaggedness: clamp(jaggedness, 0, 1),
    density: clamp(density, 0.5, 2),
    friction: clamp(friction, 0.3, 1),
    restitution: clamp(restitution, 0.05, 0.3),
    baseBias: clamp(baseBias, -1, 1),
    radius: clamp(radius, 30, 70),
    seed,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
