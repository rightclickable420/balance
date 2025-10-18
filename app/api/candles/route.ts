import { NextResponse } from "next/server"
import { MockCandleSource } from "@/lib/data/mock-candle-source"
import type { Candle } from "@/lib/types"

const DEFAULT_SYMBOL = process.env.BALANCE_DEFAULT_SYMBOL ?? "SPY"
const DEFAULT_LIMIT = 120
const MAX_LIMIT = 500
const polygonEndpoint = "https://api.polygon.io/v2/aggs/ticker"

export const runtime = "edge"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbol = (searchParams.get("symbol") ?? DEFAULT_SYMBOL).toUpperCase()
  const limitParam = parseInt(searchParams.get("limit") ?? `${DEFAULT_LIMIT}`, 10)
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), MAX_LIMIT) : DEFAULT_LIMIT

  try {
    const candles = await fetchPolygonCandles(symbol, limit)
    if (candles.length > 0) {
      return NextResponse.json({ candles, source: "polygon" })
    }
  } catch (error) {
    console.warn("[candles] Polygon fetch failed, falling back to mock data.", error)
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
