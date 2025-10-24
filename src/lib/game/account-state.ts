import { create } from "zustand"

import type { Candle } from "@/lib/types"
import type { Stance } from "./game-state"

const DEFAULT_STARTING_BALANCE = 1000
const DEFAULT_POSITION_NOTIONAL = 250
const LOSS_PENALTY_PER_STONE = 12
const HISTORY_LIMIT = 600

export interface AccountSnapshot {
  timestamp: number
  balance: number
  equity: number
  realized: number
  delta: number
  stance: Stance
}

interface AccountState {
  startingBalance: number
  balance: number
  realizedPnl: number
  equity: number
  lastPrice: number | null
  positionNotional: number
  history: AccountSnapshot[]
  unrealizedPnl: number
  // Track current position details
  currentPositionEntryPrice: number | null
  currentPositionStance: Stance
  // Leverage settings
  leverage: number
  isLiquidated: boolean
  setLeverage: (leverage: number) => void
  seedPrice: (price: number) => void
  registerCandle: (candle: Candle, stance: Stance) => number
  updateUnrealizedPnl: (currentPrice: number, stance: Stance) => void
  applyLossPenalty: (loseCount: number, severity: number) => number
  reset: () => void
}

const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export const useAccountState = create<AccountState>((set, get) => ({
  startingBalance: DEFAULT_STARTING_BALANCE,
  balance: DEFAULT_STARTING_BALANCE,
  realizedPnl: 0,
  equity: DEFAULT_STARTING_BALANCE,
  lastPrice: null,
  positionNotional: DEFAULT_POSITION_NOTIONAL,
  history: [],
  unrealizedPnl: 0,
  currentPositionEntryPrice: null,
  currentPositionStance: "flat",
  leverage: 1, // Default 1x leverage (no leverage)
  isLiquidated: false,

  setLeverage: (leverage) => {
    const clampedLeverage = clampNumber(leverage, 1, 20) // Allow 1x to 20x
    set({ leverage: clampedLeverage })
    console.log(`[Leverage] Set to ${clampedLeverage}x`)
  },

  seedPrice: (price) => {
    if (!Number.isFinite(price)) return
    set({ lastPrice: price })
  },

  updateUnrealizedPnl: (currentPrice, stance) => {
    if (!Number.isFinite(currentPrice)) return

    const state = get()

    // Check if we're flipping positions (changing stance)
    const isFlip = state.currentPositionStance !== stance && state.currentPositionStance !== "flat"

    // If flipping or opening new position, we need to close the old position first
    if (isFlip && state.currentPositionEntryPrice !== null) {
      // Close the current position and realize P&L
      const entryPrice = state.currentPositionEntryPrice
      const direction = state.currentPositionStance === "long" ? 1 : state.currentPositionStance === "short" ? -1 : 0
      const returnPct = entryPrice > 0 ? (currentPrice - entryPrice) / entryPrice : 0
      // Apply leverage to realized P&L when closing position
      const realizedFromFlip = direction * returnPct * state.positionNotional * state.leverage

      // Update balance with the realized P&L from closing
      const newBalance = state.balance + realizedFromFlip
      const newRealizedPnl = state.realizedPnl + realizedFromFlip

      set({
        balance: newBalance,
        realizedPnl: newRealizedPnl,
        currentPositionEntryPrice: currentPrice, // New position entry
        currentPositionStance: stance,
        unrealizedPnl: 0, // Fresh position starts at 0 unrealized
        equity: newBalance,
        lastPrice: currentPrice,
      })
      return
    }

    // If opening a new position from flat or first position
    if (state.currentPositionEntryPrice === null || state.currentPositionStance === "flat") {
      set({
        currentPositionEntryPrice: currentPrice,
        currentPositionStance: stance,
        unrealizedPnl: 0,
        equity: state.balance,
      })
      return
    }

    // Normal case: update unrealized P&L for current position
    const entryPrice = state.currentPositionEntryPrice
    const direction = stance === "long" ? 1 : stance === "short" ? -1 : 0

    if (direction === 0) {
      // Flat stance = no position
      set({ unrealizedPnl: 0, equity: state.balance, currentPositionStance: "flat" })
      return
    }

    const returnPct = entryPrice > 0 ? (currentPrice - entryPrice) / entryPrice : 0
    // Apply leverage to P&L calculation
    const unrealized = direction * returnPct * state.positionNotional * state.leverage
    const nextEquity = state.balance + unrealized

    // Check for liquidation
    if (nextEquity <= 0 && !state.isLiquidated) {
      console.log(`[LIQUIDATION] Equity fell to $${nextEquity.toFixed(2)} - Account liquidated!`)
      set({
        unrealizedPnl: -state.balance, // Loss equals entire balance
        equity: 0,
        balance: 0,
        realizedPnl: -state.startingBalance,
        isLiquidated: true,
        currentPositionStance: "flat",
        currentPositionEntryPrice: null,
      })
      return
    }

    set({
      unrealizedPnl: unrealized,
      equity: nextEquity,
    })
  },

  registerCandle: (candle, stance) => {
    if (!Number.isFinite(candle.close) || !Number.isFinite(candle.open)) {
      return 0
    }

    const state = get()

    // Check if we're changing stance - only close position if stance changed
    const isStanceChange = state.currentPositionStance !== stance && state.currentPositionStance !== "flat"

    let delta = 0
    let nextBalance = state.balance
    let nextRealized = state.realizedPnl
    let nextEntryPrice = state.currentPositionEntryPrice
    let nextStance = state.currentPositionStance

    if (isStanceChange) {
      // Stance changed - close current position and realize P&L
      console.log(`[Position] Stance change: ${state.currentPositionStance} → ${stance}, realizing P&L: $${state.unrealizedPnl.toFixed(2)}`)
      delta = state.unrealizedPnl
      nextBalance = state.balance + delta
      nextRealized = state.realizedPnl + delta

      // Open new position at current price
      nextEntryPrice = candle.close
      nextStance = stance
    } else {
      // Stance unchanged - position continues, just update entry price to latest candle close
      // This represents the continuous trading position across multiple stones
      console.log(`[Position] Continuing ${stance} position, entry updated to $${candle.close.toFixed(2)}`)
      nextEntryPrice = candle.close
      nextStance = stance
      // Don't realize P&L - it stays unrealized
      delta = 0
    }

    const nextEquity = nextBalance + state.unrealizedPnl

    const snapshot: AccountSnapshot = {
      timestamp: candle.timestamp,
      balance: nextBalance,
      equity: nextEquity,
      realized: nextRealized,
      delta,
      stance,
    }

    const nextHistory = [...state.history, snapshot]
    if (nextHistory.length > HISTORY_LIMIT) {
      nextHistory.shift()
    }

    set({
      balance: nextBalance,
      realizedPnl: nextRealized,
      equity: nextEquity,
      lastPrice: candle.close,
      history: nextHistory,
      unrealizedPnl: isStanceChange ? 0 : state.unrealizedPnl, // Only reset if stance changed
      currentPositionEntryPrice: nextEntryPrice,
      currentPositionStance: nextStance,
    })

    return delta
  },

  applyLossPenalty: (loseCount, severity) => {
    if (loseCount <= 0) return 0
    const state = get()
    const severityScale = clampNumber(severity, 0.2, 1.2)
    const penalty = loseCount * LOSS_PENALTY_PER_STONE * severityScale
    const nextBalance = Math.max(0, state.balance - penalty)
    const nextRealized = state.realizedPnl - penalty
    const nextEquity = nextBalance

    const snapshot: AccountSnapshot = {
      timestamp: Date.now(),
      balance: nextBalance,
      equity: nextEquity,
      realized: nextRealized,
      delta: -penalty,
      stance: "flat",
    }

    const nextHistory = [...state.history, snapshot]
    if (nextHistory.length > HISTORY_LIMIT) {
      nextHistory.shift()
    }

    set({
      balance: nextBalance,
      realizedPnl: nextRealized,
      equity: nextEquity,
      history: nextHistory,
    })

    return penalty
  },

  reset: () =>
    set({
      balance: DEFAULT_STARTING_BALANCE,
      realizedPnl: 0,
      equity: DEFAULT_STARTING_BALANCE,
      lastPrice: null,
      history: [],
      unrealizedPnl: 0,
      currentPositionEntryPrice: null,
      currentPositionStance: "flat",
      isLiquidated: false,
    }),
}))
