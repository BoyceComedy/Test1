#!/usr/bin/env python3
"""Logo Construction Sheet — standalone generator (Python 3, standard library only).

Writes logo-construction-sheet.svg next to this script: one 1200 x 1200
artboard for designing a logo in Adobe Illustrator.

  * 14 grid systems, each on its own layer, all sharing one centre and one
    1000 px construction square. Only the 12 x 12 grid is visible at first;
    turn the others on in the Layers panel.
  * master-frame layer: square, centre cross, circle, trim marks.
  * logo-artwork layer (top, empty): draw your mark here.

Tip: select a grid layer and press Cmd/Ctrl+5 to turn it into Illustrator guides.

To change things, edit LAYERS (which grids, which are visible), SIZE, K
(scale) or the GUIDE / SUB_KEY / MASTER stroke styles near the bottom.

Run:  python3 logo_construction_sheet.py
"""

import math
import os
import re
from xml.sax.saxutils import escape

PHI = (1 + 5 ** 0.5) / 2
S3 = math.sqrt(3)

# --------------------------------------------------------------------------
# Primitives (all in a +/-100 box)
#   ('c', cx, cy, r, role)            circle
#   ('l', x1, y1, x2, y2, role)       line
#   ('pg', pts, role)                 closed polygon
#   ('d', ops, role)                  path: ('M',x,y) ('L',x,y) ('A',r,large,sweep,x,y) ('Z',)
#   ('dot', cx, cy, r)                small filled dot
# role: 'g' = construction guide, 'k' = key line
# --------------------------------------------------------------------------


def polar(r, a, cx=0, cy=0):
    t = math.radians(a)
    return cx + r * math.cos(t), cy + r * math.sin(t)


def reg(n_sides, r, rot=-90, cx=0, cy=0):
    return [polar(r, rot + 360 * i / n_sides, cx, cy) for i in range(n_sides)]


def lerp(a, b, f):
    return a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f


def square(h=100):
    return [(-h, -h), (h, -h), (h, h), (-h, h)]


def frame(h=100):
    return ("pg", square(h), "k")


def clip_convex(px, py, dx, dy, poly):
    """Clip the infinite line p + t*d to a convex polygon (Cyrus-Beck)."""
    cx = sum(p[0] for p in poly) / len(poly)
    cy = sum(p[1] for p in poly) / len(poly)
    t0, t1 = -1e9, 1e9
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        nx, ny = -(b[1] - a[1]), b[0] - a[0]
        if nx * (cx - a[0]) + ny * (cy - a[1]) < 0:
            nx, ny = -nx, -ny                       # inward normal
        den = nx * dx + ny * dy
        num = nx * (px - a[0]) + ny * (py - a[1])
        if abs(den) < 1e-12:
            if num < 0:
                return None
            continue
        t = -num / den
        if den > 0:
            t0 = max(t0, t)
        else:
            t1 = min(t1, t)
    if t1 - t0 < 1e-6:
        return None
    return px + dx * t0, py + dy * t0, px + dx * t1, py + dy * t1


def family(angle, spacing, poly, key_every=0, skip_centre=False):
    """Parallel lines at `angle`, `spacing` apart, through the centre, clipped to poly."""
    dx, dy = math.cos(math.radians(angle)), math.sin(math.radians(angle))
    nx, ny = -dy, dx
    out = []
    for k in range(-60, 61):
        if skip_centre and k == 0:
            continue
        seg = clip_convex(nx * spacing * k, ny * spacing * k, dx, dy, poly)
        if seg:
            role = "k" if key_every and k % key_every == 0 else "g"
            out.append(("l", *seg, role))
    return out


def hex_centres(rings, spacing, flat=False):
    pts = []
    for q in range(-rings, rings + 1):
        for r in range(-rings, rings + 1):
            if abs(q + r) <= rings:
                x, y = spacing * (q + r / 2), spacing * r * S3 / 2
                pts.append((y, x) if flat else (x, y))
    return pts


