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
let lastPolygonRateLimitLog = 0

type CandleCacheEntry = {
  candles: Candle[]
  fetchedAt: number
}

const polygonCache = new Map<string, CandleCacheEntry>()

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
      const candles = await fetchPolygonCandles(symbol, limit, true)
      if (candles.length > 0) {
        return NextResponse.json({ candles, source: "polygon" })
      }
    } catch (error) {
      console.warn("[candles] Polygon fetch failed, checking cache before falling back.", error)
      const cacheKey = cacheKeyForPolygon(symbol, limit)
      const cached = polygonCache.get(cacheKey)
      if (cached?.candles?.length) {
        return NextResponse.json({ candles: cached.candles, source: "polygon-cache" })
      }
      console.warn("[candles] Polygon cache empty; using mock data.")
    }
  }

  const fallbackCandles = MockCandleSource.generateSeries(limit, Date.now() & 0xffff, 100)
  return NextResponse.json({ candles: fallbackCandles, source: "mock" })
}

function cacheKeyForPolygon(symbol: string, limit: number): string {
  return `${symbol}:${limit}`
}

async function fetchPolygonCandles(symbol: string, limit: number, useCache = false): Promise<Candle[]> {
  const cacheKey = cacheKeyForPolygon(symbol, limit)
  if (useCache) {
    const cached = polygonCache.get(cacheKey)
    const now = Date.now()
    if (cached && now - cached.fetchedAt < 55_000 && cached.candles.length > 0) {
      return cached.candles
    }
  }

  const apiKey = process.env.POLYGON_API_KEY
  if (!apiKey) {
    return []
  }

  const now = new Date()
  const from = new Date(now.getTime() - limit * 60 * 1000)

  const url = `${polygonEndpoint}/${encodeURIComponent(symbol)}/range/1/minute/${from.getTime()}/${now.getTime()}?sort=asc&limit=${limit}&apiKey=${apiKey}`

  const response = await fetch(url, { cache: "no-store" })
  if (!response.ok) {
    if (response.status === 429) {
      const now = Date.now()
      if (now - lastPolygonRateLimitLog > RATE_LIMIT_LOG_INTERVAL_MS) {
        console.warn("[candles] Polygon rate limited request. Using cache/fallback.")
        lastPolygonRateLimitLog = now
      }
    }
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
  const candles = results
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

  if (useCache && candles.length > 0) {
    polygonCache.set(cacheKey, { candles, fetchedAt: Date.now() })
  }

  return candles
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
