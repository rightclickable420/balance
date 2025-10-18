import type { Candle, CandleSource } from "@/lib/types"

type PolygonWebsocketSourceOptions = {
  symbol?: string
  snapshotSize?: number
}

type PolygonStatusMessage = {
  ev: "status"
  status: string
  message?: string
}

type PolygonAggregateMessage = {
  ev: "XA"
  pair: string
  o: number
  h: number
  l: number
  c: number
  v: number
  s: number
  e: number
}

type PolygonMessage = PolygonStatusMessage | PolygonAggregateMessage

const WS_URL = "wss://socket.polygon.io/crypto"
const SNAPSHOT_ENDPOINT = "/api/candles"
const DEFAULT_SYMBOL = "X:BTCUSD"
const DEFAULT_SNAPSHOT_SIZE = 120
const RECONNECT_DELAY_MS = 5_000
const AUTH_TIMEOUT_MS = 5_000
const isBrowser = typeof window !== "undefined"

export class PolygonWebsocketSource implements CandleSource {
  private readonly apiKey: string | undefined
  private readonly symbol: string
  private readonly pair: string
  private readonly snapshotSize: number

  private socket: WebSocket | null = null
  private reconnectTimer: number | null = null
  private authTimer: number | null = null
  private authenticated = false

  private queue: Candle[] = []
  private lastCandle: Candle | null = null
  private initializing = false
  private readonly source = "polygon"

  constructor(options: PolygonWebsocketSourceOptions = {}) {
    this.apiKey = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_POLYGON_API_KEY : undefined
    this.symbol = options.symbol ?? DEFAULT_SYMBOL
    this.pair = this.normalizePair(this.symbol)
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
    this.authenticated = false
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

  private async fetchSnapshot() {
    try {
      const url = `${SNAPSHOT_ENDPOINT}?symbol=${encodeURIComponent(this.symbol)}&limit=${this.snapshotSize}&provider=polygon`
      const response = await fetch(url, { cache: "no-store" })
      if (!response.ok) {
        throw new Error(`Snapshot request failed with ${response.status}`)
      }
      const payload = (await response.json()) as { candles?: Candle[] }
      const candles = Array.isArray(payload.candles) ? payload.candles : []
      if (candles.length > 0) {
        const sorted = candles.sort((a, b) => a.timestamp - b.timestamp)
        this.queue.push(...sorted.slice(-this.snapshotSize))
        this.lastCandle = sorted[sorted.length - 1]
      }
    } catch (error) {
      console.warn("[PolygonWS] Failed to load snapshot:", error)
    }
  }

  private connect() {
    this.teardown()

    if (!isBrowser) return
    if (!this.apiKey) {
      console.warn("[PolygonWS] NEXT_PUBLIC_POLYGON_API_KEY missing; falling back to mock data.")
      return
    }

    try {
      this.socket = new WebSocket(WS_URL)
    } catch (error) {
      console.error("[PolygonWS] Failed to create websocket", error)
      this.scheduleReconnect()
      return
    }

    this.socket.addEventListener("open", () => {
      this.send({ action: "auth", params: this.apiKey })
      this.startAuthTimeout()
    })

    this.socket.addEventListener("message", (event) => {
      this.handleMessage(event.data)
    })

    this.socket.addEventListener("close", () => {
      this.authenticated = false
      this.scheduleReconnect()
    })

    this.socket.addEventListener("error", (event) => {
      console.warn("[PolygonWS] Websocket error", event)
      this.socket?.close()
    })
  }

  private handleMessage(raw: string) {
    let messages: PolygonMessage[] = []
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        messages = parsed as PolygonMessage[]
      } else {
        messages = [parsed as PolygonMessage]
      }
    } catch (error) {
      console.error("[PolygonWS] Failed to parse message", error)
      return
    }

    for (const msg of messages) {
      if (msg.ev === "status") {
        if (msg.status === "auth_success") {
          this.authenticated = true
          this.stopAuthTimeout()
          this.subscribe()
        } else if (msg.status === "success" && msg.message?.includes("connected")) {
          // Connected, wait for auth
        } else if (msg.status === "auth_failed") {
          console.error("[PolygonWS] Authentication failed:", msg.message)
        }
      } else if (msg.ev === "XA") {
        const candle = this.transformCandle(msg)
        if (!candle) continue
        if (!this.lastCandle || candle.timestamp > this.lastCandle.timestamp) {
          this.queue.push(candle)
          this.lastCandle = candle
        } else if (this.lastCandle && candle.timestamp === this.lastCandle.timestamp) {
          this.lastCandle = candle
          if (this.queue.length > 0) {
            this.queue[this.queue.length - 1] = candle
          }
        }
      }
    }
  }

  private transformCandle(entry: PolygonAggregateMessage): Candle | null {
    const timestamp = Number(entry.s)
    const open = Number(entry.o)
    const close = Number(entry.c)
    const high = Number(entry.h)
    const low = Number(entry.l)
    const volume = Number(entry.v)

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

  private subscribe() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
    this.send({ action: "subscribe", params: `XA.${this.pair}` })
  }

  private send(payload: Record<string, unknown>) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
    this.socket.send(JSON.stringify(payload))
  }

  private scheduleReconnect() {
    if (!isBrowser) return
    if (this.reconnectTimer !== null) return
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, RECONNECT_DELAY_MS)
  }

  private startAuthTimeout() {
    this.stopAuthTimeout()
    this.authTimer = window.setTimeout(() => {
      if (!this.authenticated) {
        console.warn("[PolygonWS] Auth timeout, reconnecting")
        this.socket?.close()
      }
    }, AUTH_TIMEOUT_MS)
  }

  private stopAuthTimeout() {
    if (this.authTimer !== null) {
      window.clearTimeout(this.authTimer)
      this.authTimer = null
    }
  }

  private teardown() {
    this.stopAuthTimeout()
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
  }

  private normalizePair(symbol: string): string {
    let base = symbol
    if (base.includes(":")) {
      base = base.split(":")[1]
    }
    if (base.includes("/")) {
      base = base.replace("/", "-")
    }
    if (base.includes("-")) {
      return base.toUpperCase()
    }
    if (base.endsWith("USDT")) {
      return `${base.slice(0, -4)}-USDT`.toUpperCase()
    }
    if (base.endsWith("USD")) {
      return `${base.slice(0, -3)}-USD`.toUpperCase()
    }
    if (base.length > 3) {
      return `${base.slice(0, base.length - 3)}-${base.slice(-3)}`.toUpperCase()
    }
    return base.toUpperCase()
  }
}
