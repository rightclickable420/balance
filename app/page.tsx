"use client"

import { GameContainer } from "../src/components/game-container"
import { GameUI } from "../src/components/game-ui"
import { useIsMobile } from "../src/hooks/use-is-mobile"

export default function Home() {
  const isMobile = useIsMobile()

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
            {/* Desktop: Centered layout */}
            <header className="text-center">
              <h1 className="font-bold tracking-tight text-white text-4xl mb-2">
                Balance — DEMO
              </h1>
              <p className="text-gray-400 text-sm">
                click to flip · swipe to discard · one stone per candle
              </p>
            </header>

            <div className="relative">
              <GameContainer isMobile={isMobile} />
              <GameUI isMobile={isMobile} />
            </div>

            <footer className="text-center">
              <p className="text-sm text-gray-400 italic">data shapes the stones; you shape the stack</p>
            </footer>
          </>
        )}
      </div>
    </main>
  )
}
