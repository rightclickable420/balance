import type { Candle, CandleSource } from "@/lib/types"

/**
 * Real-time candle source that connects to the aggregator service via WebSocket
 * Receives 1-second OHLCV candles combining Jupiter price + Raydium volume
 */

const DEFAULT_WS_URL = "ws://localhost:8080"
const RECONNECT_DELAY_MS = 5000
const QUEUE_SIZE_WARNING = 100

export class RealtimeWebsocketSource implements CandleSource {
  private wsUrl: string
  private socket: WebSocket | null = null
  private queue: Candle[] = []
  private lastCandle: Candle | null = null
  private reconnectTimer: number | null = null
  private isConnected = false
  private readonly source = "realtime"
  private shouldReconnect = true
  private reconnectAttempts = 0
  private readonly maxReconnectAttempts = 10

  constructor(wsUrl: string = DEFAULT_WS_URL) {
    this.wsUrl = wsUrl

    // Don't auto-connect - let the game start the connection when ready
    // This prevents the aggregator from running before the game actually starts
    console.log("[RealtimeWS] Created (connection deferred until first data request)")
  }

  private connect() {
    try {
      console.log("[RealtimeWS] Connecting to:", this.wsUrl)
      this.socket = new WebSocket(this.wsUrl)

      this.socket.onopen = () => {
        console.log("[RealtimeWS] ✅ Connected")
        this.isConnected = true
        this.reconnectAttempts = 0 // Reset counter on successful connection
        if (this.reconnectTimer) {
          window.clearTimeout(this.reconnectTimer)
          this.reconnectTimer = null
        }
      }

      this.socket.onmessage = (event) => {
        this.handleMessage(event.data)
      }

      this.socket.onclose = () => {
        console.log("[RealtimeWS] Disconnected")
        this.isConnected = false
        if (this.shouldReconnect) {
          this.scheduleReconnect()
        }
      }

      this.socket.onerror = (error) => {
        console.error("[RealtimeWS] WebSocket error:", error)
      }
    } catch (error) {
      console.error("[RealtimeWS] Failed to create WebSocket:", error)
      this.scheduleReconnect()
    }
  }

  private handleMessage(raw: string) {
    try {
      const message = JSON.parse(raw)

      if (message.type === "connected") {
        console.log("[RealtimeWS]", message.message)
        return
      }

      if (message.type === "candle" && message.data) {
        const candle = message.data as Candle

        // Add to queue
        this.queue.push(candle)
        this.lastCandle = candle

        // Warn if queue is getting large (frontend is consuming too slowly)
        if (this.queue.length > QUEUE_SIZE_WARNING) {
          console.warn(
            `[RealtimeWS] Queue size: ${this.queue.length} - frontend may be lagging`
          )
        }
      }

      if (message.type === "status") {
        console.log("[RealtimeWS] Status:", message.data)
      }
    } catch (error) {
      console.error("[RealtimeWS] Failed to parse message:", error)
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null) return
    if (!this.shouldReconnect) return

    this.reconnectAttempts++

    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      console.error(`[RealtimeWS] Max reconnect attempts (${this.maxReconnectAttempts}) reached. Giving up.`)
      this.shouldReconnect = false
      return
    }

    console.log(`[RealtimeWS] Reconnecting in ${RECONNECT_DELAY_MS / 1000}s... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, RECONNECT_DELAY_MS)
  }

  next(): Candle {
    // Connect on first data request (lazy connection)
    if (!this.socket && typeof window !== "undefined" && this.shouldReconnect) {
      console.log("[RealtimeWS] First data request - connecting now")
      this.connect()
    }

    // Return queued candle if available
    if (this.queue.length > 0) {
      const candle = this.queue.shift()!
      this.lastCandle = candle
      console.log(`[RealtimeWS] Returning real candle: $${candle.close.toFixed(2)} (queue: ${this.queue.length})`)
      return candle
    }

    // If we have a last candle, return it (frontend is ahead of stream)
    if (this.lastCandle && this.lastCandle.close > 0) {
      console.log(`[RealtimeWS] Reusing last candle: $${this.lastCandle.close.toFixed(2)}`)
      return { ...this.lastCandle, timestamp: Date.now() }
    }

    // No data yet - return a reasonable mock candle until WebSocket connects
    // This prevents the game from breaking on startup
    console.warn("[RealtimeWS] No candles available yet, returning mock SOL price (waiting for WebSocket data)")
    const mockCandle: Candle = {
      timestamp: Date.now(),
      open: 154.5,
      high: 154.5,
      low: 154.5,
      close: 154.5,
      volume: 0,
    }
    // Don't save mock as lastCandle so real data overwrites it
    return mockCandle
  }

  peek(): Candle {
    if (this.queue.length > 0) {
      return this.queue[0]
    }
    return this.lastCandle ?? this.next()
  }

  reset(): void {
    console.log("[RealtimeWS] Reset called")
    this.queue = []
    this.lastCandle = null
  }

  getSource(): string {
    return this.source
  }

  /**
   * Check if WebSocket is connected
   */
  isSocketConnected(): boolean {
    return this.isConnected && this.socket?.readyState === WebSocket.OPEN
  }

  /**
   * Manually close connection
   */
  disconnect() {
    this.shouldReconnect = false // Stop reconnection attempts
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
    console.log("[RealtimeWS] Manually disconnected")
  }
}
