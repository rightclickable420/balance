"use client"

import { useEffect, useRef, useState } from "react"
import { useGameState } from "@/lib/game/game-state"
import type { Candle } from "@/lib/types"

// Import types only at build time
import type { IChartApi, ISeriesApi } from "lightweight-charts"

interface ChartPanelProps {
  visible?: boolean
  onToggleVisibility?: () => void
}

export function ChartPanel({ visible = true, onToggleVisibility }: ChartPanelProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  // Subscribe to candle history from game state
  const candleHistory = useGameState((state) => state.candleHistory)
  const [historicalDataLoaded, setHistoricalDataLoaded] = useState(false)

  // Load historical data first
  useEffect(() => {
    if (historicalDataLoaded) return
    if (!isInitialized || !candlestickSeriesRef.current) return

    const loadHistoricalData = async () => {
      try {
        console.log("[ChartPanel] Loading historical data...")
        const { initializeHistoricalData } = await import("@/lib/data/historical-candles")

        // Fetch 15 minutes of historical 1-second candles
        const historicalCandles = await initializeHistoricalData({
          durationSeconds: 900, // 15 minutes
          candleIntervalSeconds: 1,
        })

        if (historicalCandles.length > 0) {
          // Convert to chart format
          const chartData = historicalCandles.map((candle) => ({
            time: Math.floor(candle.timestamp / 1000) as any,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
          }))

          chartData.sort((a, b) => a.time - b.time)

          candlestickSeriesRef.current?.setData(chartData)
          chartRef.current?.timeScale().fitContent()

          console.log(`[ChartPanel] ✅ Loaded ${chartData.length} historical candles`)
          setHistoricalDataLoaded(true)
        }
      } catch (error) {
        console.warn("[ChartPanel] Failed to load historical data, will use live data:", error)
        setHistoricalDataLoaded(true) // Mark as loaded anyway to start using live data
      }
    }

    loadHistoricalData()
  }, [isInitialized, historicalDataLoaded])

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return
    if (chartRef.current) return // Already initialized

    console.log("[ChartPanel] Initializing chart...")

    // Dynamically import lightweight-charts to avoid SSR issues
    import("lightweight-charts").then((LightweightCharts) => {
      if (!chartContainerRef.current) return

      console.log("[ChartPanel] Lightweight charts loaded:", LightweightCharts)

      const chart = LightweightCharts.createChart(chartContainerRef.current, {
        layout: {
          background: { type: LightweightCharts.ColorType.Solid, color: "rgba(0, 0, 0, 0)" },
          textColor: "#D9D9D9",
        },
        grid: {
          vertLines: { color: "rgba(197, 203, 206, 0.1)" },
          horzLines: { color: "rgba(197, 203, 206, 0.1)" },
        },
        crosshair: {
          mode: 1, // Normal crosshair
          vertLine: {
            color: "rgba(224, 227, 235, 0.4)",
            width: 1,
            style: 3, // Dashed
            labelBackgroundColor: "#2962FF",
          },
          horzLine: {
            color: "rgba(224, 227, 235, 0.4)",
            width: 1,
            style: 3, // Dashed
            labelBackgroundColor: "#2962FF",
          },
        },
        rightPriceScale: {
          borderColor: "rgba(197, 203, 206, 0.2)",
          scaleMargins: {
            top: 0.1,
            bottom: 0.2,
          },
        },
        timeScale: {
          borderColor: "rgba(197, 203, 206, 0.2)",
          timeVisible: true,
          secondsVisible: true,
        },
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight,
      })

      console.log("[ChartPanel] Chart created successfully")

      // v5 API: Use addSeries with CandlestickSeries type
      const candlestickSeries = chart.addSeries(LightweightCharts.CandlestickSeries, {
        upColor: "#26a69a",
        downColor: "#ef5350",
        borderVisible: false,
        wickUpColor: "#26a69a",
        wickDownColor: "#ef5350",
      })

      chartRef.current = chart
      candlestickSeriesRef.current = candlestickSeries
      setIsInitialized(true)

      console.log("[ChartPanel] Chart initialized")

      // Resize handler
      const handleResize = () => {
        if (chartContainerRef.current && chartRef.current) {
          chartRef.current.applyOptions({
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
          })
        }
      }

      window.addEventListener("resize", handleResize)

      // Cleanup function
      return () => {
        window.removeEventListener("resize", handleResize)
        console.log("[ChartPanel] Cleaning up chart...")
        chart.remove()
        chartRef.current = null
        candlestickSeriesRef.current = null
        setIsInitialized(false)
      }
    }).catch((error) => {
      console.error("[ChartPanel] Failed to load lightweight-charts:", error)
    })

    // Cleanup if component unmounts before library loads
    return () => {
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
        candlestickSeriesRef.current = null
        setIsInitialized(false)
      }
    }
  }, [])

  // Update chart with live data after historical data is loaded
  useEffect(() => {
    if (!isInitialized || !candlestickSeriesRef.current) return
    if (!historicalDataLoaded) return // Wait for historical data first
    if (candleHistory.length === 0) return

    try {
      // Get the latest candle from live data
      const latestCandle = candleHistory[candleHistory.length - 1]

      const candleData = {
        time: Math.floor(latestCandle.timestamp / 1000) as any,
        open: latestCandle.open,
        high: latestCandle.high,
        low: latestCandle.low,
        close: latestCandle.close,
      }

      // Update the chart with the latest candle
      candlestickSeriesRef.current.update(candleData)

      console.log(`[ChartPanel] Updated with live candle at ${new Date(latestCandle.timestamp).toISOString()}`)
    } catch (error) {
      console.error("[ChartPanel] Failed to update chart with live data:", error)
    }
  }, [candleHistory, isInitialized, historicalDataLoaded])

  // Handle visibility toggle with keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if user is typing in input field
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return
      }

      // Press 'C' to toggle chart visibility
      if (event.key === "c" || event.key === "C") {
        event.preventDefault()
        onToggleVisibility?.()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onToggleVisibility])

  if (!visible) return null

  return (
    <div className="absolute top-4 left-4 right-4 h-[500px] pointer-events-auto z-10">
      <div className="h-full bg-black/20 backdrop-blur-sm rounded-lg border border-white/10 shadow-2xl">
        {/* Chart Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-black/40">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              SOL/USD Live Chart
            </h2>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span>Live</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Timeframe selector (placeholder for future) */}
            <div className="flex gap-1">
              <button className="px-2 py-1 text-xs font-medium bg-white/10 text-white rounded hover:bg-white/20 transition-colors">
                1s
              </button>
              <button className="px-2 py-1 text-xs font-medium text-muted-foreground rounded hover:bg-white/10 transition-colors">
                1m
              </button>
              <button className="px-2 py-1 text-xs font-medium text-muted-foreground rounded hover:bg-white/10 transition-colors">
                5m
              </button>
            </div>

            {/* Close button */}
            <button
              onClick={onToggleVisibility}
              className="p-1 text-muted-foreground hover:text-white transition-colors"
              title="Close chart (press C)"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Chart Container */}
        <div ref={chartContainerRef} className="w-full h-[calc(100%-48px)]" />

        {/* Chart Footer - Status */}
        <div className="absolute bottom-2 left-4 text-xs text-muted-foreground">
          {!historicalDataLoaded ? (
            <span className="flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              Loading historical data...
            </span>
          ) : candleHistory.length > 0 ? (
            <span>{candleHistory.length} live candles</span>
          ) : (
            <span>Ready for live data...</span>
          )}
        </div>

        {/* Keyboard hint */}
        <div className="absolute bottom-2 right-4 text-xs text-muted-foreground">
          Press <kbd className="px-1 py-0.5 bg-white/10 rounded text-white">C</kbd> to toggle
        </div>
      </div>
    </div>
  )
}
