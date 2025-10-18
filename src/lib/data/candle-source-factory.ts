import { MockCandleSource } from "./mock-candle-source"
import { LiveCandleSource } from "./live-candle-source"
import { HyperliquidWebsocketSource } from "./hyperliquid-websocket-source"
import type { CandleSource } from "@/lib/types"

const getProvider = () =>
  (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_BALANCE_DATA_PROVIDER : undefined)?.toLowerCase() ??
  "polygon"

const LIVE_ENABLED = typeof process !== "undefined" && process.env.NEXT_PUBLIC_BALANCE_USE_LIVE === "true"
const DEFAULT_SYMBOL = (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_BALANCE_SYMBOL : undefined) ?? "SPY"

const getHyperliquidSymbol = () =>
  (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_BALANCE_SYMBOL : undefined)?.toUpperCase() ?? "BTC"

export const createCandleSource = (): CandleSource => {
  const provider = getProvider()

  if (provider === "hyperliquid") {
    if (typeof window === "undefined") {
      return new MockCandleSource()
    }
    return new HyperliquidWebsocketSource({ symbol: getHyperliquidSymbol() })
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
