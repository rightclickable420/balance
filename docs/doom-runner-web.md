# Doom Runner Web Port Plan

This document tracks the work needed to ship the "real" Doom Runner experience entirely in the browser.

> **Status update (Nov 2025):** PrBoom-Web is now our active engine. The wasm bundle loads inside the Next.js iframe, auto-drive is compiled into the engine, and the React alignment signal already drives lane targets (and can toggle auto-fire) via `WebSetLaneTarget` / `WebSetFireIntent`. The placeholder corridor currently renders as a simple, Freedoom-safe hallway; earlier attempts to layer raised floor strips or bright torches caused rendering glitches, so lane cues will be reintroduced via sprites/ceiling lights or HUD overlays. The GZDoom section below is kept for historical reference only.

### Current state snapshot

- `scripts/prboom-web/build.sh freedoom2` produces `prboom.{js,wasm,data}` with Freedoom Phase 2 + `mr-rails.wad` staged under `/public/gzdoom-runner/`.
- `web_autodrive.c` injects deterministic forward/strafe input each tic; `WebSetAutoDrive`, `WebSetLaneTarget`, and `WebSetFireIntent` are exported to JS and already called from the shell (`public/gzdoom-shell.js`).
- The React `GzdoomRunner` component forwards live alignment data (from the Balance experience) into the iframe, so stance flips immediately influence the Doom runner’s lane target.
- `build_mr_rails.py` emits a looping corridor with a teleporter and a few torches. The latest version purposely avoids overlapping geometry/textures to keep PrBoom’s software renderer stable.
- Audio remains muted via `-nosound`; re-enabling is deferred until the core experience is locked down.

### Current state snapshot

- `scripts/prboom-web/build.sh freedoom2` produces `prboom.{js,wasm,data}` with Freedoom Phase 2 + `mr-rails.wad` staged in `/public/gzdoom-runner/`.
- Auto-drive module (`web_autodrive.c`) synthesizes forward motion and accepts lane/fire commands from JS. The shell sends live alignment updates, so the character visibly tracks the trading stance (even though we’ve reverted to a single-texture floor for stability).
- `build_mr_rails.py` generates a straight looping hallway with edge torches and a teleporter, keeping textures strictly within Freedoom’s set to avoid renderer crashes.
- Lane visualization is pending—initial attempts using overlapping floor sectors produced smearing, so the next approach will rely on sprite props or HUD cues instead of altering the floor plane.
- Audio is temporarily disabled via `-nosound`; we can re-enable once we decide on the final experience.

## Fast-path approach: PrBoom-Web Build

