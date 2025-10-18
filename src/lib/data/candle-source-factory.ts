import { MockCandleSource } from "./mock-candle-source"
import { LiveCandleSource } from "./live-candle-source"
import type { CandleSource } from "@/lib/types"

const LIVE_ENABLED =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_BALANCE_USE_LIVE === "true"

export const createCandleSource = (): CandleSource => {
  if (LIVE_ENABLED) {
    return new LiveCandleSource({ fallback: new MockCandleSource() })
  }

  return new MockCandleSource()
}
