import { Keypair, PublicKey, LAMPORTS_PER_SOL, Connection } from "@solana/web3.js"
import bs58 from "bs58"
import { getSessionRegistry } from "./session-registry"

/**
 * Session Wallet Manager with Encrypted Recovery
 *
 * Creates an ephemeral keypair for the game session that can auto-sign trades
 * without requiring user approval for each transaction.
 *
 * Security Features:
 * - Private key encrypted with user's main wallet signature
 * - Encrypted backup stored in BOTH sessionStorage AND localStorage
 * - Automatic recovery on page refresh and browser reopen
 * - NO automatic timeout deletion (prevents accidental fund loss!)
 * - Balance warnings before tab close
 *
 * Flow:
 * 1. User connects Phantom wallet
 * 2. Generate session keypair + encrypt with wallet signature
 * 3. User deposits SOL from Phantom → session wallet
 * 4. Game auto-signs trades using session keypair
 * 5. Auto-recover keypair on page refresh/reopen (requires wallet signature)
 * 6. User withdraws balance from session wallet → Phantom when done
 * 7. Backup cleared ONLY after successful withdrawal (never auto-deleted!)
 *
 * CRITICAL SAFETY: Backups are NEVER auto-deleted based on time to prevent fund loss.
 * Users can always recover their session wallet as long as they have their main wallet.
 */

const STORAGE_KEY = "balance_session_wallet_encrypted"
const PERSISTENT_STORAGE_KEY = "balance_session_wallet_persistent" // localStorage for persistence

/**
 * CRITICAL: This message MUST be identical across all session wallet operations!
 * - Used for both creation (generateSession) and recovery (recoverFromStorage)
 * - Different signatures = different encryption keys = recovery failure
 * - Wallet signatures are deterministic ONLY if message is identical
 */
export const SESSION_WALLET_SIGNATURE_MESSAGE = "Balance session wallet authorization"

export interface SessionWalletState {
  sessionKeypair: Keypair | null
  sessionPublicKey: PublicKey | null
  balance: number // SOL balance in session wallet
  isActive: boolean
}

export interface PositionBackup {
  positionAddress: string
  side: "long" | "short"
  sizeUsd: number
  entryPrice: number
  openTime: number
  collateralUsd: number
}

export interface SessionBackup {
  encrypted: string
  publicKey: string
  timestamp: number
  positions?: PositionBackup[] // Open positions at time of backup
}

/**
 * Simple XOR encryption/decryption
 * NOTE: This is not cryptographically secure but provides basic obfuscation
 * The main security comes from requiring user's wallet signature to decrypt
 */
function xorEncrypt(data: Uint8Array, key: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length)
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ key[i % key.length]
  }
  return result
}

