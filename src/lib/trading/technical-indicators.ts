/**
 * Technical Indicators Library
 *
 * Implements common technical analysis indicators for trading signals
 */

import type { Candle } from "@/lib/types"

// ============================================================================
// Utility Functions
// ============================================================================

function sum(values: number[]): number {
  return values.reduce((acc, val) => acc + val, 0)
}

function mean(values: number[]): number {
  return values.length > 0 ? sum(values) / values.length : 0
}

function stdDev(values: number[]): number {
  if (values.length === 0) return 0
  const avg = mean(values)
  const squareDiffs = values.map(value => Math.pow(value - avg, 2))
  return Math.sqrt(mean(squareDiffs))
}

// ============================================================================
// Moving Averages
// ============================================================================

/**
 * Simple Moving Average (SMA)
 */
export function sma(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] ?? 0
  const slice = prices.slice(-period)
  return mean(slice)
}

/**
 * Exponential Moving Average (EMA)
 */
export function ema(prices: number[], period: number): number {
  if (prices.length === 0) return 0
  if (prices.length < period) return mean(prices)

  const multiplier = 2 / (period + 1)
  let emaValue = mean(prices.slice(0, period))

  for (let i = period; i < prices.length; i++) {
    emaValue = (prices[i] - emaValue) * multiplier + emaValue
  }

  return emaValue
}

/**
 * Calculate multiple EMAs efficiently
 */
export function calculateEMAs(prices: number[], periods: number[]): Record<number, number> {
  const result: Record<number, number> = {}
  for (const period of periods) {
    result[period] = ema(prices, period)
  }
  return result
}

// ============================================================================
// Momentum Indicators
// ============================================================================

/**
 * Relative Strength Index (RSI)
 * Returns value between 0-100
 * > 70 = overbought, < 30 = oversold
 */
export function rsi(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50 // Neutral

  const changes: number[] = []
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1])
  }

  const recentChanges = changes.slice(-period)
  const gains = recentChanges.filter(c => c > 0)
  const losses = recentChanges.filter(c => c < 0).map(Math.abs)

  const avgGain = gains.length > 0 ? mean(gains) : 0
  const avgLoss = losses.length > 0 ? mean(losses) : 0.001 // Avoid division by zero

  const rs = avgGain / avgLoss
  return 100 - (100 / (1 + rs))
}

/**
 * Stochastic Oscillator
 * Returns value between 0-100
 * > 80 = overbought, < 20 = oversold
 */
export function stochastic(candles: Candle[], period: number = 14): { k: number; d: number } {
  if (candles.length < period) {
    return { k: 50, d: 50 } // Neutral
  }

  const recentCandles = candles.slice(-period)
  const closes = recentCandles.map(c => c.close)
  const highs = recentCandles.map(c => c.high)
  const lows = recentCandles.map(c => c.low)

  const currentClose = closes[closes.length - 1]
  const lowestLow = Math.min(...lows)
  const highestHigh = Math.max(...highs)

  const k = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100

  // %D is 3-period SMA of %K (simplified - would need multiple K values for true %D)
  const d = k // Simplified

  return { k, d }
}

/**
 * MACD (Moving Average Convergence Divergence)
 */
export function macd(
  prices: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macd: number; signal: number; histogram: number } {
  if (prices.length < slowPeriod) {
    return { macd: 0, signal: 0, histogram: 0 }
  }

  const fastEMA = ema(prices, fastPeriod)
  const slowEMA = ema(prices, slowPeriod)
  const macdLine = fastEMA - slowEMA

  // For signal, we'd need to calculate EMA of MACD values over time
  // Simplified: use a fraction of MACD as signal
  const signalLine = macdLine * 0.8 // Simplified

  const histogram = macdLine - signalLine

  return {
    macd: macdLine,
    signal: signalLine,
    histogram,
  }
}

// ============================================================================
// Volatility Indicators
// ============================================================================

/**
 * Average True Range (ATR)
 * Measures market volatility
 */
