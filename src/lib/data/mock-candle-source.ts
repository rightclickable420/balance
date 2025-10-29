import type { Candle, CandleSource } from "../types"

/**
 * Mock candle source with realistic market dynamics
 * Features:
 * - Autocorrelation/momentum (trends persist)
 * - Volatility regimes (calm/volatile periods)
 * - Volume correlation (big moves = high volume)
 * - Mean reversion (prevents runaway prices)
 */
export class MockCandleSource implements CandleSource {
  private index = 0
  private lastClose = 100
  private rng: () => number
  private initialPrice: number
  private readonly source = "mock"

  // Market dynamics state
  private trendMomentum = 0 // Persistent trend component (-1 to 1)
  private volatilityRegime = 1.0 // Current volatility multiplier (0.5 to 2.0)
  private regimeChangeCounter = 0 // Tracks time until next regime shift

  constructor(seed = 42, initialPrice = 100) {
    // Simple seeded RNG (mulberry32)
    let state = seed
    this.rng = () => {
      state = (state + 0x6d2b79f5) | 0
      let t = Math.imul(state ^ (state >>> 15), 1 | state)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    this.initialPrice = initialPrice
    this.lastClose = initialPrice
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
    this.lastClose = this.initialPrice
    this.trendMomentum = 0
    this.volatilityRegime = 1.0
    this.regimeChangeCounter = 0
  }

  static generateSeries(count: number, seed = 42, initialPrice = 100): Candle[] {
    const generator = new MockCandleSource(seed, initialPrice)
    const candles: Candle[] = []
    for (let i = 0; i < count; i++) {
      candles.push(generator.next())
    }
    return candles
  }

  getSource(): string {
    return this.source
  }

  private generateCandle(index: number): Candle {
    const timestamp = Date.now() + index * 1000 // 1 second candles

    // === VOLATILITY REGIME DYNAMICS ===
    // Slowly evolve volatility regime (calm ↔ volatile periods)
    this.regimeChangeCounter++
    if (this.regimeChangeCounter > 20) {
      // Every ~20 candles, adjust regime
      this.volatilityRegime *= 0.95 + (this.rng() - 0.5) * 0.3
      // Clamp between 0.5x (calm) and 2.5x (volatile)
      this.volatilityRegime = Math.max(0.5, Math.min(2.5, this.volatilityRegime))
      this.regimeChangeCounter = 0
    }

    // === TREND MOMENTUM (AUTOCORRELATION) ===
    // Trends persist but slowly decay toward 0
    // New shocks can reinforce or reverse the trend
    const trendDecay = 0.95 // Trends decay slowly
    const trendShock = (this.rng() - 0.5) * 0.4 // Random trend changes
    this.trendMomentum = this.trendMomentum * trendDecay + trendShock
    // Clamp momentum to prevent extreme runaway
    this.trendMomentum = Math.max(-1, Math.min(1, this.trendMomentum))

    // === PRICE MOVEMENT ===
    // Mean reversion (pull toward initial price)
    const meanReversionForce = (this.initialPrice - this.lastClose) * 0.008

    // Base volatility scaled by regime
    const baseVolatility = 2
    const effectiveVolatility = baseVolatility * this.volatilityRegime

    // Random component
    const randomShock = (this.rng() - 0.5) * effectiveVolatility

    // Total change combines: mean reversion + trend + random
    const change = meanReversionForce + this.trendMomentum * 0.8 + randomShock

    const open = this.lastClose
    const close = open + change

    // === HIGH/LOW WITH REALISTIC WICKS ===
    // Larger moves have larger wicks (volatility clustering)
    const priceRange = Math.abs(change)
    const wickRange = priceRange * (0.5 + this.rng() * 1.5) * this.volatilityRegime * 0.5
    const high = Math.max(open, close) + this.rng() * wickRange
    const low = Math.min(open, close) - this.rng() * wickRange

    // === VOLUME CORRELATION ===
    // Volume increases with price movement and volatility
    const baseVolume = 500000
    const priceMoveFactor = 1 + priceRange * 2 // Bigger moves = more volume
    const volatilityFactor = 0.7 + this.volatilityRegime * 0.6 // High vol = more volume
    const randomVolumeFactor = 0.8 + this.rng() * 0.4 // Add some noise

    const volume = baseVolume * priceMoveFactor * volatilityFactor * randomVolumeFactor

    return { timestamp, open, high, low, close, volume }
  }
}
