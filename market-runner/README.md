# Market Runner

Market Runner is a self-contained GZDoom mod that turns Doomguy into a market maker sprinting through an infinite corridor while tracking an alignment bitstream. You juggle three states:

- **Long (1)**
- **Short (2)**
- **Flat (0)**

On every beat the director reveals the next bit. Match it to stay aligned and auto-liquidate a few front enemies. Miss it and every live enemy fires a loss volley that eats into your "position health" (player HP). Going Flat pauses spawns and gently heals you back to 80 HP, but it also halts score/streak gains.

## Controls

| Action | Default Binding | Description |
| --- | --- | --- |
| Toggle Long/Short | `mr_togglels` (bind in GZDoom menu) | Flips between Long and Short. If you are Flat, it selects Long first. |
| Toggle Flat | `mr_toggleflat` | Enter/exit the Flat state. When enabled, spawns pause and you heal slowly. |
| Toggle Auto Mode | `mr_automode` | Allows external bridges to set the current state via console commands. |

Auto mode exposes commands for external tooling:

```
pukename MR_SetAlign 0   # Flat
pukename MR_SetAlign 1   # Long
pukename MR_SetAlign 2   # Short
pukename MR_SetSigma 0.65
pukename MR_SetLoss 0.45
```

## Loop cadence

- Beat spacing uses `lerp(0.7s, 2.0s, 1-σ)` so higher σ speeds the game up.
- Auto-kills per aligned beat = `1 + floor(σ * 2)`.
- Loss damage = `clamp((0.5σ + 0.5L) * 40, 1, 40)`.
- Flat heals 1 HP/tic until 80 HP and pauses enemy spawns.

## Running the mod

1. Zip the contents **inside** `pk3/` (not the folder itself) into `market-runner.pk3`.
2. Launch with GZDoom: `gzdoom -file market-runner.pk3 +map MR01`.
3. Bind the custom keys in the GZDoom menu or edit `autoexec.cfg`.
4. Optionally run one of the bridge helpers from `bridge/` to pipe external signals into the console.

## Daily seed idea

The director exposes `MR_SetAlign`, `MR_SetSigma`, and `MR_SetLoss`. Swap `ChooseBit()` in `Director.zs` with a deterministic stream loader (CSV lump, RNG seeded by date, etc.) to generate daily ladders.

## Open assets

The packaged sprites, sounds, and texture patches are sourced from the **Freedoom** project (BSD-3-Clause). See `THIRD_PARTY.md` (repo root) and `pk3/docs/FREEDOOM_LICENSE.txt` (bundled inside the PK3) for attribution details if you redistribute or customize this project.

## File layout

```
market-runner/
  README.md
  build-and-run.md
  market-runner.pk3        # placeholder instructions
  pk3/                     # everything needed for the pk3
  bridge/                  # optional external automation hooks
```
