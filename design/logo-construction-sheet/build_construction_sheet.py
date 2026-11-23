#!/usr/bin/env python3
"""Logo Construction Sheet — one working canvas for designing a logo.

Every grid system sits on its own Illustrator layer, all locked to the same
centre and the same 1000 x 1000 construction square. Toggle layers on/off in
the Layers panel and draw on the empty 'LOGO ARTWORK' layer at the top.

Hidden layers are written with style="display:none", which Illustrator
imports as hidden layers.

Uses the grid definitions from ../grid-library/build_grid_library.py.

Run:  python3 build_construction_sheet.py
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "grid-library"))
import build_grid_library as gl  # noqa: E402

SIZE = 1200          # artboard
C = SIZE / 2         # centre
K = 5.0              # +/-100 grid units -> +/-500 px construction square

GUIDE = 'fill="none" stroke="#a6a6a6" stroke-width="0.75"'
SUB_KEY = 'fill="none" stroke="#5a5a5a" stroke-width="1"'
MASTER = 'fill="none" stroke="#000000" stroke-width="1.5"'

# (layer name, grid function, visible by default)
LAYERS = [
    ("Square grid 12 x 12", gl.g_square(12, 4), True),
    ("Rule of thirds + diagonals", gl.g_thirds, False),
    ("Phi grid", gl.g_phi_grid, False),
    ("Golden spiral", gl.g_golden_spiral, False),
    ("Concentric circles", gl.g_concentric(10, True), False),
    ("Radial 24", gl.g_radial(24, [100 * i / 6 for i in range(1, 6)]), False),
    ("Circle + square + triangle", gl.g_nested_inscribed, False),
    ("Corner arcs", gl.g_corner_arcs, False),
    ("Isometric", gl.g_isometric(20), False),
    ("Triangular lattice", gl.g_tri_lattice, False),
    ("Hexagon construction", gl.g_hex_construction, False),
    ("Honeycomb", gl.g_honeycomb(3, 15), False),
    ("Flower of life", gl.g_flower, False),
    ("Metatron's cube", gl.g_metatron, False),
]


def master_frame():
    h = 100
    prims = [("pg", gl.square(h), "k"), ("c", 0, 0, h, "k"),
             ("l", -h, 0, h, 0, "k"), ("l", 0, -h, 0, h, "k")]
    _, keys = gl.render(prims, K, C, C, MASTER, MASTER, "#000")
    # small registration ticks outside the square
    t = 18
    e = 500
    for x, y, dx, dy in ((C - e, C - e - t, 0, 1), (C + e, C - e - t, 0, 1),
                         (C - e - t, C - e, 1, 0), (C - e - t, C + e, 1, 0),
                         (C + e + t, C - e, -1, 0), (C + e + t, C + e, -1, 0),
                         (C - e, C + e + t, 0, -1), (C + e, C + e + t, 0, -1)):
        keys.append(f'<line x1="{gl.n(x)}" y1="{gl.n(y)}" x2="{gl.n(x + dx * (t - 6))}" '
                    f'y2="{gl.n(y + dy * (t - 6))}" {MASTER}/>')
    return keys


def layer(lid, body, visible=True, indent="    "):
    hide = "" if visible else ' style="display:none"'
    return f'  <g id="{lid}"{hide}>\n{indent}' + f"\n{indent}".join(body) + "\n  </g>"


def build():
    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="{SIZE}px" height="{SIZE}px" '
        f'viewBox="0 0 {SIZE} {SIZE}">',
        "  <title>Logo Construction Sheet</title>",
        layer("background", [f'<rect x="0" y="0" width="{SIZE}" height="{SIZE}" fill="#ffffff" stroke="none"/>']),
    ]
    # bottom-most grid first so the default square grid is near the top of the stack
    for i, (name, fn, vis) in reversed(list(enumerate(LAYERS, start=1))):
        guides, keys = gl.render(fn(), K, C, C, GUIDE, SUB_KEY, "#a6a6a6")
        parts.append(layer(f"grid-{i:02d}-{gl.slug(name)}", guides + keys, vis))
    parts.append(layer("master-frame", master_frame()))
    parts.append(layer("notes", [
        gl.text(50, 50, "LOGO CONSTRUCTION SHEET", 14, "bold", "#000000"),
        gl.text(50, 70, "Turn grid layers on/off in the Layers panel. Draw on the logo-artwork layer. "
                "Cmd/Ctrl+5 turns a selected grid into Illustrator guides.", 11, fill="#777777"),
    ]))
    parts.append('  <g id="logo-artwork">\n  </g>')
    parts += ["</svg>", ""]
    return "\n".join(parts)


if __name__ == "__main__":
    out = os.path.join(HERE, "logo-construction-sheet.svg")
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(build())
    print(f"Wrote {out} with {len(LAYERS)} switchable grid layers")
