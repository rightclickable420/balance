import type { StoneParams } from "../types"

export interface Point {
  x: number
  y: number
}

/**
 * Generates irregular polygon vertices from stone parameters
 * Uses seeded RNG for deterministic generation
 * Updated to create flatter, river-rock-like shapes
 */
export function generateStoneShape(params: StoneParams): Point[] {
  const { convexity, jaggedness, baseBias, radius, seed } = params

  // Seeded RNG (same as mock candle source)
  let state = seed
  const rng = () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const vertexCount = Math.floor(6 + (1 - convexity) * 4) // 6-10 vertices

  const points: Point[] = []
  const angleStep = (Math.PI * 2) / vertexCount

  const aspectRatio = 1.8 + rng() * 0.4 // 1.8 to 2.2

  for (let i = 0; i < vertexCount; i++) {
    const angle = i * angleStep

    // Base radius with variation
    let r = radius

    const jagVariation = (rng() - 0.5) * jaggedness * radius * 0.15
    r += jagVariation

    const convexSmoothing = Math.sin(angle * 2) * (1 - convexity) * radius * 0.3
    r += convexSmoothing

    // Apply base bias (flatten one side)
    const verticalPos = Math.sin(angle) // -1 (bottom) to 1 (top)
    if (baseBias > 0 && verticalPos < 0) {
      r *= 1 - baseBias * 0.3 * Math.abs(verticalPos)
    } else if (baseBias < 0 && verticalPos > 0) {
      r *= 1 - Math.abs(baseBias) * 0.3 * verticalPos
    }

    const x = Math.cos(angle) * r * aspectRatio
    const y = Math.sin(angle) * r

    points.push({ x, y })
  }

  return points
}

/**
 * Calculate the centroid of a polygon
 */
export function calculateCentroid(points: Point[]): Point {
  let cx = 0
  let cy = 0
  let area = 0

  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    const cross = points[i].x * points[j].y - points[j].x * points[i].y
    area += cross
    cx += (points[i].x + points[j].x) * cross
    cy += (points[i].y + points[j].y) * cross
  }

  area /= 2
  cx /= 6 * area
  cy /= 6 * area

  return { x: cx, y: cy }
}

/**
 * Normalize points so centroid is at origin
 */
export function normalizePoints(points: Point[]): Point[] {
  const centroid = calculateCentroid(points)
  return points.map((p) => ({
    x: p.x - centroid.x,
    y: p.y - centroid.y,
  }))
}

/**
 * Calculate approximate area of polygon (for mass calculation)
 */
export function calculateArea(points: Point[]): number {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    area += points[i].x * points[j].y - points[j].x * points[i].y
  }
  return Math.abs(area / 2)
}
