"use client"

import { useEffect, useRef, useState } from "react"
import { GameCanvas } from "./game-canvas"
import { PhysicsEngine } from "@/lib/game/physics-engine"
import { MockCandleSource } from "@/lib/data/mock-candle-source"
import { candleToStone } from "@/lib/data/candle-mapper"
import { generateStoneShape, normalizePoints } from "@/lib/game/stone-generator"
import { getStoneColor } from "@/lib/game/stone-color"
import { DEFAULT_CONFIG } from "@/lib/config"
import { useGameState } from "@/lib/game/game-state"
import { AudioManager } from "@/lib/audio/audio-manager"
// import { AudioManager } from "@/lib/audio/audio-manager"

const CANVAS_WIDTH = 800
const CANVAS_HEIGHT = 600
const GROUND_Y = CANVAS_HEIGHT - 50

export function GameContainer() {
  const engineRef = useRef<PhysicsEngine | null>(null)
  const candleSourceRef = useRef(new MockCandleSource())
  const audioRef = useRef<AudioManager>(new AudioManager())
  const animationFrameRef = useRef<number>()
  const lastTimeRef = useRef<number>(Date.now())
  const dropTimerRef = useRef<NodeJS.Timeout>()
  const containerRef = useRef<HTMLDivElement>(null)
  const marketAlignmentTimeRef = useRef<number>(0)
  const stoneCountRef = useRef<number>(0)
  const dropStartTimeRef = useRef<number>(Date.now())

  const [renderTrigger, setRenderTrigger] = useState(0)
  const [testCounter, setTestCounter] = useState(0)
  const [placingStone, setPlacingStone] = useState<{
    vertices: { x: number; y: number }[]
    x: number
    y: number
    color: string
    startY: number
    targetY: number
  } | null>(null)

  const {
    phase,
    setPhase,
    setDropStartTime,
    physicsActive,
    setPhysicsActive,
    marketAlignment,
    setMarketAlignment,
    towerOffset,
    setTowerOffset,
    placementProgress,
    setPlacementProgress,
    debugMode,
    setDebugMode,
    timeScale,
    setTimeScale,
    stonesPlaced,
    incrementStonesPlaced,
  } = useGameState()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "l" || e.key === "L") {
        const newDebugMode = !debugMode
        setDebugMode(newDebugMode)
        setTimeScale(newDebugMode ? 60 : 1)
        console.log(`[v0] Debug mode ${newDebugMode ? "enabled" : "disabled"} - timeScale: ${newDebugMode ? 60 : 1}x`)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [debugMode, setDebugMode, setTimeScale])

  // Initialize physics engine and audio
  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return
    try {
      console.log("[v0] Starting game container initialization")
      engineRef.current = new PhysicsEngine(CANVAS_WIDTH, CANVAS_HEIGHT, DEFAULT_CONFIG.gravity)

      // Audio temporarily disabled for debugging
      // const initAudio = async () => {
      //   try {
      //     await audioRef.current.initialize()
      //     console.log("[v0] Audio initialized successfully")
      //   } catch (error) {
      //     console.error("[v0] Audio initialization failed:", error)
      //   }
      //   document.removeEventListener("click", initAudio)
      //   document.removeEventListener("keydown", initAudio)
      // }
      // document.addEventListener("click", initAudio)
      // document.addEventListener("keydown", initAudio)

      const gameLoop = () => {
        const now = Date.now()
        const deltaTime = now - lastTimeRef.current
        lastTimeRef.current = now

        if (engineRef.current) {
          if (physicsActive) {
            engineRef.current.update(deltaTime)
          }

          // Update render periodically
          if (Math.random() < 0.1) {
            setRenderTrigger((prev) => prev + 1)
          }

          // Test counter to verify React is working
          setTestCounter((prev) => prev + 1)

          marketAlignmentTimeRef.current += deltaTime / 1000
          const newAlignment = Math.sin(marketAlignmentTimeRef.current * 0.1) * 0.5
          setMarketAlignment(newAlignment)

          if (newAlignment < -0.3 && phase === "stable" && stonesPlaced > 5) {
            console.log("[v0] Market misalignment detected - triggering loss event")
            triggerLossEvent()
          }

          if (phase === "placing" && placingStone) {
            const elapsed = now - dropStartTimeRef.current
            const duration = DEFAULT_CONFIG.placementDuration / timeScale
            const progress = Math.min(elapsed / duration, 1)
            setPlacementProgress(progress)

            // Easing function (ease-in-out)
            const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2

            // Update placing stone position
            const currentY = placingStone.startY + (placingStone.targetY - placingStone.startY) * eased
            setPlacingStone({
              ...placingStone,
              y: currentY,
            })

            // When placement complete, add to stable stack
            if (progress >= 1) {
              finalizePlacement()
            }
          }
        }

        animationFrameRef.current = requestAnimationFrame(gameLoop)
      }

      animationFrameRef.current = requestAnimationFrame(gameLoop)

      console.log("[v0] Game container initialized, scheduling first drop")
      scheduleNextDrop()

      // For testing: also drop a stone immediately to verify generation works
      setTimeout(() => {
        console.log("[v0] Testing immediate stone generation")
        if (typeof document !== 'undefined') {
          document.title = "STONE TEST - " + Date.now()
        }
        dropNextStone()
      }, 1000)

      // Also drop another one after a longer delay for more testing
      setTimeout(() => {
        console.log("[v0] Testing second stone generation")
        dropNextStone()
      }, 5000)

      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current)
        }
        if (dropTimerRef.current) {
          clearTimeout(dropTimerRef.current)
        }
        audioRef.current.dispose()
        // document.removeEventListener("click", initAudio)
        // document.removeEventListener("keydown", initAudio)
      }
    } catch (error) {
      console.error("[v0] Game container initialization failed:", error)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (dropTimerRef.current) {
      clearTimeout(dropTimerRef.current)
      scheduleNextDrop()
    }
  }, [timeScale])

  const scheduleNextDrop = () => {
    const adjustedCadence = DEFAULT_CONFIG.dropCadence / timeScale
    console.log(`[v0] Scheduling next stone drop in ${adjustedCadence}ms (cadence: ${DEFAULT_CONFIG.dropCadence}ms, timeScale: ${timeScale}x)`)
    dropTimerRef.current = setTimeout(() => {
      dropNextStone()
      scheduleNextDrop()
    }, adjustedCadence)
  }

  const dropNextStone = () => {
    if (!engineRef.current) {
      console.log("[v0] Cannot drop stone - engine not initialized")
      return
    }

    // Get next candle
    const candle = candleSourceRef.current.next()
    const stoneParams = candleToStone(candle)

    // Generate stone shape
    const vertices = generateStoneShape(stoneParams)
    const normalizedVertices = normalizePoints(vertices)

    // Get color
    const color = getStoneColor(stoneParams.seed)

    const startY = -100 // Start above screen
    const targetY = GROUND_Y - 40 - stoneCountRef.current * 5 // Stack position

    stoneCountRef.current++

    console.log(`[v0] Dropping stone #${stoneCountRef.current} at position (${CANVAS_WIDTH / 2}, ${startY}) -> (${CANVAS_WIDTH / 2}, ${targetY})`)

    setPlacingStone({
      vertices: normalizedVertices,
      x: CANVAS_WIDTH / 2,
      y: startY,
      color,
      startY,
      targetY,
    })

    dropStartTimeRef.current = Date.now()
    setDropStartTime(dropStartTimeRef.current)
    setPhase("placing")
    setPlacementProgress(0)

    if (debugMode) {
      const priceChange = ((candle.close - candle.open) / candle.open) * 100
      console.log(
        `[v0] Spawn #${stoneCountRef.current} - simulated price ${priceChange > 0 ? "+" : ""}${priceChange.toFixed(1)}%`,
      )
    }
  }

  const finalizePlacement = () => {
    if (!placingStone || !engineRef.current) {
      console.log("[v0] Cannot finalize placement - missing stone or engine")
      return
    }

    // Add stone to physics engine but keep physics disabled
    engineRef.current.addStone(
      placingStone.vertices,
      candleToStone(candleSourceRef.current.peek()),
      placingStone.x,
      placingStone.y,
      placingStone.color,
    )

    setPlacingStone(null)
    setPhase("stable")
    incrementStonesPlaced()

    const newOffset = towerOffset + 5
    setTowerOffset(newOffset)

    console.log(`[v0] Stone finalized - tower height: ${stonesPlaced + 1}, offset: ${newOffset}`)
  }

  const triggerLossEvent = () => {
    if (!engineRef.current) return

    setPhase("loss")
    setPhysicsActive(true)

    const allStones = engineRef.current.getStones()
    const lossFactor = 0.2 // Remove 20% of stones
    const stonesToRemove = Math.floor(lossFactor * allStones.length)

    console.log(`[v0] Loss event - removing ${stonesToRemove} stones`)

    // Remove top stones by enabling physics on them
    for (let i = 0; i < stonesToRemove && i < allStones.length; i++) {
      const stone = allStones[i]
      // Apply upward force to make them tumble
      stone.body.force = { x: (Math.random() - 0.5) * 0.1, y: -0.2 }
    }

    audioRef.current.playTumble()

    // After 3 seconds, disable physics and return to stable
    setTimeout(() => {
      setPhysicsActive(false)
      setPhase("stable")
      console.log("[v0] Loss event complete - returning to stable mode")
    }, 3000)
  }

  return (
    <div ref={containerRef} className="relative touch-none">
      <GameCanvas
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        engineRef={engineRef}
        groundY={GROUND_Y}
        renderTrigger={renderTrigger}
        placingStone={placingStone}
      />
      {debugMode && (
        <div className="absolute top-4 right-4 bg-black/80 text-white px-3 py-2 rounded text-sm font-mono">
          <div>Debug Mode: ON</div>
          <div>TimeScale: {timeScale}x</div>
          <div>Stones: {stonesPlaced}</div>
          <div>Alignment: {marketAlignment.toFixed(2)}</div>
          <div>Phase: {phase}</div>
          <div>Test Counter: {testCounter}</div>
        </div>
      )}
    </div>
  )
}
