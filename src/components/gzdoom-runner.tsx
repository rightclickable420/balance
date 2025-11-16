"use client"

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"

export interface DoomRunnerBridge {
  sendConsoleCommand: (command: string) => void
  isReady: () => boolean
  shutdown: () => void
}

interface Props {
  jsPath?: string
  onReadyChange?: (ready: boolean) => void
  laneTarget?: number | null
  fireIntent?: boolean
}

type ShellMessage =
  | { type: "gzdoom-ready" }
  | { type: "gzdoom-progress"; payload: { loaded: number; total: number } }
  | { type: "gzdoom-error"; payload: string }

export const GzdoomRunner = forwardRef<DoomRunnerBridge, Props>(function GzdoomRunner(
  { onReadyChange, laneTarget = null, fireIntent = false },
  ref,
) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null)
  const pendingCommandsRef = useRef<string[]>([])
  const [engineReady, setEngineReady] = useState(false)

  const targetOrigin = useMemo(() => window.location.origin, [])

  useEffect(() => {
    setStatus("loading")
    setError(null)
    setProgress(null)
    setEngineReady(false)
  }, [])

  useEffect(() => {
    onReadyChange?.(engineReady)
  }, [engineReady, onReadyChange])

  useEffect(() => {
    const handleMessage = (event: MessageEvent<ShellMessage>) => {
      if (event.origin !== targetOrigin) return
      if (event.source !== iframeRef.current?.contentWindow) return

      const data = event.data
      if (!data || typeof data !== "object") return
      switch (data.type) {
        case "gzdoom-ready":
          setStatus("ready")
          setProgress(null)
          setEngineReady(true)
          if (pendingCommandsRef.current.length) {
            for (const cmd of pendingCommandsRef.current) {
              iframeRef.current?.contentWindow?.postMessage(
                { type: "gzdoom-command", payload: cmd },
                targetOrigin,
              )
            }
            pendingCommandsRef.current = []
          }
          break
        case "gzdoom-progress":
          setProgress(data.payload)
          break
        case "gzdoom-error":
          console.error("[GZDoom Shell] error", data.payload)
          setError(data.payload)
          setStatus("error")
          setEngineReady(false)
          break
      }
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [targetOrigin])

  useImperativeHandle(ref, () => ({
    sendConsoleCommand: (command: string) => {
      if (!command) return
      if (engineReady) {
        iframeRef.current?.contentWindow?.postMessage({ type: "gzdoom-command", payload: command }, targetOrigin)
      } else {
        pendingCommandsRef.current.push(command)
      }
    },
    isReady: () => engineReady,
    shutdown: () => {
      iframeRef.current?.contentWindow?.postMessage({ type: "gzdoom-shutdown" }, targetOrigin)
      setEngineReady(false)
      setStatus("idle")
    },
  }))

  useEffect(() => {
    if (!iframeRef.current?.contentWindow) {
      console.log('[GzdoomRunner] No iframe contentWindow')
      return
    }
    if (!Number.isFinite(laneTarget) && !fireIntent) {
      console.log('[GzdoomRunner] Skipping message - laneTarget:', laneTarget, 'fireIntent:', fireIntent)
      return
    }
    console.log('[GzdoomRunner] Sending alignment-update:', { lane: laneTarget, fire: fireIntent })
    iframeRef.current.contentWindow.postMessage(
      {
        type: "alignment-update",
        payload: {
          lane: Number.isFinite(laneTarget) ? (laneTarget as number) : undefined,
          fire: fireIntent ? 1 : 0,
        },
      },
      targetOrigin,
    )
  }, [laneTarget, fireIntent, targetOrigin])

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <iframe
        ref={iframeRef}
        src="/gzdoom-shell.html"
        title="GZDoom Runner"
        className="h-full w-full border-0"
        sandbox="allow-scripts allow-same-origin"
      />
      {status !== "ready" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 p-4 text-center text-white">
          {status === "loading" && (
            <div className="flex w-full max-w-xs flex-col items-center gap-3">
              <span className="text-lg font-semibold">Loading Doom Runner engine…</span>
              {progress ? (
                <>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-yellow-300 to-rose-400 transition-all"
                      style={{ width: `${Math.min(100, Math.round((progress.loaded / progress.total) * 100))}%` }}
                    />
                  </div>
                  <span className="text-xs text-white/70">
                    {Math.round(progress.loaded / 1024 / 1024)} MB / {Math.round(progress.total / 1024 / 1024)} MB
                  </span>
                </>
              ) : (
                <span className="text-sm text-white/70">Large download (~60MB). Keep this tab focused.</span>
              )}
            </div>
          )}
          {status === "error" && (
            <div className="space-y-2">
              <p className="text-lg font-semibold text-rose-200">Engine not available</p>
              <p className="text-sm text-white/70">
                Build the wasm bundle via <code>scripts/prboom-web/build.sh</code> and ensure
                <code className="mx-1">public/gzdoom-runner/prboom.js</code> exists.
              </p>
              {error && <p className="text-xs text-rose-300">{error}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
})
