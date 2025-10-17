import type { GameConfig } from "./types"

export const DEFAULT_CONFIG: GameConfig = {
  dropCadence: 3000, // 3 seconds per stone (for better testing)
  timeScale: 1, // Multiplier for testing (1 = normal, 60 = 60x faster)
  decisionWindow: 0.4, // first 40% of fall time
  gravity: 980, // pixels/s² (roughly Earth gravity at 1px = 1cm)
  spawnHeight: 100, // pixels above ground
  stabilityThreshold: 0.3, // ~17 degrees tilt
  graceBias: 0.1, // 10% lighter for consecutive unstable stones
  placementDuration: 4000, // 4 seconds for smooth descent animation (increased for better visibility)
}
