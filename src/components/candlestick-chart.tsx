"use client"

import { useEffect, useState } from "react"
import { ComposedChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
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
  // For candlestick rendering
  bodyRange: [number, number] // [min(open,close), max(open,close)]
  wickRange: [number, number] // [low, high]
  isGreen: boolean
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

      const isGreen = candle.close >= candle.open
      const bodyMin = Math.min(candle.open, candle.close)
      const bodyMax = Math.max(candle.open, candle.close)

      return {
        time,
        timestamp: candle.timestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        price: candle.close,
        fill: isGreen ? '#10b981' : '#ef4444',
        bodyRange: [bodyMin, bodyMax] as [number, number],
        wickRange: [candle.low, candle.high] as [number, number],
        isGreen,
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

  // Custom candlestick shape using Bar chart
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderCandlestick = (props: any) => {
    const { x, width, height, index } = props
    if (index === undefined) return <g />

    const dataPoint = chartData[index]
    if (!dataPoint) return <g />

    const { open, close, high, low, isGreen } = dataPoint

    // Calculate canvas dimensions from the chart
    const chartHeight = height
    const priceRange = yDomain[1] - yDomain[0]
    const pixelsPerPrice = chartHeight / priceRange

    // Calculate positions (Y increases downward in SVG)
    const highY = (yDomain[1] - high) * pixelsPerPrice
    const lowY = (yDomain[1] - low) * pixelsPerPrice
    const openY = (yDomain[1] - open) * pixelsPerPrice
    const closeY = (yDomain[1] - close) * pixelsPerPrice

    const bodyTop = Math.min(openY, closeY)
    const bodyHeight = Math.abs(closeY - openY)
    const candleWidth = Math.min(width * 0.7, 8) // Max 8px wide

    const color = isGreen ? '#10b981' : '#ef4444'
    const centerX = x + width / 2

    return (
      <g>
        {/* Wick (thin line from low to high) */}
        <line
          x1={centerX}
          y1={highY}
          x2={centerX}
          y2={lowY}
          stroke={color}
          strokeWidth={1}
        />

        {/* Body (rectangle from open to close) */}
        <rect
          x={centerX - candleWidth / 2}
          y={bodyTop}
          width={candleWidth}
          height={Math.max(bodyHeight, 1)} // Minimum 1px for doji
          fill={color}
          stroke={color}
          strokeWidth={1}
        />
      </g>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={chartData}
        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
      >
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

        {/* Use Bar chart with custom shape for candlesticks */}
        <Bar
          dataKey="close"
          shape={renderCandlestick}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
