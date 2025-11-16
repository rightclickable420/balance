;(function () {
  const debug = (...args) => console.debug("[WebPrBoom Shell]", ...args)

  function resolveTargetOrigin() {
    if (window.parent && window.parent !== window) {
      try {
        const parentOrigin = window.parent.location?.origin
        if (parentOrigin) return parentOrigin
      } catch {
        // Cross-origin parent; fall back to our own origin.
      }
    }
    return window.location.origin
  }

  const targetOrigin = resolveTargetOrigin()
  debug("Resolved target origin", targetOrigin)

  const sendMessage = (type, payload) => {
    try {
      window.parent?.postMessage({ type, payload }, targetOrigin)
    } catch (error) {
      console.error("[WebPrBoom] Failed to postMessage to parent", error)
    }
  }

  const canvas = document.getElementById("gzdoom-canvas")
  if (!canvas) {
    const message = "Shell canvas element not found."
    console.error("[WebPrBoom]", message)
    sendMessage("gzdoom-error", message)
    return
  }

  let moduleInstance = null
  let lastAlignmentPayload = null
  let unloadPatched = false

  const patchUnloadListener = () => {
    if (unloadPatched) return
    const SDL = globalThis.SDL
    if (!SDL || typeof SDL.receiveEvent !== "function") return
    try {
      window.removeEventListener("unload", SDL.receiveEvent)
      window.addEventListener("pagehide", SDL.receiveEvent)
      unloadPatched = true
      debug("Redirected SDL unload handler to pagehide")
    } catch (error) {
      console.warn("[WebPrBoom] Failed to rewire unload handler", error)
    }
  }

  const moduleConfig = {
    canvas,
    noInitialRun: false,
    print: (...args) => debug(...args),
    printErr: (...args) => {
      const message = args.join(" ")
      if (/^preload plugin/.test(message) || message.startsWith("Downloading data")) {
        debug(message)
        return
      }
      console.error("[WebPrBoom]", message)
      sendMessage("gzdoom-error", message)
    },
    setStatus: (msg) => {
      const match = /Downloading data\.\.\. \((\d+)\/(\d+)\)/.exec(msg)
      if (match) {
        sendMessage("gzdoom-progress", { loaded: Number(match[1]), total: Number(match[2]) })
      }
    },
    locateFile: (path) => `/gzdoom-runner/${path}`,
    arguments: ["-iwad", "/freedoom.wad", "-file", "/mr-rails.wad", "-warp", "1", "-nomouse", "-nosound", "-complevel", "2", "-skill", "3"],
    preRun: [
      () => {
        patchUnloadListener()
      },
    ],
  }

  const handleCommand = (command) => {
    if (!command) return
    if (!moduleInstance) {
      debug("Command queued but module not ready", command)
      return
    }
    debug("Console command received (not yet wired):", command)
  }

  const applyAlignmentPayload = (payload) => {
    debug("applyAlignmentPayload called", payload, "moduleInstance:", !!moduleInstance)
    if (!moduleInstance || !payload) return
    const lane = typeof payload.lane === "number" ? payload.lane : null
    const fire = typeof payload.fire === "number" ? payload.fire : null
    debug("Extracted lane:", lane, "fire:", fire)
    if (lane !== null) {
      try {
        debug("Calling WebSetLaneTarget with", lane)
        // Try with underscore prefix (C name mangling)
        if (typeof moduleInstance._WebSetLaneTarget === 'function') {
          debug("Using _WebSetLaneTarget direct call")
          moduleInstance._WebSetLaneTarget(lane)
        } else if (moduleInstance.ccall) {
          debug("Using ccall")
          moduleInstance.ccall("WebSetLaneTarget", null, ["number"], [lane])
        } else {
          debug("No method available to call WebSetLaneTarget")
        }
        debug("WebSetLaneTarget called successfully")
      } catch (error) {
        console.warn("[WebPrBoom] lane call failed", error)
      }
    }
    if (fire !== null) {
      try {
        moduleInstance.ccall?.("WebSetFireIntent", null, ["number"], [fire ? 1 : 0])
      } catch (error) {
        console.warn("[WebPrBoom] fire toggle failed", error)
      }
    }
  }

  window.addEventListener("message", (event) => {
    if (event.origin !== targetOrigin) return
    const { type, payload } = event.data || {}
    debug("Message received:", type, payload)
    if (type === "gzdoom-command") {
      handleCommand(payload)
    }
    if (type === "alignment-update") {
      debug("Received alignment-update", payload)
      lastAlignmentPayload = payload
      if (moduleInstance) {
        applyAlignmentPayload(payload)
      } else {
        debug("No moduleInstance yet, stored for later")
      }
    }
    if (type === "balance-hud-update") {
      debug("Received balance-hud-update", payload)
      if (moduleInstance && typeof moduleInstance._WebSetBalanceHUD === 'function') {
        const { equity, balance, solPrice, streakGainPct, suddenLoss } = payload
        debug("Calling WebSetBalanceHUD:", equity, balance, solPrice, streakGainPct, suddenLoss)
        moduleInstance._WebSetBalanceHUD(
          equity || 0,
          balance || 0,
          solPrice || 0,
          streakGainPct || 0,
          suddenLoss ? 1 : 0
        )
      }
    }
    if (type === "market-indicators-update") {
      debug("Received market-indicators-update", payload)
      if (moduleInstance && typeof moduleInstance._WebSetMarketIndicators === 'function') {
        const { momentum, breadth, volatility, volume } = payload
        debug("Calling WebSetMarketIndicators:", momentum, breadth, volatility, volume)
        moduleInstance._WebSetMarketIndicators(
          momentum || 50,
          breadth || 50,
          volatility || 50,
          volume || 50
        )
      }
    }
    if (type === "enemy-spawn") {
      debug("Received enemy-spawn", payload)
      if (moduleInstance && typeof moduleInstance._WebSpawnEnemies === 'function') {
        const { lane, enemyType } = payload
        debug("Calling WebSpawnEnemies:", lane, enemyType)
        moduleInstance._WebSpawnEnemies(lane, enemyType || 0)
      }
    }
    if (type === "gzdoom-shutdown") {
      moduleInstance?.exit?.(0)
      moduleInstance = null
    }
  })

  function bootstrap() {
    if (typeof createPrBoomModule !== "function") {
      const message = "prboom.js did not expose createPrBoomModule"
      console.error("[WebPrBoom]", message)
      sendMessage("gzdoom-error", message)
      return
    }

    createPrBoomModule(moduleConfig)
      .then((mod) => {
        moduleInstance = mod
        patchUnloadListener()
        debug("Module ready")
        try {
          moduleInstance.ccall?.("WebSetAutoDrive", null, ["number", "number", "number", "number", "number"], [1, 1, 0, 0, 0])
        } catch (err) {
          console.warn("[WebPrBoom] Failed to configure auto-drive", err)
        }

        // Give super shotgun on startup (weapon type 8)
        // Wait a bit for the game to fully initialize
        setTimeout(() => {
          try {
            if (typeof moduleInstance._WebGiveWeapon === 'function') {
              debug("Giving super shotgun (weapon 8)")
              moduleInstance._WebGiveWeapon(8)
            } else {
              debug("WebGiveWeapon not available")
            }
          } catch (err) {
            console.warn("[WebPrBoom] Failed to give weapon", err)
          }
        }, 2000)

        // Periodically ensure super shotgun is selected (weapon 8)
        // This prevents weapon changes from pickups
        setInterval(() => {
          try {
            if (typeof moduleInstance._WebSetWeapon === 'function') {
              moduleInstance._WebSetWeapon(8) // Force super shotgun selection
            } else if (typeof moduleInstance._WebGiveWeapon === 'function') {
              moduleInstance._WebGiveWeapon(8) // Fallback: give and select
            }
          } catch (err) {
            // Silent fail - not critical
          }
        }, 5000) // Check every 5 seconds

        if (lastAlignmentPayload != null) {
          applyAlignmentPayload(lastAlignmentPayload)
        }
        sendMessage("gzdoom-ready")
      })
      .catch((error) => {
        console.error("[WebPrBoom] bootstrap failed", error)
        sendMessage("gzdoom-error", error?.message || String(error))
      })
  }

  const script = document.createElement("script")
  script.src = "/gzdoom-runner/prboom.js"
  script.async = true
  script.onload = () => {
    debug("prboom.js loaded")
    bootstrap()
  }
  script.onerror = () => {
    const message = "Failed to load prboom.js"
    console.error("[WebPrBoom]", message)
    sendMessage("gzdoom-error", message)
  }
  document.body.appendChild(script)

  window.addEventListener("beforeunload", () => {
    moduleInstance?.exit?.(0)
  })
})()
