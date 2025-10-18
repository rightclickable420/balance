import { clamp } from "./math"

export interface Point {
  x: number
  y: number
}

export const degToRad = (degrees: number): number => (degrees * Math.PI) / 180

export const rotatePoint = (point: Point, theta: number): Point => {
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  }
}

export const rotatePoints = (points: Point[], theta: number): Point[] => points.map((p) => rotatePoint(p, theta))

const clampSegments = (segments: number): number => Math.max(1, Math.floor(segments))

const addFilletsCCW = (poly4: Point[], radius: number, segments = 3): Point[] => {
  if (radius <= 0) {
    return [...poly4]
  }

  const n = poly4.length
  const out: Point[] = []
  const idx = (i: number) => (i + n) % n
  const segmentCount = clampSegments(segments)
  const eps = 1e-6

  const clampDot = (value: number) => (value > 1 ? 1 : value < -1 ? -1 : value)

  for (let i = 0; i < n; i++) {
    const A = poly4[idx(i - 1)]
    const B = poly4[i]
    const C = poly4[idx(i + 1)]

    const vPrev = { x: A.x - B.x, y: A.y - B.y }
    const vNext = { x: C.x - B.x, y: C.y - B.y }
    const lenPrev = Math.hypot(vPrev.x, vPrev.y)
    const lenNext = Math.hypot(vNext.x, vNext.y)

    if (lenPrev < eps || lenNext < eps) {
      out.push({ ...B })
      continue
    }

    const dirPrev = { x: vPrev.x / lenPrev, y: vPrev.y / lenPrev }
    const dirNext = { x: vNext.x / lenNext, y: vNext.y / lenNext }

    const dot = clampDot(dirPrev.x * dirNext.x + dirPrev.y * dirNext.y)
    const angle = Math.acos(dot)

    if (!Number.isFinite(angle) || angle < eps) {
      out.push({ ...B })
      continue
    }

    const maxRadius = Math.min(lenPrev, lenNext) * Math.tan(angle / 2)
    const cornerRadius = Math.min(radius, maxRadius)

    if (!(cornerRadius > eps)) {
      out.push({ ...B })
      continue
    }

    const tangentLength = cornerRadius / Math.tan(angle / 2)

    if (!Number.isFinite(tangentLength) || tangentLength <= eps) {
      out.push({ ...B })
      continue
    }

    const p1 = {
      x: B.x + dirPrev.x * tangentLength,
      y: B.y + dirPrev.y * tangentLength,
    }
    const p2 = {
      x: B.x + dirNext.x * tangentLength,
      y: B.y + dirNext.y * tangentLength,
    }

    const bisector = { x: dirPrev.x + dirNext.x, y: dirPrev.y + dirNext.y }
    const bisectorLen = Math.hypot(bisector.x, bisector.y)

    if (bisectorLen < eps) {
      out.push(p1)
      out.push(p2)
      continue
    }

    const bisectorDir = { x: bisector.x / bisectorLen, y: bisector.y / bisectorLen }
    const centerDistance = cornerRadius / Math.sin(angle / 2)

    if (!Number.isFinite(centerDistance)) {
      out.push(p1)
      out.push(p2)
      continue
    }

    const center = {
      x: B.x + bisectorDir.x * centerDistance,
      y: B.y + bisectorDir.y * centerDistance,
    }

    const startAngle = Math.atan2(p1.y - center.y, p1.x - center.x)
    const endAngle = Math.atan2(p2.y - center.y, p2.x - center.x)
    let delta = endAngle - startAngle

    if (delta <= 0) {
      delta += Math.PI * 2
    }

    out.push(p1)

    for (let s = 1; s < segmentCount; s++) {
      const theta = startAngle + (delta * s) / segmentCount
      out.push({
        x: center.x + Math.cos(theta) * cornerRadius,
        y: center.y + Math.sin(theta) * cornerRadius,
      })
    }

    out.push(p2)
  }

  return out
}

export interface TrapezoidGeometry {
  widthBottom: number
  height: number
  taper: number
  round: number
}

export interface TrapezoidParams extends TrapezoidGeometry {
  beta: number
  tau: number
  prevTopAngleGlobal: number
  segments?: number
}

export interface TrapezoidAngleParams extends TrapezoidGeometry {
  betaGlobal: number
  tauGlobal: number
  prevTopAngleGlobal: number
  segments?: number
}

export interface TrapezoidMetrics {
  bottomMidLocal: Point
  bottomMidWorld: Point
  topMidLocal: Point
  topMidWorld: Point
  bottomAngleLocal: number
  bottomAngleWorld: number
  topAngleLocal: number
  topAngleWorld: number
  bottomWidth: number
  topWidth: number
  heightLocal: number
}

export interface TrapezoidResult {
  local: Point[]
  world: Point[]
  cornersLocal: [Point, Point, Point, Point]
  cornersWorld: [Point, Point, Point, Point]
  metrics: TrapezoidMetrics
}

interface LocalTrapezoid {
  polygon: Point[]
  corners: [Point, Point, Point, Point]
}

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

