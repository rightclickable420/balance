/**
 * Aggregates price ticks and volume into 1-second OHLCV candles
 * Combines Jupiter price data with Raydium volume data
 */

import { Candle, PriceTick } from './types'

export class CandleBuilder {
  private prices: number[] = []
  private volumeAccumulated = 0
  private startTime: number
  private windowMs: number

  constructor(windowMs = 1000) {
    this.windowMs = windowMs
    this.startTime = Date.now()
  }

  /**
   * Add a price tick from Jupiter
   */
  addPrice(price: number) {
    this.prices.push(price)
  }

  /**
   * Add volume from Raydium trade
   */
  addVolume(amount: number) {
    this.volumeAccumulated += amount
  }

  /**
   * Check if the current window should be finalized
   */
  shouldFinalize(): boolean {
    return Date.now() - this.startTime >= this.windowMs
  }

  /**
   * Finalize the current candle and return OHLCV data
   * Returns null if no price data collected
   */
  finalize(): Candle | null {
    if (this.prices.length === 0) {
      console.warn('[CandleBuilder] No prices collected, returning null candle')
      return null
    }

    const candle: Candle = {
      timestamp: this.startTime,
      open: this.prices[0],
      high: Math.max(...this.prices),
      low: Math.min(...this.prices),
      close: this.prices[this.prices.length - 1],
      volume: this.volumeAccumulated
    }

    console.log(
      `[CandleBuilder] Finalized candle: O=${candle.open.toFixed(2)} ` +
      `H=${candle.high.toFixed(2)} L=${candle.low.toFixed(2)} ` +
      `C=${candle.close.toFixed(2)} V=${candle.volume.toFixed(2)} ` +
      `(${this.prices.length} price ticks)`
    )

    return candle
  }

  /**
   * Reset for next candle window
   */
  reset() {
    this.prices = []
    this.volumeAccumulated = 0
    this.startTime = Date.now()
  }

  /**
   * Get current state (for debugging)
   */
  getState() {
    return {
      startTime: this.startTime,
      priceCount: this.prices.length,
      volume: this.volumeAccumulated,
      elapsed: Date.now() - this.startTime
    }
  }
}
