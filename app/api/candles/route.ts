import { NextResponse } from "next/server"
import { MockCandleSource } from "@/lib/data/mock-candle-source"
import type { Candle } from "@/lib/types"

const DEFAULT_SYMBOL = process.env.BALANCE_DEFAULT_SYMBOL ?? "SPY"
const DEFAULT_LIMIT = 120
const MAX_LIMIT = 500
const polygonEndpoint = "https://api.polygon.io/v2/aggs/ticker"
const hyperliquidEndpoint = "https://api.hyperliquid.xyz/info"
const DEFAULT_PROVIDER = (process.env.BALANCE_DATA_PROVIDER ?? "polygon").toLowerCase()
const RATE_LIMIT_LOG_INTERVAL_MS = 60_000
let lastHyperliquidRateLimitLog = 0

export const runtime = "edge"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbol = (searchParams.get("symbol") ?? DEFAULT_SYMBOL).toUpperCase()
  const limitParam = parseInt(searchParams.get("limit") ?? `${DEFAULT_LIMIT}`, 10)
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), MAX_LIMIT) : DEFAULT_LIMIT
  const providerParam = searchParams.get("provider")
  const provider = (providerParam ?? DEFAULT_PROVIDER).toLowerCase()

  if (provider === "hyperliquid") {
    try {
      const candles = await fetchHyperliquidCandles(symbol, limit)
      if (candles.length > 0) {
        return NextResponse.json({ candles, source: "hyperliquid" })
      }
    } catch (error) {
      console.warn("[candles] Hyperliquid fetch failed, falling back to other providers.", error)
    }
  }

  if (provider === "polygon" || provider === "default" || provider === "hyperliquid") {
    try {
      const candles = await fetchPolygonCandles(symbol, limit)
      if (candles.length > 0) {
        return NextResponse.json({ candles, source: "polygon" })
      }
    } catch (error) {
      console.warn("[candles] Polygon fetch failed, falling back to mock data.", error)
    }
  }

  const fallbackCandles = MockCandleSource.generateSeries(limit, Date.now() & 0xffff, 100)
  return NextResponse.json({ candles: fallbackCandles, source: "mock" })
}

async function fetchPolygonCandles(symbol: string, limit: number): Promise<Candle[]> {
  const apiKey = process.env.POLYGON_API_KEY
  if (!apiKey) {
    return []
  }

  const now = new Date()
  const timespanMinutes = limit + 5
  const start = new Date(now.getTime() - timespanMinutes * 60 * 1000)

  const from = start.toISOString().split("T")[0]
  const to = now.toISOString().split("T")[0]
  const url = `${polygonEndpoint}/${encodeURIComponent(symbol)}/range/1/minute/${from}/${to}?sort=asc&limit=${limit}&apiKey=${apiKey}`

  const response = await fetch(url, { cache: "no-store" })
  if (!response.ok) {
    throw new Error(`Polygon API returned ${response.status}`)
  }

  const payload = (await response.json()) as {
    results?: Array<{
      t: number
      o: number
      h: number
      l: number
      c: number
      v: number
    }>
  }

  const results = payload.results ?? []
  return results
    .filter((entry) => Number.isFinite(entry.t))
    .map((entry) => ({
      timestamp: entry.t,
      open: entry.o,
      high: entry.h,
      low: entry.l,
      close: entry.c,
      volume: entry.v,
    }))
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-limit)
}

async function fetchHyperliquidCandles(symbol: string, limit: number): Promise<Candle[]> {
  const endTime = Date.now()
  const intervalMs = 60 * 1000
  const safetyMultiplier = 3
  const startTime = endTime - intervalMs * limit * safetyMultiplier

  const response = await fetch(hyperliquidEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "candleSnapshot",
      req: {
        coin: symbol,
        interval: "1m",
        startTime,
        endTime,
      },
    }),
  })

  if (!response.ok) {
    if (response.status === 429) {
      const now = Date.now()
      if (now - lastHyperliquidRateLimitLog > RATE_LIMIT_LOG_INTERVAL_MS) {
        console.warn("[candles] Hyperliquid rate limited request. Using fallback provider.")
        lastHyperliquidRateLimitLog = now
      }
      return []
    }
    throw new Error(`Hyperliquid API returned ${response.status}`)
  }

  const payload = (await response.json()) as Array<{
    t?: number
    T?: number
    o?: string
    c?: string
    h?: string
    l?: string
    v?: string
  }>

  const candles = (Array.isArray(payload) ? payload : [])
    .map((entry) => {
      const timestamp = Number(entry.t ?? entry.T)
      const open = Number(entry.o)
      const close = Number(entry.c)
      const high = Number(entry.h)
      const low = Number(entry.l)
      const volume = Number(entry.v ?? 0)

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
    })
    .filter((entry): entry is Candle => Boolean(entry))
    .sort((a, b) => a.timestamp - b.timestamp)

  return candles.slice(-limit)
}
