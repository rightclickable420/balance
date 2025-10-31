"use client"

import { GameContainer } from "../src/components/game-container"
import { GameUI } from "../src/components/game-ui"
import { CandlestickChart } from "../src/components/candlestick-chart"
import { useIsMobile } from "../src/hooks/use-is-mobile"
import { useGameState } from "../src/lib/game/game-state"

export default function Home() {
  const isMobile = useIsMobile()
  const candleHistory = useGameState((state) => state.candleHistory)
  const currentCandle = useGameState((state) => state.currentCandle)

  return (
    <main className={`min-h-screen bg-gradient-to-b from-[#0a0a0f] via-[#12121a] to-[#1a1a28] flex flex-col items-center ${isMobile ? 'justify-center p-0' : 'justify-center p-8'}`}>
      <div className={`flex flex-col items-center ${isMobile ? 'w-full h-full' : 'gap-8'}`}>
        {isMobile ? (
          <>
            {/* Mobile: No header, game centered vertically */}
            <div className="relative w-full">
              <GameContainer isMobile={isMobile} />
              <GameUI isMobile={isMobile} />
            </div>
          </>
        ) : (
          <>
            {/* Desktop: Centered layout with chart on right */}
            <header className="text-center mb-6">
              <h1 className="font-bold tracking-tight text-white text-4xl mb-2">
                Balance — DEMO
              </h1>
              <p className="text-gray-400 text-sm">
                click to flip · swipe to discard · one stone per candle
              </p>
            </header>

            <div className="flex gap-6 items-start">
              {/* Main game area */}
              <div className="relative">
                <GameContainer isMobile={isMobile} />
                <GameUI isMobile={isMobile} />
              </div>

              {/* Chart panel on the right */}
              <div className="w-96 h-[600px] bg-black/40 border border-white/10 rounded-lg p-4">
                <div className="mb-2">
                  <h3 className="text-white text-sm font-semibold">Market Chart</h3>
                  <p className="text-gray-500 text-xs">30-second candles</p>
                </div>
                <div className="h-[calc(100%-3rem)]">
                  <CandlestickChart
                    candleHistory={candleHistory}
                    currentCandle={currentCandle}
                    maxCandles={20}
                  />
                </div>
              </div>
            </div>

            <footer className="text-center mt-6">
              <p className="text-sm text-gray-400 italic">data shapes the stones; you shape the stack</p>
            </footer>
          </>
        )}
      </div>
    </main>
  )
}