def arc_through(c, r, a, b, through):
    def ang(p):
        return math.degrees(math.atan2(p[1] - c[1], p[0] - c[0])) % 360
    aa, ab = ang(a), ang(b)
    cw = (ab - aa) % 360
    if (through - aa) % 360 < cw:
        sweep, ext = 1, cw
    else:
        sweep, ext = 0, 360 - cw
    return ("A", r, 1 if ext > 180 else 0, sweep, *b)


def tri_up(side=200):
    h = side * S3 / 2
    return [(0, -h / 2), (side / 2, h / 2), (-side / 2, h / 2)]


# --------------------------------------------------------------------------
# Grid definitions
# --------------------------------------------------------------------------
def g_square(n, key_every=0):
    def f():
        out = [frame()]
        step = 200 / n
        for i in range(1, n):
            v = -100 + i * step
            role = "k" if key_every and i % key_every == 0 else "g"
            out += [("l", v, -100, v, 100, role), ("l", -100, v, 100, v, role)]
        return out
    return f


def g_thirds():
    out = [frame()]
    for v in (-100 / 3, 100 / 3):
        out += [("l", v, -100, v, 100, "g"), ("l", -100, v, 100, v, "g")]
    out += [("l", -100, -100, 100, 100, "g"), ("l", -100, 100, 100, -100, "g")]
    for v in (-100 / 3, 100 / 3):  # reciprocal diagonals
        out += [("l", -100, -100, v, 100, "g"), ("l", 100, 100, -v, -100, "g")]
    return out


def g_square_master():
    h = 70
    return [("c", 0, 0, h * math.sqrt(2), "g"), ("c", 0, 0, h, "g"),
            ("pg", [(0, -h), (h, 0), (0, h), (-h, 0)], "g"),
            ("pg", square(h / 2), "g"), ("c", 0, 0, h / 2, "g"),
            ("l", -h, -h, h, h, "g"), ("l", -h, h, h, -h, "g"),
            ("l", -h, 0, h, 0, "g"), ("l", 0, -h, 0, h, "g"),
            ("pg", square(h), "k")]


def g_root2():
    s = 200 / math.sqrt(2)
    y0, y1 = -s / 2, s / 2
    x0 = -100
    out = [("pg", [(x0, y0), (x0 + s, y0), (x0 + s, y1), (x0, y1)], "g"),
           ("l", x0, y1, x0 + s, y0, "g"),
           ("d", [("M", x0 + s, y0), ("A", 200, 0, 1, 100, y1)], "g"),
           ("l", x0 + s / 2, y0, x0 + s / 2, y1, "g"),
           ("pg", [(-100, y0), (100, y0), (100, y1), (-100, y1)], "k")]
    return out


def g_dots():
    out = [("dot", x, y, 1.6) for y in range(-100, 101, 20) for x in range(-100, 101, 20)]
    return out + [("pg", square(), "g")]


def g_concentric(n, extras=False):
    def f():
        out = [("c", 0, 0, 100 * i / n, "g") for i in range(1, n)]
        out += [("l", -100, 0, 100, 0, "g"), ("l", 0, -100, 0, 100, "g")]
        if extras:
            out += [("l", *polar(100, a), *polar(100, a + 180), "g") for a in (45, 135)]
        return out + [("c", 0, 0, 100, "k")]
    return f


def g_circle_cells():
    out = g_square(3)()
    for y in (-200 / 3, 0, 200 / 3):
        for x in (-200 / 3, 0, 200 / 3):
            out.append(("c", x, y, 100 / 3, "g"))
    return out


def g_overlap_square():
    out = [("c", x, y, 50, "g") for y in (-50, 0, 50) for x in (-50, 0, 50)]
    out += [("l", -100, 0, 100, 0, "g"), ("l", 0, -100, 0, 100, "g")]
    return out + [frame()]


def g_circle_packing():
    r = 20
    out = []
    for c in hex_centres(4, 2 * r):
        if abs(c[0]) + r <= 100.01 and abs(c[1]) + r <= 100.01:
            out.append(("c", *c, r, "g"))
    return out + [frame()]


def g_overlap_hex():
    out = [("c", *c, 25, "g") for c in hex_centres(3, 25)]
    return out + [("c", 0, 0, 100, "k")]


