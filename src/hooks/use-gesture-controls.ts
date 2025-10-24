"use client"

import type React from "react"

import { useEffect, useRef } from "react"
import { useGesture } from "@use-gesture/react"

export interface GestureHandlers {
  onFlip: () => void
  onDiscard: () => void
  onSetLong?: () => void
  onSetShort?: () => void
  onSetFlat?: () => void
}

export function useGestureControls(elementRef: React.RefObject<HTMLElement>, handlers: GestureHandlers) {
  const { onFlip, onDiscard, onSetLong, onSetShort, onSetFlat } = handlers
  const lastTapRef = useRef<number>(0)

  // Gesture handling
  useGesture(
    {
      // Tap/click to flip
      onClick: () => {
        const now = Date.now()
        // Debounce rapid clicks
        if (now - lastTapRef.current > 100) {
          onFlip()
          lastTapRef.current = now
        }
      },

      // Swipe to discard
      onDrag: ({ movement: [mx, my], velocity: [vx], cancel }) => {
        // Detect horizontal swipe (left or right)
        const isHorizontalSwipe = Math.abs(mx) > Math.abs(my) && Math.abs(mx) > 50
        const isFastSwipe = Math.abs(vx) > 0.5

        if (isHorizontalSwipe && isFastSwipe) {
          onDiscard()
          cancel() // Stop tracking this gesture
        }
      },
    },
    {
      target: elementRef,
      eventOptions: { passive: false },
    },
  )

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowUp": // Up arrow = Long
          e.preventDefault()
          if (onSetLong) onSetLong()
          break
        case "ArrowDown": // Down arrow = Short
          e.preventDefault()
          if (onSetShort) onSetShort()
          break
        case " ": // Space = Flat
          e.preventDefault()
          if (onSetFlat) onSetFlat()
          break
        case "f": // F to flip (legacy)
          e.preventDefault()
          onFlip()
          break
        case "d": // D to discard (legacy)
        case "Delete":
        case "Backspace":
          e.preventDefault()
          onDiscard()
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onFlip, onDiscard, onSetLong, onSetShort, onSetFlat])
}
