/**
 * Multi-Timeframe Confluence Analysis
 *
 * Combines multiple timeframes and indicators to generate high-conviction trading signals
 */

import type { Candle } from "@/lib/types"
import {
  sma,
  ema,
  rsi,
  macd,
  atr,
  bollingerBands,
  adx,
  detectTrend,
  findSupportResistanceLevels,
  nearLevelCheck,
  pivotPoints,
} from "./technical-indicators"

// ============================================================================
// Types
// ============================================================================

export type TimeframeName = "1m" | "5m" | "15m" | "1h" | "4h" | "1d"
export type TrendDirection = "strong_uptrend" | "uptrend" | "ranging" | "downtrend" | "strong_downtrend"
export type Signal = "strong_long" | "long" | "neutral" | "short" | "strong_short"

export interface TimeframeAnalysis {
  timeframe: TimeframeName
  trend: TrendDirection
  rsi: number
  macd: { macd: number; signal: number; histogram: number }
  adx: number
  ema20: number
  ema50: number
  ema200: number
  bollingerBands: { upper: number; middle: number; lower: number; bandwidth: number }
  atr: number
  currentPrice: number
  signal: Signal
  conviction: number // 0-1
}

export interface SupportResistance {
  supports: number[]
  resistances: number[]
  nearSupport: { near: boolean; level: number | null; distance: number }
  nearResistance: { near: boolean; level: number | null; distance: number }
}

export interface MultiTimeframeSignal {
  primarySignal: Signal
  conviction: number // 0-1, confidence in the signal
  trend: {
    short: TrendDirection // 1m-5m
    medium: TrendDirection // 15m-1h
    long: TrendDirection // 4h-1d
    aligned: boolean // All trends pointing same direction
  }
  indicators: {
    rsiOverbought: boolean // RSI > 70 on any timeframe
    rsiOversold: boolean // RSI < 30 on any timeframe
    macdBullish: number // Count of bullish MACD crossovers
    macdBearish: number // Count of bearish MACD crossovers
    strongTrend: boolean // ADX > 25 on majority of timeframes
  }
  levels: SupportResistance
  timeframes: TimeframeAnalysis[]
  timestamp: number
}

// ============================================================================
// Candle Aggregation
// ============================================================================

/**
 * Aggregate 1-second candles into larger timeframes
 */
function aggregateCandles(candles: Candle[], intervalSeconds: number): Candle[] {
  if (candles.length === 0) return []

  const aggregated: Candle[] = []
  const intervalMs = intervalSeconds * 1000

  // Group candles by time intervals
  let currentGroup: Candle[] = []
  let groupStartTime = Math.floor(candles[0].timestamp / intervalMs) * intervalMs

  for (const candle of candles) {
    const candleInterval = Math.floor(candle.timestamp / intervalMs) * intervalMs

    if (candleInterval === groupStartTime) {
      currentGroup.push(candle)
    } else {
      // Finalize current group
      if (currentGroup.length > 0) {
        aggregated.push(buildAggregatedCandle(currentGroup, groupStartTime))
      }
      // Start new group
      currentGroup = [candle]
      groupStartTime = candleInterval
    }
  }

  // Finalize last group
  if (currentGroup.length > 0) {
    aggregated.push(buildAggregatedCandle(currentGroup, groupStartTime))
  }

  return aggregated
}

function buildAggregatedCandle(candles: Candle[], timestamp: number): Candle {
  return {
    timestamp,
    open: candles[0].open,
    high: Math.max(...candles.map(c => c.high)),
    low: Math.min(...candles.map(c => c.low)),
    close: candles[candles.length - 1].close,
    volume: candles.reduce((sum, c) => sum + c.volume, 0),
  }
}

// ============================================================================
// Single Timeframe Analysis
// ============================================================================

