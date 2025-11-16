/**
 * Raydium Polling Client for SOL/USDC Volume
 *
 * Polls the Raydium pool account periodically to get volume estimates
 * Much more efficient than subscribing to all trade logs
 */

import { Connection, PublicKey } from '@solana/web3.js'

interface VolumeData {
  volume: number
  timestamp: number
}

export class RaydiumPollingClient {
  private connection: Connection
  private poolAddress: PublicKey
  private pollingInterval: NodeJS.Timeout | null = null
  private isRunning = false
  private onVolumeUpdate: ((volume: number) => void) | null = null
  private pollIntervalMs: number
  private lastBaseReserve: bigint | null = null
  private lastQuoteReserve: bigint | null = null

  constructor(rpcUrl: string, poolAddress: string, pollIntervalMs: number = 3000) {
    this.connection = new Connection(rpcUrl, { commitment: 'confirmed' })
    this.poolAddress = new PublicKey(poolAddress)
    this.pollIntervalMs = pollIntervalMs
  }

  async start(onVolumeUpdate: (volume: number) => void) {
    if (this.isRunning) {
      console.log('[RaydiumPoll] Already running')
      return
    }

    this.isRunning = true
    this.onVolumeUpdate = onVolumeUpdate
    console.log('[RaydiumPoll] Starting volume polling')
    console.log('[RaydiumPoll] Pool address:', this.poolAddress.toBase58())
    console.log('[RaydiumPoll] Poll interval:', this.pollIntervalMs, 'ms')

    // Fetch initial reserves
    await this.pollReserves()

    // Start polling
    this.pollingInterval = setInterval(() => {
      this.pollReserves()
    }, this.pollIntervalMs)

    console.log('[RaydiumPoll] ✅ Started successfully')
  }

  private async pollReserves() {
    try {
      const accountInfo = await this.connection.getAccountInfo(this.poolAddress)

      if (!accountInfo) {
        console.warn('[RaydiumPoll] Pool account not found')
        return
      }

      // Parse Raydium pool data
      // Raydium AMM pool layout has reserves at specific offsets
      const data = accountInfo.data

      // These offsets are for Raydium V4 AMM
      // baseReserve is at offset 73 (8 bytes)
      // quoteReserve is at offset 81 (8 bytes)
      const baseReserve = data.readBigUInt64LE(73)
      const quoteReserve = data.readBigUInt64LE(81)

      // Calculate volume estimate from reserve changes
      if (this.lastBaseReserve !== null && this.lastQuoteReserve !== null) {
        // Volume estimate: sum of absolute changes in reserves
        // This approximates trading activity since last poll
        const baseChange = Number(baseReserve > this.lastBaseReserve
          ? baseReserve - this.lastBaseReserve
          : this.lastBaseReserve - baseReserve)

        const quoteChange = Number(quoteReserve > this.lastQuoteReserve
          ? quoteReserve - this.lastQuoteReserve
          : this.lastQuoteReserve - quoteReserve)

        // Convert from lamports (SOL has 9 decimals, USDC has 6)
        const baseVolume = baseChange / 1e9  // SOL volume
        const quoteVolume = quoteChange / 1e6 // USDC volume

        // Use quote volume (USD value) as our volume metric
        const volume = quoteVolume

        if (volume > 0 && this.onVolumeUpdate) {
          this.onVolumeUpdate(volume)
          console.log(`[RaydiumPoll] 📊 Volume delta: $${volume.toFixed(2)} USDC (${(this.pollIntervalMs / 1000).toFixed(1)}s window)`)
        }
      } else {
        console.log('[RaydiumPoll] Initial reserves captured')
      }

      // Update last reserves
      this.lastBaseReserve = baseReserve
      this.lastQuoteReserve = quoteReserve

    } catch (error) {
      console.error('[RaydiumPoll] Failed to poll reserves:', error)
    }
  }

  stop() {
    console.log('[RaydiumPoll] Stopping...')
    this.isRunning = false

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }

    this.lastBaseReserve = null
    this.lastQuoteReserve = null

    console.log('[RaydiumPoll] Stopped')
  }
}
