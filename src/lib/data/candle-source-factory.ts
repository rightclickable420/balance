import { MockCandleSource } from "./mock-candle-source"
import { LiveCandleSource } from "./live-candle-source"
import { PolygonWebsocketSource } from "./polygon-websocket-source"
import type { CandleSource } from "@/lib/types"

const getProvider = () =>
  (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_BALANCE_DATA_PROVIDER : undefined)?.toLowerCase() ??
  "mock"

const LIVE_ENABLED = typeof process !== "undefined" && process.env.NEXT_PUBLIC_BALANCE_USE_LIVE === "true"
const DEFAULT_SYMBOL = (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_BALANCE_SYMBOL : undefined) ?? "SPY"

export const createCandleSource = (): CandleSource => {
  const provider = getProvider()

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
