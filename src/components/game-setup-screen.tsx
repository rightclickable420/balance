"use client"

import { useState, useEffect } from "react"
import { WalletConnectButton } from "./wallet-connect-button"
import { useWallet } from "@solana/wallet-adapter-react"
import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js"
import { getSessionWallet, SESSION_WALLET_SIGNATURE_MESSAGE } from "@/lib/wallet/session-wallet"
import { STRATEGY_PRESETS, type TradingStrategy } from "@/lib/trading/trading-controller"
import { useGameState } from "@/lib/game/game-state"

interface GameSetupScreenProps {
  onStartGame: (mode: "mock" | "real", strategy?: TradingStrategy, leverage?: number) => void
}

// Trading constants
// Drift uses Swift Protocol (gasless trading), so minimal gas needed
// Most SOL goes to collateral for trading
const DRIFT_ACCOUNT_RENT = 0.035 // SOL - one-time cost for Drift account creation
const MIN_TRADING_COLLATERAL = 0.04 // SOL - minimum collateral (~$8 at $200/SOL)
const GAS_BUFFER = 0.005 // SOL - small buffer for withdrawal transaction
const MIN_DEPOSIT = DRIFT_ACCOUNT_RENT + MIN_TRADING_COLLATERAL + GAS_BUFFER // 0.08 SOL
const DEFAULT_DEPOSIT = 0.1 // SOL - recommended starting amount

