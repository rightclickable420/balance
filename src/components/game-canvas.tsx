"use client"

import type React from "react"
import { useRef, useEffect } from "react"
import type { PhysicsEngine, Stone } from "@/lib/game/physics-engine"
import { getStoneOutlineColor } from "@/lib/game/stone-color"
import { useGameState, type Stance } from "@/lib/game/game-state"

interface GameCanvasProps {
  width: number
  height: number
  engineRef: React.RefObject<PhysicsEngine | null>
  renderTrigger: number
  hoverStone?: {
    vertices: { x: number; y: number }[]
    x: number
    y: number
    color: string
    stance?: Stance
    angle?: number
    highlightAngle?: number
  } | null
  hoverCanDecide?: boolean
  decisionProgress?: number
  placingStone?: {
    vertices: { x: number; y: number }[]
    x: number
    y: number
    color: string
    stance?: Stance
    angle?: number
    highlightAngle?: number
  } | null
  energyPhase?: "calm" | "building" | "critical"
  energyRatio?: number
  stabilizerStrength?: number
  disturberStrength?: number
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

const adjustHex = (hex: string, factor: number) => {
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex
  if (normalized.length !== 6) return hex
  const r = Math.max(0, Math.min(255, Math.round(parseInt(normalized.slice(0, 2), 16) * factor)))
  const g = Math.max(0, Math.min(255, Math.round(parseInt(normalized.slice(2, 4), 16) * factor)))
  const b = Math.max(0, Math.min(255, Math.round(parseInt(normalized.slice(4, 6), 16) * factor)))
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
}

const getLocalExtents = (vertices: { x: number; y: number }[]) => {
  if (vertices.length === 0) {
    return { radiusX: 0, radiusY: 0 }
  }
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const vertex of vertices) {
    if (vertex.x < minX) minX = vertex.x
    if (vertex.x > maxX) maxX = vertex.x
    if (vertex.y < minY) minY = vertex.y
    if (vertex.y > maxY) maxY = vertex.y
  }
  return {
    radiusX: (maxX - minX) / 2,
    radiusY: (maxY - minY) / 2,
  }
}

