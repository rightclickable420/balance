/**
 * Pyth HTTP API Client for Real-Time SOL Price Streaming
 *
 * Uses Pyth Hermes API for reliable, up-to-date SOL/USD prices
 * NO RATE LIMITS - Designed for high-frequency polling
 */

// Pyth Hermes API endpoint
const PYTH_HERMES_API = 'https://hermes.pyth.network/v2/updates/price/latest'

// SOL/USD price feed ID
const SOL_USD_FEED_ID = '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d'

interface PythPrice {
  price: string
  conf: string
  expo: number
  publish_time: number
}

interface PythResponse {
  parsed: Array<{
    id: string
    price: PythPrice
    ema_price: PythPrice
  }>
}

export class PythHttpClient {
  private pollingInterval: NodeJS.Timeout | null = null
  private isRunning = false
  private onPriceUpdate: ((price: number) => void) | null = null
  private pollIntervalMs: number

  constructor(pollIntervalMs: number = 1000) {
    this.pollIntervalMs = pollIntervalMs
  }

  async start(onPriceUpdate: (price: number) => void) {
    if (this.isRunning) {
      console.log('[PythHTTP] Already running')
      return
    }

    this.isRunning = true
    this.onPriceUpdate = onPriceUpdate
    console.log('[PythHTTP] Starting SOL/USD price stream from Pyth Hermes API')
    console.log('[PythHTTP] Poll interval:', this.pollIntervalMs, 'ms')

    // Fetch initial price
    await this.fetchPrice()

    // Start polling
    this.pollingInterval = setInterval(() => {
      this.fetchPrice()
    }, this.pollIntervalMs)

    console.log('[PythHTTP] ✅ Started successfully')
  }

  private async fetchPrice() {
    try {
      const url = `${PYTH_HERMES_API}?ids[]=${SOL_USD_FEED_ID}`
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Pyth API error: ${response.status} ${response.statusText}`)
      }

      const data: PythResponse = await response.json()

      if (!data.parsed || data.parsed.length === 0) {
        console.warn('[PythHTTP] No price data in response')
        return
      }

      const priceData = data.parsed[0].price

      // Parse price: price * 10^expo
      const priceValue = BigInt(priceData.price)
      const expo = priceData.expo
      const priceNumber = Number(priceValue) * Math.pow(10, expo)

      if (this.onPriceUpdate) {
        this.onPriceUpdate(priceNumber)
      }

      console.log(`[PythHTTP] 📊 SOL/USD: $${priceNumber.toFixed(2)} (${new Date(priceData.publish_time * 1000).toISOString()})`)
    } catch (error) {
      console.error('[PythHTTP] Failed to fetch price:', error)
    }
  }

  stop() {
    console.log('[PythHTTP] Stopping...')
    this.isRunning = false

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }

    console.log('[PythHTTP] Stopped')
  }
}