function analyzeTimeframe(candles: Candle[], timeframeName: TimeframeName): TimeframeAnalysis {
  if (candles.length === 0) {
    return {
      timeframe: timeframeName,
      trend: "ranging",
      rsi: 50,
      macd: { macd: 0, signal: 0, histogram: 0 },
      adx: 0,
      ema20: 0,
      ema50: 0,
      ema200: 0,
      bollingerBands: { upper: 0, middle: 0, lower: 0, bandwidth: 0 },
      atr: 0,
      currentPrice: 0,
      signal: "neutral",
      conviction: 0,
    }
  }

  const prices = candles.map(c => c.close)
  const currentPrice = prices[prices.length - 1]

  // Calculate indicators
  const rsiValue = rsi(prices, 14)
  const macdValue = macd(prices, 12, 26, 9)
  const adxValue = adx(candles, 14)
  const ema20 = ema(prices, 20)
  const ema50 = ema(prices, 50)
  const ema200 = ema(prices, 200)
  const bb = bollingerBands(prices, 20, 2)
  const atrValue = atr(candles, 14)
  const trend = detectTrend(prices, candles)

  // Generate signal based on indicators
  let signal: Signal = "neutral"
  let conviction = 0

  // Bullish signals
  if (
    trend === "strong_uptrend" &&
    rsiValue < 70 &&
    macdValue.histogram > 0 &&
    currentPrice > ema20 &&
    ema20 > ema50
  ) {
    signal = "strong_long"
    conviction = 0.8 + (adxValue / 100) * 0.2
  } else if (
    (trend === "uptrend" || trend === "strong_uptrend") &&
    rsiValue < 65 &&
    currentPrice > ema20
  ) {
    signal = "long"
    conviction = 0.5 + (adxValue / 100) * 0.2
  }
  // Bearish signals
  else if (
    trend === "strong_downtrend" &&
    rsiValue > 30 &&
    macdValue.histogram < 0 &&
    currentPrice < ema20 &&
    ema20 < ema50
  ) {
    signal = "strong_short"
    conviction = 0.8 + (adxValue / 100) * 0.2
  } else if (
    (trend === "downtrend" || trend === "strong_downtrend") &&
    rsiValue > 35 &&
    currentPrice < ema20
  ) {
    signal = "short"
    conviction = 0.5 + (adxValue / 100) * 0.2
  }
  // Neutral/ranging
  else {
    signal = "neutral"
    conviction = 0.2
  }

  return {
    timeframe: timeframeName,
    trend,
    rsi: rsiValue,
    macd: macdValue,
    adx: adxValue,
    ema20,
    ema50,
    ema200,
    bollingerBands: bb,
    atr: atrValue,
    currentPrice,
    signal,
    conviction,
  }
}

// ============================================================================
// Multi-Timeframe Confluence
// ============================================================================

/**
 * Analyze multiple timeframes and generate confluence signal
 */