export function atr(candles: Candle[], period: number = 14): number {
  if (candles.length < 2) return 0

  const trueRanges: number[] = []

  for (let i = 1; i < candles.length; i++) {
    const current = candles[i]
    const previous = candles[i - 1]

    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close)
    )
    trueRanges.push(tr)
  }

  const recentTR = trueRanges.slice(-period)
  return mean(recentTR)
}

/**
 * Bollinger Bands
 */
export function bollingerBands(
  prices: number[],
  period: number = 20,
  stdDevMultiplier: number = 2
): { upper: number; middle: number; lower: number; bandwidth: number } {
  if (prices.length < period) {
    const price = prices[prices.length - 1] ?? 0
    return { upper: price, middle: price, lower: price, bandwidth: 0 }
  }

  const slice = prices.slice(-period)
  const middle = mean(slice)
  const std = stdDev(slice)

  const upper = middle + stdDevMultiplier * std
  const lower = middle - stdDevMultiplier * std
  const bandwidth = ((upper - lower) / middle) * 100

  return { upper, middle, lower, bandwidth }
}

// ============================================================================
// Volume Indicators
// ============================================================================

/**
 * On-Balance Volume (OBV)
 * Cumulative volume indicator
 */
export function obv(candles: Candle[]): number {
  if (candles.length < 2) return 0

  let obvValue = 0

  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) {
      obvValue += candles[i].volume
    } else if (candles[i].close < candles[i - 1].close) {
      obvValue -= candles[i].volume
    }
  }

  return obvValue
}

/**
 * Volume-Weighted Average Price (VWAP)
 */
export function vwap(candles: Candle[]): number {
  if (candles.length === 0) return 0

  let totalPriceVolume = 0
  let totalVolume = 0

  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3
    totalPriceVolume += typicalPrice * candle.volume
    totalVolume += candle.volume
  }

  return totalVolume > 0 ? totalPriceVolume / totalVolume : candles[candles.length - 1].close
}

// ============================================================================
// Trend Indicators
// ============================================================================

/**
 * Average Directional Index (ADX)
 * Measures trend strength (0-100)
 * > 25 = strong trend, < 20 = weak/ranging
 */
export function adx(candles: Candle[], period: number = 14): number {
  if (candles.length < period + 1) return 0

  const plusDM: number[] = []
  const minusDM: number[] = []
  const trueRanges: number[] = []

  for (let i = 1; i < candles.length; i++) {
    const current = candles[i]
    const previous = candles[i - 1]

    const highDiff = current.high - previous.high
    const lowDiff = previous.low - current.low

    plusDM.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0)
    minusDM.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0)

    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close)
    )
    trueRanges.push(tr)
  }

  const smoothedPlusDM = ema(plusDM, period)
  const smoothedMinusDM = ema(minusDM, period)
  const smoothedTR = ema(trueRanges, period)

  const plusDI = (smoothedPlusDM / smoothedTR) * 100
  const minusDI = (smoothedMinusDM / smoothedTR) * 100

  const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100

  // ADX is smoothed DX (simplified - would need multiple DX values for true ADX)
  return dx
}

/**
 * Parabolic SAR
 * Returns stop and reverse levels
 */
export function parabolicSAR(
  candles: Candle[],
  acceleration: number = 0.02,
  maximum: number = 0.2
): { sar: number; isLong: boolean } {
  if (candles.length < 2) {
    return { sar: candles[0]?.low ?? 0, isLong: true }
  }

  // Simplified SAR calculation
  const recentCandles = candles.slice(-10)
  const currentPrice = recentCandles[recentCandles.length - 1].close
  const lowestLow = Math.min(...recentCandles.map(c => c.low))
  const highestHigh = Math.max(...recentCandles.map(c => c.high))

  const isUptrend = currentPrice > (highestHigh + lowestLow) / 2

  return {
    sar: isUptrend ? lowestLow : highestHigh,
    isLong: isUptrend,
  }
}

// ============================================================================
// Support/Resistance Levels
// ============================================================================

/**
 * Find pivot points (support/resistance levels)
 */
