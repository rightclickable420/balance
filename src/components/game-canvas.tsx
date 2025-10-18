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
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { towerOffset } = useGameState()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, width, height)

    ctx.save()
    ctx.translate(0, towerOffset)

    // Get stones from physics engine
    const stones: Stone[] = engineRef.current?.getStones() ?? []


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
    }

    if (placingStone) {
      drawPreviewStone(placingStone, { alpha: placingStone.stance === "flat" ? 0.35 : 0.95 })
    }

    ctx.restore()
  }, [width, height, engineRef, renderTrigger, hoverStone, hoverCanDecide, decisionProgress, placingStone, towerOffset])

  return <canvas ref={canvasRef} width={width} height={height} className="block" />
}
