import type { GameConfig } from "./types"

export const DEFAULT_CONFIG: GameConfig = {
  dropCadence: 30000, // 30 seconds per stone aligns with 30s candle windows
  timeScale: 1, // Multiplier for testing (1 = normal, 60 = 60x faster)
  decisionWindow: 0.9833, // 29.5 seconds hover (98.33% of 30s), then 0.5s placement
  gravity: 980, // pixels/s² (roughly Earth gravity at 1px = 1cm)
  spawnHeight: 100, // pixels above ground
  stabilityThreshold: 0.3, // ~17 degrees tilt
  graceBias: 0.1, // 10% lighter for consecutive unstable stones
  placementDuration: 500, // 0.5 seconds for snappy descent animation
}