def g_nested_inscribed():
    r1 = 100
    r2 = r1 / math.sqrt(2)
    r3 = r2 / 2
    return [("pg", square(r2), "g"), ("c", 0, 0, r2, "g"),
            ("pg", reg(3, r2), "g"), ("c", 0, 0, r3, "g"),
            ("pg", reg(6, r3), "g"), ("l", 0, -100, 0, 100, "g"),
            ("c", 0, 0, r1, "k")]


def g_corner_arcs():
    out = [("d", [("M", 100, -100), ("A", 200, 0, 1, -100, 100)], "g"),
           ("d", [("M", 100, 100), ("A", 200, 0, 1, -100, -100)], "g"),
           ("d", [("M", -100, 100), ("A", 200, 0, 1, 100, -100)], "g"),
           ("d", [("M", -100, -100), ("A", 200, 0, 1, 100, 100)], "g"),
           ("c", 0, 0, 100, "g"), ("l", -100, -100, 100, 100, "g"), ("l", -100, 100, 100, -100, "g")]
    return out + [frame()]


def g_target():
    out = [("c", 0, 0, r, "g") for r in (20, 40, 60, 80)]
    out += [("l", *polar(100, a), *polar(100, a + 180), "g") for a in range(0, 180, 45)]
    return out + [("c", 0, 0, 100, "k")]


def g_radial(n, rings):
    def f():
        out = [("c", 0, 0, r, "g") for r in rings]
        out += [("l", 0, 0, *polar(100, -90 + 360 * i / n), "g") for i in range(n)]
        return out + [("c", 0, 0, 100, "k")]
    return f


def g_radial_petals():
    out = [("c", *polar(50, -90 + 30 * i), 50, "g") for i in range(12)]
    out += [("l", 0, 0, *polar(100, -90 + 30 * i), "g") for i in range(12)]
    return out + [("c", 0, 0, 100, "k")]


def g_dodecagon():
    out = [("pg", reg(12, 100), "g"), ("pg", reg(12, 66, -75), "g"), ("c", 0, 0, 66, "g"), ("c", 0, 0, 33, "g")]
    out += [("l", *polar(100, -90 + 30 * i), *polar(100, 90 + 30 * i), "g") for i in range(6)]
    return out + [("c", 0, 0, 100, "k")]


def g_tri_sub(n):
    def f():
        a, b, c = tri_up()
        out = [("pg", [a, b, c], "k")]
        for i in range(1, n):
            t = i / n
            out += [("l", *lerp(a, b, t), *lerp(a, c, t), "g"),
                    ("l", *lerp(c, a, t), *lerp(c, b, t), "g"),
                    ("l", *lerp(b, a, t), *lerp(b, c, t), "g")]
        return out
    return f


def g_tri_lattice():
    sq = square()
    side = 25
    sp = side * S3 / 2
    out = []
    for a in (0, 60, 120):
        out += family(a, sp, sq)
    return out + [frame()]


def g_isometric(spacing, key_every=0):
    def f():
        sq = square()
        out = []
        for a in (90, 30, 150):
            out += family(a, spacing, sq, key_every)
        return out + [frame()]
    return f


def g_iso_cube():
    hexa = reg(6, 100)
    out = []
    for a in (90, 30, 150):
        out += family(a, 100 * S3 / 2 / 4, hexa)
    out += [("l", 0, 0, *polar(100, a), "k") for a in (90, 210, 330)]
    return out + [("pg", hexa, "k")]


def g_hexagram():
    return [("pg", reg(3, 100), "g"), ("pg", reg(3, 100, 90), "g"),
            ("pg", reg(6, 100 / S3, 0), "g"), ("c", 0, 0, 50, "g"),
            ("l", 0, -100, 0, 100, "g"), ("c", 0, 0, 100, "k")]


def g_tri_centres():
    r = 80
    v = [(x, y + 20) for x, y in reg(3, r)]
    out = [("c", 0, 20, r, "g"), ("c", 0, 20, r / 2, "g")]
    for i in range(3):
        a, b, c = v[i], v[(i + 1) % 3], v[(i + 2) % 3]
        out.append(("l", *a, *lerp(b, c, 0.5), "g"))
    out.append(("pg", [lerp(v[0], v[1], .5), lerp(v[1], v[2], .5), lerp(v[2], v[0], .5)], "g"))
    return out + [("pg", v, "k")]


