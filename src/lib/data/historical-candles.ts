import type { Candle } from "@/lib/types"

const SOL_USD_FEED_ID = "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d"
const PYTH_HERMES_ENDPOINT = "https://hermes.pyth.network"

interface PythHistoricalPrice {
  price: string
  expo: number
  publish_time: number
}

interface PythHistoricalResponse {
  parsed: Array<{
    id: string
    price: PythHistoricalPrice
  }>
}

/**
 * Fetch historical 1-second candles from Pyth Hermes API
 *
 * @param durationSeconds - How many seconds of history to fetch (e.g., 3600 for 1 hour)
 * @param candleIntervalSeconds - Candle interval in seconds (default: 1)
 * @returns Array of historical candles, oldest first
 */
export async function fetchHistoricalCandles(
  durationSeconds: number = 3600,
  candleIntervalSeconds: number = 1
): Promise<Candle[]> {
  console.log(`[HistoricalCandles] Fetching ${durationSeconds}s of SOL/USD history...`)

  const now = Math.floor(Date.now() / 1000) // Current Unix timestamp
  const startTime = now - durationSeconds

  // Pyth updates ~2-3x per second, so we'll sample at 2 Hz for 1s candles
  // For longer intervals, we'll aggregate multiple prices
  const samplesPerCandle = Math.max(2, candleIntervalSeconds * 2)
  const totalSamples = Math.ceil((durationSeconds / candleIntervalSeconds) * samplesPerCandle)

  const prices: Array<{ timestamp: number; price: number }> = []

  console.log(`[HistoricalCandles] Sampling ${totalSamples} price points...`)

  // Fetch prices in parallel batches to speed up
  const BATCH_SIZE = 20
  const timestamps: number[] = []

  for (let i = 0; i < totalSamples; i++) {
    const ts = startTime + Math.floor((i / totalSamples) * durationSeconds)
    timestamps.push(ts)
  }

  // Fetch in batches
  for (let i = 0; i < timestamps.length; i += BATCH_SIZE) {
    const batch = timestamps.slice(i, i + BATCH_SIZE)
    const batchPromises = batch.map(ts => fetchPriceAtTime(ts))

    try {
      const batchResults = await Promise.all(batchPromises)
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j]
        if (result !== null) {
          prices.push({
            timestamp: batch[j],
            price: result,
          })
        }
      }
    } catch (error) {
      console.warn(`[HistoricalCandles] Batch ${i / BATCH_SIZE + 1} failed:`, error)
    }

    // Rate limiting: wait 100ms between batches
    if (i + BATCH_SIZE < timestamps.length) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  console.log(`[HistoricalCandles] Fetched ${prices.length} price samples`)

  if (prices.length === 0) {
    console.warn("[HistoricalCandles] No historical data available")
    return []
  }

  // Build candles from price samples
  const candles: Candle[] = []
  const candleIntervalMs = candleIntervalSeconds * 1000

  for (let ts = startTime; ts < now; ts += candleIntervalSeconds) {
    const candleStart = ts
    const candleEnd = ts + candleIntervalSeconds

    // Get all prices within this candle window
    const candlePrices = prices.filter(
      p => p.timestamp >= candleStart && p.timestamp < candleEnd
    )

    if (candlePrices.length === 0) {
      // No data for this candle - skip or use last known price
      if (candles.length > 0) {
        const lastCandle = candles[candles.length - 1]
        candles.push({
          timestamp: candleStart * 1000, // Convert to milliseconds
          open: lastCandle.close,
          high: lastCandle.close,
          low: lastCandle.close,
          close: lastCandle.close,
          volume: 0,
        })
      }
      continue
    }

    const open = candlePrices[0].price
    const close = candlePrices[candlePrices.length - 1].price
    const high = Math.max(...candlePrices.map(p => p.price))
    const low = Math.min(...candlePrices.map(p => p.price))

    candles.push({
      timestamp: candleStart * 1000, // Convert to milliseconds
      open,
      high,
      low,
      close,
      volume: 0, // Pyth doesn't provide volume
    })
  }

  console.log(`[HistoricalCandles] ✅ Built ${candles.length} candles from historical data`)

  return candles
}

/**
 * Fetch a single price at a specific Unix timestamp
 */
async function fetchPriceAtTime(unixTimestamp: number): Promise<number | null> {
  try {
    const url = `${PYTH_HERMES_ENDPOINT}/api/get_price_feed?id=${SOL_USD_FEED_ID}&publish_time=${unixTimestamp}`
    const response = await fetch(url)

    if (!response.ok) {
      // 404 is expected for timestamps without data
      if (response.status === 404) {
        return null
      }
      throw new Error(`HTTP ${response.status}`)
    }

    const data = (await response.json()) as PythHistoricalResponse
    const priceData = data.parsed?.[0]?.price

    if (!priceData) {
      return null
    }

    const price = Number(priceData.price) * Math.pow(10, priceData.expo)
    return Number.isFinite(price) ? price : null
  } catch (error) {
    // Silently skip - some timestamps may not have data
    return null
  }
}

/**
 * Fetch historical data and pre-populate candle history
 * Use this on app startup to avoid waiting for rolling windows to fill
 */
export async function initializeHistoricalData(options?: {
  durationSeconds?: number
  candleIntervalSeconds?: number
}): Promise<Candle[]> {
  const duration = options?.durationSeconds ?? 3600 // Default: 1 hour
  const interval = options?.candleIntervalSeconds ?? 1 // Default: 1 second

  try {
    const candles = await fetchHistoricalCandles(duration, interval)
    console.log(
      `[HistoricalCandles] Initialized ${candles.length} historical candles ` +
      `(${(duration / 60).toFixed(0)} minutes of data)`
    )
    return candles
  } catch (error) {
    console.error("[HistoricalCandles] Failed to initialize historical data:", error)
    return []
  }
}
