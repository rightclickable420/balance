export interface Candle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface StoneParams {
  convexity: number // 0-1, how round vs angular
  jaggedness: number // 0-1, edge irregularity
  density: number // kg/m², affects weight
  friction: number // 0-1, surface grip
  restitution: number // 0-1, bounciness
  baseBias: number // -1 to 1, which side is flatter
  radius: number // base size in pixels
  aspect: number // width:height ratio
  seed: number // for deterministic generation
}

export interface CandleSource {
  next(): Candle
  peek(): Candle
  reset(): void
  getSource(): string
}

export interface GameConfig {
  dropCadence: number // ms between drops
  timeScale: number // multiplier for testing (1 = normal, 60 = 60x faster)
  decisionWindow: number // fraction of fall time (0-1)
  gravity: number // pixels/s²
  spawnHeight: number // pixels above ground
  stabilityThreshold: number // radians of tilt before tumble
  graceBias: number // lighten consecutive unstable stones
  placementDuration: number // ms for smooth descent animation
}
