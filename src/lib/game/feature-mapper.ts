import type { Features } from "@/lib/data/features"
import type { StoneParams } from "@/lib/types"
import { clamp, clamp01, hslToHex } from "./math"

export interface StoneVisual {
  params: StoneParams
  color: string
}

export const featuresToStoneVisual = (features: Features, seed: number): StoneVisual => {
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

  const hue = clamp(32 - 55 * momentum + 10 * order, -10, 60)
  const saturation = clamp01(0.35 + 0.45 * volatility + 0.1 * regime)
  const lightness = clamp01(0.8 - 0.3 * volume + 0.08 * (0.5 - regime))

  const color = hslToHex((hue + 360) % 360, saturation, lightness)

  return { params, color }
}
