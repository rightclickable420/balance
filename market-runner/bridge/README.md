# Market Runner Bridge Helpers

Two lightweight helpers live here so you can drive the auto-alignment mode without installing heavyweight automation stacks.

## autobridge-node

- Pure Node.js (no native deps) that plays back JSON/CSV beat schedules.
- It prints the relevant console commands (e.g., `pukename MR_SetAlign 1`) to STDOUT at the correct timestamps.
- Copy the emitted block, focus the running GZDoom window, open the console (`~`), paste, press Enter.

## autobridge-ahk

- AutoHotkey (v1) script for Windows.
- `Ctrl+Alt+1/2/3` send Flat/Long/Short via the console.
- `Ctrl+Alt+[` and `Ctrl+Alt+]` tweak Sigma; `Ctrl+Alt+;` and `Ctrl+Alt+'` tweak Loss.
- The script pastes the corresponding `pukename` commands into the focused GZDoom window.

Both options simply orchestrate console commands. They never hook game memory and are easy to audit.
