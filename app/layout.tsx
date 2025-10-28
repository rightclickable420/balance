import type { Metadata } from "next"
import "./globals.css"

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
        {children}
      </body>
    </html>
  )
}
