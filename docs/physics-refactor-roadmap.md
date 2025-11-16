# Balance Physics Refactor Roadmap

## 1. Purpose & Outcomes
- **Primary goal**: deliver an intuitive “always-on stance” experience where the tower’s stability reflects alignment with market data without feeling scripted.
- **Success criteria**:
  - Hover and placed stones share a consistent contact reference with no rotational drift.
  - Aligned stances feel calm and forgiving; misalignment produces progressive instability that the player can sense.
  - Loss events are proportional, predictable, and recoverable.

## 2. Current Pain Points
- Hover stones inherit compounded angle error; settling often snaps or flips.
- Physics forces are binary (static vs tumble) so players experience sudden punishment.
- No telemetry loop: we can’t observe or tune per-frame alignment vs tower response.

## 3. Target Architecture
```
Market Data → Feature Mapping → Alignment Engine
                                ↓
                        Stabilizer / Disturber
                                ↓
                     Physics Engine (Matter.js)
                                ↓
                      Visual + Audio Feedback
```

### 3.1 Baseline Physics
- Keep Matter.js as source of truth.
- Represent stones bottom-anchored so rotations are measured relative to the active contact surface.
- Maintain `stackOrientation` (top surface normal + position) updated after each settle.

### 3.2 Alignment Engine
- Continuous `alignmentScore ∈ [-1, 1]` derived from:
  - Stance vs fused direction.
  - Signal confidence / confluence.
  - Regime & volatility modulation.
- Smoothed using exponential decay; include derivative to detect shifts.
- Manage an `energyBudget` accumulator that:
  - Decays toward zero each frame.
  - Adds positive energy when misaligned, subtracts when aligned.
  - Triggers proportional loss when > threshold (respect cooldown).

### 3.3 Stabilizer Layer (alignment ≥ 0)
- Micro-centering impulses toward local balance.
- Contact friction multiplier > 1.
- Damping boost on bodies with low velocity (critical damping feel).
- Optional “magnetic snap” when new stone lands (impulse along contact normal).

### 3.4 Disturber Layer (alignment < 0)
- Horizontal shear impulses at top bodies proportional to misalignment and energy.
- Friction reduction and slight restitution increase to encourage slip.
- Gravity bias / torque applying slow lean (“tilt whisper”).
- Micro jitter during volatility spikes.

### 3.5 Loss Event Handling
- When energy threshold crossed:
  - Select top N stones (bounded) and release with tuned impulses.
  - Freeze survivors, apply stabilizer to remaining stack for `LOSS_COOLDOWN_MS`.
  - Reset part of energy budget to avoid cascading losses.

## 4. Implementation Phases

### Phase A – Telemetry & Geometry Foundation
1. Refactor `stone-generator` to create bottom-anchored geometry and expose face normals.
2. Extend `PhysicsEngine` to report per-stone contact data, angular velocity, and applied helper forces (for debug).
3. Instrument debug overlays (normals, energy, alignment) toggled via `debugMode`.
   - ✅ Bottom-anchored geometry and telemetry buffer shipped (May 2025).
   - ✅ Debug UI now shows body/contact counts and alignment score/velocity.

### Phase B – Alignment Engine
1. ✅ Alignment score pipeline with exponential smoothing and stance-aware updates.
2. Introduce `energyBudget` with configurable rates (`EROSION_RATE`, `RECOVERY_RATE`, `THRESHOLD`, `COOLDOWN_MS`).
   - ✅ Baseline accumulator, volatility scaling, and cooldown reset on loss events implemented.
3. Surface score/energy to Game UI for tuning (hidden behind debug).

### Phase C – Stabilizer & Disturber
1. ✅ `PhysicsEngine` now accepts stabilizer/disturber strengths plus gravity bias, applying continuous damping/friction boosts and shear nudges.
2. ✅ Alignment + energy feed force strengths each frame; debug HUD exposes current values.
3. ✅ Tune helper curves (target: presets for calm/stormy) and add centering impulses per contact.
   - Stabilizer pass now applies anchored bottom-face centering with passive tick window (Jun 2025).
   - Disturber shear/lean scales with volatility-driven jitter and updated force curves.
4. Validate telemetry vs perceived behavior in scripted scenarios (aligned, flip, volatility spike).
   - 🔄 Debug hotkeys (1/2/3) now drive scripted alignment + volatility cases with HUD readout (Jun 2025).
5. 🔄 Stabilize stacking pipeline:
   - Initial pillar now pre-settles with helper-free micro steps before gameplay begins.
   - Passive tick window disabled unless helpers are active; hover transitions level body orientation.
   - Pending: ensure hover stones remain perfectly horizontal during geometry morphs; refine drum-tight settling after each placement.
   - Pending: capture `stackOrientation` payload (surface normal + support point) after every settle and re-seed hover stones to that frame before helpers engage.
   - Pending: add pre-drop support envelope check (hover center-of-mass vs. current top polygon) to warn when the player drifts off the "safe" trade side and clamp auto-drop timing accordingly.

