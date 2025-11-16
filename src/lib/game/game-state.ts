import { create } from "zustand"
import type { Candle } from "../types"
import type { Stone } from "./physics-engine"
import type { Features } from "@/lib/data/features"
import type { PublicKey } from "@solana/web3.js"

export type GamePhase = "waiting" | "hovering" | "placing" | "stable" | "loss" | "settled"
export type Stance = "long" | "short" | "flat"
export type GameMode = "mock" | "real"
export type ExperienceMode = "balance" | "doomrunner"
export type SetupPhase = "not_started" | "in_setup" | "playing"

export interface GameState {
  // Setup & Mode
  setupPhase: SetupPhase
  experienceMode: ExperienceMode
  gameMode: GameMode
  mockBalance: number // Starting balance for mock mode

  // Game status
  phase: GamePhase
  score: number
  stonesPlaced: number
  consecutiveUnstable: number

  physicsActive: boolean
  marketAlignment: number // -1 to 1, oscillates over time
  towerOffset: number // Y offset for scrolling tower down
  towerOffsetX: number // X offset for centering tower horizontally

  // Current stone
  currentCandle: Candle | null
  currentStone: Stone | null
  dropStartTime: number | null
  canDecide: boolean

  placementProgress: number // 0-1, animation progress

  // Chart data
  candleHistory: Candle[] // Historical 30-second candles for chart display

  debugMode: boolean
  timeScale: number
  hoverStance: Stance
  latestFeatures: Features | null
  decisionProgress: number
  dataProvider: string
  alignmentScore: number
  alignmentVelocity: number
  lastAlignmentUpdate: number
  energyBudget: number
  energyPhase: "calm" | "building" | "critical"
  energyCooldownUntil: number
  stabilizerStrength: number
  disturberStrength: number
  disturberDirection: number

  // Wallet & Trading
  sessionWalletPublicKey: PublicKey | null
  sessionWalletBalance: number // SOL balance in session wallet
  startingRealBalance: number // Starting balance for real mode (to calculate total PnL)
  equity: number // Current equity (balance + unrealized PnL)
  openPositionSize: number // Current position size in USD
  unrealizedPnl: number // Unrealized profit/loss
  realizedPnl: number // Cumulative realized PnL for session
  tradingLeverage: number // Configured leverage for real trading
  tradingStrategy: string // Configured strategy for real trading

  // Actions
  setSetupPhase: (phase: SetupPhase) => void
  setExperienceMode: (mode: ExperienceMode) => void
  setGameMode: (mode: GameMode) => void
  startGame: (mode: GameMode) => void
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
  setTowerOffsetX: (offsetX: number) => void
  setPlacementProgress: (progress: number) => void
  setDebugMode: (debug: boolean) => void
  setTimeScale: (scale: number) => void
  setHoverStance: (stance: Stance) => void
  setLatestFeatures: (features: Features | null) => void
  setDecisionProgress: (progress: number) => void
  setDataProvider: (provider: string) => void
  setAlignmentScore: (score: number, velocity: number, timestamp: number) => void
  setEnergyState: (budget: number, phase: "calm" | "building" | "critical", cooldownUntil: number) => void
  setForceStrengths: (stabilizer: number, disturber: number, direction?: number) => void
  addCandleToHistory: (candle: Candle) => void
  updateCurrentCandle: (candle: Candle) => void
  setSessionWallet: (publicKey: PublicKey | null, balance: number) => void
  setEquity: (equity: number) => void
  setPosition: (size: number, unrealizedPnl: number) => void
  addRealizedPnl: (pnl: number) => void
  setTradingConfig: (leverage: number, strategy: string) => void
  reset: () => void
}

