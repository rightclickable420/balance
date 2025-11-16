import type { Candle } from "@/lib/types"

// Utility functions (math.ts was removed with Balance game)
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const clamp01 = (value: number) => clamp(value, 0, 1)
const ensurePositive = (value: number) => Math.max(value, 1e-10)
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))
const tanhSafe = (x: number) => Math.tanh(clamp(x, -10, 10))

export interface Features {
  momentum: number // -1..1
  volatility: number // 0..1
  volume: number // 0..1
  breadth: number // -1..1
  orderImbalance: number // -1..1
  regime: number // 0..1
}

interface FeatureState {
  emaBody: number
  emaRange: number
  emaVolume: number
  orderBias: number
  lastClose: number | null
}

const EMA_ALPHA = 0.2
const ORDER_ALPHA = 0.3
const VOLATILITY_SCALE = 8.5
const REGIME_MULTIPLIER = 5.5
const REGIME_SHIFT = 2.2

export const initFeatureState = (): FeatureState => ({
  emaBody: 0,
  emaRange: 0,
  emaVolume: 0,
  orderBias: 0,
  lastClose: null,
})

const updateEma = (prev: number, value: number): number => {
  if (prev === 0) return value
  return prev + EMA_ALPHA * (value - prev)
}

export const computeFeatures = (
  prevState: FeatureState,
  candle: Candle,
): { features: Features; state: FeatureState } => {
  const { open, high, low, close, volume } = candle

  const rangeRaw = Math.max(high - low, 0)
  const body = Math.abs(close - open)
  const price = ensurePositive(Math.abs(close))
  // Don't use ensurePositive on range - we need to detect true zero for flat candles
  const range = rangeRaw

  const emaBody = updateEma(prevState.emaBody, body)
  const emaRange = updateEma(prevState.emaRange, ensurePositive(range))  // Only ensure positive for EMA
  const emaVolume = updateEma(prevState.emaVolume, volume)

  // Prevent division by zero when range is 0 (flat candle)
  const rawMomentum = range > 0 ? tanhSafe((close - open) / range) : 0
  const volatility = clamp01((emaRange / price) * VOLATILITY_SCALE)

  const volumeRatio = emaVolume === 0 ? 1 : volume / ensurePositive(emaVolume)
  const volumeSignal = clamp01((tanhSafe(volumeRatio - 1) + 1) / 2)

  const breadth = tanhSafe(emaBody / ensurePositive(emaRange))

  let orderBias = prevState.orderBias
  if (prevState.lastClose !== null) {
    const delta = close - prevState.lastClose
    // Prevent division by zero when range is 0
    const rawOrder = range > 0 ? tanhSafe(delta / range) : 0
    orderBias = clamp(orderBias + ORDER_ALPHA * (rawOrder - orderBias), -1, 1)
  } else {
    orderBias = rawMomentum
  }

  const regime = clamp01(sigmoid(volatility * REGIME_MULTIPLIER - REGIME_SHIFT))

  const nextState: FeatureState = {
    emaBody,
    emaRange,
    emaVolume,
    orderBias,
    lastClose: close,
  }

  return {
    features: {
      momentum: rawMomentum,
      volatility,
      volume: volumeSignal,
      breadth,
      orderImbalance: orderBias,
      regime,
    },
    state: nextState,
  }
}

export type { FeatureState }