def g_rhombus_lattice():
    sq = square()
    return family(60, 25, sq) + family(120, 25, sq) + [frame()]


def g_hex_construction():
    return [("c", 0, 0, 100, "g"), ("c", 0, 0, 50 * S3, "g"), ("pg", reg(6, 50), "g"),
            ("pg", reg(3, 100), "g"), ("pg", reg(3, 100, 90), "g")] + \
           [("l", *polar(100, a), *polar(100, a + 180), "g") for a in (-90, -30, 30)] + \
           [("pg", reg(6, 100), "k")]


def g_honeycomb(rings, r, flat=False):
    def f():
        out = []
        for c in hex_centres(rings, S3 * r, flat):
            role = "k" if abs(c[0]) < 1e-6 and abs(c[1]) < 1e-6 else "g"
            out.append(("pg", reg(6, r, 0 if flat else -90, *c), role))
        return out
    return f


def g_nested_hex():
    out, r, rot = [], 100, -90
    for i in range(7):
        out.append(("pg", reg(6, r, rot), "k" if i == 0 else "g"))
        r *= S3 / 2
        rot += 30
    return out


def g_hex_sub():
    hexa = reg(6, 100)
    out = []
    for a in (30, 90, 150):
        out += family(a, 50 * S3 / 3, hexa)
    return out + [("pg", hexa, "k")]


def g_hex_radial():
    out = [("pg", reg(6, 100), "g"), ("pg", reg(6, 50 * S3, 0), "g"), ("c", 0, 0, 50, "g"), ("c", 0, 0, 75, "g")]
    out += [("l", 0, 0, *polar(100, -90 + 30 * i), "g") for i in range(12)]
    return out + [("c", 0, 0, 100, "k")]


def golden_squares():
    w, h = 200, 200 / PHI
    x, y = -100, -h / 2
    squares, ops = [], []
    for i in range(8):
        side = i % 4
        if side == 0:
            s = h; sq = (x, y, s); c = (x + s, y + s); a = (x, y + s); b = (x + s, y); x += s; w -= s
        elif side == 1:
            s = w; sq = (x, y, s); c = (x, y + s); a = (x, y); b = (x + s, y + s); y += s; h -= s
        elif side == 2:
            s = h; sq = (x + w - s, y, s); c = (x + w - s, y); a = (x + w, y); b = (x + w - s, y + s); w -= s
        else:
            s = w; sq = (x, y + h - s, s); c = (x + s, y + h - s); a = (x + s, y + h); b = (x, y + h - s); h -= s
        squares.append((sq, c))
        opp = (2 * (sq[0] + s / 2) - c[0], 2 * (sq[1] + s / 2) - c[1])
        if not ops:
            ops.append(("M", *a))
        ops.append(arc_through(c, s, a, b, math.degrees(math.atan2(opp[1] - c[1], opp[0] - c[0])) % 360))
    return squares, ops


def g_golden_spiral():
    sqs, ops = golden_squares()
    out = [("pg", [(x, y), (x + s, y), (x + s, y + s), (x, y + s)], "g") for (x, y, s), _ in sqs]
    out.append(("d", ops, "k"))
    h = 100 / PHI
    return out + [("pg", [(-100, -h), (100, -h), (100, h), (-100, h)], "k")]


def g_golden_circles_rect():
    sqs, _ = golden_squares()
    out = []
    for (x, y, s), c in sqs[:5]:
        out.append(("pg", [(x, y), (x + s, y), (x + s, y + s), (x, y + s)], "g"))
        out.append(("c", x + s / 2, y + s / 2, s / 2, "g"))
    h = 100 / PHI
    return out + [("pg", [(-100, -h), (100, -h), (100, h), (-100, h)], "k")]


