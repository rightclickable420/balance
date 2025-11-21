import type { Candle } from "@/lib/types"

export type MarketRegime = "trending" | "ranging" | "choppy"

const MIN_CANDLES = 10

function calculateDirectionalMoves(candles: Candle[]): number {
  let streaks = 0
  for (let i = 2; i < candles.length; i++) {
    const prevDelta = candles[i - 1].close - candles[i - 2].close
    const currDelta = candles[i].close - candles[i - 1].close

    if (prevDelta === 0 || currDelta === 0) continue
    if ((prevDelta > 0 && currDelta > 0) || (prevDelta < 0 && currDelta < 0)) {
      streaks++
    }
  }
  return streaks
}

export function detectMarketRegime(candles: Candle[]): MarketRegime {
  if (candles.length < MIN_CANDLES) {
    return "trending"
  }

  const recent = candles.slice(-Math.max(MIN_CANDLES, Math.floor(candles.length / 2)))
  const highs = recent.map((c) => c.high)
  const lows = recent.map((c) => c.low)
  const priceRange = Math.max(...highs) - Math.min(...lows)
  const avgBody =
    recent.reduce((sum, candle) => sum + Math.abs(candle.close - candle.open), 0) / recent.length

  const avgRange =
    recent.reduce((sum, candle) => sum + (candle.high - candle.low), 0) / recent.length

  const directionalMoves = calculateDirectionalMoves(recent)
  const directionalStrength = directionalMoves / recent.length
  const bodyToRangeRatio = priceRange === 0 ? 0 : avgBody / priceRange
  const noiseRatio = avgRange === 0 ? 0 : avgBody / avgRange

  if (directionalStrength >= 0.6 && bodyToRangeRatio >= 0.15) {
    return "trending"
  }

  if (priceRange <= avgBody * 3 || noiseRatio < 0.25) {
    return "ranging"
  }

  return "choppy"
}