export function GameSetupScreen({ onStartGame }: GameSetupScreenProps) {
  const { connected, publicKey, signMessage, sendTransaction } = useWallet()
  // Always use Doom Runner mode (Balance game removed)
  const experienceMode = "doomrunner"
  const [selectedMode, setSelectedMode] = useState<"mock" | "real">("mock")
  const [depositAmount, setDepositAmount] = useState<string>(DEFAULT_DEPOSIT.toString())
  const [isDepositing, setIsDepositing] = useState(false)
  const [isWithdrawing, setIsWithdrawing] = useState(false)
  const [sessionWalletAddress, setSessionWalletAddress] = useState<string | null>(null)
  const [sessionBalance, setSessionBalance] = useState<number>(0)
  const [mainWalletBalance, setMainWalletBalance] = useState<number>(0)
  const [recoveryStatus, setRecoveryStatus] = useState<"checking" | "recovered" | "new" | "failed">("checking")
  const [leverage, setLeverage] = useState<number>(5) // Default 5x leverage
  const [tradingStrategy, setTradingStrategy] = useState<TradingStrategy>("balanced") // Default to balanced strategy

  // Auto-recover session wallet on connect
  useEffect(() => {
    if (!connected || !publicKey || !signMessage) {
      setRecoveryStatus("new")
      setSessionWalletAddress(null)
      return
    }

    const autoRecover = async () => {
      const sessionWallet = getSessionWallet()

      if (!sessionWallet.hasBackup()) {
        console.log("[Setup] No backup found")
        setRecoveryStatus("new")
        setSessionWalletAddress(null)
        return
      }

      const backupInfo = sessionWallet.getBackupInfo()
      if (!backupInfo) {
        setRecoveryStatus("new")
        setSessionWalletAddress(null)
        return
      }

      console.log("[Setup] Found session wallet backup from", new Date(backupInfo.timestamp).toLocaleString())
      console.log("[Setup] Auto-recovering session wallet...")

      try {
        // Get encryption key from wallet signature
        // CRITICAL: Must use same message as creation for deterministic signature
        const message = new TextEncoder().encode(SESSION_WALLET_SIGNATURE_MESSAGE)
        const signature = await signMessage(message)

        const recovered = await sessionWallet.recoverFromStorage(signature)

        if (recovered) {
          const pubKey = sessionWallet.getPublicKey()
          if (pubKey) {
            const address = pubKey.toBase58()
            setSessionWalletAddress(address)
            setRecoveryStatus("recovered")
            console.log("[Setup] ✅ Session wallet auto-recovered:", address)

            // Get balance
            const balance = await sessionWallet.getBalance()
            setSessionBalance(balance)
            console.log("[Setup] Session wallet balance:", balance, "SOL")
          }
        } else {
          console.warn("[Setup] Auto-recovery failed, user will create new session")
          setRecoveryStatus("new")
          setSessionWalletAddress(null)
        }
      } catch (error) {
        console.error("[Setup] Auto-recovery error:", error)
        // If recovery fails, treat as new user (don't show error to user)
        setRecoveryStatus("new")
        setSessionWalletAddress(null)
      }
    }

    autoRecover()
  }, [connected, publicKey, signMessage])

  // Fetch main wallet balance
  useEffect(() => {
    if (!connected || !publicKey) return

    const fetchBalance = async () => {
      try {
        const connection = new Connection(
          process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"
        )
        const balance = await connection.getBalance(publicKey)
        setMainWalletBalance(balance / LAMPORTS_PER_SOL)
      } catch (error) {
        console.error("[Setup] Failed to fetch wallet balance:", error)
      }
    }

    fetchBalance()
    const interval = setInterval(fetchBalance, 30000) // Update every 30s to avoid rate limits
    return () => clearInterval(interval)
  }, [connected, publicKey])

  // Warn user before closing tab if session wallet has balance
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (sessionBalance > 0.001) { // More than dust (0.001 SOL)
        e.preventDefault()
        e.returnValue = `You have ${sessionBalance.toFixed(3)} SOL in your session wallet! Please withdraw before closing.`
        return e.returnValue
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [sessionBalance])


  const handleDeposit = async () => {
    if (!connected || !publicKey || !signMessage || !sendTransaction) {
      alert("Please connect your wallet first")
      return
    }

    const amount = parseFloat(depositAmount)
    if (isNaN(amount) || amount <= 0) {
      alert("Please enter a valid amount")
      return
    }

    if (amount < MIN_DEPOSIT) {
      alert(`Minimum deposit is ${MIN_DEPOSIT} SOL (${MIN_TRADING_COLLATERAL} SOL collateral + ${DRIFT_ACCOUNT_RENT} SOL Drift rent + ${GAS_BUFFER} SOL buffer)`)
      return
    }

    if (amount > mainWalletBalance - GAS_BUFFER) {
      alert(`Insufficient balance. Keep at least ${GAS_BUFFER} SOL in your main wallet for transaction fees`)
      return
    }

    setIsDepositing(true)

    try {
      const sessionWallet = getSessionWallet()
      let sessionPubKey: PublicKey

      console.log("[Deposit] Current sessionWalletAddress state:", sessionWalletAddress)

      // Check if session wallet instance has an active session
      const existingPubKey = sessionWallet.getPublicKey()
      console.log("[Deposit] Session wallet instance has active session?", existingPubKey?.toBase58())

      // Use existing session if available, otherwise create new one
      if (existingPubKey) {
        console.log("[Deposit] Using existing session wallet from instance:", existingPubKey.toBase58())
        sessionPubKey = existingPubKey
        // Sync state with instance
        const address = existingPubKey.toBase58()
        if (sessionWalletAddress !== address) {
          console.log("[Deposit] Syncing state with session wallet instance")
          setSessionWalletAddress(address)
        }
      } else {
        console.log("[Deposit] No active session, creating new session wallet...")

        // Get encryption key from wallet signature
        // CRITICAL: Must use same message as recovery for deterministic signature
        const message = new TextEncoder().encode(SESSION_WALLET_SIGNATURE_MESSAGE)
        const signature = await signMessage(message)

        const session = await sessionWallet.generateSession(signature)
        sessionPubKey = session.publicKey
        const address = session.publicKey.toBase58()
        setSessionWalletAddress(address)
        setRecoveryStatus("new")
        console.log("[Deposit] Created new session wallet:", address)
      }

      // Create deposit transaction
      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"
      )

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: sessionPubKey,
          lamports: Math.floor(amount * LAMPORTS_PER_SOL),
        })
      )

      const { blockhash } = await connection.getLatestBlockhash()
      transaction.recentBlockhash = blockhash
      transaction.feePayer = publicKey

      // Send transaction
      console.log("[Deposit] Sending transaction...")
      const signature = await sendTransaction(transaction, connection)
      console.log("[Deposit] Transaction sent:", signature)

      // Wait for confirmation
      console.log("[Deposit] Waiting for confirmation...")
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight: (await connection.getLatestBlockhash()).lastValidBlockHeight
      })
      console.log("[Deposit] Transaction confirmed!")

      // Update session balance
      const newBalance = await sessionWallet.getBalance()
      setSessionBalance(newBalance)
      console.log("[Deposit] Updated session balance:", newBalance, "SOL")

      // Update main wallet balance
      const mainBalance = await connection.getBalance(publicKey)
      setMainWalletBalance(mainBalance / LAMPORTS_PER_SOL)

      alert(`Successfully deposited ${amount} SOL to session wallet!`)
    } catch (error) {
      console.error("[Deposit] Failed:", error)
      const errorMessage = error instanceof Error ? error.message : "Unknown error"

      // Provide helpful error messages
      if (errorMessage.includes("insufficient funds") || errorMessage.includes("Attempt to debit")) {
        alert(`Deposit failed: Insufficient SOL in your wallet.\n\nNote: You're connected to ${process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.includes('devnet') ? 'DEVNET' : 'MAINNET'}. Make sure you have enough SOL on this network.`)
      } else if (errorMessage.includes("403") || errorMessage.includes("forbidden")) {
        alert(`Deposit failed: RPC connection error.\n\nThe RPC endpoint is blocking requests. Please add a valid RPC API key to .env.local`)
      } else {
        alert(`Deposit failed: ${errorMessage}`)
      }
    } finally {
      setIsDepositing(false)
    }
  }

  const handleWithdraw = async () => {
    if (!connected || !publicKey || !sendTransaction) {
      alert("Please connect your wallet first")
      return
    }

    if (sessionBalance === 0) {
      alert("No funds to withdraw")
      return
    }

    setIsWithdrawing(true)

    try {
      const sessionWallet = getSessionWallet()
      const sessionKeypair = sessionWallet.getKeypair()

      if (!sessionKeypair) {
        alert("Session wallet not found. Please deposit first.")
        setIsWithdrawing(false)
        return
      }

      // CRITICAL: Check Drift account for funds before clearing session
      try {
        const { getDriftPositionManager } = await import("@/lib/trading/drift-position-manager")
        const driftManager = getDriftPositionManager()

        // Check if Drift is initialized for this session
        if (driftManager.isInitialized) {
          console.log("[Withdraw] Checking Drift account for collateral...")

          // Get Drift collateral
          const summary = await driftManager.getPositionSummary()
          const driftCollateralUsd = summary.totalCollateral

          if (driftCollateralUsd > 1) { // More than $1 in Drift
            const shouldWithdrawFromDrift = window.confirm(
              `You have $${driftCollateralUsd.toFixed(2)} in your Drift account!\n\n` +
              `This needs to be withdrawn to your session wallet first.\n\n` +
              `Click OK to withdraw from Drift automatically, or Cancel to keep funds in Drift.`
            )

            if (shouldWithdrawFromDrift) {
              console.log("[Withdraw] Withdrawing from Drift to session wallet...")
              await driftManager.withdrawCollateral(0) // 0 = withdraw all
              console.log("[Withdraw] ✅ Drift collateral withdrawn to session wallet")

              // Update session balance
              const newBalance = await sessionWallet.getBalance()
              setSessionBalance(newBalance)
              console.log("[Withdraw] Updated session balance:", newBalance, "SOL")
            } else {
              alert("Withdrawal cancelled. Your Drift funds remain in the account.\n\nYou can access them later by recovering this session wallet.")
              setIsWithdrawing(false)
              return
            }
          }
        }
      } catch (driftError) {
        console.warn("[Withdraw] Could not check Drift account:", driftError)
        // Continue with session wallet withdrawal even if Drift check fails
      }

      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"
      )

      // Get current balance
      const currentBalance = await connection.getBalance(sessionKeypair.publicKey)

      // Estimate transaction fee
      const testTransaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: sessionKeypair.publicKey,
          toPubkey: publicKey,
          lamports: 1, // Dummy amount for fee estimation
        })
      )
      const { blockhash } = await connection.getLatestBlockhash()
      testTransaction.recentBlockhash = blockhash
      testTransaction.feePayer = sessionKeypair.publicKey

      // Get fee for transaction
      const fee = await connection.getFeeForMessage(
        testTransaction.compileMessage(),
        "confirmed"
      )
      const estimatedFee = fee.value || 5000 // Fallback to 5000 lamports if estimation fails

      // Add safety buffer to prevent failed transactions due to fee fluctuation
      // Use 3x the estimated fee to account for priority fees and network congestion
      const feeBuffer = estimatedFee * 3

      // Withdraw with safety buffer for fees
      const withdrawAmount = currentBalance - feeBuffer

      if (withdrawAmount <= 0) {
        alert("Insufficient balance to cover transaction fees (balance too low)")
        setIsWithdrawing(false)
        return
      }

      console.log("[Withdraw] Balance:", currentBalance / LAMPORTS_PER_SOL, "SOL")
      console.log("[Withdraw] Estimated fee:", estimatedFee / LAMPORTS_PER_SOL, "SOL")
      console.log("[Withdraw] Fee buffer (3x):", feeBuffer / LAMPORTS_PER_SOL, "SOL")
      console.log("[Withdraw] Withdraw amount:", withdrawAmount / LAMPORTS_PER_SOL, "SOL")

      console.log(`[Withdraw] Withdrawing maximum: ${(withdrawAmount / LAMPORTS_PER_SOL).toFixed(6)} SOL (fee: ${(estimatedFee / LAMPORTS_PER_SOL).toFixed(6)} SOL)`)

      // Create withdrawal transaction (signed by session wallet)
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: sessionKeypair.publicKey,
          toPubkey: publicKey,
          lamports: withdrawAmount,
        })
      )

      transaction.recentBlockhash = blockhash
      transaction.feePayer = sessionKeypair.publicKey

      // Sign with session wallet
      transaction.sign(sessionKeypair)

      // Send transaction
      const signature = await connection.sendRawTransaction(transaction.serialize())
      console.log("[Withdraw] Transaction sent:", signature)

      // Wait for confirmation
      await connection.confirmTransaction(signature, "confirmed")
      console.log("[Withdraw] Transaction confirmed!")

      // CRITICAL SAFETY: Only clear session if Drift account is also empty
      // Otherwise user loses access to Drift rent deposit (~0.035 SOL)
      let shouldClearSession = true
      let driftBalance = 0

      try {
        const { getDriftPositionManager } = await import("@/lib/trading/drift-position-manager")
        const driftManager = getDriftPositionManager()

        if (driftManager.isInitialized) {
          const summary = await driftManager.getPositionSummary()
          driftBalance = summary.totalCollateral

          if (driftBalance > 0.5) { // More than $0.50 in Drift
            console.warn(
              `[Withdraw] ⚠️ Drift account has $${driftBalance.toFixed(2)} remaining - NOT clearing session!`
            )
            shouldClearSession = false
          }
        }
      } catch (driftError) {
        console.warn("[Withdraw] Could not verify Drift account status:", driftError)
        // If we can't check Drift, DON'T clear session (safety first)
        shouldClearSession = false
      }

      if (shouldClearSession) {
        // Safe to clear - no Drift funds remaining
        sessionWallet.clearSession()
        setSessionWalletAddress(null)
        setSessionBalance(0)
        setRecoveryStatus("new")
        console.log("[Withdraw] ✅ Session cleared (Drift account empty)")
        alert(`Successfully withdrew ${(withdrawAmount / LAMPORTS_PER_SOL).toFixed(6)} SOL!\nSession wallet cleared. You can create a new one on your next deposit.`)
      } else {
        // Don't clear - Drift might have funds
        setSessionBalance(0) // UI shows 0 for session wallet
        console.log("[Withdraw] ⚠️ Session preserved (Drift account may have funds)")
        alert(
          `Successfully withdrew ${(withdrawAmount / LAMPORTS_PER_SOL).toFixed(6)} SOL from session wallet!\n\n` +
          (driftBalance > 0
            ? `⚠️ Your Drift account still has $${driftBalance.toFixed(2)}.\n` +
              `Session wallet backup preserved. Reconnect to access Drift funds.`
            : `⚠️ Could not verify Drift account. Session backup preserved for safety.`)
        )
      }
    } catch (error) {
      console.error("[Withdraw] Failed:", error)
      alert(`Withdrawal failed: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setIsWithdrawing(false)
    }
  }

  const handleStartGame = () => {
    if (selectedMode === "real" && sessionBalance < MIN_DEPOSIT) {
      alert(`Please deposit at least ${MIN_DEPOSIT} SOL into your session wallet before starting real trading`)
      return
    }
    onStartGame(selectedMode, tradingStrategy, leverage)
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-[#0a0a0f] via-[#12121a] to-[#1a1a28] flex items-start justify-center overflow-y-auto">
      <div className="max-w-2xl w-full mx-auto px-8 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="font-bold tracking-tight text-white text-6xl mb-4">
            Balance
          </h1>
          <p className="text-gray-400 text-lg">
            Stack stones. Follow the market. Stay balanced.
          </p>
        </div>

        {/* Setup Card */}
        <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-2xl p-8 space-y-6">
          {/* Doom Runner Mode (Balance mode removed) */}
          {experienceMode === "doomrunner" && (
            <div className="rounded-2xl border border-purple-500/30 bg-purple-500/10 p-4 text-sm text-purple-100/90 leading-relaxed space-y-2">
              <p>
                Doom Runner renders directly in the browser. The same market alignment, auto-align logic, and Drift hooks
                apply—only the visuals change. Use the controls below to run mock or real sessions just like the Balance
                stacker.
              </p>
              <p className="text-purple-200/80">
                Want the standalone GZDoom build? Zip the contents of <code className="text-white/80">market-runner/pk3</code>
                and follow <code className="text-white/80">market-runner/README.md</code>.
              </p>
            </div>
          )}

          {/* Wallet Connection */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-white text-xl font-bold mb-1">Connect Wallet</h2>
                <p className="text-gray-400 text-sm">
                  {connected ? "Wallet connected" : "Connect your Solana wallet to begin"}
                </p>
              </div>
              <WalletConnectButton />
            </div>
            {connected && publicKey && (
              <div className="space-y-2">
                <div className="p-3 bg-emerald-900/20 border border-emerald-600/30 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-emerald-400 font-mono">
                      {publicKey.toString().slice(0, 8)}...{publicKey.toString().slice(-8)}
                    </div>
                    <div className="text-sm font-bold text-emerald-300">
                      {mainWalletBalance.toFixed(4)} SOL
                    </div>
                  </div>
                </div>

                {/* Session Wallet Status */}
                {sessionWalletAddress && (
                  <div className="p-3 bg-cyan-900/20 border border-cyan-600/30 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs text-cyan-400 font-bold">Session Wallet</div>
                      <div className="text-xs text-cyan-300">
                        {recoveryStatus === "recovered" && "✓ Recovered"}
                        {recoveryStatus === "new" && "✓ Created"}
                        {recoveryStatus === "failed" && "⚠ Recovery Failed"}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-cyan-400 font-mono">
                        {sessionWalletAddress.slice(0, 8)}...{sessionWalletAddress.slice(-8)}
                      </div>
                      <div className="text-sm font-bold text-cyan-300">
                        {sessionBalance.toFixed(4)} SOL
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Deposit/Withdraw Section - Only show for Real Trading */}
          {connected && selectedMode === "real" && (
            <>
              <div className="h-px bg-white/10" />

              <div className="space-y-4">
                <div>
                  <h2 className="text-white text-xl font-bold mb-1">Fund Session Wallet</h2>
                  <p className="text-gray-400 text-sm">
                    Deposit SOL for trading (recoverable on page refresh)
                  </p>
                </div>

                <div className="flex gap-2">
                  <div className="flex-1">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="Amount (SOL)"
                      className="w-full px-4 py-3 bg-black/40 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <button
                    onClick={handleDeposit}
                    disabled={isDepositing || !connected}
                    className="px-6 py-3 bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
                  >
                    {isDepositing ? "Depositing..." : "Deposit"}
                  </button>
                </div>

                {sessionBalance > 0 && (
                  <button
                    onClick={handleWithdraw}
                    disabled={isWithdrawing}
                    className="w-full px-4 py-2 bg-white/10 hover:bg-white/20 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    {isWithdrawing ? "Withdrawing..." : `Withdraw All (${sessionBalance.toFixed(4)} SOL)`}
                  </button>
                )}

                <div className="p-3 bg-blue-900/20 border border-blue-600/30 rounded-lg">
                  <p className="text-xs text-blue-200">
                    💡 Withdrawal takes maximum amount (minus tx fee). Session wallet is encrypted and recoverable across page refreshes.
                  </p>
                </div>
              </div>
            </>
          )}

          <div className="h-px bg-white/10" />

          {/* Game Mode Selection */}
          <div className="space-y-4">
            <div>
              <h2 className="text-white text-xl font-bold mb-1">Select Mode</h2>
              <p className="text-gray-400 text-sm">
                Choose how you want to play
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Mock Trading Mode */}
              <button
                onClick={() => setSelectedMode("mock")}
                className={`p-6 rounded-xl border-2 transition-all ${
                  selectedMode === "mock"
                    ? "border-cyan-500 bg-cyan-500/10"
                    : "border-white/10 bg-black/20 hover:border-white/20"
                }`}
              >
                <div className="text-center space-y-3">
                  <div className="text-4xl">🎮</div>
                  <div>
                    <h3 className="text-white font-bold text-lg mb-1">Mock Trading</h3>
                    <p className="text-gray-400 text-sm">
                      Practice with $1,000 virtual balance
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-xs">
                    <span className="px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded">No risk</span>
                    <span className="px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded">Learn</span>
                  </div>
                </div>
              </button>

              {/* Real Trading Mode */}
              <button
                onClick={() => setSelectedMode("real")}
                disabled={!connected}
                className={`p-6 rounded-xl border-2 transition-all ${
                  selectedMode === "real"
                    ? "border-rose-500 bg-rose-500/10"
                    : "border-white/10 bg-black/20 hover:border-white/20"
                } ${!connected ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <div className="text-center space-y-3">
                  <div className="text-4xl">⚡</div>
                  <div>
                    <h3 className="text-white font-bold text-lg mb-1">Real Trading</h3>
                    <p className="text-gray-400 text-sm">
                      Trade on Drift Protocol with real SOL
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-xs">
                    <span className="px-2 py-1 bg-rose-500/20 text-rose-400 rounded">Live</span>
                    <span className="px-2 py-1 bg-rose-500/20 text-rose-400 rounded">Real money</span>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Trading Strategy & Settings - Available for both Mock and Real Trading */}
          <div className="h-px bg-white/10" />

          {/* Trading Strategy Selection */}
          <div className="space-y-4">
            <div>
              <h2 className="text-white text-xl font-bold mb-1">Trading Strategy</h2>
              <p className="text-gray-400 text-sm">
                Choose how aggressively to trade market signals
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {(Object.keys(STRATEGY_PRESETS) as TradingStrategy[]).map((strategy) => {
                const preset = STRATEGY_PRESETS[strategy]
                const isSelected = tradingStrategy === strategy
                return (
                  <button
                    key={strategy}
                    onClick={() => setTradingStrategy(strategy)}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      isSelected
                        ? "border-cyan-500 bg-cyan-500/10"
                        : "border-white/10 bg-white/5 hover:border-white/30"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="text-white font-bold text-lg">{preset.name}</div>
                      {isSelected && (
                        <div className="text-cyan-400 text-sm font-semibold">✓ Selected</div>
                      )}
                    </div>
                    <div className="text-gray-400 text-sm">{preset.description}</div>
                    <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                      <span>Min conviction: {(preset.minConviction * 100).toFixed(0)}%</span>
                      <span>•</span>
                      <span>Hold: {preset.minHoldTimeMs / 1000}s</span>
                      {preset.dynamicSizing && (
                        <>
                          <span>•</span>
                          <span>Dynamic sizing</span>
                        </>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Leverage Selection - Only for Real Trading */}
          {selectedMode === "real" && (
            <>
              <div className="h-px bg-white/10" />

              <div className="space-y-4">
                <div>
                  <h2 className="text-white text-xl font-bold mb-1">Leverage</h2>
                  <p className="text-gray-400 text-sm">
                    Choose your position multiplier (1x - 100x)
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 text-sm">1x Safe</span>
                    <span className="text-white text-2xl font-bold">{leverage}x</span>
                    <span className="text-gray-400 text-sm">100x Max</span>
                  </div>

                  <input
                    type="range"
                    min="1"
                    max="100"
                    step="1"
                    value={leverage}
                    onChange={(e) => setLeverage(parseInt(e.target.value))}
                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer slider"
                    style={{
                      background: `linear-gradient(to right, rgb(6 182 212) 0%, rgb(6 182 212) ${((leverage - 1) / 99) * 100}%, rgba(255,255,255,0.1) ${((leverage - 1) / 99) * 100}%, rgba(255,255,255,0.1) 100%)`
                    }}
                  />

                  <div className="grid grid-cols-5 gap-2">
                    {[1, 10, 25, 50, 100].map((lev) => (
                      <button
                        key={lev}
                        onClick={() => setLeverage(lev)}
                        className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                          leverage === lev
                            ? "bg-cyan-500 text-white"
                            : "bg-white/10 text-gray-400 hover:bg-white/20"
                        }`}
                      >
                        {lev}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Real Trading Warning */}
          {selectedMode === "real" && connected && (
            <div className="p-4 bg-rose-900/20 border border-rose-600/30 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="text-2xl">⚠️</div>
                <div className="flex-1 space-y-2">
                  <h4 className="text-rose-200 font-bold text-sm">Real Trading Mode</h4>
                  <p className="text-rose-200/80 text-xs leading-relaxed">
                    This mode will execute real trades on Drift Protocol using your deposited funds
                    with {leverage}x leverage. Only trade with funds you can afford to lose.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Start Button */}
          <button
            onClick={handleStartGame}
            disabled={selectedMode === "real" && (!connected || sessionBalance < MIN_DEPOSIT)}
            className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
              selectedMode === "real" && (!connected || sessionBalance < MIN_DEPOSIT)
                ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                : selectedMode === "mock"
                ? "bg-cyan-500 hover:bg-cyan-600 text-white"
                : "bg-rose-500 hover:bg-rose-600 text-white"
            }`}
          >
            {selectedMode === "mock"
              ? "Start Mock Trading"
              : sessionBalance < MIN_DEPOSIT
              ? `Deposit ${MIN_DEPOSIT}+ SOL to Start`
              : "Start Real Trading"}
          </button>

          {/* Footer Info */}
          <div className="text-center text-gray-500 text-xs space-y-1">
            <p>Market data: SOL/USD from Pyth Network</p>
            <p>Real trades: Drift Protocol on Solana</p>
          </div>
        </div>
      </div>
    </div>
  )
}