def g_golden_circles():
    out, r = [("l", -100, 100, 100, 100, "g"), ("l", 0, -100, 0, 100, "g")], 100
    for i in range(6):
        out.append(("c", 0, 100 - r, r, "k" if i == 0 else "g"))
        r /= PHI
    return out


def g_phi_grid():
    out = [frame(), ("l", -100, -100, 100, 100, "g"), ("l", -100, 100, 100, -100, "g")]
    for f in (1 / PHI, 1 / PHI ** 2, 1 / PHI ** 3):
        for v in (-100 + 200 * f, 100 - 200 * f):
            out += [("l", v, -100, v, 100, "g"), ("l", -100, v, 100, v, "g")]
    return out


def g_golden_triangle():
    w = 200 / math.tan(math.radians(72))
    P, Q, R = (0, -100), (-w, 100), (w, 100)
    out = [("pg", [P, Q, R], "k")]
    for _ in range(8):
        S = lerp(P, R, 1 / PHI)
        out.append(("l", *Q, *S, "g"))
        P, Q, R = Q, R, S
    return out


def g_seed():
    out = [("c", 0, 0, 50, "g")] + [("c", *polar(50, -90 + 60 * i), 50, "g") for i in range(6)]
    return out + [("c", 0, 0, 100, "k")]


def g_flower():
    out = [("c", *c, 100 / 3, "g") for c in hex_centres(2, 100 / 3)]
    return out + [("c", 0, 0, 100, "k")]


def g_vesica():
    h = math.sqrt(60 ** 2 - 30 ** 2)
    return [("c", -30, 0, 60, "g"), ("c", 30, 0, 60, "g"),
            ("l", -100, 0, 100, 0, "g"), ("l", 0, -100, 0, 100, "g"),
            ("pg", [(-30, 0), (0, -h), (30, 0), (0, h)], "g"),
            ("pg", [(-30, 0), (0, -h), (0, h)], "g"),
            ("d", [("M", 0, -h), ("A", 60, 0, 1, 0, h), ("A", 60, 0, 1, 0, -h), ("Z",)], "k")]


def g_metatron():
    a = 20
    pts = [(0, 0)] + [polar(2 * a, -90 + 60 * i) for i in range(6)] + [polar(4 * a, -90 + 60 * i) for i in range(6)]
    out = [("c", *p, a, "g") for p in pts]
    for i in range(len(pts)):
        for j in range(i + 1, len(pts)):
            out.append(("l", *pts[i], *pts[j], "g"))
    return out + [("pg", reg(6, 4 * a), "k")]


def g_pentagon():
    v = reg(5, 100)
    out = [("pg", v, "g"), ("pg", [v[0], v[2], v[4], v[1], v[3]], "g"),
           ("pg", reg(5, 100 / PHI ** 2, 90), "g"), ("c", 0, 0, 100 * math.cos(math.radians(36)), "g")]
    out += [("l", 0, 0, *p, "g") for p in v]
    return out + [("c", 0, 0, 100, "k")]


def g_octagram():
    v = reg(8, 100, -90)
    out = [("pg", square(100 / math.sqrt(2)), "g"), ("pg", [(0, -100), (100, 0), (0, 100), (-100, 0)], "g"),
           ("pg", v, "g"), ("pg", [v[(3 * i) % 8] for i in range(8)], "g"),
           ("c", 0, 0, 100 / math.sqrt(2), "g")]
    return out + [("c", 0, 0, 100, "k")]


def g_triquetra():
    d = 100 / (1 + S3)              # centre ring radius so circles touch the boundary
    r = d * S3
    out = [("c", *polar(d, a), r, "g") for a in (-90, 30, 150)]
    out += [("c", 0, 0, d, "g"), ("pg", reg(3, d), "g"), ("pg", reg(3, d, 90), "g")]
    return out + [("c", 0, 0, 100, "k")]


