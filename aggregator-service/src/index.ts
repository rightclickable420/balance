/**
 * Jupiter Perps Real-Time Aggregator Service
 *
 * Uses Pyth Hermes API for real-time SOL/USD price streaming
 * NO REST API RATE LIMITS!
 *
 * Combines:
 * - Pyth Hermes API: Real-time SOL/USD prices polled every 100ms (~10 ticks per candle)
 * - Raydium Pool Polling: Volume estimates from SOL/USDC pool reserves (polled every 3s)
 *
 * Outputs: 1-second OHLCV candles via WebSocket to frontend
 */

import 'dotenv/config'
import { PythHttpClient } from './pyth-http-client'
import { RaydiumPollingClient } from './raydium-polling-client'
import { CandleBuilder } from './candle-builder'
import { CandleWebSocketServer } from './websocket-server'

// Configuration from environment or defaults
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
const SOLANA_WS_URL = process.env.SOLANA_WS_URL || 'wss://api.mainnet-beta.solana.com'
const WS_PORT = parseInt(process.env.WS_PORT || '8080')
const RAYDIUM_POOL = process.env.RAYDIUM_POOL_ADDRESS || '58oQChx4ywMVKDwLLZZbi4ChocC2FQCuWbkWMihLYQo2'
const USE_RAYDIUM_VOLUME = process.env.USE_RAYDIUM_VOLUME === 'true'

class PerpsAggregator {
  private pythClient: PythHttpClient
  private raydiumClient: RaydiumPollingClient | null
  private candleBuilder: CandleBuilder
  private wsServer: CandleWebSocketServer
  private candleCheckInterval: NodeJS.Timeout | null = null
  private candlesGenerated = 0

  constructor() {
    console.log('[Aggregator] Initializing Jupiter Perps aggregator...')
    console.log('[Aggregator] Using Pyth Hermes API for SOL/USD prices')
    console.log('[Aggregator] Raydium volume:', USE_RAYDIUM_VOLUME ? 'Enabled (polling)' : 'Disabled')
    console.log('[Aggregator] WebSocket port:', WS_PORT)

    this.pythClient = new PythHttpClient(400) // Poll every 400ms to match Pyth's update frequency (~2-3 ticks per candle)
    this.raydiumClient = USE_RAYDIUM_VOLUME ? new RaydiumPollingClient(SOLANA_RPC_URL, RAYDIUM_POOL, 3000) : null // Poll volume every 3s
    this.candleBuilder = new CandleBuilder(1000) // 1-second candles
    this.wsServer = new CandleWebSocketServer(WS_PORT)
  }

  async start() {
    console.log('[Aggregator] Starting...')

    // Start Pyth HTTP price polling
    await this.pythClient.start((price) => {
      this.candleBuilder.addPrice(price)
    })

    // Start Raydium volume polling (optional)
    if (this.raydiumClient) {
      await this.raydiumClient.start((volume) => {
        this.candleBuilder.addVolume(volume)
      })
    }

    // Check every 100ms if we should finalize the current candle
    this.candleCheckInterval = setInterval(() => {
      if (this.candleBuilder.shouldFinalize()) {
        this.finalizeCandle()
      }
    }, 100)

    console.log('[Aggregator] ✅ Started successfully!')
    console.log('[Aggregator] Generating 1-second candles...')
    console.log('[Aggregator] Frontend should connect to: ws://localhost:' + WS_PORT)
  }

  private finalizeCandle() {
    const candle = this.candleBuilder.finalize()

    if (candle) {
      // Broadcast to all connected frontend clients
      this.wsServer.broadcast(candle)
      this.candlesGenerated++

      // Log summary every 10 candles
      if (this.candlesGenerated % 10 === 0) {
        console.log(`[Aggregator] 📊 Generated ${this.candlesGenerated} candles, ${this.wsServer.getClientCount()} clients connected`)
      }
    }

    // Reset for next candle
    this.candleBuilder.reset()
  }

  async stop() {
    console.log('[Aggregator] Stopping...')

    if (this.candleCheckInterval) {
      clearInterval(this.candleCheckInterval)
    }

    this.pythClient.stop()
    if (this.raydiumClient) {
      this.raydiumClient.stop()
    }
    this.wsServer.close()

    console.log('[Aggregator] Stopped')
  }
}

// Start the service
const aggregator = new PerpsAggregator()

aggregator.start().catch((error) => {
  console.error('[Aggregator] Failed to start:', error)
  process.exit(1)
})

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Aggregator] Received SIGINT, shutting down gracefully...')
  await aggregator.stop()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\n[Aggregator] Received SIGTERM, shutting down gracefully...')
  await aggregator.stop()
  process.exit(0)
})
