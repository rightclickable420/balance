import type { GameConfig } from "./types"

export const DEFAULT_CONFIG: GameConfig = {
  dropCadence: 60000, // 60 seconds per stone (1 minute)
  timeScale: 1, // Multiplier for testing (1 = normal, 60 = 60x faster)
  decisionWindow: 0.4, // first 40% of fall time
  gravity: 980, // pixels/s² (roughly Earth gravity at 1px = 1cm)
  spawnHeight: 100, // pixels above ground
  stabilityThreshold: 0.3, // ~17 degrees tilt
  graceBias: 0.1, // 10% lighter for consecutive unstable stones
  placementDuration: 2000, // 2 seconds for smooth descent animation
}
