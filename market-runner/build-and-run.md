# Build and Run

## 1. Package the PK3

From inside `market-runner/pk3`, zip *all* contents (files and folders) — including `docs/FREEDOOM_LICENSE.txt` — into the root of a new archive named `market-runner.pk3`:

```bash
cd market-runner/pk3
zip -r ../market-runner.pk3 .
```

(Any ZIP tool works; a PK3 is just a renamed ZIP.)

## 2. Launch GZDoom

```bash
gzdoom -file market-runner.pk3 +map MR01
```

Bind the custom controls (under "Market Runner" section) or edit `autoexec.cfg` with:

```
bind l "mr_togglels"
bind f "mr_toggleflat"
bind a "mr_automode"
```

## 3. Enable/disable Auto Mode

- Toggle with `mr_automode` key or run `pukename MR_ToggleAuto`.
- When Auto Mode is on, the bridge tools may call:
  - `pukename MR_SetAlign <0|1|2>`
  - `pukename MR_SetSigma <0..1>`
  - `pukename MR_SetLoss <0..1>`

## 4. Bridge helpers

- `bridge/autobridge-node`: Plays back CSV/JSON timelines and prints console commands you can paste into GZDoom.
- `bridge/autobridge-ahk`: Windows-only AutoHotkey script that fires the same commands via hotkeys (Ctrl+Alt+1/2/3, etc.).

## 5. Testing checklist

1. Launch MR01 and verify MR_Player is the default class (status bar + HUD appear).
2. Use `mr_togglels` to flip Long/Short; watch HUD banner update.
3. Use `mr_toggleflat` to enter Flat; enemies stop spawning and HP ticks toward 80.
4. Force bits via console:
   - `pukename MR_SetSigma 0.9`
   - `pukename MR_SetLoss 0.7`
   - `pukename MR_SetAlign 1`
5. Confirm aligned beats auto-kill fodder, misaligned beats trigger volley damage, and liquidation (HP<=0) restarts the level with the fade overlay.
