# Third-party Attributions

## Freedoom (BSD-3-Clause)

Source: https://github.com/freedoom/freedoom (commit 1791ff4dca611cc3ca0e4d06597211d4ef5e487b, 2025-07-24)

The following assets are copied from the Freedoom project and remain under the Freedoom BSD-style license (see `THIRD_PARTY/FREEDOOM_LICENSE.txt`):

- `pk3/sprites/ENEMA0.png` – derived from `sprites/possa1.png`
- `pk3/sprites/MRPUFFA0.png` – derived from `sprites/puffa0.png`
- `pk3/sounds/ui_flat.wav` – `sounds/dsitemup.wav`
- `pk3/sounds/ui_switch.wav` – `sounds/dsswtchn.wav`
- `pk3/sounds/volley.wav` – `sounds/dsplasma.wav`
- `pk3/textures/freedoom-brick.png` – `patches/aqbrik01.png`
- `pk3/textures/freedoom-floor.png` – `flats/aqf005.png`

Please retain the license below when redistributing.

## Freedoom Phase 2 IWAD (BSD-3-Clause)

Source: https://github.com/freedoom/freedoom/releases/download/v0.12.1/freedoom-0.12.1.zip

`scripts/gzdoom-wasm/build.sh` downloads `freedoom2.wad` during the wasm build and packages it into `gzdoom.data` so that the browser runtime has a legal base IWAD. The binary contents remain under the Freedoom BSD-style license (see `THIRD_PARTY/FREEDOOM_LICENSE.txt`). Do not remove the attribution when hosting the wasm artifacts.
