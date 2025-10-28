"use client"

import { GameContainer } from "../src/components/game-container"
import { GameUI } from "../src/components/game-ui"
import { useIsMobile } from "../src/hooks/use-is-mobile"

export default function Home() {
  const isMobile = useIsMobile()

  return (
    <main className={`min-h-screen bg-gradient-to-b from-[#0a0a0f] via-[#12121a] to-[#1a1a28] flex flex-col items-center ${isMobile ? 'justify-start pt-4' : 'justify-center'} ${isMobile ? 'p-2' : 'p-8'}`}>
      <div className="flex flex-col items-center gap-4 md:gap-8">
        <header className="text-center">
          <h1 className={`font-bold tracking-tight text-white mb-2 ${isMobile ? 'text-2xl' : 'text-4xl'}`}>
            Balance — DEMO
          </h1>
          <p className={`text-gray-400 ${isMobile ? 'text-xs' : 'text-sm'}`}>
            {isMobile ? "tap to flip · swipe to discard" : "click to flip · swipe to discard · one stone per candle"}
          </p>
        </header>

        <div className="relative">
          <GameContainer />
          <GameUI isMobile={isMobile} />
        </div>

        {!isMobile && (
          <footer className="text-center">
            <p className="text-sm text-gray-400 italic">data shapes the stones; you shape the stack</p>
          </footer>
        )}
      </div>
    </main>
  )
}
