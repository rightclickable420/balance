#!/usr/bin/env python3
"""Simplified corridor generator (pre-lane state)."""
from __future__ import annotations
import subprocess
from pathlib import Path
from omg import WAD
from omg.mapedit import MapEditor, Thing, Sector, Sidedef

PRBOOM_ROOT = Path(__file__).resolve().parents[1]
TOOLS_DIR = PRBOOM_ROOT / "tools"
ASSETS_DIR = PRBOOM_ROOT / "assets" / "mr-rails"
RAW_WAD = ASSETS_DIR / "_mr-rails-raw.wad"
FINAL_WAD = ASSETS_DIR / "mr-rails.wad"
ZDBSP_BIN = TOOLS_DIR / "zdbsp" / "build" / "zdbsp"


def set_skill_flags(thing: Thing) -> None:
    thing.easy = thing.medium = thing.hard = 1
    thing.solo = thing.multiplayer = 1


def build_corridor(editor: MapEditor) -> None:
    width = 512
    # Long corridor so the end wall is never visible when teleporting
    corridor_length = 20000
    scroll_special = 224
    lane_width = width // 3  # 3 lanes: ~170 units each

    # Create 3 simple, continuous lane sectors - no subdivisions
    # Left lane (x: 0-170) - SHORT position (red blood)
    left_lane = Sector(
        z_floor=0,
        z_ceil=192,
        light=192,
        tx_floor="BLOOD1",
        tx_ceil="CEIL3_5",
        tag=0,
        type=0,
    )
    editor.draw_sector(
        [(0, 0), (lane_width, 0), (lane_width, corridor_length), (0, corridor_length)],
        sector=left_lane,
        sidedef=Sidedef(tx_mid="STONE2", tx_up="STONE2", tx_low="STONE2"),
    )

    # Center lane (x: 171-341) - FLAT position (checkerboard)
    center_lane = Sector(
        z_floor=0,
        z_ceil=192,
        light=192,
        tx_floor="FLAT5_4",
        tx_ceil="CEIL3_5",
        tag=0,
        type=0,
    )
    editor.draw_sector(
        [(lane_width, 0), (lane_width * 2, 0), (lane_width * 2, corridor_length), (lane_width, corridor_length)],
        sector=center_lane,
        sidedef=Sidedef(tx_mid="STONE2", tx_up="STONE2", tx_low="STONE2"),
    )

    # Right lane (x: 342-512) - LONG position (green nukage)
    right_lane = Sector(
        z_floor=0,
        z_ceil=192,
        light=192,
        tx_floor="NUKAGE1",
        tx_ceil="CEIL3_5",
        tag=0,
        type=0,
    )
    editor.draw_sector(
        [(lane_width * 2, 0), (width, 0), (width, corridor_length), (lane_width * 2, corridor_length)],
        sector=right_lane,
        sidedef=Sidedef(tx_mid="STONE2", tx_up="STONE2", tx_low="STONE2"),
    )

    player = Thing(x=width // 2, y=192, type=1, angle=90)
    set_skill_flags(player)
    editor.things.append(player)

    print(f"Simple corridor created: {corridor_length} units long, 3 lanes")
    print("Manual teleportation will be implemented in C code")


def ensure_tools() -> None:
    if not ZDBSP_BIN.exists():
        raise SystemExit("Build zdbsp first")


def write_wad(editor: MapEditor) -> None:
    wad = WAD()
    wad.maps["MAP01"] = editor.to_lumps()
    wad.to_file(str(RAW_WAD))


def run_zdbsp() -> None:
    subprocess.run([str(ZDBSP_BIN), "-m", "MAP01", "-o", str(FINAL_WAD), str(RAW_WAD)], check=True)
    RAW_WAD.unlink(missing_ok=True)


def main() -> None:
    ensure_tools()
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    editor = MapEditor()
    build_corridor(editor)
    write_wad(editor)
    run_zdbsp()
    print(f"Wrote placeholder corridor to {FINAL_WAD}")


if __name__ == "__main__":
    main()
