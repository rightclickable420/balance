/**
 * Session Registry - Permanent record of all session wallets
 *
 * CRITICAL SAFETY: This registry tracks ALL session wallets ever created
 * for a given main wallet. Records are NEVER auto-deleted.
 *
 * Purpose: Prevent fund loss by maintaining a permanent audit trail
 */

const REGISTRY_KEY = "balance_session_registry"
const REGISTRY_BACKUP_KEY = "balance_session_registry_backup" // Redundant copy

export interface SessionRecord {
  sessionPublicKey: string
  mainWalletPublicKey: string
  createdAt: number
  lastAccessedAt: number
  status: "active" | "withdrawn" | "archived"
  driftAccountExists: boolean
  metadata: {
    initialDeposit?: number
    lastKnownSessionBalance: number
    lastKnownDriftBalance: number
    lastBalanceCheck: number
  }
}

export interface SessionRegistry {
  version: number
  records: SessionRecord[]
}

class SessionRegistryManager {
  private registry: SessionRegistry

  constructor() {
    this.registry = this.loadRegistry()
  }

  /**
   * Load registry from storage with fallback to backup
   */
  private loadRegistry(): SessionRegistry {
    if (typeof window === "undefined") {
      return { version: 1, records: [] }
    }

    // Try primary storage
    try {
      const stored = localStorage.getItem(REGISTRY_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        console.log(`[SessionRegistry] Loaded ${parsed.records.length} records from primary storage`)
        return parsed
      }
    } catch (e) {
      console.warn("[SessionRegistry] Failed to load from primary storage:", e)
    }

    // Try backup storage
    try {
      const backup = localStorage.getItem(REGISTRY_BACKUP_KEY)
      if (backup) {
        const parsed = JSON.parse(backup)
        console.log(
          `[SessionRegistry] Loaded ${parsed.records.length} records from backup storage`
        )
        // Restore to primary
        this.saveRegistry(parsed)
        return parsed
      }
    } catch (e) {
      console.warn("[SessionRegistry] Failed to load from backup storage:", e)
    }

    // New registry
    console.log("[SessionRegistry] Creating new registry")
    return { version: 1, records: [] }
  }

  /**
   * Save registry to both primary and backup storage
   */
  private saveRegistry(registry: SessionRegistry = this.registry): void {
    if (typeof window === "undefined") return

    const serialized = JSON.stringify(registry)

    try {
      localStorage.setItem(REGISTRY_KEY, serialized)
      localStorage.setItem(REGISTRY_BACKUP_KEY, serialized) // Redundant backup
      console.log("[SessionRegistry] Saved registry with", registry.records.length, "records")
    } catch (e) {
      console.error("[SessionRegistry] CRITICAL: Failed to save registry:", e)
      alert(
        "WARNING: Could not save session wallet registry.\n\n" +
          "This may cause fund loss if you close your browser.\n" +
          "Please complete your withdrawal before closing."
      )
    }
  }

  /**
   * Register a new session wallet
   */
  registerSession(
    sessionPublicKey: string,
    mainWalletPublicKey: string,
    initialDeposit?: number
  ): void {
    // Check if already registered
    const existing = this.registry.records.find((r) => r.sessionPublicKey === sessionPublicKey)
    if (existing) {
      console.log("[SessionRegistry] Session already registered, updating:", sessionPublicKey)
      existing.lastAccessedAt = Date.now()
      if (initialDeposit !== undefined) {
        existing.metadata.initialDeposit = initialDeposit
      }
      this.saveRegistry()
      return
    }

    // Create new record
    const record: SessionRecord = {
      sessionPublicKey,
      mainWalletPublicKey,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      status: "active",
      driftAccountExists: false,
      metadata: {
        initialDeposit,
        lastKnownSessionBalance: 0,
        lastKnownDriftBalance: 0,
        lastBalanceCheck: 0,
      },
    }

    this.registry.records.push(record)
    this.saveRegistry()

    console.log(
      "[SessionRegistry] ✅ Registered new session:",
      sessionPublicKey.slice(0, 8) + "..."
    )
  }

  /**
   * Get all sessions for a main wallet
   */
  getSessionsForWallet(mainWalletPublicKey: string): SessionRecord[] {
    return this.registry.records.filter((r) => r.mainWalletPublicKey === mainWalletPublicKey)
  }

  /**
   * Get all active (non-withdrawn) sessions for a main wallet
   */
  getActiveSessionsForWallet(mainWalletPublicKey: string): SessionRecord[] {
    return this.registry.records.filter(
      (r) => r.mainWalletPublicKey === mainWalletPublicKey && r.status !== "withdrawn"
    )
  }