export function analyzeMultiTimeframe(
  candles1s: Candle[], // 1-second candles (historical)
  options?: {
    requireTrendAlignment?: boolean // Require all timeframes to agree on trend
    minConviction?: number // Minimum conviction to generate signal (0-1)
  }
): MultiTimeframeSignal {
  const requireAlignment = options?.requireTrendAlignment ?? true
  const minConviction = options?.minConviction ?? 0.6

  // Aggregate candles into different timeframes
  const candles1m = aggregateCandles(candles1s, 60) // 1 minute
  const candles5m = aggregateCandles(candles1s, 300) // 5 minutes
  const candles15m = aggregateCandles(candles1s, 900) // 15 minutes
  const candles1h = aggregateCandles(candles1s, 3600) // 1 hour
  const candles4h = aggregateCandles(candles1s, 14400) // 4 hours
  const candles1d = aggregateCandles(candles1s, 86400) // 1 day

  // Analyze each timeframe
  const tf1m = analyzeTimeframe(candles1m, "1m")
  const tf5m = analyzeTimeframe(candles5m, "5m")
  const tf15m = analyzeTimeframe(candles15m, "15m")
  const tf1h = analyzeTimeframe(candles1h, "1h")
  const tf4h = analyzeTimeframe(candles4h, "4h")
  const tf1d = analyzeTimeframe(candles1d, "1d")

  const timeframes = [tf1m, tf5m, tf15m, tf1h, tf4h, tf1d]

  // Determine trend alignment
  const shortTrend = tf5m.trend // Short-term: 1m-5m
  const mediumTrend = tf1h.trend // Medium-term: 15m-1h
  const longTrend = tf1d.trend // Long-term: 4h-1d

  const trendAligned =
    (shortTrend.includes("uptrend") &&
      mediumTrend.includes("uptrend") &&
      longTrend.includes("uptrend")) ||
    (shortTrend.includes("downtrend") &&
      mediumTrend.includes("downtrend") &&
      longTrend.includes("downtrend"))

  // Count indicator confluences
  const rsiOverbought = timeframes.some(tf => tf.rsi > 70)
  const rsiOversold = timeframes.some(tf => tf.rsi < 30)
  const macdBullish = timeframes.filter(tf => tf.macd.histogram > 0).length
  const macdBearish = timeframes.filter(tf => tf.macd.histogram < 0).length
  const strongTrend = timeframes.filter(tf => tf.adx > 25).length >= timeframes.length / 2

  // Find support/resistance levels from longer timeframes
  const levels = findSupportResistanceLevels(candles1h, 100)
  const currentPrice = tf1m.currentPrice
  const nearSupport = nearLevelCheck(currentPrice, levels.supports, 0.005)
  const nearResistance = nearLevelCheck(currentPrice, levels.resistances, 0.005)

  // Calculate primary signal and conviction
  let primarySignal: Signal = "neutral"
  let conviction = 0

  // Count bullish vs bearish signals across timeframes
  const longSignals = timeframes.filter(tf => tf.signal === "long" || tf.signal === "strong_long")
  const shortSignals = timeframes.filter(tf => tf.signal === "short" || tf.signal === "strong_short")
  const strongLongSignals = timeframes.filter(tf => tf.signal === "strong_long")
  const strongShortSignals = timeframes.filter(tf => tf.signal === "strong_short")

  // Weighted conviction by timeframe importance
  const weights = {
    "1m": 0.05,
    "5m": 0.10,
    "15m": 0.15,
    "1h": 0.30,
    "4h": 0.25,
    "1d": 0.15,
  }

  let weightedConviction = 0
  let totalBullishWeight = 0
  let totalBearishWeight = 0

  for (const tf of timeframes) {
    const weight = weights[tf.timeframe]
    weightedConviction += tf.conviction * weight

    if (tf.signal === "long" || tf.signal === "strong_long") {
      totalBullishWeight += weight
    } else if (tf.signal === "short" || tf.signal === "strong_short") {
      totalBearishWeight += weight
    }
  }

  // Determine primary signal
  if (longSignals.length >= 4 && totalBullishWeight > 0.6 && !rsiOverbought) {
    if (strongLongSignals.length >= 2 && trendAligned && strongTrend) {
      primarySignal = "strong_long"
      conviction = Math.min(0.95, weightedConviction * 1.2)
    } else {
      primarySignal = "long"
      conviction = Math.min(0.85, weightedConviction)
    }

    // Boost conviction if near support
    if (nearSupport.near) {
      conviction = Math.min(1.0, conviction * 1.15)
    }
  } else if (shortSignals.length >= 4 && totalBearishWeight > 0.6 && !rsiOversold) {
    if (strongShortSignals.length >= 2 && trendAligned && strongTrend) {
      primarySignal = "strong_short"
      conviction = Math.min(0.95, weightedConviction * 1.2)
    } else {
      primarySignal = "short"
      conviction = Math.min(0.85, weightedConviction)
    }

    // Boost conviction if near resistance
    if (nearResistance.near) {
      conviction = Math.min(1.0, conviction * 1.15)
    }
  } else {
    primarySignal = "neutral"
    conviction = weightedConviction * 0.5
  }

  // Apply trend alignment filter
  if (requireAlignment && !trendAligned && primarySignal !== "neutral") {
    conviction *= 0.6 // Reduce conviction if trends don't align
  }

  // Apply minimum conviction filter
  if (conviction < minConviction && primarySignal !== "neutral") {
    primarySignal = "neutral"
    conviction *= 0.5
  }

  return {
    primarySignal,
    conviction,
    trend: {
      short: shortTrend,
      medium: mediumTrend,
      long: longTrend,
      aligned: trendAligned,
    },
    indicators: {
      rsiOverbought,
      rsiOversold,
      macdBullish,
      macdBearish,
      strongTrend,
    },
    levels: {
      supports: levels.supports,
      resistances: levels.resistances,
      nearSupport,
      nearResistance,
    },
    timeframes,
    timestamp: Date.now(),
  }
}

