import { MockCandleSource } from "./mock-candle-source"
import { LiveCandleSource } from "./live-candle-source"
import { PolygonWebsocketSource } from "./polygon-websocket-source"
import { RealtimeWebsocketSource } from "./realtime-websocket-source"
import type { CandleSource } from "@/lib/types"

const getProvider = () =>
  (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_BALANCE_DATA_PROVIDER : undefined)?.toLowerCase() ??
  "mock"

const LIVE_ENABLED = typeof process !== "undefined" && process.env.NEXT_PUBLIC_BALANCE_USE_LIVE === "true"
const DEFAULT_SYMBOL = (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_BALANCE_SYMBOL : undefined) ?? "SPY"
const REALTIME_WS_URL = (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_REALTIME_WS_URL : undefined) ?? "ws://localhost:8080"

export const createCandleSource = (): CandleSource => {
  const provider = getProvider()

  // Real-time Solana aggregator (Jupiter + Raydium)
  if (provider === "realtime") {
    if (typeof window === "undefined") {
      console.warn("[Balance] Realtime provider requires browser, using mock data")
      return new MockCandleSource()
    }
    console.log("[Balance] ✅ Creating real-time Solana aggregator")
    console.log("[Balance] WebSocket URL:", REALTIME_WS_URL)
    const source = new RealtimeWebsocketSource(REALTIME_WS_URL)
    console.log("[Balance] Created source type:", source.getSource())
    return source
  }

  if (provider === "hyperliquid") {
    console.warn("[Balance] Hyperliquid feed disabled – using mock data instead.")
    return new MockCandleSource()
  }

  if (provider === "polygon") {
    if (typeof window === "undefined") {
      return new MockCandleSource()
    }
    return new PolygonWebsocketSource({ symbol: DEFAULT_SYMBOL, snapshotSize: 180 })
  }

  if (LIVE_ENABLED) {
    return new LiveCandleSource({
      fallback: new MockCandleSource(),
      symbol: DEFAULT_SYMBOL,
      provider,
    })
  }

  return new MockCandleSource()
}
