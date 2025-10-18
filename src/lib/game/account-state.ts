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
  seedPrice: (price: number) => void
  registerCandle: (candle: Candle, stance: Stance) => number
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

  seedPrice: (price) => {
    if (!Number.isFinite(price)) return
    set({ lastPrice: price })
  },

  registerCandle: (candle, stance) => {
    if (!Number.isFinite(candle.close) || !Number.isFinite(candle.open)) {
      return 0
    }

    const state = get()
    const prevPrice = state.lastPrice ?? candle.open
    const price = candle.close
    const direction = stance === "long" ? 1 : stance === "short" ? -1 : 0

    const returnPct = prevPrice > 0 ? (price - prevPrice) / prevPrice : 0
    const delta = direction * returnPct * state.positionNotional
    const nextBalance = state.balance + delta
    const nextRealized = state.realizedPnl + delta
    const nextEquity = nextBalance

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
      lastPrice: price,
      history: nextHistory,
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
    }),
}))
