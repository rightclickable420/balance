"use client"

import { useState, useEffect, useCallback } from "react"
import { WalletConnectButton } from "./wallet-connect-button"
import { useWallet } from "@solana/wallet-adapter-react"
import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js"
import { getSessionWallet, SESSION_WALLET_SIGNATURE_MESSAGE } from "@/lib/wallet/session-wallet"
import { STRATEGY_PRESETS, type TradingStrategy, getTradingController } from "@/lib/trading/trading-controller"
import { getDriftPositionManager } from "@/lib/trading/drift-position-manager"
import { getSessionRegistry, type SessionRecord } from "@/lib/wallet/session-registry"

interface GameSetupScreenProps {
  onStartGame: (
    mode: "mock" | "real",
    strategy?: TradingStrategy,
    leverage?: number,
    options?: { resumeExistingCollateral?: boolean }
  ) => void
}

type SessionWithBalance = SessionRecord & { onChainBalance: number | null }

// Trading constants
// Drift uses Swift Protocol (gasless trading), so minimal gas needed
// Most SOL goes to collateral for trading
const DRIFT_ACCOUNT_RENT = 0.035 // SOL - one-time cost for Drift account creation
const MIN_TRADING_COLLATERAL = 0.04 // SOL - minimum collateral (~$8 at $200/SOL)
const GAS_BUFFER = 0.005 // SOL - small buffer for withdrawal transaction
const MIN_DEPOSIT = DRIFT_ACCOUNT_RENT + MIN_TRADING_COLLATERAL + GAS_BUFFER // 0.08 SOL
const DEFAULT_DEPOSIT = 0.1 // SOL - recommended starting amount
const SOLANA_RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"
const REAL_TRADING_AVAILABLE =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_REAL_TRADING === "true"

