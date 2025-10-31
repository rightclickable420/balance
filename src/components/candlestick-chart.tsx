"use client"

import { useEffect, useState } from "react"
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import type { Candle } from "../lib/types"

interface CandlestickChartProps {
  candleHistory: Candle[] // Completed 30-second candles
  currentCandle: Candle | null // Current forming candle
  maxCandles?: number
}

interface ChartDataPoint {
  time: string
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  price: number
  fill: string
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{ payload: ChartDataPoint }>
}

export function CandlestickChart({ candleHistory, currentCandle, maxCandles = 30 }: CandlestickChartProps) {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])

  useEffect(() => {
    // Combine history with current forming candle
    const allCandles = currentCandle
      ? [...candleHistory, currentCandle]
      : candleHistory

    // Take the last N candles
    const recentCandles = allCandles.slice(-maxCandles)

    // Transform candles into chart data
    const data = recentCandles.map((candle) => {
      const time = new Date(candle.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })

      return {
        time,
        timestamp: candle.timestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        // For simple line chart showing close prices
        price: candle.close,
        // Color based on candle direction
        fill: candle.close >= candle.open ? '#10b981' : '#ef4444',
      }
    })

    setChartData(data)
  }, [candleHistory, currentCandle, maxCandles])

  const CustomTooltip = ({ active, payload }: TooltipProps) => {
    if (!active || !payload || payload.length === 0) return null

    const data = payload[0].payload
    const isGreen = data.close >= data.open

    return (
      <div className="bg-black/90 border border-white/20 rounded px-3 py-2 text-xs">
        <div className="text-gray-400 mb-1">{data.time}</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <span className="text-gray-500">O:</span>
          <span className="text-white text-right">{data.open.toFixed(2)}</span>

          <span className="text-gray-500">H:</span>
          <span className="text-white text-right">{data.high.toFixed(2)}</span>

          <span className="text-gray-500">L:</span>
          <span className="text-white text-right">{data.low.toFixed(2)}</span>

          <span className="text-gray-500">C:</span>
          <span className={`text-right font-bold ${isGreen ? 'text-green-400' : 'text-red-400'}`}>
            {data.close.toFixed(2)}
          </span>
        </div>
      </div>
    )
  }

  if (chartData.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
        Waiting for data...
      </div>
    )
  }

  // Get min/max for Y axis domain
  const allPrices = chartData.flatMap(d => [d.high, d.low])
  const minPrice = Math.min(...allPrices)
  const maxPrice = Math.max(...allPrices)
  const padding = (maxPrice - minPrice) * 0.1
  const yDomain = [minPrice - padding, maxPrice + padding]

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={chartData}
        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>

        <XAxis
          dataKey="time"
          stroke="#4b5563"
          style={{ fontSize: '10px' }}
          tickLine={false}
          axisLine={{ stroke: '#374151' }}
          interval="preserveStartEnd"
          minTickGap={50}
        />

        <YAxis
          stroke="#4b5563"
          style={{ fontSize: '10px' }}
          tickLine={false}
          axisLine={{ stroke: '#374151' }}
          domain={yDomain}
          tickFormatter={(value) => value.toFixed(2)}
          width={50}
        />

        <Tooltip content={<CustomTooltip />} />

        <Area
          type="monotone"
          dataKey="price"
          stroke="#3b82f6"
          strokeWidth={2}
          fill="url(#priceGradient)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