export function GameCanvas({
  width,
  height,
  engineRef,
  renderTrigger,
  hoverStone,
  hoverCanDecide = false,
  decisionProgress = 0,
  placingStone,
  energyPhase = "calm",
  energyRatio = 0,
  stabilizerStrength = 0,
  disturberStrength = 0,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { towerOffset, towerOffsetX, debugMode } = useGameState()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, width, height)

    ctx.save()
    ctx.translate(towerOffsetX, towerOffset)

    // Get stones from physics engine
    const stones: Stone[] = engineRef.current?.getStones() ?? []

    let stackMinX = Infinity
    let stackMaxX = -Infinity
    let stackTopY = height
    for (const stone of stones) {
      const bounds = stone.body.bounds
      if (!bounds) continue
      if (bounds.min.x < stackMinX) stackMinX = bounds.min.x
      if (bounds.max.x > stackMaxX) stackMaxX = bounds.max.x
      if (bounds.min.y < stackTopY) stackTopY = bounds.min.y
    }
    if (Number.isFinite(placingStone?.x) && placingStone?.vertices) {
      const placingBounds = placingStone.vertices.reduce(
        (acc, vertex) => {
          const x = placingStone.x + vertex.x
          const y = placingStone.y + vertex.y
          return {
            minX: Math.min(acc.minX, x),
            maxX: Math.max(acc.maxX, x),
            minY: Math.min(acc.minY, y),
          }
        },
        { minX: Infinity, maxX: -Infinity, minY: Infinity },
      )
      if (placingBounds.minX < stackMinX) stackMinX = placingBounds.minX
      if (placingBounds.maxX > stackMaxX) stackMaxX = placingBounds.maxX
      if (placingBounds.minY < stackTopY) stackTopY = placingBounds.minY
    }
    const traceBodyPath = (
      vertices: { x: number; y: number }[],
      bodyX: number,
      bodyY: number,
      angle: number,
    ) => {
      if (!Number.isFinite(bodyX) || !Number.isFinite(bodyY) || !Number.isFinite(angle)) {
        return
      }

      ctx.beginPath()
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      for (let i = 0; i < vertices.length; i++) {
        const vertex = vertices[i]
        const rotatedX = vertex.x * cos - vertex.y * sin
        const rotatedY = vertex.x * sin + vertex.y * cos
        const screenX = bodyX + rotatedX
        const screenY = bodyY + rotatedY
        if (i === 0) {
          ctx.moveTo(screenX, screenY)
        } else {
          ctx.lineTo(screenX, screenY)
        }
      }
      ctx.closePath()
    }

    for (const stone of stones) {
      const { body, vertices, color } = stone
      const { radiusY } = getLocalExtents(vertices)

      if (!Number.isFinite(body.position.x) || !Number.isFinite(body.position.y) || !Number.isFinite(radiusY)) {
        continue
      }

      const gradient = ctx.createLinearGradient(
        body.position.x,
        body.position.y - radiusY,
        body.position.x,
        body.position.y + radiusY,
      )
      gradient.addColorStop(0, adjustHex(color, 1.1))
      gradient.addColorStop(1, adjustHex(color, 0.78))

      ctx.save()
      ctx.shadowColor = "rgba(0,0,0,0.25)"
      ctx.shadowBlur = 18
      ctx.shadowOffsetY = 8
      ctx.globalAlpha = 0.92
      ctx.fillStyle = gradient
      traceBodyPath(vertices, body.position.x, body.position.y, body.angle)
      ctx.fill()
      ctx.restore()

      ctx.save()
      ctx.globalAlpha = 1
      ctx.lineWidth = 2
      ctx.lineJoin = "round"
      ctx.strokeStyle = getStoneOutlineColor(color)
      traceBodyPath(vertices, body.position.x, body.position.y, body.angle)
      ctx.stroke()
      ctx.restore()

      // highlight removed
    }

    if (debugMode) {
      ctx.save()
      ctx.globalAlpha = 0.35
      ctx.lineWidth = 1
      ctx.setLineDash([6, 4])
      for (const stone of stones) {
        const bounds = stone.body.bounds
        if (!bounds) continue
        const minX = bounds.min.x
        const minY = bounds.min.y
        const widthSpan = bounds.max.x - bounds.min.x
        const heightSpan = bounds.max.y - bounds.min.y
        if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(widthSpan) || !Number.isFinite(heightSpan)) {
          continue
        }
        ctx.strokeStyle = "rgba(255,0,0,0.6)"
        ctx.strokeRect(minX, minY, widthSpan, heightSpan)
      }
      ctx.restore()
    }

    const auraBaseColor =
      energyPhase === "critical"
        ? "255, 80, 80"
        : energyPhase === "building"
          ? "255, 196, 84"
          : "94, 206, 255"
    const auraIntensity = clamp01(Math.min(energyRatio, 1.6) / 1.6)
    const shearPulse = clamp01(disturberStrength * 0.8)
    const stabilizerPulse = clamp01(stabilizerStrength * 0.6)
    const overlayAlphaBase = energyPhase === "critical" ? 0.28 : energyPhase === "building" ? 0.18 : 0.12
    const overlayAlpha = auraIntensity * (overlayAlphaBase + shearPulse * 0.12 + stabilizerPulse * 0.08)

    if (overlayAlpha > 0.02 && Number.isFinite(stackMinX) && Number.isFinite(stackMaxX)) {
      const centerX = (stackMinX + stackMaxX) / 2
      const overlayWidth = Math.max(140, stackMaxX - stackMinX + 120)
      const topY = Number.isFinite(stackTopY) ? stackTopY - 80 : height * 0.35
      const overlayHeight = Math.min(height * 0.6, Math.max(180, height - topY + 24))
      const jitter = (Math.random() - 0.5) * shearPulse * 8
      const gradient = ctx.createLinearGradient(centerX, topY, centerX, topY + overlayHeight)
      gradient.addColorStop(
        0,
        `rgba(${auraBaseColor}, ${0.4 + shearPulse * 0.2 + stabilizerPulse * 0.08})`,
      )
      gradient.addColorStop(0.65, `rgba(${auraBaseColor}, ${0.16 + shearPulse * 0.12})`)
      gradient.addColorStop(1, `rgba(${auraBaseColor}, 0)`)

      ctx.save()
      ctx.globalAlpha = overlayAlpha
      ctx.fillStyle = gradient
      ctx.fillRect(centerX - overlayWidth / 2 + jitter, topY, overlayWidth, overlayHeight)
      ctx.restore()
    }

    const drawPreviewStone = (
      stone: {
        vertices: { x: number; y: number }[]
        x: number
        y: number
        color: string
        stance?: Stance
        angle?: number
        highlightAngle?: number
      },
      options: { alpha?: number; highlight?: boolean; progress?: number } = {},
    ) => {
      const { vertices, x, y, color, stance = "long" } = stone
      const alpha = options.alpha ?? (stance === "flat" ? 0.35 : 0.95)
      const highlightActive = options.highlight ?? false
      const progress = clamp01(options.progress ?? 0)

      let minY = Infinity
      let maxY = -Infinity
      for (const vertex of vertices) {
        if (vertex.y < minY) minY = vertex.y
        if (vertex.y > maxY) maxY = vertex.y
      }
      const radiusY = (maxY - minY) / 2

      const baseColor =
        stance === "flat"
          ? adjustHex(color, 1.1)
          : stance === "short"
            ? adjustHex(color, 0.9)
            : color

      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radiusY)) {
        return
      }

      const gradient = ctx.createLinearGradient(x, y - radiusY, x, y + radiusY)
      gradient.addColorStop(0, adjustHex(baseColor, 1.12))
      gradient.addColorStop(1, adjustHex(baseColor, 0.78))

      const tracePath = () => {
        ctx.beginPath()
        for (let i = 0; i < vertices.length; i++) {
          const screenX = x + vertices[i].x
          const screenY = y + vertices[i].y
          if (i === 0) {
            ctx.moveTo(screenX, screenY)
          } else {
            ctx.lineTo(screenX, screenY)
          }
        }
        ctx.closePath()
      }

      ctx.save()
      ctx.shadowColor = "rgba(0,0,0,0.2)"
      ctx.shadowBlur = 14
      ctx.shadowOffsetY = 6
      ctx.globalAlpha = alpha
      ctx.fillStyle = gradient
      tracePath()
      ctx.fill()
      ctx.restore()

      ctx.save()
      ctx.globalAlpha = 1
      ctx.lineWidth = 2
      ctx.lineJoin = "round"
      tracePath()
      ctx.strokeStyle = getStoneOutlineColor(baseColor)
      ctx.stroke()
      ctx.restore()


      if (highlightActive) {
        const pulse = 0.35 + 0.45 * (1 - progress)
        ctx.save()
        ctx.globalAlpha = pulse
        ctx.lineWidth = 3
        const highlightColor =
          stance === "flat"
            ? "rgba(251,191,36,0.85)"
            : stance === "short"
              ? "rgba(96,165,250,0.8)"
              : "rgba(74,222,128,0.85)"
        ctx.strokeStyle = highlightColor
        tracePath()
        ctx.stroke()
        ctx.restore()
      }
    }

    if (hoverStone) {
      const alpha = hoverStone.stance === "flat" ? 0.35 : hoverCanDecide ? 0.95 : 0.7
      drawPreviewStone(hoverStone, {
        alpha,
        highlight: hoverCanDecide,
        progress: decisionProgress,
      })

      if (debugMode) {
        ctx.save()
        ctx.globalAlpha = 0.3
        ctx.setLineDash([4, 3])
        ctx.strokeStyle = "rgba(0, 180, 255, 0.7)"
        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity
        for (const vertex of hoverStone.vertices) {
          const sx = hoverStone.x + vertex.x
          const sy = hoverStone.y + vertex.y
          if (sx < minX) minX = sx
          if (sy < minY) minY = sy
          if (sx > maxX) maxX = sx
          if (sy > maxY) maxY = sy
        }
        if (Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY)) {
          ctx.strokeRect(minX, minY, maxX - minX, maxY - minY)
        }
        ctx.restore()
      }
    }

    if (placingStone) {
      drawPreviewStone(placingStone, { alpha: placingStone.stance === "flat" ? 0.35 : 0.95 })

      if (debugMode) {
        ctx.save()
        ctx.globalAlpha = 0.34
        ctx.setLineDash([4, 3])
        ctx.strokeStyle = "rgba(0, 255, 180, 0.7)"
        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity
        for (const vertex of placingStone.vertices) {
          const sx = placingStone.x + vertex.x
          const sy = placingStone.y + vertex.y
          if (sx < minX) minX = sx
          if (sy < minY) minY = sy
          if (sx > maxX) maxX = sx
          if (sy > maxY) maxY = sy
        }
        if (Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY)) {
          ctx.strokeRect(minX, minY, maxX - minX, maxY - minY)
        }
        ctx.restore()
      }
    }

    ctx.restore()
  }, [
    width,
    height,
    engineRef,
    renderTrigger,
    hoverStone,
    hoverCanDecide,
    decisionProgress,
    placingStone,
    towerOffset,
    towerOffsetX,
    energyPhase,
    energyRatio,
    stabilizerStrength,
    disturberStrength,
    debugMode,
  ])

  return <canvas ref={canvasRef} width={width} height={height} className="block w-full h-full" />
}
