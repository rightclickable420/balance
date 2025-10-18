import type { Candle, CandleSource } from "@/lib/types"

type HyperliquidWebsocketSourceOptions = {
  symbol?: string
  interval?: string
  snapshotSize?: number
}

type HyperliquidWireCandle = {
  t?: number
  T?: number
  o?: string
  c?: string
  h?: string
  l?: string
  v?: string
}

const HYPERLIQUID_WS_URL = "wss://api.hyperliquid.xyz/ws"
const HYPERLIQUID_REST_URL = "https://api.hyperliquid.xyz/info"
const DEFAULT_SYMBOL = "BTC"
const DEFAULT_INTERVAL = "1m"
const DEFAULT_SNAPSHOT_SIZE = 5
const SNAPSHOT_LOOKBACK_MULTIPLIER = 4
const RECONNECT_DELAY_MS = 5_000
const PING_INTERVAL_MS = 50_000
const SNAPSHOT_RETRY_DELAY_MS = 30_000
const RATE_LIMIT_LOG_INTERVAL_MS = 60_000

const isBrowser = typeof window !== "undefined"

export class HyperliquidWebsocketSource implements CandleSource {
  private readonly symbol: string
  private readonly interval: string
  private readonly snapshotSize: number
  private socket: WebSocket | null = null
  private heartbeat: number | null = null
  private reconnectTimer: number | null = null
  private queue: Candle[] = []
  private lastCandle: Candle | null = null
  private readonly source = "hyperliquid"
  private initializing = false
  private lastRateLimitLog = 0

  constructor(options: HyperliquidWebsocketSourceOptions = {}) {
    this.symbol = (options.symbol ?? DEFAULT_SYMBOL).toUpperCase()
    this.interval = options.interval ?? DEFAULT_INTERVAL
    this.snapshotSize = Math.max(1, options.snapshotSize ?? DEFAULT_SNAPSHOT_SIZE)

    if (isBrowser) {
      this.initialize()
    }
  }

  next(): Candle {
    if (this.queue.length > 0) {
      const candle = this.queue.shift()!
      this.lastCandle = candle
      return candle
    }

    if (this.lastCandle) {
      return { ...this.lastCandle }
    }

    // Return a neutral candle until real data arrives
    const now = Date.now()
    const placeholder: Candle = {
      timestamp: now,
      open: 0,
      high: 0,
      low: 0,
      close: 0,
      volume: 0,
    }
    this.lastCandle = placeholder
    return placeholder
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
    this.initializing = false
    this.teardown()
    if (isBrowser) {
      this.initialize()
    }
  }

  getSource(): string {
    return this.source
  }

  private initialize() {
    if (this.initializing) return
    this.initializing = true
    void this.fetchSnapshot().finally(() => {
      this.connect()
      this.initializing = false
    })
  }

  private async fetchSnapshot(): Promise<void> {
    const endTime = Date.now()
    const intervalMs = this.intervalToMs(this.interval)
    const startTime = endTime - intervalMs * this.snapshotSize * SNAPSHOT_LOOKBACK_MULTIPLIER

    const fetchSnapshotInner = async () => {
      const response = await fetch(HYPERLIQUID_REST_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "candleSnapshot",
          req: {
            coin: this.symbol,
            interval: this.interval,
            startTime,
            endTime,
          },
        }),
      })

      if (!response.ok) {
        if (response.status === 429) {
          const now = Date.now()
          if (now - this.lastRateLimitLog > RATE_LIMIT_LOG_INTERVAL_MS) {
            console.warn("[HyperliquidWS] Snapshot rate-limited. Will retry.")
            this.lastRateLimitLog = now
          }
        } else {
          console.error(`[HyperliquidWS] Snapshot request failed with status ${response.status}`)
        }
        setTimeout(() => this.fetchSnapshot(), SNAPSHOT_RETRY_DELAY_MS)
        return
      }

      const payload = (await response.json()) as HyperliquidWireCandle[]

      const candles = this.transformCandles(payload)
      if (candles.length > 0) {
        this.lastCandle = candles[candles.length - 1]
        const recent = candles.slice(-this.snapshotSize)
        this.queue.push(...recent)
      }
    }

    try {
      await fetchSnapshotInner()
    } catch (error) {
      console.error("[HyperliquidWS] Failed to fetch snapshot", error)
      setTimeout(() => this.fetchSnapshot(), SNAPSHOT_RETRY_DELAY_MS)
    }
  }

  private connect() {
    this.teardown()

    if (!isBrowser) return

    try {
      this.socket = new WebSocket(HYPERLIQUID_WS_URL)
    } catch (error) {
      console.error("[HyperliquidWS] Failed to create websocket", error)
      this.scheduleReconnect()
      return
    }

    this.socket.addEventListener("open", () => {
      this.subscribe()
      this.startHeartbeat()
    })

    this.socket.addEventListener("message", (event) => {
      this.handleMessage(event.data)
    })

    this.socket.addEventListener("close", () => {
      this.stopHeartbeat()
      this.scheduleReconnect()
    })

    this.socket.addEventListener("error", (event) => {
      console.warn("[HyperliquidWS] Websocket error", event)
      this.socket?.close()
    })
  }

  private subscribe() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
    const subscription = {
      method: "subscribe",
      subscription: {
        type: "candle",
        coin: this.symbol,
        interval: this.interval,
      },
    }
    this.socket.send(JSON.stringify(subscription))
  }

  private handleMessage(raw: string) {
    if (raw === "Websocket connection established.") {
      return
    }

    try {
      const msg = JSON.parse(raw) as { channel?: string; data?: HyperliquidWireCandle }

      if (msg.channel !== "candle" || !msg.data) return

      const candle = this.transformCandle(msg.data)
      if (!candle) return

      if (!this.lastCandle || candle.timestamp > this.lastCandle.timestamp) {
        this.queue.push(candle)
        this.lastCandle = candle
      }
    } catch (error) {
      console.error("[HyperliquidWS] Failed to parse message", error)
    }
  }

  private transformCandles(entries: HyperliquidWireCandle[]): Candle[] {
      return entries
      .map((entry) => this.transformCandle(entry))
      .filter((entry): entry is Candle => Boolean(entry))
      .sort((a, b) => a.timestamp - b.timestamp)
  }

  private transformCandle(entry: HyperliquidWireCandle | null | undefined): Candle | null {
    const timestamp = Number(entry?.t ?? entry?.T)
    const open = Number(entry?.o)
    const close = Number(entry?.c)
    const high = Number(entry?.h)
    const low = Number(entry?.l)
    const volume = Number(entry?.v ?? 0)

    if ([timestamp, open, close, high, low].some((value) => !Number.isFinite(value))) {
      return null
    }

    return {
      timestamp,
      open,
      close,
      high,
      low,
      volume: Number.isFinite(volume) ? volume : 0,
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null) return

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, RECONNECT_DELAY_MS)
  }

  private startHeartbeat() {
    this.stopHeartbeat()
    if (!isBrowser || !this.socket) return

    this.heartbeat = window.setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ method: "ping" }))
      }
    }, PING_INTERVAL_MS)
  }

  private stopHeartbeat() {
    if (this.heartbeat !== null) {
      window.clearInterval(this.heartbeat)
      this.heartbeat = null
    }
  }

  private teardown() {
    this.stopHeartbeat()
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
  }

  private intervalToMs(interval: string): number {
    const match = /^([0-9]+)([smhd])$/.exec(interval)
    if (!match) return 60_000
    const value = Number(match[1])
    const unit = match[2]
    if (!Number.isFinite(value)) return 60_000
    const base = unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000
    return value * base
  }
}
