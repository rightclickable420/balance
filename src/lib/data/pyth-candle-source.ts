import type { Candle, CandleSource } from "@/lib/types"

const SOL_USD_FEED_ID = "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d"
const PYTH_HERMES_ENDPOINT = "https://hermes.pyth.network/v2/updates/price/latest"

interface HermesPrice {
  price: string
  expo: number
  publish_time: number
}

interface HermesResponse {
  parsed: Array<{
    id: string
    price: HermesPrice
  }>
}

class CandleBuilder {
  private prices: number[] = []
  private startTime = Date.now()

  constructor(private readonly windowMs = 1000) {}

  addPrice(price: number) {
    this.prices.push(price)
  }

  shouldFinalize(): boolean {
    return Date.now() - this.startTime >= this.windowMs
  }

  finalize(): Candle | null {
    if (this.prices.length === 0) {
      return null
    }

    const candle: Candle = {
      timestamp: this.startTime,
      open: this.prices[0],
      high: Math.max(...this.prices),
      low: Math.min(...this.prices),
      close: this.prices[this.prices.length - 1],
      volume: 0, // Volume data not available from Pyth HTTP API
    }

    return candle
  }

  reset() {
    this.prices = []
    this.startTime = Date.now()
  }
}

export class PythCandleSource implements CandleSource {
  private readonly pollMs: number
  private readonly builder = new CandleBuilder()
  private priceTimer: number | null = null
  private finalizeTimer: number | null = null
  private queue: Candle[] = []
  private lastCandle: Candle | null = null
  private started = false
  private readonly source = "pyth"

  constructor(pollMs: number = 400) {
    this.pollMs = pollMs
  }

  private ensureStarted() {
    if (this.started) return
    if (typeof window === "undefined") {
      console.warn("[PythCandleSource] Window not available, staying idle")
      return
    }

    this.started = true
    this.fetchPrice() // Prime immediately
    this.priceTimer = window.setInterval(() => {
      this.fetchPrice()
    }, this.pollMs)

    // Check multiple times per second if we should finalize the candle
    this.finalizeTimer = window.setInterval(() => {
      if (this.builder.shouldFinalize()) {
        const candle = this.builder.finalize()
        this.builder.reset()
        if (candle) {
          this.queue.push(candle)
          this.lastCandle = candle
        }
      }
    }, 200)

    console.log("[PythCandleSource] ✅ Started polling Hermes API for SOL/USD")
  }

  private async fetchPrice() {
    try {
      const url = `${PYTH_HERMES_ENDPOINT}?ids[]=${SOL_USD_FEED_ID}`
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = (await response.json()) as HermesResponse
      const priceData = data.parsed?.[0]?.price
      if (!priceData) {
        console.warn("[PythCandleSource] No price data in response")
        return
      }

      const price = Number(priceData.price) * Math.pow(10, priceData.expo)
      if (Number.isFinite(price)) {
        this.builder.addPrice(price)
      }
    } catch (error) {
      console.error("[PythCandleSource] Failed to fetch price:", error)
    }
  }

  next(): Candle {
    this.ensureStarted()

    if (this.queue.length > 0) {
      const candle = this.queue.shift()!
      this.lastCandle = candle
      return candle
    }

    if (this.lastCandle) {
      return { ...this.lastCandle, timestamp: Date.now() }
    }

    return {
      timestamp: Date.now(),
      open: 0,
      high: 0,
      low: 0,
      close: 0,
      volume: 0,
    }
  }

  peek(): Candle {
    if (this.queue.length > 0) {
      return this.queue[0]
    }
    return this.lastCandle ?? this.next()
  }

  reset(): void {
    this.queue = []
    this.lastCandle = null
  }

  getSource(): string {
    return this.source
  }
}
