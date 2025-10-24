import type { GameConfig } from "./types"

export const DEFAULT_CONFIG: GameConfig = {
  dropCadence: 30000, // 30 seconds per stone aligns with 30s candle windows
  timeScale: 1, // Multiplier for testing (1 = normal, 60 = 60x faster)
  decisionWindow: 0.8667, // 26 seconds hover (86.67% of 30s), then 4s placement
  gravity: 980, // pixels/s² (roughly Earth gravity at 1px = 1cm)
  spawnHeight: 100, // pixels above ground
  stabilityThreshold: 0.3, // ~17 degrees tilt
  graceBias: 0.1, // 10% lighter for consecutive unstable stones
  placementDuration: 4000, // 4 seconds for smooth descent animation
}