export function pivotPoints(candle: Candle): {
  pivot: number
  r1: number
  r2: number
  r3: number
  s1: number
  s2: number
  s3: number
} {
  const pivot = (candle.high + candle.low + candle.close) / 3

  const r1 = 2 * pivot - candle.low
  const s1 = 2 * pivot - candle.high
  const r2 = pivot + (candle.high - candle.low)
  const s2 = pivot - (candle.high - candle.low)
  const r3 = candle.high + 2 * (pivot - candle.low)
  const s3 = candle.low - 2 * (candle.high - pivot)

  return { pivot, r1, r2, r3, s1, s2, s3 }
}

/**
 * Detect support/resistance zones from historical highs/lows
 */
export function findSupportResistanceLevels(
  candles: Candle[],
  lookback: number = 100
): { supports: number[]; resistances: number[] } {
  if (candles.length < lookback) {
    lookback = candles.length
  }

  const recentCandles = candles.slice(-lookback)
  const highs = recentCandles.map(c => c.high)
  const lows = recentCandles.map(c => c.low)

  // Find local peaks and troughs
  const resistances: number[] = []
  const supports: number[] = []

  for (let i = 5; i < highs.length - 5; i++) {
    const isPeak = highs.slice(i - 5, i).every(h => h < highs[i]) &&
                   highs.slice(i + 1, i + 6).every(h => h < highs[i])

    if (isPeak) {
      resistances.push(highs[i])
    }

    const isTrough = lows.slice(i - 5, i).every(l => l > lows[i]) &&
                     lows.slice(i + 1, i + 6).every(l => l > lows[i])

    if (isTrough) {
      supports.push(lows[i])
    }
  }

  // Cluster nearby levels (within 1% of each other)
  const clusterLevels = (levels: number[]): number[] => {
    if (levels.length === 0) return []

    const sorted = [...levels].sort((a, b) => a - b)
    const clustered: number[] = [sorted[0]]

    for (let i = 1; i < sorted.length; i++) {
      const lastCluster = clustered[clustered.length - 1]
      if (Math.abs(sorted[i] - lastCluster) / lastCluster > 0.01) {
        clustered.push(sorted[i])
      }
    }

    return clustered
  }

  return {
    supports: clusterLevels(supports).slice(-5), // Keep top 5
    resistances: clusterLevels(resistances).slice(-5),
  }
}

// ============================================================================
// Pattern Recognition
// ============================================================================

/**
 * Detect trend based on multiple indicators
 */
export function detectTrend(
  prices: number[],
  candles: Candle[]
): "strong_uptrend" | "uptrend" | "ranging" | "downtrend" | "strong_downtrend" {
  if (prices.length < 50) return "ranging"

  const ema20 = ema(prices, 20)
  const ema50 = ema(prices, 50)
  const currentPrice = prices[prices.length - 1]
  const adxValue = adx(candles, 14)

  // Strong uptrend: price > EMA20 > EMA50 AND ADX > 25
  if (currentPrice > ema20 && ema20 > ema50 && adxValue > 25) {
    return "strong_uptrend"
  }

  // Uptrend: price > EMA20 > EMA50
  if (currentPrice > ema20 && ema20 > ema50) {
    return "uptrend"
  }

  // Strong downtrend: price < EMA20 < EMA50 AND ADX > 25
  if (currentPrice < ema20 && ema20 < ema50 && adxValue > 25) {
    return "strong_downtrend"
  }

  // Downtrend: price < EMA20 < EMA50
  if (currentPrice < ema20 && ema20 < ema50) {
    return "downtrend"
  }

  return "ranging"
}

/**
 * Check if price is near support/resistance
 */
export function nearLevelCheck(
  currentPrice: number,
  levels: number[],
  threshold: number = 0.005 // 0.5%
): { near: boolean; level: number | null; distance: number } {
  for (const level of levels) {
    const distance = Math.abs(currentPrice - level) / level
    if (distance <= threshold) {
      return { near: true, level, distance }
    }
  }
  return { near: false, level: null, distance: 1 }
}