const makeTrapezoidLocal = (geometry: TrapezoidGeometry, beta: number, tau: number, segments = 4): LocalTrapezoid => {
  const Wb = geometry.widthBottom
  const H = geometry.height
  const taperClamped = clamp(geometry.taper, 0, 1)
  const roundClamped = clamp(geometry.round, 0, 1)
  const Wt = Math.max(4, Wb * (1 - 0.35 * taperClamped))

  const a = (Wt - Wb) / H
  const b = Wb

  const xL = (y: number) => -0.5 * (a * y + b)
  const xR = (y: number) => 0.5 * (a * y + b)

  const mb = Math.tan(beta)
  const kb = 0
  const mt = Math.tan(tau)
  const kt = H
  const eps = 1e-6

  const bottomLeftDen = 1 + 0.5 * mb * a
  const yBL = (kb - 0.5 * mb * b) / (Math.abs(bottomLeftDen) < eps ? Math.sign(bottomLeftDen || 1) * eps : bottomLeftDen)
  const xBL = xL(yBL)

  const bottomRightDen = 1 - 0.5 * mb * a
  const yBR = (kb + 0.5 * mb * b) / (Math.abs(bottomRightDen) < eps ? Math.sign(bottomRightDen || 1) * eps : bottomRightDen)
  const xBR = xR(yBR)

  const topRightDen = 1 - 0.5 * mt * a
  const yTR = (kt + 0.5 * mt * b) / (Math.abs(topRightDen) < eps ? Math.sign(topRightDen || 1) * eps : topRightDen)
  const xTR = xR(yTR)

  const topLeftDen = 1 + 0.5 * mt * a
  const yTL = (kt - 0.5 * mt * b) / (Math.abs(topLeftDen) < eps ? Math.sign(topLeftDen || 1) * eps : topLeftDen)
  const xTL = xL(yTL)

  const corners: [Point, Point, Point, Point] = [
    { x: xBL, y: yBL },
    { x: xBR, y: yBR },
    { x: xTR, y: yTR },
    { x: xTL, y: yTL },
  ]

  const localMin = Math.min(Wb, H)
  const radius = roundClamped * localMin * 0.22

  return {
    polygon: addFilletsCCW(corners, radius, segments),
    corners,
  }
}

export function makeTrapezoid(params: TrapezoidParams): TrapezoidResult {
  const { polygon, corners } = makeTrapezoidLocal(params, params.beta, params.tau, params.segments ?? 4)
  const centroid = calculateCentroid(polygon)

  const local = polygon.map((p) => ({
    x: p.x - centroid.x,
    y: p.y - centroid.y,
  }))

  const cornersLocal = corners.map((p) => ({
    x: p.x - centroid.x,
    y: p.y - centroid.y,
  })) as [Point, Point, Point, Point]

  const world = rotatePoints(local, params.prevTopAngleGlobal)
  const cornersWorld = cornersLocal.map((p) => rotatePoint(p, params.prevTopAngleGlobal)) as [Point, Point, Point, Point]

  const bottomMidLocal = midpoint(cornersLocal[0], cornersLocal[1])
  const topMidLocal = midpoint(cornersLocal[3], cornersLocal[2])
  const bottomWidth = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y)
  const topWidth = Math.hypot(corners[2].x - corners[3].x, corners[2].y - corners[3].y)
  const bottomAngleLocal = Math.atan2(cornersLocal[1].y - cornersLocal[0].y, cornersLocal[1].x - cornersLocal[0].x)
  const topAngleLocal = Math.atan2(cornersLocal[2].y - cornersLocal[3].y, cornersLocal[2].x - cornersLocal[3].x)
  const bottomMidWorld = rotatePoint(bottomMidLocal, params.prevTopAngleGlobal)
  const topMidWorld = rotatePoint(topMidLocal, params.prevTopAngleGlobal)

  return {
    local,
    world,
    cornersLocal,
    cornersWorld,
    metrics: {
      bottomMidLocal,
      bottomMidWorld,
      topMidLocal,
      topMidWorld,
      bottomAngleLocal,
      bottomAngleWorld: bottomAngleLocal + params.prevTopAngleGlobal,
      topAngleLocal,
      topAngleWorld: topAngleLocal + params.prevTopAngleGlobal,
      bottomWidth,
      topWidth,
      heightLocal: topMidLocal.y - bottomMidLocal.y,
    },
  }
}

export function makeTrapezoidFromAngles(params: TrapezoidAngleParams): TrapezoidResult {
  const { betaGlobal, tauGlobal, prevTopAngleGlobal, ...rest } = params
  const betaLocal = betaGlobal - prevTopAngleGlobal
  const tauLocal = tauGlobal - prevTopAngleGlobal
  return makeTrapezoid({
    ...rest,
    beta: betaLocal,
    tau: tauLocal,
    prevTopAngleGlobal,
    segments: params.segments,
  })
}

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

export function normalizePoints(points: Point[]): Point[] {
  const centroid = calculateCentroid(points)
  return points.map((p) => ({
    x: p.x - centroid.x,
    y: p.y - centroid.y,
  }))
}

export function calculateArea(points: Point[]): number {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    area += points[i].x * points[j].y - points[j].x * points[i].y
  }
  return Math.abs(area / 2)
}