CATEGORIES = [
    ("Square and Modular", [
        ("2 × 2 Grid", g_square(2)), ("3 × 3 Grid", g_square(3)), ("4 × 4 Grid", g_square(4)),
        ("6 × 6 Grid", g_square(6, 3)), ("8 × 8 Grid", g_square(8, 4)), ("12 × 12 Modular Grid", g_square(12, 4)),
        ("Rule of Thirds", g_thirds), ("Square Master Construction", g_square_master),
        ("Root-2 Rectangle", g_root2), ("Dot Grid", g_dots)]),
    ("Circles", [
        ("Concentric Circles", g_concentric(5)), ("Concentric Circles Fine", g_concentric(10, True)),
        ("Circle Cell Grid", g_circle_cells), ("Overlapping Circle Grid", g_overlap_square),
        ("Circle Packing", g_circle_packing), ("Overlapping Circle Lattice", g_overlap_hex),
        ("Inscribed Shapes", g_nested_inscribed), ("Corner Arc Grid", g_corner_arcs),
        ("Target Grid", g_target)]),
    ("Radial", [
        ("Radial 8", g_radial(8, [50])), ("Radial 12", g_radial(12, [33.33, 66.67])),
        ("Radial 16", g_radial(16, [25, 50, 75])), ("Radial 24", g_radial(24, [100 * i / 6 for i in range(1, 6)])),
        ("Radial 36", g_radial(36, [20, 40, 60, 80])), ("Radial Petals", g_radial_petals),
        ("Dodecagon Compass", g_dodecagon)]),
    ("Triangles and Isometric", [
        ("Triangle Subdivided 3", g_tri_sub(3)), ("Triangle Subdivided 6", g_tri_sub(6)),
        ("Triangular Lattice", g_tri_lattice), ("Isometric Grid", g_isometric(20)),
        ("Isometric Grid Fine", g_isometric(10, 4)), ("Isometric Cube", g_iso_cube),
        ("Hexagram Construction", g_hexagram), ("Triangle Centres", g_tri_centres),
        ("Rhombus Lattice", g_rhombus_lattice)]),
    ("Hexagons", [
        ("Hexagon Construction", g_hex_construction), ("Honeycomb 19", g_honeycomb(2, 22)),
        ("Honeycomb 37", g_honeycomb(3, 15)), ("Honeycomb Flat", g_honeycomb(2, 22, True)),
        ("Nested Hexagons", g_nested_hex), ("Hexagon Subdivided", g_hex_sub),
        ("Hexagon Radial", g_hex_radial)]),
    ("Golden Ratio", [
        ("Golden Spiral", g_golden_spiral), ("Golden Rectangle Circles", g_golden_circles_rect),
        ("Golden Circles", g_golden_circles), ("Phi Grid", g_phi_grid),
        ("Golden Triangle", g_golden_triangle)]),
    ("Sacred Geometry", [
        ("Seed of Life", g_seed), ("Flower of Life", g_flower), ("Vesica Piscis", g_vesica),
        ("Metatron's Cube", g_metatron), ("Pentagram Construction", g_pentagon),
        ("Octagram Construction", g_octagram), ("Triquetra Construction", g_triquetra)]),
]

# --------------------------------------------------------------------------
# Rendering
# --------------------------------------------------------------------------


