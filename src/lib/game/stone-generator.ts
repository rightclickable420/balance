import type { StoneParams } from "../types"

export interface Point {
  x: number
  y: number
}

const seededRandom = (seed: number) => {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const smoothStroke = (points: Point[], passes = 2): Point[] => {
  let current = points
  for (let p = 0; p < passes; p++) {
    const next: Point[] = []
    for (let i = 0; i < current.length; i++) {
      const a = current[i]
      const b = current[(i + 1) % current.length]
      const c = current[(i + 2) % current.length]

      const ab = { x: a.x + (b.x - a.x) * 0.5, y: a.y + (b.y - a.y) * 0.5 }
      const bc = { x: b.x + (c.x - b.x) * 0.5, y: b.y + (c.y - b.y) * 0.5 }

      next.push(ab, bc)
    }
    current = next
  }
  return current
}

interface ShapeOptions {
  facetStrength?: number
  facetWidth?: number
}

/**
 * Generates a softened river-rock polygon using aspect ratio, flattening, and stochastic noise.
 */
export function generateStoneShape(params: StoneParams, options: ShapeOptions = {}): Point[] {
  const { convexity, jaggedness, baseBias, radius, aspect, seed } = params
  const { facetStrength = 0.35, facetWidth = Math.PI / 5 } = options
  const rng = seededRandom(seed)

  const basePoints: Point[] = []
  const segments = 28
  const biasStrength = 0.16 * Math.abs(baseBias)

  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2
    const sin = Math.sin(t)
    const cos = Math.cos(t)

    const flatten = baseBias >= 0 ? Math.max(0, -sin) : Math.max(0, sin)
    const biasScale = 1 - biasStrength * Math.pow(flatten, 1.5)

    const angleDiff = Math.abs(Math.atan2(Math.sin(t), Math.cos(t)))
    const facetWeight = Math.max(0, 1 - angleDiff / facetWidth)
    const facetScale = 1 - facetStrength * facetWeight * facetWeight

    const ovalX = cos * radius * aspect
    const ovalY = sin * radius

    const noise = (rng() - 0.5) * jaggedness * radius * 0.12
    const ridge = Math.sin(t * 2) * (1 - convexity) * radius * 0.18

    const scaleBase = Math.max(0.55, biasScale * facetScale)
    const scale = scaleBase + noise / Math.max(1, radius) + ridge / Math.max(1, radius)

    basePoints.push({ x: ovalX * scale, y: ovalY * (scale * 0.95) })
  }

  const smoothed = smoothStroke(basePoints, 2)
  return smoothed
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
