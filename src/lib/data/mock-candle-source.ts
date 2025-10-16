import type { Candle, CandleSource } from "../types"

/**
 * Mock candle source with deterministic pseudo-random walk
 * Produces realistic-looking OHLCV data for demo mode
 */
export class MockCandleSource implements CandleSource {
  private index = 0
  private lastClose = 100
  private rng: () => number

  constructor(seed = 42) {
    // Simple seeded RNG (mulberry32)
    let state = seed
    this.rng = () => {
      state = (state + 0x6d2b79f5) | 0
      let t = Math.imul(state ^ (state >>> 15), 1 | state)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  next(): Candle {
    const candle = this.generateCandle(this.index)
    this.index++
    this.lastClose = candle.close
    return candle
  }

  peek(): Candle {
    return this.generateCandle(this.index)
  }

  reset(): void {
    this.index = 0
    this.lastClose = 100
  }

  private generateCandle(index: number): Candle {
    const timestamp = Date.now() + index * 60000 // 1min candles

    // Random walk with mean reversion
    const drift = (100 - this.lastClose) * 0.01 // pull toward 100
    const volatility = 2
    const change = drift + (this.rng() - 0.5) * volatility

    const open = this.lastClose
    const close = open + change

    // Generate high/low with realistic wicks
    const wickRange = Math.abs(change) * (0.5 + this.rng() * 1.5)
    const high = Math.max(open, close) + this.rng() * wickRange
    const low = Math.min(open, close) - this.rng() * wickRange

    // Volume varies randomly
    const volume = 500000 + this.rng() * 1000000

    return { timestamp, open, high, low, close, volume }
  }
}