def n(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def render(prims, k, ox, oy, gstyle, kstyle, dotfill):
    """Scale +/-100 primitives by k, translate to (ox, oy). Returns (guides, keys)."""
    X = lambda x: n(ox + x * k)
    Y = lambda y: n(oy + y * k)
    guides, keys = [], []
    for pr in prims:
        kind = pr[0]
        role = pr[-1] if kind != "dot" else "g"
        st = kstyle if role == "k" else gstyle
        if kind == "c":
            el = f'<circle cx="{X(pr[1])}" cy="{Y(pr[2])}" r="{n(pr[3] * k)}" {st}/>'
        elif kind == "l":
            el = f'<line x1="{X(pr[1])}" y1="{Y(pr[2])}" x2="{X(pr[3])}" y2="{Y(pr[4])}" {st}/>'
        elif kind == "pg":
            el = f'<polygon points="{" ".join(X(x) + "," + Y(y) for x, y in pr[1])}" {st}/>'
        elif kind == "dot":
            el = f'<circle cx="{X(pr[1])}" cy="{Y(pr[2])}" r="{n(pr[3] * max(k, 1) ** 0.5)}" fill="{dotfill}" stroke="none"/>'
        elif kind == "d":
            parts = []
            for op in pr[1]:
                if op[0] in ("M", "L"):
                    parts.append(f"{op[0]}{X(op[1])},{Y(op[2])}")
                elif op[0] == "A":
                    _, r, lg, sw, x, y = op
                    parts.append(f"A{n(r * k)} {n(r * k)} 0 {lg} {sw} {X(x)},{Y(y)}")
                else:
                    parts.append("Z")
            el = f'<path d="{" ".join(parts)}" {st}/>'
        (keys if role == "k" else guides).append(el)
    return guides, keys


def slug(s):
    s = s.lower().replace("×", "x").replace("'", "")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


FONT = 'font-family="Helvetica, Arial, sans-serif"'


def text(x, y, s, size, weight="normal", fill="#333333", anchor="start"):
    return (f'<text x="{n(x)}" y="{n(y)}" {FONT} font-size="{size}" font-weight="{weight}" '
            f'fill="{fill}" text-anchor="{anchor}">{escape(s)}</text>')


def all_grids():
    i = 0
    for cat, items in CATEGORIES:
        for name, fn in items:
            i += 1
            yield i, cat, name, fn()



# ==========================================================================
# Construction sheet
# ==========================================================================

HERE = os.path.dirname(os.path.abspath(__file__))
SIZE = 1200          # artboard
C = SIZE / 2         # centre
K = 5.0              # +/-100 grid units -> +/-500 px construction square

GUIDE = 'fill="none" stroke="#a6a6a6" stroke-width="0.75"'
SUB_KEY = 'fill="none" stroke="#5a5a5a" stroke-width="1"'
MASTER = 'fill="none" stroke="#000000" stroke-width="1.5"'

# (layer name, grid function, visible by default)
LAYERS = [
    ("Square grid 12 x 12", g_square(12, 4), True),
    ("Rule of thirds + diagonals", g_thirds, False),
    ("Phi grid", g_phi_grid, False),
    ("Golden spiral", g_golden_spiral, False),
    ("Concentric circles", g_concentric(10, True), False),
    ("Radial 24", g_radial(24, [100 * i / 6 for i in range(1, 6)]), False),
    ("Circle + square + triangle", g_nested_inscribed, False),
    ("Corner arcs", g_corner_arcs, False),
    ("Isometric", g_isometric(20), False),
    ("Triangular lattice", g_tri_lattice, False),
    ("Hexagon construction", g_hex_construction, False),
    ("Honeycomb", g_honeycomb(3, 15), False),
    ("Flower of life", g_flower, False),
    ("Metatron's cube", g_metatron, False),
]


def master_frame():
    h = 100
    prims = [("pg", square(h), "k"), ("c", 0, 0, h, "k"),
             ("l", -h, 0, h, 0, "k"), ("l", 0, -h, 0, h, "k")]
    _, keys = render(prims, K, C, C, MASTER, MASTER, "#000")
    # small registration ticks outside the square
    t = 18
    e = 500
    for x, y, dx, dy in ((C - e, C - e - t, 0, 1), (C + e, C - e - t, 0, 1),
                         (C - e - t, C - e, 1, 0), (C - e - t, C + e, 1, 0),
                         (C + e + t, C - e, -1, 0), (C + e + t, C + e, -1, 0),
                         (C - e, C + e + t, 0, -1), (C + e, C + e + t, 0, -1)):
        keys.append(f'<line x1="{n(x)}" y1="{n(y)}" x2="{n(x + dx * (t - 6))}" '
                    f'y2="{n(y + dy * (t - 6))}" {MASTER}/>')
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
        guides, keys = render(fn(), K, C, C, GUIDE, SUB_KEY, "#a6a6a6")
        parts.append(layer(f"grid-{i:02d}-{slug(name)}", guides + keys, vis))
    parts.append(layer("master-frame", master_frame()))
    parts.append(layer("notes", [
        text(50, 50, "LOGO CONSTRUCTION SHEET", 14, "bold", "#000000"),
        text(50, 70, "Turn grid layers on/off in the Layers panel. Draw on the logo-artwork layer. "
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
