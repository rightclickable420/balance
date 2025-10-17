import type { Features } from "@/lib/data/features"
import type { Stance } from "./game-state"
import { clamp, clamp01 } from "./math"

const STANCE_ALIGNMENT_THRESHOLD = 0.12
const MAX_LOSS_RATIO = 0.3

export const stonesToLose = (features: Features, stance: Stance, stackCount: number): number => {
  if (stackCount <= 0) return 0

  const momentum = features.momentum
  const volatility = features.volatility
  const regime = features.regime
  const orderImbalance = features.orderImbalance

  const dir = Math.sign(momentum || orderImbalance)

  const aligned =
    (stance === "long" && dir >= 0) ||
    (stance === "short" && dir <= 0) ||
    (stance === "flat" && Math.abs(momentum) < STANCE_ALIGNMENT_THRESHOLD)

  if (aligned) return 0

  const momentumPenalty = Math.max(0, dir > 0 ? -momentum : momentum)
  const orderPenalty = Math.max(0, dir > 0 ? -orderImbalance : orderImbalance)
  const severityRaw = 0.55 * momentumPenalty + 0.25 * orderPenalty + 0.2 * regime
  const severity = clamp01(severityRaw * (0.6 + volatility * 0.8))

  const maxLoss = Math.max(1, Math.floor(stackCount * MAX_LOSS_RATIO))
  const loseCount = Math.round(severity * maxLoss)
  return clamp(loseCount, 0, maxLoss)
}
