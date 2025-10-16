import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Balance Game",
  description: "A physics-based stone stacking game",
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