### Phase D – Loss Events & Recovery
1. ✅ Energy threshold now triggers loss events with proportional severity and cooldown reset.
2. Implement proportional drop logic respecting cap & cooldown.
3. Ensure stack orientation recalculates post-loss and hover stones realign.

### Phase E – Polish & Feedback
1. Audio/visual cues tied to alignment (e.g. hum when calm, tension tone during erosion).
   - 🔄 Energy-phase aura overlay + noise cue hooks landed (Jun 2025); expand to stance-specific motifs.
2. Particle or glow feedback on contact edges when entering stabilizer mode.
3. Document tuning presets (“Calm”, “Stormy”, etc.).
4. Introduce stack intuition aids:
   - Extend debug overlays to render telemetry-derived contact normals and active support footprint.
   - Surface hover-vs-stack alignment warnings (color pulse, timer clamp) when support envelope is breached.
   - Feed stack stance vs. market stance reconciliation into UI prompts before auto-drop.

## 5. Parameter Guide (initial ranges)
| Dial          | Symbol                | Suggested Range       | Notes                              |
|---------------|-----------------------|-----------------------|------------------------------------|
| Calm vs Storm | `BASE_DAMPING`        | 0.70 – 1.25           | Higher in aligned regimes.         |
| Grip          | `FRICTION_BOOST`      | +0.0 – +0.35          | Drop to -0.20 when misaligned.     |
| Bias          | `GRAVITY_BIAS`        | 0 – 0.12 g            | Direction determined by signal.    |
| Resilience    | `ENERGY_DECAY_RATE`   | 0.25 – 0.40 per sec   | Higher when aligned/flat stance.   |
| Erosion       | `ENERGY_ACCUM_RATE`   | 0.60 – 0.90 per sec   | Scales with misalignment strength. |
| Vol Jitter    | `ENERGY_VOL_MULT`     | 0.8 – 1.2             | Boosted jitter during spikes.      |
| Loss Cap      | `MAX_LOSS_STONES`     | 1 – 3                 | Ensure recoverability.             |

## 6. Testing Plan
- **Harness**: scripted market scenarios (aligned, flip, prolonged misalignment, volatility spike).
- **Metrics to capture**: tower height, energy budget, alignment score, number of stabilizer/disturber interventions, loss frequency.
- **QA focus**: ensure hysteresis prevents rapid toggling; verify cooldown prevents back‑to‑back losses; confirm flat stance behaves neutrally.

## 7. Risks & Mitigations
- **Over-fitting** to mock data → keep parameters data-driven, test with multiple feeds.
- **Performance**: extra per-frame adjustments; batch operations inside physics step.
- **Complex tuning**: ship presets + debug overlays; keep parameters centralized in config.
- **Player trust**: ensure interventions remain subtle—no sudden teleports or force spikes.

## 8. Next Steps
1. Review and ratify the roadmap with the team.
2. Continue Phase C Step 5: finalize hover leveling + post-drop settle behaviour, stackOrientation seeding, and support envelope warnings.
3. Kick off Phase E Step 4: ship the stack intuition overlays and hover alignment cues that connect telemetry to player feedback.
4. Investigate seating regression: first post-hover stone still inserts beneath the topper despite snap animation targeting the stack surface (see current session notes).
5. Re-introduce passive helper modes once stability confirmed; expand telemetry logging for field tuning.

> _Appendix_: expand with diagrams or tuning cheat sheet once Phase A lands.

## 9. Doom Runner Web Port Direction (New)
- **Problem recap**: GZDoom + GLES nightly builds fail WebGL shader compilation (dynamic loops, unsupported contexts). Weeks of tweaking args/configs haven’t produced a stable browser build, blocking the auto-runner experience.
- **Strategy shift**: adopt a lightweight Doom port that already targets WASM/software rendering (PrBoom+/DSDA-Doom wasm forks) instead of forcing the full GZDoom GLES stack.
- **Benefits**:
  - Deterministic software renderer → no WebGL shader hurdles.
  - Straightforward IWAD/PWAD pipeline for Freedoom + custom Market Runner content.
  - Smaller code surface; easier to expose API hooks for binary path decisions (long/short alignment).
- **Execution plan**:
  1. **Engine baseline**: clone a maintained wasm-ready PrBoom+/dsda port, build once with Emscripten, and drop the output into `public/gzdoom-runner/` (reusing the existing iframe shell).
  2. **Content authoring**: craft a PWAD that encodes the infinite “on-rails” map—auto-movement, scripted firing, and left/right decision portals tied to long/short states.
  3. **Bridge API**: expose a simple command channel (console commands/CVARs) so the React layer can instruct the engine which branch to take or when to trigger encounters.
  4. **Market integration**: map real-time alignment/volatility data to portal choices and encounter pacing; keep Doom visuals recognizable while the gameplay mirrors alignment decisions.
- **Next actions**:
  - Evaluate available wasm repos (dsda-doom, classic-runners) and pick the one with the cleanest build story.
  - Prototype the iframe swap using the new wasm bundle to confirm load/perf in the existing Next.js shell.
  - Kick off PWAD scripting to prove the “rail shooter with binary portals” loop before layering in market data.
