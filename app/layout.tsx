import type { Metadata } from "next"
import "./globals.css"
import { SolanaWalletProvider } from "../src/components/wallet-provider"
import { Toaster } from "sonner"

export const metadata: Metadata = {
  title: "Balance — DEMO",
  description: "A physics-based stone stacking trading game",
  icons: {
    icon: '/favicon.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <SolanaWalletProvider>
          {children}
        </SolanaWalletProvider>
        <Toaster richColors position="top-center" expand />
      </body>
    </html>
  )
}
