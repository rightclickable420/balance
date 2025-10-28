"use client"

import { GameContainer } from "../src/components/game-container"
import { GameUI } from "../src/components/game-ui"
import { useIsMobile } from "../src/hooks/use-is-mobile"

export default function Home() {
  const isMobile = useIsMobile()

  return (
    <main className={`min-h-screen bg-gradient-to-b from-[#0a0a0f] via-[#12121a] to-[#1a1a28] flex flex-col items-center ${isMobile ? 'justify-start pt-0' : 'justify-center'} ${isMobile ? 'p-0' : 'p-8'}`}>
      <div className={`flex flex-col items-center ${isMobile ? 'gap-1 w-full' : 'gap-8'}`}>
        <header className={`text-center ${isMobile ? 'py-2 px-2' : ''}`}>
          <h1 className={`font-bold tracking-tight text-white ${isMobile ? 'text-lg mb-0.5' : 'text-4xl mb-2'}`}>
            Balance — DEMO
          </h1>
          <p className={`text-gray-400 ${isMobile ? 'text-[10px]' : 'text-sm'}`}>
            {isMobile ? "tap to flip · swipe to discard" : "click to flip · swipe to discard · one stone per candle"}
          </p>
        </header>

        <div className={`relative ${isMobile ? 'w-full' : ''}`}>
          <GameContainer isMobile={isMobile} />
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