export function GameSetupScreen({ onStartGame }: GameSetupScreenProps) {
  const { connected, publicKey, signMessage, sendTransaction } = useWallet()
  // Always use Doom Runner mode (Balance game removed)
  const experienceMode = "doomrunner"
  const [selectedMode, setSelectedMode] = useState<"mock" | "real">("mock")
  const [depositAmount, setDepositAmount] = useState<string>(DEFAULT_DEPOSIT.toString())
  const [isDepositing, setIsDepositing] = useState(false)
  const [isWithdrawing, setIsWithdrawing] = useState(false)
  const [isInitializingReal, setIsInitializingReal] = useState(false)
  const [sessionWalletAddress, setSessionWalletAddress] = useState<string | null>(null)
  const [sessionBalance, setSessionBalance] = useState<number>(0)
  const [mainWalletBalance, setMainWalletBalance] = useState<number>(0)
  const [recoveryStatus, setRecoveryStatus] = useState<"checking" | "recovered" | "new" | "failed">("checking")
  const [leverage, setLeverage] = useState<number>(5) // Default 5x leverage
  const [tradingStrategy, setTradingStrategy] = useState<TradingStrategy>("balanced") // Default to balanced strategy
  const [registrySessions, setRegistrySessions] = useState<SessionWithBalance[]>([])
  const [registryLoading, setRegistryLoading] = useState(false)
  const [showWithdrawnSessions, setShowWithdrawnSessions] = useState(false)
  const [isCheckingDrift, setIsCheckingDrift] = useState(false)
  const [isWithdrawingDrift, setIsWithdrawingDrift] = useState(false)
  const [autoCheckedDrift, setAutoCheckedDrift] = useState(false)
  const unresolvedSessions = registrySessions.filter((session) => {
    if (session.sessionPublicKey === sessionWalletAddress) return false
    if (session.status === "archived" || session.status === "withdrawn") return false

    const hasBalance =
      (session.onChainBalance ?? 0) > 0.0005 ||
      (session.metadata?.lastKnownSessionBalance ?? 0) > 0.0005 ||
      (session.metadata?.lastKnownDriftBalance ?? 0) > 0.1

    return hasBalance
  })
  const currentSessionRecord = registrySessions.find(
    (session) => session.sessionPublicKey === sessionWalletAddress
  )
  const lastDriftBalance = currentSessionRecord?.metadata?.lastKnownDriftBalance ?? 0
  const hasDriftCollateral = lastDriftBalance > 0.1
  const hasBlockingSessions = unresolvedSessions.length > 0
  const canStartRealTrading =
    REAL_TRADING_AVAILABLE &&
    selectedMode === "real" &&
    connected &&
    !hasBlockingSessions &&
    (sessionBalance >= MIN_DEPOSIT || hasDriftCollateral) &&
    recoveryStatus !== "checking"
  const realChecklist = [
    {
      label: connected ? `Wallet connected (${publicKey?.toBase58().slice(0, 8)}...)` : "Connect Phantom wallet",
      done: !!connected,
    },
    {
      label: hasDriftCollateral
        ? `Drift collateral detected ($${lastDriftBalance.toFixed(2)})`
        : `Session wallet funded ≥ ${MIN_DEPOSIT} SOL`,
      done: sessionBalance >= MIN_DEPOSIT || hasDriftCollateral,
    },
    {
      label: "No unresolved sessions or Drift balances",
      done: !hasBlockingSessions,
    },
  ]

  useEffect(() => {
    const controller = getTradingController()
    controller.ensureAllPositionsClosed("setup_screen_mount").catch((error) => {
      console.warn("[Setup] Failed to auto-close Drift positions:", error)
    })
  }, [])

  const refreshSessionRegistry = useCallback(async () => {
    if (!connected || !publicKey) {
      setRegistrySessions([])
      return
    }
    if (typeof window === "undefined") return

    setRegistryLoading(true)
    try {
      const registry = getSessionRegistry()
      const sessions = registry.getSessionsForWallet(publicKey.toBase58())
      const connection = new Connection(SOLANA_RPC_ENDPOINT, "confirmed")

      const enriched: SessionWithBalance[] = await Promise.all(
        sessions.map(async (session) => {
          let onChainBalance: number | null = null
          try {
            const lamports = await connection.getBalance(new PublicKey(session.sessionPublicKey))
            onChainBalance = lamports / LAMPORTS_PER_SOL
          } catch (error) {
            console.warn("[Setup] Failed to fetch session wallet balance:", error)
          }
          return {
            ...session,
            onChainBalance,
          }
        }),
      )

      setRegistrySessions(enriched)
    } catch (error) {
      console.warn("[Setup] Failed to load session registry:", error)
    } finally {
      setRegistryLoading(false)
    }
  }, [connected, publicKey])

  const handleMarkSessionCleared = useCallback(
    (sessionPubKey: string) => {
      const confirmed = window.confirm(
        "Only mark a session as cleared if you have already withdrawn every last lamport from both Drift and the session wallet.\n\nMark this session as cleared?",
      )
      if (!confirmed) return

      try {
        const registry = getSessionRegistry()
        registry.updateStatus(sessionPubKey, "archived")
        refreshSessionRegistry()
      } catch (error) {
        console.error("[Setup] Failed to mark session as cleared:", error)
      }
    },
    [refreshSessionRegistry],
  )

  const handleRemoveSession = useCallback(
    (session: SessionWithBalance) => {
      const hasBalance =
        (session.onChainBalance ?? 0) > 0.0005 ||
        (session.metadata?.lastKnownSessionBalance ?? 0) > 0.0005 ||
        (session.metadata?.lastKnownDriftBalance ?? 0) > 0.1

      if (hasBalance) {
        alert("This session still shows a balance. Withdraw everything before removing it.")
        return
      }

      const confirmed = window.confirm(
        "Remove this session wallet backup? You will need to create a new one next time (including Drift rent)."
      )
      if (!confirmed) return

      try {
        const registry = getSessionRegistry()
        registry.removeSession(session.sessionPublicKey)

        if (sessionWalletAddress === session.sessionPublicKey) {
          const sessionWallet = getSessionWallet()
          sessionWallet.clearSession()
          setSessionWalletAddress(null)
          setSessionBalance(0)
          setRecoveryStatus("new")
        }

        refreshSessionRegistry()
      } catch (error) {
        console.error("[Setup] Failed to remove session:", error)
      }
    },
    [refreshSessionRegistry, sessionWalletAddress],
  )

  const handleCheckDriftBalance = useCallback(
    async ({ silent = false, ensureFlat = true }: { silent?: boolean; ensureFlat?: boolean } = {}) => {
      if (!sessionWalletAddress) {
        if (!silent) alert("Recover your session wallet first.")
        return
      }

      const sessionWallet = getSessionWallet()
      const keypair = sessionWallet.getKeypair()
      if (!keypair) {
        if (!silent) alert("Session wallet not recovered. Connect your wallet and approve the recovery prompt.")
        return
      }

      try {
        setIsCheckingDrift(true)
        const driftManager = getDriftPositionManager()
        await driftManager.initialize(keypair, { skipDeposit: true })
        let summary = await driftManager.getPositionSummary()

        // Close positions if requested and any exist
        if (ensureFlat && summary.positions.length > 0) {
          console.log(`[Setup] Found ${summary.positions.length} open position(s), attempting to close...`)

          const closeResults: { success: boolean; position: string; error?: string }[] = []

          for (const position of summary.positions) {
            try {
              console.log(`[Setup] Closing ${position.marketSymbol} ${position.side} position...`)
              await driftManager.closePosition(position.marketIndex, 100)
              closeResults.push({
                success: true,
                position: `${position.marketSymbol} ${position.side.toUpperCase()}`
              })
              console.log(`[Setup] ✅ Closed ${position.marketSymbol}`)
            } catch (closeError) {
              const errorMsg = closeError instanceof Error ? closeError.message : 'Unknown error'
              console.error(`[Setup] ❌ Failed to close ${position.marketSymbol}:`, closeError)
              closeResults.push({
                success: false,
                position: `${position.marketSymbol} ${position.side.toUpperCase()}`,
                error: errorMsg
              })
            }
          }

          // Refresh summary after closures
          summary = await driftManager.getPositionSummary()

          // Show results
          const successCount = closeResults.filter(r => r.success).length
          const failCount = closeResults.filter(r => !r.success).length

          if (failCount > 0 && !silent) {
            const failedPositions = closeResults
              .filter(r => !r.success)
              .map(r => `${r.position}: ${r.error}`)
              .join('\n')

            alert(
              `Warning: Failed to close ${failCount} position(s):\n\n${failedPositions}\n\n` +
              `${successCount} position(s) closed successfully.\n` +
              `Remaining positions: ${summary.positions.length}`
            )
          } else if (successCount > 0 && !silent) {
            console.log(`[Setup] ✅ Closed ${successCount} position(s) successfully`)
          }
        }

        await sessionWallet.updateRegistryBalances(summary.totalCollateral)
        const refreshedBalance = await sessionWallet.getBalance()
        setSessionBalance(refreshedBalance)
        refreshSessionRegistry()

        if (!silent) {
          const message = [
            `Drift collateral: $${summary.totalCollateral.toFixed(2)}`,
            `Equity: $${summary.totalEquity.toFixed(2)}`,
            `Free collateral: $${summary.freeCollateral.toFixed(2)}`,
          ]

          if (summary.positions.length > 0) {
            message.push(`\n⚠️ Open positions: ${summary.positions.length}`)
            summary.positions.forEach(p => {
              message.push(
                `  ${p.marketSymbol} ${p.side.toUpperCase()}: $${p.sizeUsd.toFixed(2)} ` +
                `(PnL: ${p.unrealizedPnl >= 0 ? '+' : ''}$${p.unrealizedPnl.toFixed(2)})`
              )
            })
            message.push('\nClose all positions before withdrawing.')
          }

          alert(message.join('\n'))
        }
        await driftManager.cleanup()
      } catch (error) {
        console.error("[Setup] Failed to fetch Drift balance:", error)
        if (!silent) {
          alert(
            "Failed to fetch Drift balance. Make sure the session wallet is recovered and try again.\n\n" +
              (error instanceof Error ? error.message : "Unknown error")
          )
        }
      } finally {
        setIsCheckingDrift(false)
      }

      return
    },
    [sessionWalletAddress, refreshSessionRegistry]
  )

  const handleWithdrawDriftFunds = useCallback(async () => {
    if (!sessionWalletAddress) {
      alert("Recover your session wallet first.")
      return
    }

    const sessionWallet = getSessionWallet()
    const keypair = sessionWallet.getKeypair()
    if (!keypair) {
      alert("Session wallet not recovered. Connect your wallet and approve the recovery prompt.")
      return
    }

    try {
      setIsWithdrawingDrift(true)
      const driftManager = getDriftPositionManager()
      await driftManager.initialize(keypair, { skipDeposit: true })

      // Check for open positions and close them
      let openPositions = await driftManager.getOpenPositions()
      if (openPositions.length > 0) {
        console.log(`[Setup] Found ${openPositions.length} open position(s) before withdrawal, closing...`)

        const closeResults: { success: boolean; position: string; error?: string }[] = []

        for (const position of openPositions) {
          try {
            console.log(`[Setup] Closing ${position.marketSymbol} ${position.side} position...`)
            await driftManager.closePosition(position.marketIndex, 100)
            closeResults.push({
              success: true,
              position: `${position.marketSymbol} ${position.side.toUpperCase()}`
            })
            console.log(`[Setup] ✅ Closed ${position.marketSymbol}`)
          } catch (closeError) {
            const errorMsg = closeError instanceof Error ? closeError.message : 'Unknown error'
            console.error(`[Setup] ❌ Failed to close ${position.marketSymbol}:`, closeError)
            closeResults.push({
              success: false,
              position: `${position.marketSymbol} ${position.side.toUpperCase()}`,
              error: errorMsg
            })
          }
        }

        // Check results
        const successCount = closeResults.filter(r => r.success).length
        const failCount = closeResults.filter(r => !r.success).length

        if (failCount > 0) {
          const failedPositions = closeResults
            .filter(r => !r.success)
            .map(r => `${r.position}: ${r.error}`)
            .join('\n')

          alert(
            `Failed to close ${failCount} position(s):\n\n${failedPositions}\n\n` +
            `${successCount} position(s) closed successfully.\n\n` +
            `Cannot withdraw with open positions. Please close them manually via Drift UI.`
          )
          await driftManager.cleanup()
          return
        }

        console.log(`[Setup] ✅ Closed ${successCount} position(s) successfully`)

        // Refresh positions after closures
        openPositions = await driftManager.getOpenPositions()
      }

      // Double-check no positions remain
      if (openPositions.length > 0) {
        const positionList = openPositions.map(p =>
          `${p.marketSymbol} ${p.side.toUpperCase()}: $${p.sizeUsd.toFixed(2)}`
        ).join('\n')

        alert(
          `Cannot withdraw with ${openPositions.length} open position(s):\n\n${positionList}\n\n` +
          `Please close these positions manually via Drift UI at https://app.drift.trade`
        )
        await driftManager.cleanup()
        return
      }

      const summary = await driftManager.getPositionSummary()
      if (summary.totalCollateral <= 0.01) {
        alert("No Drift collateral detected to withdraw.")
        await driftManager.cleanup()
        return
      }

      await driftManager.withdrawCollateral(0)
      await sessionWallet.updateRegistryBalances(0)
      const refreshedBalance = await sessionWallet.getBalance()
      setSessionBalance(refreshedBalance)
      refreshSessionRegistry()
      alert("Drift funds withdrawn to session wallet. Use 'Withdraw All' to send back to Phantom.")
      await driftManager.cleanup()
    } catch (error) {
      console.error("[Setup] Failed to withdraw from Drift:", error)
      alert(
        "Failed to withdraw from Drift. Try again or ensure your session wallet is recovered.\n\n" +
          (error instanceof Error ? error.message : "Unknown error")
      )
    } finally {
      setIsWithdrawingDrift(false)
    }
  }, [sessionWalletAddress, refreshSessionRegistry])

  // Auto-recover session wallet on connect
  useEffect(() => {
    if (!connected || !publicKey || !signMessage) {
      setRecoveryStatus("new")
      setSessionWalletAddress(null)
      setAutoCheckedDrift(false)
       setAutoCheckedDrift(false)
      return
    }

    const autoRecover = async () => {
      const sessionWallet = getSessionWallet()

      if (!sessionWallet.hasBackup()) {
        console.log("[Setup] No backup found")
        setRecoveryStatus("new")
        setSessionWalletAddress(null)
        setAutoCheckedDrift(false)
        return
      }

      const backupInfo = sessionWallet.getBackupInfo()
      if (!backupInfo) {
        setRecoveryStatus("new")
        setSessionWalletAddress(null)
        setAutoCheckedDrift(false)
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
            if (typeof window !== "undefined") {
              try {
                const registry = getSessionRegistry()
                registry.updateLastAccessed(address)
              } catch (registryError) {
                console.warn("[Setup] Failed to update registry access time:", registryError)
              }
            }

            // Get balance
            const balance = await sessionWallet.getBalance()
            setSessionBalance(balance)
            console.log("[Setup] Session wallet balance:", balance, "SOL")
            await sessionWallet.updateRegistryBalances()
            refreshSessionRegistry()
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
        setAutoCheckedDrift(false)
      }
    }

    autoRecover()
  }, [connected, publicKey, signMessage])

  useEffect(() => {
    if (!sessionWalletAddress) return
    const controller = getTradingController()
    controller.ensureAllPositionsClosed("setup_session_ready").catch((error) => {
      console.warn("[Setup] Failed to auto-close positions for session:", error)
    })
  }, [sessionWalletAddress])

  useEffect(() => {
    if (
      !sessionWalletAddress ||
      recoveryStatus !== "recovered" ||
      autoCheckedDrift
    ) {
      return
    }

    handleCheckDriftBalance({ silent: true, ensureFlat: true }).finally(() => setAutoCheckedDrift(true))
  }, [sessionWalletAddress, recoveryStatus, autoCheckedDrift, handleCheckDriftBalance])

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

  useEffect(() => {
    refreshSessionRegistry()
  }, [refreshSessionRegistry])

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
          setAutoCheckedDrift(false)
        }
      } else {
        console.log("[Deposit] No active session, creating new session wallet...")

        // Get encryption key from wallet signature
        // CRITICAL: Must use same message as recovery for deterministic signature
        const message = new TextEncoder().encode(SESSION_WALLET_SIGNATURE_MESSAGE)
        const signature = await signMessage(message)

        const session = await sessionWallet.generateSession(signature, publicKey.toBase58())
        sessionPubKey = session.publicKey
        const address = session.publicKey.toBase58()
        setSessionWalletAddress(address)
        setAutoCheckedDrift(false)
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
      await sessionWallet.updateRegistryBalances()
      refreshSessionRegistry()

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
        if (driftManager.getIsInitialized()) {
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

      // Rent-exempt reserve for system account (required to keep account alive)
      const rentExemptReserve = await connection.getMinimumBalanceForRentExemption(0)

      const totalBuffer = feeBuffer + rentExemptReserve

      // Withdraw with safety buffer for fees + rent reserve
      const withdrawAmount = currentBalance - totalBuffer

      if (withdrawAmount <= 0) {
        alert(
          `Insufficient balance to cover transaction fees and rent reserve.\n\n` +
            `At least ${(
              totalBuffer / LAMPORTS_PER_SOL
            ).toFixed(6)} SOL must remain in the session wallet to keep it alive and pay fees.`
        )
        setIsWithdrawing(false)
        return
      }

      console.log("[Withdraw] Balance:", currentBalance / LAMPORTS_PER_SOL, "SOL")
      console.log("[Withdraw] Estimated fee:", estimatedFee / LAMPORTS_PER_SOL, "SOL")
      console.log("[Withdraw] Fee buffer (3x):", feeBuffer / LAMPORTS_PER_SOL, "SOL")
      console.log("[Withdraw] Rent-exempt reserve:", rentExemptReserve / LAMPORTS_PER_SOL, "SOL")
      console.log("[Withdraw] Withdraw amount:", withdrawAmount / LAMPORTS_PER_SOL, "SOL")

      console.log(
        `[Withdraw] Withdrawing maximum: ${(withdrawAmount / LAMPORTS_PER_SOL).toFixed(6)} SOL (fee: ${(estimatedFee / LAMPORTS_PER_SOL).toFixed(6)} SOL, rent reserve: ${(rentExemptReserve / LAMPORTS_PER_SOL).toFixed(6)} SOL)`
      )

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

        if (driftManager.getIsInitialized()) {
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

      await sessionWallet.updateRegistryBalances(driftBalance)

      if (shouldClearSession) {
        setSessionBalance(0)
        await sessionWallet.updateRegistryBalances(0)
        if (sessionWallet.getPublicKey()) {
          const registry = getSessionRegistry()
          registry.updateStatus(sessionWallet.getPublicKey()!.toBase58(), "archived")
        }
        setRecoveryStatus("recovered")
        console.log("[Withdraw] Session preserved for reuse after successful withdrawal")
        alert(
          `Successfully withdrew ${(withdrawAmount / LAMPORTS_PER_SOL).toFixed(6)} SOL!\nYour session wallet backup was preserved so you can reuse it next time.`
        )
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
      refreshSessionRegistry()
    } catch (error) {
      console.error("[Withdraw] Failed:", error)
      alert(`Withdrawal failed: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setIsWithdrawing(false)
    }
  }

  const handleStartGame = () => {
    const modeToStart: "mock" | "real" = REAL_TRADING_AVAILABLE ? selectedMode : "mock"

    if (modeToStart === "real" && sessionBalance < MIN_DEPOSIT && !hasDriftCollateral) {
      alert(`Please deposit at least ${MIN_DEPOSIT} SOL into your session wallet before starting real trading`)
      return
    }
      onStartGame(modeToStart, tradingStrategy, leverage)
  }

  const handleStartRealTrading = async () => {
    if (!canStartRealTrading) {
      alert("Complete all checklist items before starting real trading.")
      return
    }

    const confirmed = window.confirm(
      `Start real trading with the following settings?\n\n` +
        `Strategy: ${STRATEGY_PRESETS[tradingStrategy].name}\n` +
        `Leverage: ${leverage}x\n` +
        `Session Wallet: ${sessionWalletAddress?.slice(0, 8)}...\n` +
        `Deposited: ${sessionBalance.toFixed(4)} SOL\n` +
        (hasDriftCollateral
          ? `Existing Drift Collateral: $${lastDriftBalance.toFixed(2)}\n` +
            `New deposit will be added on top of existing collateral`
          : "")
    )
    if (!confirmed) return

    try {
      setIsInitializingReal(true)
      // ALWAYS allow deposits - don't skip deposit even if collateral exists
      // This ensures users can add more funds to Drift even if some amount is stuck
      onStartGame("real", tradingStrategy, leverage, { resumeExistingCollateral: false })
    } finally {
      setIsInitializingReal(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-[#0a0a0f] via-[#12121a] to-[#1a1a28] flex items-start justify-center overflow-y-auto">
      <div className="max-w-2xl w-full mx-auto px-8 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="font-bold tracking-tight text-white text-6xl mb-4">
            DOOM TRADE
          </h1>
          <p className="text-gray-300 text-lg">
            Live SOL trading inside Doom Runner. Steer between SHORT, FLAT, and LONG lanes as conviction swings.
          </p>
        </div>

        {/* Setup Card */}
        <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-2xl p-8 space-y-6">
          {REAL_TRADING_AVAILABLE && (
            <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-200">Internal Testing Only</div>
              <p>
                Real trading is enabled because <code className="text-rose-100/80">NEXT_PUBLIC_REAL_TRADING=true</code>.
                This flow is unfinished—only proceed if you are actively testing deposits, Drift integration, and withdrawals.
              </p>
            </div>
          )}
          {/* Doom Runner Mode Overview */}
          {experienceMode === "doomrunner" && (
            <div className="rounded-2xl border border-purple-500/30 bg-purple-500/10 p-4 text-sm text-purple-100/90 leading-relaxed space-y-3">
              <p>
                DOOM TRADE pipes live SOL candles directly into Doom Runner. Market alignment pushes the Slayer between SHORT (left lane), FLAT (center), and LONG (right lane) positions while conviction spikes spawn demons.
              </p>
              <p className="text-purple-100">
                Manual strategy turns auto-align off so you can trade like a DJ: <span className="font-semibold text-white">↑ Up</span> = go LONG, <span className="font-semibold text-white">↓ Down</span> = go SHORT, <span className="font-semibold text-white">Space</span> = flatten out.
              </p>
              <p className="text-purple-200/80">
                Auto strategies keep the AI lane switching while you focus on survivability.
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

                {hasBlockingSessions && (
                  <div className="rounded-lg border border-rose-500/40 bg-rose-900/20 p-4 text-sm text-rose-100 space-y-2">
                    <div className="text-xs uppercase tracking-[0.3em] text-rose-300 font-semibold">
                      Recovery Required
                    </div>
                    <p>
                      We detected previous sessions that may still hold funds on Drift or in their session wallets.
                      Please recover or mark them as cleared before starting a new real-trading session.
                    </p>
                    <p className="text-xs text-rose-200/80">
                      Use the list below to recover funds or mark sessions as cleared.
                    </p>
                  </div>
                )}

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
                      <div className="flex items-center gap-3">
                        <div className="text-sm font-bold text-cyan-300">
                          {sessionBalance.toFixed(4)} SOL
                        </div>
                        <button
                          type="button"
                          onClick={hasDriftCollateral ? handleWithdrawDriftFunds : () => handleCheckDriftBalance({ silent: false })}
                          disabled={hasDriftCollateral ? isWithdrawingDrift : isCheckingDrift}
                          className="text-[11px] px-3 py-1 rounded border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {hasDriftCollateral
                            ? isWithdrawingDrift
                              ? "Withdrawing Drift…"
                              : "Withdraw Drift Funds"
                            : isCheckingDrift
                            ? "Checking…"
                            : "Check Drift Balance"}
                        </button>
                      </div>
                    </div>
                    {hasDriftCollateral && (
                      <div className="mt-2 text-[11px] text-cyan-200">
                        Last Drift balance: ${lastDriftBalance.toFixed(2)}
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2 rounded-lg border border-white/10 bg-black/30 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">Previous Sessions</div>
                      <p className="text-xs text-gray-400">
                        Every session must be cleared or recovered before creating a new one.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-[11px] text-gray-400">
                        <input
                          type="checkbox"
                          className="h-3 w-3 accent-cyan-500"
                          checked={showWithdrawnSessions}
                          onChange={(e) => setShowWithdrawnSessions(e.target.checked)}
                        />
                        Show withdrawn
                      </label>
                      {registryLoading && (
                        <span className="text-[10px] uppercase tracking-widest text-gray-400">Checking…</span>
                      )}
                    </div>
                  </div>
                  {registrySessions.length === 0 ? (
                    <div className="text-xs text-gray-500">
                      No historical sessions found for this wallet on this device.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {registrySessions
                        .filter((session) => {
                          if (session.status === "withdrawn" && !showWithdrawnSessions) return false
                          return true
                        })
                        .map((session) => {
                          const isCurrent = sessionWalletAddress === session.sessionPublicKey
                          const hasResidualBalance =
                            (session.onChainBalance ?? 0) > 0.0005 ||
                            (session.metadata?.lastKnownSessionBalance ?? 0) > 0.0005 ||
                            (session.metadata?.lastKnownDriftBalance ?? 0) > 0.1
                        const requiresAction =
                          session.status !== "archived" && session.status !== "withdrawn" && !isCurrent && hasResidualBalance
                        const canRemove = !hasResidualBalance
                        return (
                          <div
                            key={session.sessionPublicKey}
                            className={`rounded-lg border p-3 text-xs ${
                              requiresAction ? "border-rose-500/40 bg-rose-500/5" : "border-white/10 bg-black/30"
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="font-mono text-gray-200">
                                {session.sessionPublicKey.slice(0, 8)}...{session.sessionPublicKey.slice(-6)}
                              </div>
                              <div className="text-[11px] uppercase tracking-widest text-gray-400">
                                Status:{" "}
                                <span
                                  className={
                                    session.status === "withdrawn"
                                      ? "text-emerald-300"
                                      : session.status === "archived"
                                        ? "text-amber-300"
                                        : "text-rose-300"
                                  }
                                >
                                  {session.status}
                                </span>
                                {isCurrent && <span className="text-emerald-300"> • Active</span>}
                              </div>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-gray-400">
                              <div>
                                Session SOL:{" "}
                                <span className="text-white">
                                  {session.onChainBalance === null
                                    ? "—"
                                    : `${session.onChainBalance.toFixed(4)} SOL`}
                                </span>
                              </div>
                              <div>
                                Last Drift balance:{" "}
                                <span className="text-white">
                                  ${session.metadata?.lastKnownDriftBalance?.toFixed(2) ?? "0.00"}
                                </span>
                              </div>
                            </div>
                            {requiresAction ? (
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <span className="text-[11px] font-semibold uppercase tracking-widest text-rose-300">
                                  Action required
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleMarkSessionCleared(session.sessionPublicKey)}
                                  className="rounded border border-rose-500/60 px-2 py-1 text-[11px] font-semibold text-rose-100 hover:bg-rose-500/10"
                                >
                                  Mark Cleared
                                </button>
                                <a
                                  href={`https://solscan.io/account/${session.sessionPublicKey}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[11px] text-cyan-300 underline-offset-2 hover:underline"
                                >
                                  View on Solscan
                                </a>
                              </div>
                            ) : (
                              canRemove && (
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveSession(session)}
                                    className="rounded border border-white/20 px-2 py-1 text-[11px] font-semibold text-gray-200 hover:bg-white/10"
                                  >
                                    Remove Session Wallet
                                  </button>
                                  {isCurrent && (
                                    <span className="text-[11px] uppercase tracking-widest text-cyan-300">
                                      In use
                                    </span>
                                  )}
                                </div>
                              )
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {hasBlockingSessions && (
                    <p className="text-[11px] text-rose-300">
                      Resolve the highlighted sessions (withdraw funds or mark them as cleared) before depositing new SOL.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Deposit/Withdraw Section - Only show for Real Trading */}
          {REAL_TRADING_AVAILABLE && connected && selectedMode === "real" && (
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
                    disabled={isDepositing || !connected || hasBlockingSessions}
                    className="px-6 py-3 bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
                  >
                    {isDepositing ? "Depositing..." : "Deposit"}
                  </button>
                </div>
                {hasBlockingSessions && (
                  <p className="text-xs text-rose-300">
                    Unresolved sessions detected. Mark them as withdrawn before depositing new funds.
                  </p>
                )}

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

              <div className="rounded-xl border border-white/15 bg-black/50 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-bold text-lg">Real Trading Checklist</h3>
                    <p className="text-sm text-gray-400">Complete these steps before going live on Drift.</p>
                  </div>
                  <span className="text-xs uppercase tracking-[0.3em] text-cyan-300">
                    Strategy: {STRATEGY_PRESETS[tradingStrategy].name}
                  </span>
                </div>
                <div className="space-y-2 text-sm">
                  {realChecklist.map((item, index) => (
                    <div
                      key={index}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                        item.done ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-100" : "border-white/10 bg-black/30 text-gray-400"
                      }`}
                    >
                      <span className="text-lg">{item.done ? "✅" : "•"}</span>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400">
                  Leverage: <span className="text-white font-semibold">{leverage}x</span> • Session wallet:{" "}
                  <span className="text-white font-mono">
                    {sessionWalletAddress ? `${sessionWalletAddress.slice(0, 6)}...${sessionWalletAddress.slice(-4)}` : "—"}
                  </span>
                </p>
                <button
                  onClick={handleStartRealTrading}
                  disabled={!canStartRealTrading || isInitializingReal}
                  className="w-full rounded-lg bg-rose-600 py-3 text-white font-bold disabled:bg-gray-700 disabled:cursor-not-allowed"
                >
                  {isInitializingReal ? "Initializing Drift..." : "Initialize & Start Real Trading"}
                </button>
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

              {/* Real Trading Mode - Coming Soon */}
              <button
                type="button"
                onClick={() => {
                  if (REAL_TRADING_AVAILABLE) {
                    setSelectedMode("real")
                  }
                }}
                disabled={!REAL_TRADING_AVAILABLE || !connected}
                className={`relative p-6 rounded-xl border-2 transition-all ${
                  REAL_TRADING_AVAILABLE && selectedMode === "real"
                    ? "border-rose-500 bg-rose-500/10"
                    : "border-white/10 bg-black/20"
                } ${REAL_TRADING_AVAILABLE ? "hover:border-white/20" : "opacity-50 cursor-not-allowed"}`}
              >
                <div className={`text-center space-y-3 ${REAL_TRADING_AVAILABLE ? "" : "opacity-40"}`}>
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
                {!REAL_TRADING_AVAILABLE && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/70">
                    <span className="text-rose-200 font-semibold tracking-[0.2em] text-xs uppercase">
                      Coming Soon
                    </span>
                  </div>
                )}
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

          {/* Leverage Selection */}
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


          {/* Real Trading Warning */}
          {REAL_TRADING_AVAILABLE && selectedMode === "real" && connected && (
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
            onClick={selectedMode === "real" ? handleStartRealTrading : handleStartGame}
            disabled={
              selectedMode === "real"
                ? !canStartRealTrading || isInitializingReal
                : false
            }
            className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
              selectedMode === "real"
                ? !canStartRealTrading || isInitializingReal
                  ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                  : "bg-rose-500 hover:bg-rose-600 text-white"
                : "bg-cyan-500 hover:bg-cyan-600 text-white"
            }`}
          >
            {selectedMode === "real"
              ? isInitializingReal
                ? "Initializing Drift…"
                : "Start Real Trading"
              : "Start Mock Trading"}
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
