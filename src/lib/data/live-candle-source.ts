import type { Candle, CandleSource } from "@/lib/types"
import { MockCandleSource } from "./mock-candle-source"

type LiveCandleSourceOptions = {
  symbol?: string
  endpoint?: string
  batchSize?: number
  provider?: string
  fallback?: CandleSource
}

const DEFAULT_SYMBOL = process.env.NEXT_PUBLIC_BALANCE_SYMBOL ?? "SPY"
const DEFAULT_ENDPOINT = "/api/candles"
const DEFAULT_BATCH_SIZE = 120
const DEFAULT_PROVIDER = process.env.NEXT_PUBLIC_BALANCE_DATA_PROVIDER ?? "polygon"

export class LiveCandleSource implements CandleSource {
  private readonly symbol: string
  private readonly endpoint: string
  private readonly batchSize: number
  private readonly provider: string
  private readonly fallback: CandleSource

  private queue: Candle[] = []
  private lastCandle: Candle | null = null
  private fetching = false

  constructor(options: LiveCandleSourceOptions = {}) {
    this.symbol = options.symbol ?? DEFAULT_SYMBOL
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE
    this.provider = options.provider ?? DEFAULT_PROVIDER
    this.fallback = options.fallback ?? new MockCandleSource()

    if (typeof window !== "undefined") {
      void this.prefetch()
    }
  }

  next(): Candle {
    if (this.queue.length <= Math.max(1, Math.floor(this.batchSize / 3))) {
      void this.prefetch()
    }

    const nextCandle = this.queue.shift()
    if (nextCandle) {
      this.lastCandle = nextCandle
      return nextCandle
    }

    if (this.lastCandle) {
      return this.cloneWithForwardTimestamp(this.lastCandle)
    }

    const fallbackCandle = this.fallback.next()
    this.lastCandle = fallbackCandle
    return fallbackCandle
  }

  peek(): Candle {
    if (this.queue.length === 0) {
      void this.prefetch()
      return this.lastCandle ?? this.fallback.peek()
    }

    return this.queue[0]
  }

  reset(): void {
    this.queue = []
    this.lastCandle = null
    this.fetching = false
    this.fallback.reset()

    if (typeof window !== "undefined") {
      void this.prefetch()
    }
  }

  private async prefetch(): Promise<void> {
    if (this.fetching) return

    this.fetching = true
    try {
      const url = `${this.endpoint}?symbol=${encodeURIComponent(this.symbol)}&limit=${this.batchSize}&provider=${encodeURIComponent(this.provider)}`
      const response = await fetch(url, { cache: "no-store" })

      if (!response.ok) {
        throw new Error(`Failed to fetch live candles: ${response.status}`)
      }

      const data = (await response.json()) as { candles?: Candle[] } | null
      const candles = Array.isArray(data?.candles) ? data!.candles : []

      if (candles.length > 0) {
        const filtered = candles
          .filter(Boolean)
          .map((candle) => ({
            ...candle,
            timestamp: Math.round(candle.timestamp),
          }))
          .filter((candle) => !this.lastCandle || candle.timestamp > this.lastCandle.timestamp)
          .sort((a, b) => a.timestamp - b.timestamp)

        if (filtered.length > 0) {
          this.queue.push(...filtered)
          return
        }
      }

      this.enqueueFallbackBatch()
    } catch (error) {
      console.error("[LiveCandleSource] Falling back to mock data:", error)
      this.enqueueFallbackBatch()
    } finally {
      this.fetching = false
    }
  }

  private enqueueFallbackBatch(): void {
    for (let i = 0; i < this.batchSize; i++) {
      const candle = this.fallback.next()
      this.queue.push(candle)
      this.lastCandle = candle
    }
  }

  private cloneWithForwardTimestamp(candle: Candle): Candle {
    const nextTimestamp = candle.timestamp + 60 * 1000
    return {
      ...candle,
      timestamp: nextTimestamp,
      open: candle.close,
      high: candle.close,
      low: candle.close,
      close: candle.close,
      volume: candle.volume,
    }
  }
}
