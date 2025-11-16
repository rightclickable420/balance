# webprboom build notes

We’re switching to the [`webprboom`](https://github.com/raz0red/webprboom) fork (already wired for Emscripten + software rendering) so we can run a Doom IWAD/PWAD in the browser without patching DSDA’s OpenGL stack.

## Repo layout
- `scripts/prboom-web/src` – shallow clone of upstream.
- Upstream already ships a `build_wasm.sh` script plus a `frontend/` loader. We’ll wrap that with our own script to copy the wasm artifacts into `public/gzdoom-runner/`.

## Next steps
1. Study the upstream `build_wasm.sh` (and/or `frontend/Makefile`) to see which emsdk version and flags they expect.
2. Write `scripts/prboom-web/build.sh` that:
   - Ensures emsdk is active.
   - Builds the wasm target via upstream scripts.
   - Packages Freedoom + our future PWAD (e.g. `mr-rails.wad`) either via the provided `data/` directory or Emscripten `--preload-file`.
   - Copies the resulting `webprboom.js/wasm/data` (or similarly named trio) into `public/gzdoom-runner/`.
3. Update `public/gzdoom-shell.js` / React loader to import the new bundle (e.g. `createWebPrBoomModule`) and expose the same `WebCommand` interface.