/**
 * Convert multi-timeframe signal to trading stance
 */
export function signalToStance(signal: MultiTimeframeSignal): "long" | "short" | "flat" {
  if (signal.primarySignal === "strong_long" || signal.primarySignal === "long") {
    return "long"
  }
  if (signal.primarySignal === "strong_short" || signal.primarySignal === "short") {
    return "short"
  }
  return "flat"
}

/**
 * Log multi-timeframe analysis to console
 */
export function logMultiTimeframeAnalysis(signal: MultiTimeframeSignal): void {
  console.log("=".repeat(80))
  console.log("📊 MULTI-TIMEFRAME ANALYSIS")
  console.log("=".repeat(80))
  console.log(
    `🎯 Primary Signal: ${signal.primarySignal.toUpperCase()} (Conviction: ${(signal.conviction * 100).toFixed(1)}%)`
  )
  console.log("")
  console.log("📈 Trend Analysis:")
  console.log(`  Short-term (1m-5m):  ${signal.trend.short}`)
  console.log(`  Medium-term (15m-1h): ${signal.trend.medium}`)
  console.log(`  Long-term (4h-1d):   ${signal.trend.long}`)
  console.log(`  Aligned: ${signal.trend.aligned ? "✅ YES" : "❌ NO"}`)
  console.log("")
  console.log("📉 Indicators:")
  console.log(`  RSI Overbought: ${signal.indicators.rsiOverbought ? "⚠️ YES" : "✅ NO"}`)
  console.log(`  RSI Oversold: ${signal.indicators.rsiOversold ? "⚠️ YES" : "✅ NO"}`)
  console.log(`  MACD Bullish: ${signal.indicators.macdBullish}/6 timeframes`)
  console.log(`  MACD Bearish: ${signal.indicators.macdBearish}/6 timeframes`)
  console.log(`  Strong Trend: ${signal.indicators.strongTrend ? "✅ YES" : "❌ NO"}`)
  console.log("")
  console.log("🎚️  Support/Resistance:")
  console.log(`  Supports: ${signal.levels.supports.map(s => s.toFixed(2)).join(", ")}`)
  console.log(`  Resistances: ${signal.levels.resistances.map(r => r.toFixed(2)).join(", ")}`)
  if (signal.levels.nearSupport.near) {
    console.log(
      `  📍 Near Support: $${signal.levels.nearSupport.level?.toFixed(2)} (${(signal.levels.nearSupport.distance * 100).toFixed(2)}% away)`
    )
  }
  if (signal.levels.nearResistance.near) {
    console.log(
      `  📍 Near Resistance: $${signal.levels.nearResistance.level?.toFixed(2)} (${(signal.levels.nearResistance.distance * 100).toFixed(2)}% away)`
    )
  }
  console.log("")
  console.log("⏱️  Timeframe Details:")
  for (const tf of signal.timeframes) {
    console.log(`  ${tf.timeframe}: ${tf.signal} (${tf.trend}, RSI:${tf.rsi.toFixed(1)}, ADX:${tf.adx.toFixed(1)})`)
  }
  console.log("=".repeat(80))
}
