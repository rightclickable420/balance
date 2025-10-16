"use client"

import type React from "react"
import { useRef, useEffect } from "react"
import type { PhysicsEngine } from "@/lib/game/physics-engine"
import { getStoneOutlineColor } from "@/lib/game/stone-color"
import { useGameState } from "@/lib/game/game-state"

interface GameCanvasProps {
  width: number
  height: number
  engineRef: React.RefObject<PhysicsEngine | null>
  groundY: number
  renderTrigger: number
  placingStone?: {
    vertices: { x: number; y: number }[]
    x: number
    y: number
    color: string
  } | null
}

export function GameCanvas({ width, height, engineRef, groundY, renderTrigger, placingStone }: GameCanvasProps) {
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

    // Draw ground line
    ctx.strokeStyle = "#4a4a4a"
    ctx.lineWidth = 2
    ctx.lineCap = "round"
    ctx.beginPath()
    ctx.moveTo(0, groundY)
    ctx.lineTo(width, groundY)
    ctx.stroke()

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
      // Darken bottom by 15%
      const darkerColor = color.replace(/rgb$$(\d+),\s*(\d+),\s*(\d+)$$/, (_, r, g, b) => {
        return `rgb(${Math.floor(Number(r) * 0.85)}, ${Math.floor(Number(g) * 0.85)}, ${Math.floor(Number(b) * 0.85)})`
      })
      gradient.addColorStop(1, darkerColor)

      // Begin path for stone fill
      ctx.beginPath()
      ctx.globalAlpha = 0.95

      // Draw stone polygon
      for (let i = 0; i < vertices.length; i++) {
        const vertex = vertices[i]

        // Rotate vertex by body angle
        const cos = Math.cos(body.angle)
        const sin = Math.sin(body.angle)
        const rotatedX = vertex.x * cos - vertex.y * sin
        const rotatedY = vertex.x * sin + vertex.y * cos

        // Translate to body position
        const screenX = body.position.x + rotatedX
        const screenY = body.position.y + rotatedY

        if (i === 0) {
          ctx.moveTo(screenX, screenY)
        } else {
          ctx.lineTo(screenX, screenY)
        }
      }

      ctx.closePath()

      // Fill stone with gradient
      ctx.fillStyle = gradient
      ctx.fill()

      // Draw outline
      ctx.globalAlpha = 1
      ctx.strokeStyle = getStoneOutlineColor(color)
      ctx.lineWidth = 2
      ctx.lineJoin = "round"
      ctx.stroke()

      ctx.restore()
    }

    if (placingStone) {
      ctx.save()

      const { vertices, x, y, color } = placingStone

      // Add gradient for placing stone too
      const gradient = ctx.createLinearGradient(x, y - 30, x, y + 30)
      gradient.addColorStop(0, color)
      const darkerColor = color.replace(/rgb$$(\d+),\s*(\d+),\s*(\d+)$$/, (_, r, g, b) => {
        return `rgb(${Math.floor(Number(r) * 0.85)}, ${Math.floor(Number(g) * 0.85)}, ${Math.floor(Number(b) * 0.85)})`
      })
      gradient.addColorStop(1, darkerColor)

      ctx.beginPath()
      ctx.globalAlpha = 0.95

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

      ctx.fillStyle = gradient
      ctx.fill()

      ctx.globalAlpha = 1
      ctx.strokeStyle = getStoneOutlineColor(color)
      ctx.lineWidth = 2
      ctx.lineJoin = "round"
      ctx.stroke()

      ctx.restore()
    }

    ctx.restore()
  }, [width, height, engineRef, groundY, renderTrigger, placingStone, towerOffset])

  return <canvas ref={canvasRef} width={width} height={height} className="block" />
}