### Why pivot
- GZDoom’s GLES shader stack still emits unsupported `material_*` shaders under WebGL despite software-only CVARs, blocking startup.
- DSDA’s wasm path still expects legacy OpenGL/GLU/SDL_mixer plumbing, which isn’t available in the browser without large patches.
- **Decision**: adopt [`prboom-web`](https://github.com/JSPrismarine/prboom-web), a maintained PrBoom+-based wasm port that already runs entirely in the browser with software rendering, Boom/MBF support, and a JS bridge we can extend.

### High-level plan
1. **Engine selection**
   - Clone `prboom-web` into `scripts/prboom-web/src` (depth 1).
   - Mirror its build scripts (already emsdk-ready) and output artifacts into `public/gzdoom-runner/` so the iframe shell can reuse the same path.
2. **Content pipeline**
   - Author a PWAD (MR-rails) encoding the infinite hallway, auto-runner logic, and left/right portal decisions tied to long/short alignment.
   - Keep Freedoom as the IWAD for licensing; package both into the wasm virtual FS or host alongside the engine.
3. **Bridge + iframe**
   - Reuse `src/components/gzdoom-runner.tsx` and the iframe shell, swapping in the prboom-web bundle (`prboom.js/wasm/data`).
   - prboom-web already exposes console command hooks; extend/rename as needed (`set_route left/right`, `trigger_fire`, etc.) so React can send alignment choices.
4. **Alignment integration**
   - The React trading loop decides which portal to take; it sends the command to the wasm runner.
   - Doom-side scripts read the command (e.g., ACS `GetCVar`) and open the matching door/portal, while enemies auto-spawn and the protagonist auto-fires.
5. **HUD/feedback**
   - Continue rendering the Balance HUD in React; optionally overlay additional stats from the Doom port if needed.

### Immediate actions
- Prototype **lane cues that don’t touch the floor plane** (e.g., sprite props, ceiling light bands, or React HUD overlay). Document the recommended approach and land it in `build_mr_rails.py` or the UI.
- Lay out the first **portal decision room** (every ~30 s of travel) so the corridor has a real branching moment that can later be tied to alignment.
- Extend the JS ↔ auto-drive bridge with an explicit **portal-choice command** (in addition to lane/fire) even if the Doom side only logs it for now.
- Document the daily workflow for new agents:  
  `python scripts/prboom-web/tools/build_mr_rails.py` → `scripts/prboom-web/build.sh freedoom2` → `npm run dev` → load `/gzdoom-shell.html`.

### Customization backlog (Nov 2025)
1. **Lane cues without smearing** – land on the final art direction (sprite props vs. ceiling lights vs. HUD overlay) and implement it safely.
2. **Portal loop & encounters** – add a repeating “decision room,” wire the auto-driver to choose the correct portal, and decide how enemies / pickups reinforce the alignment choice.
3. **Alignment → portal bridge** – extend the wasm bridge so the engine actually toggles portal doors or enemy spawners based on the incoming alignment payload.
4. **Enemy cadence + weapon logic** – determine when to arm auto-fire, how enemies damage the player (e.g., wrong lane ⇒ HP loss), and how this ties back to the Balance game’s penalties.
5. **Audio pass** – once gameplay is locked in, decide whether to re-enable SDL_mixer (via build flags) or implement a WebAudio-backed effect layer.

---

The remaining sections capture the original GZDoom-focused roadmap for context.

## Why GZDoom

Our director, player, HUD, and bridge logic rely heavily on ZScript (e.g., `StaticEventHandler`, custom HUD class, console `pukename`s). Legacy engines (PrBoom, Crispy Doom, Chocolate Doom) do not support ZScript, so they cannot run the current mod without a ground‑up rewrite. Therefore, we target **GZDoom** (or LZDoom) compiled with Emscripten.

## Reference Work

- [`gzdoom-wasm` (experimental)](https://github.com/chocolate-doom/gzdoom-wasm) – community fork that already patches GZDoom to build under Emscripten. Use this as a starting point to avoid repeating SDL/OpenAL fixes.
- [`prboom-web`](https://github.com/JSPrismarine/prboom-web) – mature example of packaging IWADs/PK3s into the Emscripten virtual FS and wiring a canvas loader + JS bridge.
- [`chocolate-doom-web`](https://github.com/kgsws/chocolate-doom-web) – demonstrates hosting Freedoom assets online and exposing a simple launcher UI.

## High-level architecture

```
React (Next.js)
│
├─ Alignment/Trading Engine (existing Zustand stores)
├─ Doom Runner Panel
│    ├─ Loads gzdoom.wasm dynamically (via <canvas>)
│    ├─ Provides loading/errors + start/stop buttons
│    ├─ Calls C bridge for stance/auto commands
│    └─ Reads back status (HP, streak, next bit) for HUD overlay
└─ Balance Stacker Panel (unchanged)
```

## Work Breakdown

1. **Toolchain + Engine fork**
   - Fork upstream `ZDoom/gzdoom` (maintain a `web` branch under `scripts/gzdoom-wasm/src`).
   - Ensure `scripts/gzdoom-wasm/build.sh` documents the emsdk version, wraps `emcmake`, and outputs artifacts into `public/gzdoom-runner/`.

2. **CMake / Emscripten patches**
   - Update GZDoom’s CMake configs to disable unsupported subsystems (FMOD/OpenAL/ALSA/GTK/dbus/glib).
   - Force SDL2 from the emsdk sysroot (`-s USE_SDL=2`), rely on internal copies of bzip2/zmusic/cppdap, and add any missing stubs for `fts`, `stricmp`, etc.

3. **Package content**
   - Bundle `freedoom2.wad` + `market-runner.pk3` via `--preload-file` into `gzdoom.data`.
   - Default args: `-iwad freedoom2.wad -file market-runner.pk3 +map MR01 +vid_fps 60`.

4. **JS ↔ ZScript bridge**
   - Add a wasm-visible shim (e.g., `WebBridge.cpp`) exposing `EMSCRIPTEN_KEEPALIVE void WebCommand(const char* cmd)` that forwards to `C_DoCommand`.
   - (Optional) Emit structured status events (HP, streak, next bit) so React can keep its HUD in sync.

5. **Frontend integration**
   - Use `src/components/gzdoom-runner.tsx` to load `/gzdoom-runner/gzdoom.js`, mount the canvas, display loading/errors, and expose `sendConsoleCommand`.
   - Have `DoomRunnerExperience` call `Module.ccall('WebCommand', ...)` for alignment events once the module is ready.

6. **HUD polish**
   - Keep the Doom-style HUD in React so balance/equity/stance remain visible even if the internal GZDoom HUD is hidden.

7. **Deployment concerns**
   - Ship wasm assets in `public/gzdoom-runner/` (or CDN) with gzip/brotli. Document browser support and caching strategy.

## Open questions

- **Input constraints**: Do we allow mouse/keyboard control inside the canvas or lock to auto-align only? Need to define the minimal control surface.
- **Audio**: keep it? We can ship with muted audio to avoid autoplay restrictions, or provide a toggle.
- **Save data**: not needed; disable writing to the virtual FS to avoid quota issues.
- **File size budget**: Freedoom IWAD + PK3 + engine ≈ 60–80MB compressed. Validate acceptable load time.

## Next steps

1. Fork/clone `ZDoom/gzdoom` into `scripts/gzdoom-wasm/src` and create a dedicated `web` branch.
2. Patch CMake/toolchain files so `emcmake cmake` succeeds without native deps (disable FMOD/OpenAL/ALSA/GTK, hook SDL2 to emsdk).
3. Iterate until `cmake --build` produces `gzdoom.{js,wasm,data}`, then move on to bundling assets and wiring the JS bridge.

## Current build status (2024‑XX‑XX)

- ✅ `build.sh` now stages all runtime assets: it downloads `freedoom2.wad`, copies `market-runner.pk3`, zips the core `gzdoom*.pk3` bundles (brightmaps, lights, widescreen, support), and passes `--preload-file …` so `gzdoom.data` ships with everything the browser needs.
- ✅ Lemon-generated parsers are compiled inline again, and FluidSynth is stubbed out, so the wasm link completes. `gzdoom.{js,wasm,data}` are copied into `public/gzdoom-runner/` on every run.
- ✅ A wasm-visible bridge (`WebCommand`) is exported so the React layer can fire console commands via `Module.ccall`. The loader now boots straight into MR01 with absolute IWAD/PK3 paths.
- 🚧 Next blocker: surface status data (HP, streak, stance) back to React—either via another exported function or a shared memory block—so the web HUD stays in sync.
- 🚧 After that, hook the React panel (`gzdoom-runner.tsx`) into the trading loop (alignment events, auto mode toggles) and overlay the Doom-flavored HUD/UX.

### Immediate tasks

1. Teach the engine to auto-run with our assets (cmdline + WebCommand exported via `EMSCRIPTEN_KEEPALIVE`) and expose helper functions for stance toggles.
2. Build the `gzdoom-runner.tsx` loader so the Next.js UI creates the `<canvas>`, preloads the wasm trio (js/wasm/data), and surfaces lifecycle events (loading, ready, crashed).
3. Sync HUD/trading data: either read structured stats back from the wasm heap or overlay the React HUD while the engine renders the corridor.

Tracking this document ensures we have a clear roadmap while we iterate.