  /**
   * Update session status
   */
  updateStatus(
    sessionPublicKey: string,
    status: "active" | "withdrawn" | "archived"
  ): void {
    const record = this.registry.records.find((r) => r.sessionPublicKey === sessionPublicKey)
    if (!record) {
      console.warn("[SessionRegistry] Cannot update status: session not found:", sessionPublicKey)
      return
    }

    record.status = status
    record.lastAccessedAt = Date.now()
    this.saveRegistry()

    console.log(
      "[SessionRegistry] Updated status:",
      sessionPublicKey.slice(0, 8) + "... →",
      status
    )
  }

  /**
   * Update last accessed timestamp
   */
  updateLastAccessed(sessionPublicKey: string): void {
    const record = this.registry.records.find((r) => r.sessionPublicKey === sessionPublicKey)
    if (!record) return

    record.lastAccessedAt = Date.now()
    this.saveRegistry()
  }

  /**
   * Update balance information
   */
  updateBalances(
    sessionPublicKey: string,
    sessionBalance: number,
    driftBalance: number
  ): void {
    const record = this.registry.records.find((r) => r.sessionPublicKey === sessionPublicKey)
    if (!record) {
      console.warn("[SessionRegistry] Cannot update balances: session not found")
      return
    }

    record.metadata.lastKnownSessionBalance = sessionBalance
    record.metadata.lastKnownDriftBalance = driftBalance
    record.metadata.lastBalanceCheck = Date.now()
    this.saveRegistry()
  }

  /**
   * Mark that Drift account exists for this session
   */
  setDriftAccountExists(sessionPublicKey: string, exists: boolean): void {
    const record = this.registry.records.find((r) => r.sessionPublicKey === sessionPublicKey)
    if (!record) return

    record.driftAccountExists = exists
    this.saveRegistry()
  }

  /**
   * Get specific session record
   */
  getSession(sessionPublicKey: string): SessionRecord | null {
    return this.registry.records.find((r) => r.sessionPublicKey === sessionPublicKey) || null
  }

  /**
   * Export registry for debugging
   */
  exportRegistry(): SessionRegistry {
    return JSON.parse(JSON.stringify(this.registry))
  }

  /**
   * Check if any active sessions exist that might have funds
   */
  hasActiveSessions(mainWalletPublicKey: string): boolean {
    const active = this.getActiveSessionsForWallet(mainWalletPublicKey)
    return active.length > 0
  }

  /**
   * Get summary of potential funds in active sessions
   */
  getActiveFundsSummary(mainWalletPublicKey: string): {
    totalSessions: number
    totalSessionBalance: number
    totalDriftBalance: number
    oldestSession: number | null
  } {
    const active = this.getActiveSessionsForWallet(mainWalletPublicKey)

    return {
      totalSessions: active.length,
      totalSessionBalance: active.reduce((sum, r) => sum + r.metadata.lastKnownSessionBalance, 0),
      totalDriftBalance: active.reduce((sum, r) => sum + r.metadata.lastKnownDriftBalance, 0),
      oldestSession: active.length > 0 ? Math.min(...active.map((r) => r.createdAt)) : null,
    }
  }
}

// Singleton instance
let registryInstance: SessionRegistryManager | null = null

export function getSessionRegistry(): SessionRegistryManager {
  if (!registryInstance) {
    registryInstance = new SessionRegistryManager()
  }
  return registryInstance
}

/**
 * Debug utility - print all sessions to console
 */
export function debugPrintRegistry(): void {
  const registry = getSessionRegistry()
  const exported = registry.exportRegistry()

  console.log("=== Session Registry ===")
  console.log("Version:", exported.version)
  console.log("Total Records:", exported.records.length)
  console.log("")

  exported.records.forEach((record, i) => {
    console.log(`Session ${i + 1}:`)
    console.log("  Session:", record.sessionPublicKey.slice(0, 12) + "...")
    console.log("  Main Wallet:", record.mainWalletPublicKey.slice(0, 12) + "...")
    console.log("  Created:", new Date(record.createdAt).toLocaleString())
    console.log("  Status:", record.status)
    console.log("  Last Session Balance:", record.metadata.lastKnownSessionBalance, "SOL")
    console.log("  Last Drift Balance:", record.metadata.lastKnownDriftBalance, "USD")
    console.log("  Drift Account:", record.driftAccountExists ? "Yes" : "Unknown")
    console.log("")
  })
}
