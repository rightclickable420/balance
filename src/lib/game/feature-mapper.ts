import type { Features } from "@/lib/data/features"
import type { StoneParams } from "@/lib/types"
import type { Stance } from "./game-state"
import { clamp, clamp01, hslToHex, lerp } from "./math"
import { computeRawAlignment } from "./alignment"

export interface StoneGeometryInput {
  widthBottom: number
  height: number
  round: number
  taper: number
  /** Bottom face angle offset from the previous top orientation (radians). */
  beta: number
  /** Top face angle offset from the previous top orientation (radians). */
  tau: number
}

export interface StoneVisual {
  params: StoneParams
  color: string
  facetStrength: number
  geometry: StoneGeometryInput
  strength: number
}

export const featuresToStoneVisual = (features: Features, seed: number, stance: Stance = "flat"): StoneVisual => {
  const momentum = features.momentum
  const volatility = features.volatility
  const volume = features.volume
  const breadth = features.breadth
  const order = features.orderImbalance
  const regime = features.regime

  const convexity = clamp(0.72 - 0.28 * volatility + 0.08 * (1 - Math.abs(order)), 0.15, 0.95)
  const jaggedness = clamp(0.12 + 0.6 * volatility + 0.1 * (1 - Math.abs(breadth)), 0.05, 0.95)
  const baseBias = clamp(-momentum + 0.35 * order, -1, 1)
  const radius = clamp(38 + 24 * (0.3 + 0.7 * volume), 30, 72)
  const density = clamp(0.78 + 0.5 * volume + 0.2 * regime, 0.6, 2)
  const friction = clamp(0.55 + 0.35 * (1 - Math.abs(order)), 0.35, 1)
  const restitution = clamp(0.03 + 0.05 * volatility, 0.02, 0.12)

  const params: StoneParams = {
    seed,
    convexity,
    jaggedness,
    baseBias,
    radius,
    aspect: clamp(1.5 + 0.7 * (1 - Math.abs(breadth)), 1.4, 2.4),
    density,
    friction,
    restitution,
  }

  // Calculate alignment score for color mapping
  const alignment = computeRawAlignment(features, stance)

  // Map alignment to colors:
  // Positive alignment (stance matches market) → Green/Teal (hue ~160-180)
  // Negative alignment (against market) → Red/Magenta (hue ~340-360)
  // Neutral/Flat → Yellow/Amber (hue ~40-60)
  let hue: number
  if (stance === "flat" || Math.abs(alignment) < 0.1) {
    // Neutral/Flat → Yellow/Amber
    hue = 45
  } else if (alignment > 0) {
    // Positive alignment → Green/Teal (hue increases with alignment strength)
    hue = lerp(120, 180, clamp01(alignment))
  } else {
    // Negative alignment → Red/Magenta
    hue = lerp(360, 340, clamp01(-alignment))
  }

  const alignmentStrength = Math.abs(alignment)
  const saturation = clamp01(0.45 + 0.35 * alignmentStrength + 0.15 * volatility)
  const lightness = clamp01(0.55 - 0.15 * alignmentStrength + 0.1 * (1 - volatility))

  const color = hslToHex(hue % 360, saturation, lightness)
  const facetStrength = clamp01(lerp(0.25, 0.75, alignmentStrength) + volatility * 0.2)

  const widthBase = clamp(params.radius * params.aspect, 32, 160)
  const widthBottom = clamp(widthBase * (0.9 + 0.25 * volume + 0.1 * (1 - volatility)), 28, 164)

  const heightBase = clamp(params.radius * (0.75 + 0.25 * (1 - Math.abs(order)) + 0.15 * regime), 24, 132)
  const height = clamp(heightBase * (0.9 + 0.2 * (1 - Math.abs(momentum))), 24, 138)

  const taper = clamp(0.25 + 0.45 * params.convexity + 0.2 * (1 - Math.abs(order)), 0, 1)
  const round = clamp(0.35 + 0.45 * (1 - params.jaggedness) + 0.15 * (1 - volatility), 0, 1)

  const directionalSignal = clamp(momentum * 0.75 + order * 0.55 + regime * 0.25, -1, 1)
  const conviction = clamp01(
    Math.abs(momentum) * 0.5 +
      Math.abs(order) * 0.25 +
      Math.max(0, regime) * 0.15 +
      (1 - volatility) * 0.1 +
      (1 - Math.abs(breadth)) * 0.05,
  )
  const maxAngleDeg = lerp(12, 34, conviction)
  const faceAngle = ((directionalSignal * maxAngleDeg) / 180) * Math.PI

  const beta = faceAngle
  const tau = -faceAngle

  const geometry: StoneGeometryInput = {
    widthBottom,
    height,
    taper,
    round,
    beta,
    tau,
  }

  const strength = clamp01(0.45 + 0.35 * (1 - volatility) + 0.2 * regime)

  return { params, color, facetStrength, geometry, strength }
}