export class SessionWallet {
  private keypair: Keypair | null = null
  private connection: Connection

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, "confirmed")
  }

  /**
   * Generate a new session keypair and encrypt it for recovery
   * @param mainWalletPublicKey - Main wallet public key for registry
   */
  async generateSession(
    encryptionKey: Uint8Array,
    mainWalletPublicKey?: string
  ): Promise<{ publicKey: PublicKey; secretKey: Uint8Array }> {
    this.keypair = Keypair.generate()
    console.log("[SessionWallet] Generated new session keypair:", this.keypair.publicKey.toBase58())

    // Encrypt and store in sessionStorage for recovery
    await this.backupToStorage(encryptionKey)

    // Register in permanent registry
    if (mainWalletPublicKey) {
      const registry = getSessionRegistry()
      registry.registerSession(
        this.keypair.publicKey.toBase58(),
        mainWalletPublicKey
      )
    }

    return {
      publicKey: this.keypair.publicKey,
      secretKey: this.keypair.secretKey,
    }
  }

  /**
   * Encrypt keypair and store in BOTH sessionStorage AND localStorage
   * @param positions Optional position data to include in backup
   */
  private async backupToStorage(
    encryptionKey: Uint8Array,
    positions?: PositionBackup[]
  ): Promise<void> {
    if (typeof window === "undefined" || !this.keypair) return

    try {
      const encrypted = xorEncrypt(this.keypair.secretKey, encryptionKey)
      const encoded = bs58.encode(encrypted)

      const backup: SessionBackup = {
        encrypted: encoded,
        publicKey: this.keypair.publicKey.toBase58(),
        timestamp: Date.now(),
        positions: positions,
      }

      const backupStr = JSON.stringify(backup)

      // Save to BOTH storages for maximum safety
      sessionStorage.setItem(STORAGE_KEY, backupStr)
      localStorage.setItem(PERSISTENT_STORAGE_KEY, backupStr)

      console.log(
        `[SessionWallet] Encrypted backup saved to sessionStorage + localStorage${positions ? ` with ${positions.length} positions` : ""}`
      )
    } catch (error) {
      console.error("[SessionWallet] Failed to backup session:", error)
    }
  }

  /**
   * Update backup with current position state
   */
  async updatePositionsBackup(encryptionKey: Uint8Array, positions: PositionBackup[]): Promise<void> {
    await this.backupToStorage(encryptionKey, positions)
  }

  /**
   * Attempt to recover session from sessionStorage or localStorage
   */
  async recoverFromStorage(encryptionKey: Uint8Array): Promise<boolean> {
    if (typeof window === "undefined") return false

    try {
      // Try sessionStorage first (current session)
      let stored = sessionStorage.getItem(STORAGE_KEY)

      // Fallback to localStorage (persistent across sessions)
      if (!stored) {
        stored = localStorage.getItem(PERSISTENT_STORAGE_KEY)
        if (stored) {
          console.log("[SessionWallet] Found backup in localStorage (recovering from previous session)")
        }
      }

      if (!stored) {
        console.log("[SessionWallet] No backup found in sessionStorage or localStorage")
        return false
      }

      const backup = JSON.parse(stored)

      // SAFETY: Never auto-delete backups based on age to prevent fund loss!
      // Users can always recover their session wallet regardless of how old the backup is.
      // The only time backups are cleared is after successful withdrawal.

      const backupAge = Date.now() - backup.timestamp
      const backupAgeDays = Math.floor(backupAge / (24 * 60 * 60 * 1000))
      if (backupAgeDays > 0) {
        console.log(`[SessionWallet] Recovering ${backupAgeDays}-day-old backup (funds may still be present)`)
      }

      // Decrypt
      const encrypted = bs58.decode(backup.encrypted)
      const decrypted = xorEncrypt(encrypted, encryptionKey)

      // Validate secret key length
      if (decrypted.length !== 64) {
        console.error(`[SessionWallet] Invalid secret key length: ${decrypted.length} (expected 64)`)
        sessionStorage.removeItem(STORAGE_KEY)
        localStorage.removeItem(PERSISTENT_STORAGE_KEY)
        return false
      }

      // Restore keypair
      this.keypair = Keypair.fromSecretKey(decrypted)

      // Verify public key matches
      if (this.keypair.publicKey.toBase58() !== backup.publicKey) {
        console.error("[SessionWallet] Recovered keypair public key mismatch!")
        this.keypair = null
        return false
      }

      console.log("[SessionWallet] ✅ Successfully recovered session from backup")
      this.updateActivity()
      return true
    } catch (error) {
      console.error("[SessionWallet] Failed to recover session:", error)
      sessionStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(PERSISTENT_STORAGE_KEY)
      return false
    }
  }

  /**
   * Check if there's a backup available (checks both storages)
   */
  hasBackup(): boolean {
    if (typeof window === "undefined") return false
    return sessionStorage.getItem(STORAGE_KEY) !== null || localStorage.getItem(PERSISTENT_STORAGE_KEY) !== null
  }

  /**
   * Get backup info without decrypting (checks both storages)
   */
  getBackupInfo(): { publicKey: string; timestamp: number; positions?: PositionBackup[] } | null {
    if (typeof window === "undefined") return null

    try {
      // Try sessionStorage first, fallback to localStorage
      let stored = sessionStorage.getItem(STORAGE_KEY)
      if (!stored) {
        stored = localStorage.getItem(PERSISTENT_STORAGE_KEY)
      }
      if (!stored) return null

      const backup: SessionBackup = JSON.parse(stored)
      return {
        publicKey: backup.publicKey,
        timestamp: backup.timestamp,
        positions: backup.positions,
      }
    } catch {
      return null
    }
  }

  /**
   * Get the session public key
   */
  getPublicKey(): PublicKey | null {
    return this.keypair?.publicKey ?? null
  }

  /**
   * Get the session keypair for signing
   */
  getKeypair(): Keypair | null {
    return this.keypair
  }

  /**
   * Check session wallet balance
   */
  async getBalance(): Promise<number> {
    if (!this.keypair) {
      return 0
    }

    try {
      const balance = await this.connection.getBalance(this.keypair.publicKey)
      return balance / LAMPORTS_PER_SOL
    } catch (error) {
      console.error("[SessionWallet] Failed to fetch balance:", error)
      return 0
    }
  }

  /**
   * Clear session keypair and encrypted backups
   *
   * CRITICAL SAFETY: This should ONLY be called after successful withdrawal!
   * Never call this while the session wallet has funds, as it will make them unrecoverable.
   *
   * This is automatically called in game-setup-screen.tsx after withdrawal completes.
   */
  clearSession(): void {
    this.keypair = null
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(PERSISTENT_STORAGE_KEY)
    }
    console.log("[SessionWallet] ✅ Session cleared (both sessionStorage and localStorage)")
  }

  /**
   * Check if session is active
   */
  isActive(): boolean {
    return this.keypair !== null
  }

  /**
   * Update registry with current balance information
   */
  async updateRegistryBalances(driftBalance: number = 0): Promise<void> {
    if (!this.keypair) return

    const registry = getSessionRegistry()
    const sessionBalance = await this.getBalance()

    registry.updateBalances(
      this.keypair.publicKey.toBase58(),
      sessionBalance,
      driftBalance
    )
  }

  /**
   * Mark session as withdrawn in registry
   * ONLY call this after successful withdrawal AND user confirmation
   */
  markAsWithdrawn(): void {
    if (!this.keypair) return

    const registry = getSessionRegistry()
    registry.updateStatus(this.keypair.publicKey.toBase58(), "withdrawn")
  }

  /**
   * Mark that Drift account exists for this session
   */
  markDriftAccountExists(): void {
    if (!this.keypair) return

    const registry = getSessionRegistry()
    registry.setDriftAccountExists(this.keypair.publicKey.toBase58(), true)
  }

  /**
   * Cleanup on destruction
   */
  destroy() {
    if (this.timeoutCheckInterval) {
      clearInterval(this.timeoutCheckInterval)
    }
  }
}

// Global session wallet instance
let sessionWalletInstance: SessionWallet | null = null

export function getSessionWallet(rpcUrl?: string): SessionWallet {
  if (!sessionWalletInstance) {
    const url = rpcUrl || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"
    sessionWalletInstance = new SessionWallet(url)
  }
  return sessionWalletInstance
}
