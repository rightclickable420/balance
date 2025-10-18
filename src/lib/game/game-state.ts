import { create } from "zustand"
import type { Candle } from "../types"
import type { Stone } from "./physics-engine"
import type { Features } from "@/lib/data/features"

export type GamePhase = "waiting" | "hovering" | "placing" | "stable" | "loss" | "settled"
export type Stance = "long" | "short" | "flat"

export interface GameState {
  // Game status
  phase: GamePhase
  score: number
  stonesPlaced: number
  consecutiveUnstable: number

  physicsActive: boolean
  marketAlignment: number // -1 to 1, oscillates over time
  towerOffset: number // Y offset for scrolling tower down

  // Current stone
  currentCandle: Candle | null
  currentStone: Stone | null
  dropStartTime: number | null
  canDecide: boolean

  placementProgress: number // 0-1, animation progress

  debugMode: boolean
  timeScale: number
  hoverStance: Stance
  latestFeatures: Features | null
  decisionProgress: number

  // Actions
  setPhase: (phase: GamePhase) => void
  setScore: (score: number) => void
  incrementScore: (amount: number) => void
  setCurrentCandle: (candle: Candle | null) => void
  setCurrentStone: (stone: Stone | null) => void
  setDropStartTime: (time: number | null) => void
  setCanDecide: (canDecide: boolean) => void
  incrementStonesPlaced: () => void
  setConsecutiveUnstable: (count: number) => void
  setPhysicsActive: (active: boolean) => void
  setMarketAlignment: (alignment: number) => void
  setTowerOffset: (offset: number) => void
  setPlacementProgress: (progress: number) => void
  setDebugMode: (debug: boolean) => void
  setTimeScale: (scale: number) => void
  setHoverStance: (stance: Stance) => void
  setLatestFeatures: (features: Features | null) => void
  setDecisionProgress: (progress: number) => void
  reset: () => void
}

export const useGameState = create<GameState>((set) => ({
  // Initial state
  phase: "waiting",
  score: 0,
  stonesPlaced: 0,
  consecutiveUnstable: 0,
  physicsActive: false,
  marketAlignment: 0,
  towerOffset: 0,
  currentCandle: null,
  currentStone: null,
  dropStartTime: null,
  canDecide: true,
  placementProgress: 0,
  debugMode: false,
  timeScale: 1,
  hoverStance: "long",
  latestFeatures: null,
  decisionProgress: 0,

  // Actions
  setPhase: (phase) => set({ phase }),
  setScore: (score) => set({ score }),
  incrementScore: (amount) => set((state) => ({ score: state.score + amount })),
  setCurrentCandle: (currentCandle) => set({ currentCandle }),
  setCurrentStone: (currentStone) => set({ currentStone }),
  setDropStartTime: (dropStartTime) => set({ dropStartTime }),
  setCanDecide: (canDecide) => set({ canDecide }),
  incrementStonesPlaced: () => set((state) => {
    console.log(`[v0] Incrementing stones placed from ${state.stonesPlaced} to ${state.stonesPlaced + 1}`)
    return { stonesPlaced: state.stonesPlaced + 1 }
  }),
  setConsecutiveUnstable: (consecutiveUnstable) => set({ consecutiveUnstable }),
  setPhysicsActive: (physicsActive) => set({ physicsActive }),
  setMarketAlignment: (marketAlignment) => set({ marketAlignment }),
  setTowerOffset: (towerOffset) => set({ towerOffset }),
  setPlacementProgress: (placementProgress) => set({ placementProgress }),
  setDebugMode: (debugMode) => set({ debugMode }),
  setTimeScale: (timeScale) => set({ timeScale }),
  setHoverStance: (hoverStance) => set({ hoverStance }),
  setLatestFeatures: (latestFeatures) => set({ latestFeatures }),
  setDecisionProgress: (decisionProgress) => set({ decisionProgress }),
  reset: () =>
    set({
      phase: "waiting",
      score: 0,
      stonesPlaced: 0,
      consecutiveUnstable: 0,
      physicsActive: false,
      marketAlignment: 0,
      towerOffset: 0,
      currentCandle: null,
      currentStone: null,
      dropStartTime: null,
      canDecide: true,
      placementProgress: 0,
      debugMode: false,
      timeScale: 1,
      hoverStance: "long",
      latestFeatures: null,
      decisionProgress: 0,
    }),
}))
