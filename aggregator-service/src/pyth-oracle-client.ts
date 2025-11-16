/**
 * Pyth Oracle Client for Real-Time SOL Price Streaming
 *
 * Uses the Doves Oracle program (Pyth Network integration) to stream
 * real-time SOL/USD prices via WebSocket subscription to Solana blockchain.
 *
 * NO REST API RATE LIMITS - Data comes from on-chain oracle updates!
 */

import { Connection, PublicKey } from '@solana/web3.js'
import { parsePriceData } from '@pythnetwork/client'

// Pyth Oracle program address
const PYTH_ORACLE_PROGRAM = new PublicKey('FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH')

// SOL/USD Price Feed (Pyth mainnet)
const SOL_USD_PRICE_FEED = new PublicKey('H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG')

interface OraclePrice {
  price: number
  priceUsd: string
  timestamp: number
  expo: number
}

export class PythOracleClient {
  private connection: Connection
  private subscriptionId: number | null = null
  private latestPrice: OraclePrice | null = null
  private onPriceUpdate: ((price: number) => void) | null = null
  private pollingInterval: NodeJS.Timeout | null = null
  private isRunning = false

  constructor(rpcUrl: string) {
    // Use HTTP endpoint - Solana Connection handles WebSocket internally
    this.connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      wsEndpoint: rpcUrl.replace('https://', 'wss://').replace('http://', 'ws://'),
    })
  }

  async start(onPriceUpdate: (price: number) => void) {
    if (this.isRunning) {
      console.log('[PythOracle] Already running')
      return
    }

    this.isRunning = true
    this.onPriceUpdate = onPriceUpdate
    console.log('[PythOracle] Starting SOL/USD oracle price stream')
    console.log('[PythOracle] Price feed address:', SOL_USD_PRICE_FEED.toBase58())

    // Start WebSocket subscription for real-time updates
    await this.subscribeToOracle()

    // Start polling as backup (every 1 second)
    this.pollingInterval = setInterval(() => {
      this.pollPrice()
    }, 1000)

    // Fetch initial price
    await this.pollPrice()

    console.log('[PythOracle] ✅ Started successfully')
  }

  private async subscribeToOracle() {
    try {
      this.subscriptionId = this.connection.onAccountChange(
        SOL_USD_PRICE_FEED,
        async (accountInfo) => {
          try {
            const price = await this.parseOraclePrice(accountInfo.data)
            if (price && this.onPriceUpdate) {
              this.latestPrice = price
              this.onPriceUpdate(price.price)
              console.log(`[PythOracle] 📊 WebSocket update: $${price.priceUsd}`)
            }
          } catch (error) {
            console.error('[PythOracle] Failed to parse WebSocket price:', error)
          }
        },
        'confirmed'
      )
      console.log('[PythOracle] WebSocket subscription established')
    } catch (error) {
      console.error('[PythOracle] Failed to subscribe to oracle:', error)
    }
  }

  private async pollPrice() {
    try {
      const accountInfo = await this.connection.getAccountInfo(SOL_USD_PRICE_FEED)
      if (!accountInfo) {
        console.warn('[PythOracle] No account info for oracle')
        return
      }

      const price = await this.parseOraclePrice(accountInfo.data)
      if (price && this.onPriceUpdate) {
        const priceChanged = !this.latestPrice || this.latestPrice.price !== price.price
        this.latestPrice = price

        if (priceChanged) {
          this.onPriceUpdate(price.price)
          console.log(`[PythOracle] 📊 Polled update: $${price.priceUsd}`)
        }
      }
    } catch (error) {
      console.error('[PythOracle] Failed to poll price:', error)
    }
  }

  private async parseOraclePrice(data: Buffer): Promise<OraclePrice | null> {
    try {
      // Use official Pyth SDK to parse price data
      const priceData = parsePriceData(data)

      // Get current price (aggregate price from all publishers)
      const price = priceData.aggregate.price
      const expo = priceData.exponent
      const timestamp = Number(priceData.timestamp)

      console.log('[PythOracle] Debug - Raw price:', price, 'expo:', expo, 'timestamp:', timestamp)

      // Convert to decimal: price * 10^expo
      const priceNumber = Number(price) * Math.pow(10, expo)
      const priceUsd = priceNumber.toFixed(2)

      console.log('[PythOracle] Debug - Parsed price:', priceNumber)

      return {
        price: priceNumber,
        priceUsd,
        timestamp,
        expo,
      }
    } catch (error) {
      console.error('[PythOracle] Failed to parse oracle data:', error)
      return null
    }
  }

  stop() {
    console.log('[PythOracle] Stopping...')
    this.isRunning = false

    if (this.subscriptionId !== null) {
      this.connection.removeAccountChangeListener(this.subscriptionId)
      this.subscriptionId = null
    }

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }

    console.log('[PythOracle] Stopped')
  }

  getLatestPrice(): OraclePrice | null {
    return this.latestPrice
  }
}