export const useGameState = create<GameState>((set) => ({
  // Initial state
  setupPhase: "not_started",
  experienceMode: "doomrunner", // Default to Doom Runner (Balance mode removed)
  gameMode: "mock",
  mockBalance: 1000,
  phase: "waiting",
  score: 0,
  stonesPlaced: 0,
  consecutiveUnstable: 0,
  physicsActive: false,
  marketAlignment: 0,
  towerOffset: 0,
  towerOffsetX: 0,
  currentCandle: null,
  currentStone: null,
  dropStartTime: null,
  canDecide: true,
  placementProgress: 0,
  candleHistory: [],
  debugMode: false,
  timeScale: 1,
  hoverStance: "long",
  latestFeatures: null,
  decisionProgress: 0,
  dataProvider: "mock",
  alignmentScore: 0,
  alignmentVelocity: 0,
  lastAlignmentUpdate: 0,
  energyBudget: 0,
  energyPhase: "calm",
  energyCooldownUntil: 0,
  stabilizerStrength: 0,
  disturberStrength: 0,
  disturberDirection: 0,
  sessionWalletPublicKey: null,
  sessionWalletBalance: 0,
  startingRealBalance: 0,
  equity: 0,
  openPositionSize: 0,
  unrealizedPnl: 0,
  realizedPnl: 0,
  tradingLeverage: 5,
  tradingStrategy: "balanced",

  // Actions
  setSetupPhase: (setupPhase) => set({ setupPhase }),
  setExperienceMode: (experienceMode) => set({ experienceMode }),
  setGameMode: (gameMode) => set({ gameMode }),
  startGame: (mode) => set({
    gameMode: mode,
    setupPhase: "playing",
    mockBalance: mode === "mock" ? 1000 : 0,
    equity: mode === "mock" ? 1000 : 0,
    dataProvider: mode === "mock" ? "mock" : "real"
  }),
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
  setTowerOffsetX: (towerOffsetX) => set({ towerOffsetX }),
  setPlacementProgress: (placementProgress) => set({ placementProgress }),
  setDebugMode: (debugMode) => set({ debugMode }),
  setTimeScale: (timeScale) => set({ timeScale }),
  setHoverStance: (hoverStance) => set({ hoverStance }),
  setLatestFeatures: (latestFeatures) => set({ latestFeatures }),
  setDecisionProgress: (decisionProgress) => set({ decisionProgress }),
  setDataProvider: (dataProvider) => set({ dataProvider }),
  setAlignmentScore: (alignmentScore, alignmentVelocity, lastAlignmentUpdate) =>
    set({ alignmentScore, alignmentVelocity, lastAlignmentUpdate }),
  setEnergyState: (energyBudget, energyPhase, energyCooldownUntil) =>
    set({ energyBudget, energyPhase, energyCooldownUntil }),
  setForceStrengths: (stabilizerStrength, disturberStrength, disturberDirection = 0) =>
    set({ stabilizerStrength, disturberStrength, disturberDirection }),
  addCandleToHistory: (candle) =>
    set((state) => ({
      candleHistory: [...state.candleHistory, candle].slice(-60), // Keep last 60 1-second candles
      currentCandle: candle,
    })),
  updateCurrentCandle: (candle) =>
    set({ currentCandle: candle }),
  setSessionWallet: (sessionWalletPublicKey, sessionWalletBalance) =>
    set((state) => ({
      sessionWalletPublicKey,
      sessionWalletBalance,
      // Set starting balance on first wallet connection (when it was previously 0)
      startingRealBalance: state.startingRealBalance === 0 ? sessionWalletBalance : state.startingRealBalance
    })),
  setEquity: (equity) =>
    set({ equity }),
  setPosition: (openPositionSize, unrealizedPnl) =>
    set({ openPositionSize, unrealizedPnl }),
  addRealizedPnl: (pnl) =>
    set((state) => ({ realizedPnl: state.realizedPnl + pnl })),
  setTradingConfig: (tradingLeverage, tradingStrategy) =>
    set({ tradingLeverage, tradingStrategy }),
  reset: () =>
    set({
      setupPhase: "not_started",
      experienceMode: "doomrunner", // Default to Doom Runner (Balance mode removed)
      gameMode: "mock",
      mockBalance: 1000,
      phase: "waiting",
      score: 0,
      stonesPlaced: 0,
      consecutiveUnstable: 0,
      physicsActive: false,
      marketAlignment: 0,
      towerOffset: 0,
      towerOffsetX: 0,
      currentCandle: null,
      currentStone: null,
      dropStartTime: null,
      canDecide: true,
      placementProgress: 0,
      candleHistory: [],
      debugMode: false,
      timeScale: 1,
      hoverStance: "long",
      latestFeatures: null,
      decisionProgress: 0,
      dataProvider: "mock",
      alignmentScore: 0,
      alignmentVelocity: 0,
      lastAlignmentUpdate: 0,
      energyBudget: 0,
      energyPhase: "calm",
      energyCooldownUntil: 0,
      stabilizerStrength: 0,
      disturberStrength: 0,
      disturberDirection: 0,
      sessionWalletPublicKey: null,
      sessionWalletBalance: 0,
      startingRealBalance: 0,
      equity: 0,
      openPositionSize: 0,
      unrealizedPnl: 0,
      realizedPnl: 0,
    }),
}))
