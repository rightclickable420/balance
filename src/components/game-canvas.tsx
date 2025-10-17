"use client"

import type React from "react"
import { useRef, useEffect } from "react"
import type { PhysicsEngine } from "@/lib/game/physics-engine"
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
  } | null
  hoverCanDecide?: boolean
  decisionProgress?: number
  placingStone?: {
    vertices: { x: number; y: number }[]
    x: number
    y: number
    color: string
    stance?: Stance
  } | null
}

const adjustHex = (hex: string, factor: number) => {
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex
  if (normalized.length !== 6) return hex
  const r = Math.max(0, Math.min(255, Math.round(parseInt(normalized.slice(0, 2), 16) * factor)))
  const g = Math.max(0, Math.min(255, Math.round(parseInt(normalized.slice(2, 4), 16) * factor)))
  const b = Math.max(0, Math.min(255, Math.round(parseInt(normalized.slice(4, 6), 16) * factor)))
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
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
    const stones = engineRef.current?.getStones() || []

    // Draw each stone
    for (const stone of stones) {
      const { body, vertices, color } = stone

      ctx.save()

      const gradient = ctx.createLinearGradient(
        body.position.x,
        body.position.y - stone.params.radius,
        body.position.x,
        body.position.y + stone.params.radius,
      )
      gradient.addColorStop(0, color)
      gradient.addColorStop(1, adjustHex(color, 0.85))

      const traceBodyPath = () => {
        ctx.beginPath()
        for (let i = 0; i < vertices.length; i++) {
          const vertex = vertices[i]
          const cos = Math.cos(body.angle)
          const sin = Math.sin(body.angle)
          const rotatedX = vertex.x * cos - vertex.y * sin
          const rotatedY = vertex.x * sin + vertex.y * cos
          const screenX = body.position.x + rotatedX
          const screenY = body.position.y + rotatedY
          if (i === 0) {
            ctx.moveTo(screenX, screenY)
          } else {
            ctx.lineTo(screenX, screenY)
          }
        }
        ctx.closePath()
      }

      ctx.globalAlpha = 0.95
      ctx.fillStyle = gradient
      traceBodyPath()
      ctx.fill()

      ctx.globalAlpha = 1
      ctx.strokeStyle = getStoneOutlineColor(color)
      ctx.lineWidth = 2
      ctx.lineJoin = "round"
      traceBodyPath()
      ctx.stroke()

      ctx.restore()
    }

    const drawPreviewStone = (
      stone: { vertices: { x: number; y: number }[]; x: number; y: number; color: string; stance?: Stance },
      options: { alpha?: number; highlight?: boolean; progress?: number } = {},
    ) => {
      const { vertices, x, y, color, stance = "long" } = stone
      const alpha = options.alpha ?? (stance === "flat" ? 0.35 : 0.95)
      const highlight = options.highlight ?? false
      const progress = Math.max(0, Math.min(1, options.progress ?? 0))

      const baseColor =
        stance === "flat"
          ? adjustHex(color, 1.1)
          : stance === "short"
            ? adjustHex(color, 0.9)
            : color
      const gradient = ctx.createLinearGradient(x, y - 30, x, y + 30)
      gradient.addColorStop(0, baseColor)
      gradient.addColorStop(1, adjustHex(baseColor, 0.85))

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
      ctx.globalAlpha = alpha
      ctx.fillStyle = gradient
      tracePath()
      ctx.fill()

      ctx.globalAlpha = 1
      ctx.lineWidth = 2
      ctx.lineJoin = "round"
      tracePath()
      ctx.strokeStyle = getStoneOutlineColor(baseColor)
      ctx.stroke()

      if (highlight) {
        const pulse = 0.3 + 0.5 * (1 - progress)
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
      }

      ctx.restore()
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
