"use client"

import { useWallet } from "@solana/wallet-adapter-react"
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"
import { useEffect, useState } from "react"
import { getSessionWallet, type PositionBackup } from "@/lib/wallet/session-wallet"
import { useGameState } from "@/lib/game/game-state"
import { LAMPORTS_PER_SOL, SystemProgram, Transaction } from "@solana/web3.js"
import { useConnection } from "@solana/wallet-adapter-react"
import { getDriftPositionManager } from "@/lib/trading/drift-position-manager"

export function WalletConnectButton() {
  const { publicKey, connected } = useWallet()
  const { connection } = useConnection()
  const [mounted, setMounted] = useState(false)
  const [sessionActive, setSessionActive] = useState(false)
  const [driftInitialized] = useState(false)
  const [showPositionsWarning, setShowPositionsWarning] = useState(false)
  const [recoveredPositions, setRecoveredPositions] = useState<PositionBackup[]>([])
  const [currentPositions, setCurrentPositions] = useState<PositionBackup[]>([])
  const [isClosingPositions, setIsClosingPositions] = useState(false)

  const sessionWalletPublicKey = useGameState((state) => state.sessionWalletPublicKey)
  const sessionWalletBalance = useGameState((state) => state.sessionWalletBalance)

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  // Check for existing session - setup screen handles recovery and creation
  useEffect(() => {
    if (connected && publicKey && !sessionActive) {
      const sessionWallet = getSessionWallet()

      // Check if session was already recovered/created by setup screen
      const existingKeypair = sessionWallet.getKeypair()
      if (existingKeypair) {
        const sessionPubKey = sessionWallet.getPublicKey()
        if (sessionPubKey) {
          console.log("[WalletConnect] Using existing session from setup:", sessionPubKey.toBase58())
          useGameState.setState({
            sessionWalletPublicKey: sessionPubKey,
          })
          setSessionActive(true)
          return
        }
      }

      // No existing session - wait for setup screen to create one during deposit
      console.log("[WalletConnect] No session found, waiting for deposit to create one")
    }
  }, [connected, publicKey, sessionActive])

  const handleCloseAllPositions = async () => {
    if (!sessionWalletPublicKey || recoveredPositions.length === 0) return

    setIsClosingPositions(true)

    try {
      if (!driftInitialized) {
        throw new Error("Drift client not initialized")
      }

      const driftManager = getDriftPositionManager()

      // Get current open positions from Drift
      const openPositions = await driftManager.getOpenPositions()

      if (openPositions.length === 0) {
        console.log("[WalletConnect] No open positions found on Drift")
        setShowPositionsWarning(false)
        setRecoveredPositions([])
        return
      }

      console.log(`[WalletConnect] Closing ${openPositions.length} Drift positions...`)

      // Close each position
      for (const position of openPositions) {
        try {
          console.log(
            `[WalletConnect] Closing ${position.side.toUpperCase()} ${position.marketSymbol} position (${position.sizeUsd.toFixed(2)} USD)...`
          )

          const txSig = await driftManager.closePosition(position.marketIndex, 100) // 100% close

          console.log(`[WalletConnect] ✅ Position closed: ${txSig}`)
        } catch (error) {
          console.error(
            `[WalletConnect] Failed to close ${position.marketSymbol} position:`,
            error
          )
          // Continue with other positions
        }
      }

      setShowPositionsWarning(false)
      setRecoveredPositions([])

      alert(`All ${openPositions.length} positions have been closed successfully.`)
    } catch (error) {
      console.error("[WalletConnect] Failed to close all positions:", error)
      alert(`Failed to close positions: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsClosingPositions(false)
    }
  }

  const handleKeepPositions = () => {
    console.log("[WalletConnect] User chose to keep positions open")
    setCurrentPositions(recoveredPositions)
    setShowPositionsWarning(false)
    // Positions remain open, user can manage them later
  }

  const handleEmergencyCloseAll = async () => {
    const confirmed = window.confirm(
      `Are you sure you want to close all ${currentPositions.length} open positions? This action cannot be undone.`
    )

    if (!confirmed) return

    setIsClosingPositions(true)

    try {
      if (!driftInitialized) {
        throw new Error("Drift client not initialized")
      }

      const driftManager = getDriftPositionManager()
      const openPositions = await driftManager.getOpenPositions()

      if (openPositions.length === 0) {
        console.log("[WalletConnect] No open positions found")
        setCurrentPositions([])
        return
      }

      console.log(`[WalletConnect] Emergency closing ${openPositions.length} positions...`)

      for (const position of openPositions) {
        try {
          console.log(
            `[WalletConnect] Emergency closing ${position.side.toUpperCase()} ${position.marketSymbol}...`
          )

          const txSig = await driftManager.closePosition(position.marketIndex, 100)

          console.log(`[WalletConnect] ✅ Position closed: ${txSig}`)
        } catch (error) {
          console.error(
            `[WalletConnect] Failed to close ${position.marketSymbol}:`,
            error
          )
        }
      }

      setCurrentPositions([])
      alert(`All ${openPositions.length} positions have been closed.`)
    } catch (error) {
      console.error("[WalletConnect] Emergency close failed:", error)
      alert(`Failed to close positions: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsClosingPositions(false)
    }
  }

  // Poll session wallet balance
  useEffect(() => {
    if (!sessionActive || !sessionWalletPublicKey) return

    const sessionWallet = getSessionWallet()

    const pollBalance = async () => {
      const balance = await sessionWallet.getBalance()
      useGameState.setState({
        sessionWalletBalance: balance,
        equity: balance, // Initially equity = balance
      })
    }

    // Poll immediately and every 30 seconds to avoid rate limits
    pollBalance()
    const interval = setInterval(pollBalance, 30000)

    return () => clearInterval(interval)
  }, [sessionActive, sessionWalletPublicKey])

  const handleWithdraw = async () => {
    if (!publicKey || !sessionWalletPublicKey) return

    const sessionWallet = getSessionWallet()
    const keypair = sessionWallet.getKeypair()
    if (!keypair) return

    try {
      // Get session wallet balance
      const balance = await sessionWallet.getBalance()
      if (balance === 0) {
        console.log("[WalletConnect] No balance to withdraw")
        return
      }

      // Keep small amount for rent
      const rentExempt = 0.001
      const withdrawAmount = Math.max(0, balance - rentExempt)

      if (withdrawAmount <= 0) {
        console.log("[WalletConnect] Balance too low to withdraw")
        return
      }

      // Create transfer transaction from session wallet → user wallet
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: sessionWalletPublicKey,
          toPubkey: publicKey,
          lamports: withdrawAmount * LAMPORTS_PER_SOL,
        })
      )

      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash()
      transaction.recentBlockhash = blockhash
      transaction.feePayer = sessionWalletPublicKey

      // Sign with session keypair
      transaction.sign(keypair)

      // Send transaction
      const signature = await connection.sendRawTransaction(transaction.serialize())
      console.log("[WalletConnect] Withdraw transaction sent:", signature)

      await connection.confirmTransaction(signature, "confirmed")
      console.log("[WalletConnect] Withdraw confirmed:", signature)

      // Clear session
      sessionWallet.clearSession()
      setSessionActive(false)
      useGameState.setState({
        sessionWalletPublicKey: null,
        sessionWalletBalance: 0,
        equity: 0,
      })
    } catch (error) {
      console.error("[WalletConnect] Withdraw failed:", error)
    }
  }

  // Prevent hydration mismatch - return loading skeleton if not mounted
  if (!mounted) {
    return (
      <div className="flex flex-col items-end gap-2">
        <div className="h-10 w-36 bg-purple-600 rounded-lg animate-pulse" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <WalletMultiButton className="!bg-purple-600 hover:!bg-purple-700" />

      {connected && sessionActive && (
        <div className="text-xs text-gray-400 space-y-1">
          <div>Session: {sessionWalletPublicKey?.toBase58().slice(0, 8)}...</div>
          <div>Balance: {sessionWalletBalance.toFixed(4)} SOL</div>

          {currentPositions.length > 0 && (
            <div className="bg-red-900/20 border border-red-600/30 rounded px-2 py-1.5 my-2">
              <div className="flex items-center justify-between">
                <span className="text-red-200 font-medium">
                  {currentPositions.length} Open Position{currentPositions.length > 1 ? "s" : ""}
                </span>
                <button
                  onClick={handleEmergencyCloseAll}
                  disabled={isClosingPositions}
                  className="px-2 py-0.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 rounded text-white font-medium"
                >
                  {isClosingPositions ? "Closing..." : "Close All"}
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-2 mt-2">
            <button
              onClick={handleWithdraw}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs"
            >
              Withdraw
            </button>
          </div>
        </div>
      )}

      {/* Open Positions Warning Modal */}
      {showPositionsWarning && recoveredPositions.length > 0 && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-900 p-6 rounded-lg max-w-lg w-full mx-4 border border-red-600 shadow-2xl">
            <h2 className="text-xl font-bold mb-4 text-red-400 flex items-center gap-2">
              <span className="text-2xl">⚠️</span>
              Open Trading Positions Detected
            </h2>

            <div className="bg-red-900/20 border border-red-600/30 p-4 rounded mb-4">
              <p className="text-sm text-red-200 mb-3 font-medium">
                Your session wallet has {recoveredPositions.length} open trading position
                {recoveredPositions.length > 1 ? "s" : ""} that {recoveredPositions.length > 1 ? "were" : "was"}
                {" "}interrupted by the browser crash/refresh.
              </p>
              <p className="text-xs text-red-300">
                These positions are still active on-chain and exposed to market risk. You should either close them now or actively monitor them.
              </p>
            </div>

            <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
              {recoveredPositions.map((pos, idx) => (
                <div key={idx} className="bg-gray-800 p-3 rounded border border-gray-700">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold ${
                          pos.side === "long"
                            ? "bg-emerald-600 text-white"
                            : "bg-rose-600 text-white"
                        }`}
                      >
                        {pos.side.toUpperCase()}
                      </span>
                      <span className="text-sm font-mono text-gray-400">
                        {pos.positionAddress.slice(0, 8)}...
                      </span>
                    </div>
                    <span className="text-sm font-bold text-white">
                      ${pos.sizeUsd.toFixed(2)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
                    <div>
                      Entry: ${pos.entryPrice.toFixed(2)}
                    </div>
                    <div>
                      Collateral: ${pos.collateralUsd.toFixed(2)}
                    </div>
                    <div className="col-span-2">
                      Opened: {new Date(pos.openTime * 1000).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-amber-900/20 border border-amber-600/30 p-3 rounded mb-4">
              <p className="text-xs text-amber-200">
                <strong>Recommended:</strong> Close all positions now to avoid unexpected losses.
                You can always open new positions after securing your funds.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleCloseAllPositions}
                disabled={isClosingPositions}
                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 rounded font-medium text-white"
              >
                {isClosingPositions ? "Closing Positions..." : "Close All Positions"}
              </button>
              <button
                onClick={handleKeepPositions}
                disabled={isClosingPositions}
                className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 rounded font-medium"
              >
                Keep Open (Risky)
              </button>
            </div>

            <p className="text-xs text-gray-500 mt-3 text-center">
              Powered by Drift Protocol - Sub-second execution with gasless trading
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
