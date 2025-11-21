"use client"

import { useEffect, useRef, useState } from "react"
import { useGameState } from "@/lib/game/game-state"
import type { Candle } from "@/lib/types"

// Import types only at build time
import type { IChartApi, ISeriesApi } from "lightweight-charts"

// Global flag to prevent duplicate chart instances (React Strict Mode workaround)
let globalChartInstance: IChartApi | null = null

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

  // Skip historical data loading - use Pyth live feed instead
  useEffect(() => {
    if (!isInitialized) return
    if (historicalDataLoaded) return

    // Mark as loaded immediately - we'll build chart from live Pyth feed data
    console.log("[ChartPanel] Using live Pyth feed data (no historical fetch)")
    setHistoricalDataLoaded(true)
  }, [isInitialized, historicalDataLoaded])

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return
    if (chartRef.current) return // Already initialized
    if (globalChartInstance) {
      console.log("[ChartPanel] Global chart instance already exists, skipping initialization")
      return
    }

    console.log("[ChartPanel] Initializing chart...")

    // Track if we're cleaning up to prevent race conditions
    let isMounted = true

    // Dynamically import lightweight-charts to avoid SSR issues
    import("lightweight-charts").then((LightweightCharts) => {
      if (!isMounted || !chartContainerRef.current) return
      if (chartRef.current || globalChartInstance) return // Double-check after async load

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
      globalChartInstance = chart
      setIsInitialized(true)

      console.log("[ChartPanel] Chart initialized (singleton)")

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
        isMounted = false
        window.removeEventListener("resize", handleResize)
        console.log("[ChartPanel] Cleaning up chart...")
        chart.remove()
        chartRef.current = null
        candlestickSeriesRef.current = null
        globalChartInstance = null
        setIsInitialized(false)
      }
    }).catch((error) => {
      console.error("[ChartPanel] Failed to load lightweight-charts:", error)
    })

    // Cleanup if component unmounts before library loads
    return () => {
      isMounted = false
      if (chartRef.current) {
        console.log("[ChartPanel] Cleaning up chart (unmount)...")
        chartRef.current.remove()
        chartRef.current = null
        candlestickSeriesRef.current = null
        globalChartInstance = null
        setIsInitialized(false)
      }
    }
  }, [])

  // Update chart with live WebSocket data
  useEffect(() => {
    if (!isInitialized || !candlestickSeriesRef.current) return
    if (!historicalDataLoaded) return
    if (candleHistory.length === 0) return

    try {
      // Convert all candles to chart format and deduplicate by timestamp
      const chartData = candleHistory.map((candle) => ({
        time: Math.floor(candle.timestamp / 1000) as any,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      }))

      // Sort by time
      chartData.sort((a, b) => a.time - b.time)

      // Deduplicate: keep only the last candle for each unique timestamp
      const deduped = chartData.reduce((acc, candle) => {
        const existing = acc.find(c => c.time === candle.time)
        if (existing) {
          // Replace with newer data (keep last)
          Object.assign(existing, candle)
        } else {
          acc.push(candle)
        }
        return acc
      }, [] as typeof chartData)

      // Set all data (replaces previous data)
      candlestickSeriesRef.current.setData(deduped)

      // Auto-fit to show all candles
      chartRef.current?.timeScale().fitContent()

      console.log(`[ChartPanel] Updated chart with ${deduped.length} candles from Pyth feed (${chartData.length - deduped.length} duplicates removed)`)
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
    <div className="absolute top-[90px] left-0 right-0 bottom-[170px] px-4 md:px-8 pointer-events-auto z-20">
      <div className="h-full bg-transparent rounded-b-2xl border-l border-r border-b border-purple-500/30">
        {/* Chart Header */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-purple-500/30 bg-black/60 backdrop-blur-sm">
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
          {candleHistory.length > 0 ? (
            <span>{candleHistory.length} candles • Live Pyth Feed</span>
          ) : (
            <span className="flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              Waiting for Pyth feed data...
            </span>
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
