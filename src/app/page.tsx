 export default function Home() {
   return (
     <main className="min-h-screen bg-gradient-to-b from-[#0a0a0f] via-[#12121a] to-[#1a1a28] flex flex-col items-center justify-center p-8">
       <div className="flex flex-col items-center gap-8">
         <header className="text-center">
           <h1 className="text-4xl font-bold tracking-tight text-foreground mb-2">Balance — DEMO</h1>
           <p className="text-sm text-muted-foreground">click to flip · swipe to discard · one stone per candle</p>
         </header>

         <div className="relative">
           <div className="w-[800px] h-[600px] bg-gray-900/50 border border-gray-700 rounded-lg flex items-center justify-center">
             <div className="text-center">
               <div className="text-lg text-muted-foreground mb-4">Game Canvas</div>
               <div className="text-sm text-muted-foreground">Physics simulation will load here</div>
             </div>
           </div>
         </div>

         <footer className="text-center">
           <p className="text-sm text-muted-foreground italic">data shapes the stones; you shape the stack</p>
         </footer>
       </div>
     </main>
   )
 }
