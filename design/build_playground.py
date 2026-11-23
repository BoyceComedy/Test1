#!/usr/bin/env python3
"""Generate geometric-logo-component-playground.svg.

A single landscape artboard of editable geometric building blocks for logo
construction. Output is plain SVG 1.1 with presentation attributes only (no
CSS, no <use>, no masks, no raster), so it opens cleanly in Adobe Illustrator.

Every component is drawn in local coordinates centred on (0, 0) and kept within
roughly +/-60 units, then placed in its tile with a translate-only transform.

Run:  python3 design/build_playground.py
"""

import math
import os
from xml.sax.saxutils import escape

# --------------------------------------------------------------------------
# Style
# --------------------------------------------------------------------------
BLACK = "#000000"
GREY_FILL = "#9a9a9a"
GUIDE_GREY = "#8c8c8c"
TILE_GREY = "#f2f2f2"

OUT = f'fill="none" stroke="{BLACK}" stroke-width="2"'
FILL = f'fill="{GREY_FILL}" stroke="{BLACK}" stroke-width="2"'
GUIDE = f'fill="none" stroke="{GUIDE_GREY}" stroke-width="0.75"'
KEY = f'fill="none" stroke="{BLACK}" stroke-width="1"'
DOT = f'fill="{GUIDE_GREY}" stroke="none"'

FONT = 'font-family="Helvetica, Arial, sans-serif"'


def n(v):
    """Format a number compactly."""
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def p(x, y):
    return f"{n(x)},{n(y)}"


# --------------------------------------------------------------------------
# Element helpers (each returns one SVG element string)
# --------------------------------------------------------------------------
def C(cx, cy, r, st=OUT):
    return f'<circle cx="{n(cx)}" cy="{n(cy)}" r="{n(r)}" {st}/>'


def R(x, y, w, h, st=OUT, rx=0):
    rr = f' rx="{n(rx)}" ry="{n(rx)}"' if rx else ""
    return f'<rect x="{n(x)}" y="{n(y)}" width="{n(w)}" height="{n(h)}"{rr} {st}/>'


def L(x1, y1, x2, y2, st=OUT):
    return f'<line x1="{n(x1)}" y1="{n(y1)}" x2="{n(x2)}" y2="{n(y2)}" {st}/>'


def PG(pts, st=OUT):
    return f'<polygon points="{" ".join(p(*q) for q in pts)}" {st}/>'


def PL(pts, st=OUT):
    return f'<polyline points="{" ".join(p(*q) for q in pts)}" {st}/>'


def P(d, st=OUT, eo=False):
    rule = ' fill-rule="evenodd" clip-rule="evenodd"' if eo else ""
    return f'<path d="{d}"{rule} {st}/>'


def CP(subpaths, st=FILL):
    """Compound path (genuine holes via even-odd)."""
    return P(" ".join(subpaths), st, eo=True)


# --------------------------------------------------------------------------
# Path-data builders
# --------------------------------------------------------------------------
def polar(cx, cy, r, a):
    t = math.radians(a)
    return cx + r * math.cos(t), cy + r * math.sin(t)


def circ_d(cx, cy, r):
    return (f"M{p(cx - r, cy)} A{n(r)} {n(r)} 0 1 0 {p(cx + r, cy)} "
            f"A{n(r)} {n(r)} 0 1 0 {p(cx - r, cy)} Z")


def rect_d(x, y, w, h):
    return f"M{p(x, y)} H{n(x + w)} V{n(y + h)} H{n(x)} Z"


def rrect_d(x, y, w, h, r):
    return (f"M{p(x + r, y)} H{n(x + w - r)} A{n(r)} {n(r)} 0 0 1 {p(x + w, y + r)} "
            f"V{n(y + h - r)} A{n(r)} {n(r)} 0 0 1 {p(x + w - r, y + h)} "
            f"H{n(x + r)} A{n(r)} {n(r)} 0 0 1 {p(x, y + h - r)} "
            f"V{n(y + r)} A{n(r)} {n(r)} 0 0 1 {p(x + r, y)} Z")


def poly_d(pts):
    return "M" + " L".join(p(*q) for q in pts) + " Z"


def reg_poly(k, r, rot=-90, cx=0, cy=0):
    return [polar(cx, cy, r, rot + 360 * i / k) for i in range(k)]


def star(k, ro, ri, rot=-90, cx=0, cy=0):
    pts = []
    for i in range(2 * k):
        pts.append(polar(cx, cy, ro if i % 2 == 0 else ri, rot + 180 * i / k))
    return pts


def shift(pts, dx=0, dy=0):
    return [(x + dx, y + dy) for x, y in pts]


def arc_d(cx, cy, r, a0, a1):
    """Open arc, clockwise on screen from angle a0 to a1 (degrees)."""
    x0, y0 = polar(cx, cy, r, a0)
    x1, y1 = polar(cx, cy, r, a1)
    large = 1 if (a1 - a0) > 180 else 0
    return f"M{p(x0, y0)} A{n(r)} {n(r)} 0 {large} 1 {p(x1, y1)}"


def sector_d(cx, cy, r, a0, a1):
    x0, y0 = polar(cx, cy, r, a0)
    x1, y1 = polar(cx, cy, r, a1)
    large = 1 if (a1 - a0) > 180 else 0
    return f"M{p(cx, cy)} L{p(x0, y0)} A{n(r)} {n(r)} 0 {large} 1 {p(x1, y1)} Z"


def ringseg_d(cx, cy, ro, ri, a0, a1):
    o0, o1 = polar(cx, cy, ro, a0), polar(cx, cy, ro, a1)
    i0, i1 = polar(cx, cy, ri, a0), polar(cx, cy, ri, a1)
    large = 1 if (a1 - a0) > 180 else 0
    return (f"M{p(*o0)} A{n(ro)} {n(ro)} 0 {large} 1 {p(*o1)} L{p(*i1)} "
            f"A{n(ri)} {n(ri)} 0 {large} 0 {p(*i0)} Z")


def ang(cx, cy, x, y):
    return math.degrees(math.atan2(y - cy, x - cx)) % 360


def arc_through(cx, cy, r, a, b, through):
    """Arc command from point a to point b on circle (cx,cy,r) that passes the
    direction `through` (degrees)."""
    aa, ab = ang(cx, cy, *a), ang(cx, cy, *b)
    cw = (ab - aa) % 360
    if (through - aa) % 360 < cw:
        sweep, ext = 1, cw
    else:
        sweep, ext = 0, 360 - cw
    large = 1 if ext > 180 else 0
    return f" A{n(r)} {n(r)} 0 {large} {sweep} {p(*b)}"


def circle_intersections(c0, r0, c1, r1):
    (x0, y0), (x1, y1) = c0, c1
    d = math.hypot(x1 - x0, y1 - y0)
    a = (r0 ** 2 - r1 ** 2 + d ** 2) / (2 * d)
    h = math.sqrt(max(r0 ** 2 - a ** 2, 0))
    xm, ym = x0 + a * (x1 - x0) / d, y0 + a * (y1 - y0) / d
    return ((xm + h * (y1 - y0) / d, ym - h * (x1 - x0) / d),
            (xm - h * (y1 - y0) / d, ym + h * (x1 - x0) / d))


def lens_d(x0, y0, x1, y1, r):
    """Symmetric lens between two points using arcs of radius r."""
    return (f"M{p(x0, y0)} A{n(r)} {n(r)} 0 0 1 {p(x1, y1)} "
            f"A{n(r)} {n(r)} 0 0 1 {p(x0, y0)} Z")


def rounded_poly_d(pts, d):
    """Polygon with corners softened by quadratic curves (d = corner inset)."""
    k = len(pts)
    out = []
    for i in range(k):
        v = pts[i]
        prv, nxt = pts[i - 1], pts[(i + 1) % k]

        def toward(a, b, dist):
            ln = math.hypot(b[0] - a[0], b[1] - a[1])
            return a[0] + (b[0] - a[0]) * dist / ln, a[1] + (b[1] - a[1]) * dist / ln

        a, b = toward(v, prv, d), toward(v, nxt, d)
        out.append(("L" if out else "M") + p(*a) + f" Q{p(*v)} {p(*b)}")
    return " ".join(out) + " Z"


def circle_band_d(r, y1, y2):
    """Horizontal band of a circle between y1 < y2 (a split / striped circle)."""
    x1 = math.sqrt(max(r * r - y1 * y1, 0))
    x2 = math.sqrt(max(r * r - y2 * y2, 0))
    return (f"M{p(-x1, y1)} L{p(x1, y1)} A{n(r)} {n(r)} 0 0 1 {p(x2, y2)} "
            f"L{p(-x2, y2)} A{n(r)} {n(r)} 0 0 1 {p(-x1, y1)} Z")


def clip_line(px, py, dx, dy, b=60):
    """Clip an infinite line (point + direction) to the box [-b, b]^2."""
    t0, t1 = -1e9, 1e9
    for pv, dv in ((px, dx), (py, dy)):
        if abs(dv) < 1e-9:
            if pv < -b or pv > b:
                return None
            continue
        ta, tb = (-b - pv) / dv, (b - pv) / dv
        t0, t1 = max(t0, min(ta, tb)), min(t1, max(ta, tb))
    if t1 - t0 < 1e-6:
        return None
    return (px + dx * t0, py + dy * t0, px + dx * t1, py + dy * t1)


def rot_rect(cx, cy, length, width, a):
    dx, dy = math.cos(math.radians(a)), math.sin(math.radians(a))
    nx, ny = -dy, dx
    hl, hw = length / 2, width / 2
    return [(cx + dx * sl + nx * sw, cy + dy * sl + ny * sw)
            for sl, sw in ((-hl, -hw), (hl, -hw), (hl, hw), (-hl, hw))]


def mid(a, b):
    return (a[0] + b[0]) / 2, (a[1] + b[1]) / 2


# Equilateral triangle centred by bounding box (r = circumradius)
def eq_tri(r=64, up=True):
    pts = reg_poly(3, r, -90 if up else 90)
    return shift(pts, 0, r / 4 if up else -r / 4)


# --------------------------------------------------------------------------
# 1. Circles and rings
# --------------------------------------------------------------------------
def crescent():
    o, ro = (0, 0), 60
    k, rk = (24, -12), 52
    p1, p2 = circle_intersections(o, ro, k, rk)
    away = math.degrees(math.atan2(-k[1], -k[0])) % 360
    d = f"M{p(*p1)}" + arc_through(0, 0, ro, p1, p2, away)
    d += arc_through(k[0], k[1], rk, p2, p1, away) + " Z"
    return [P(d, FILL)]


def circle_intersection():
    h = math.sqrt(40 ** 2 - 20 ** 2)
    return [P(lens_d(0, -h, 0, h, 40), FILL), C(-20, 0, 40), C(20, 0, 40)]


def triple_overlap(r=32, d=20, st=OUT):
    return [C(*polar(0, 6, d, a), r, st) for a in (-90, 30, 150)]


S01 = ("Circles and Rings", [
    ("Circle", lambda: [C(0, 0, 60)]),
    ("Circle filled", lambda: [C(0, 0, 60, FILL)]),
    ("Circle sizes", lambda: [C(-50, 0, 10), C(-18, 0, 18), C(32, 0, 28)]),
    ("Concentric circles", lambda: [C(0, 0, 20), C(0, 0, 40), C(0, 0, 60)]),
    ("Thin ring", lambda: [CP([circ_d(0, 0, 60), circ_d(0, 0, 54)])]),
    ("Thick ring", lambda: [CP([circ_d(0, 0, 60), circ_d(0, 0, 34)])]),
    ("Nested circles", lambda: [C(0, 0, 60), C(0, 18, 42), C(0, 36, 24, FILL)]),
    ("Offset circles", lambda: [C(0, 0, 60), C(22, -16, 30)]),
    ("Overlapping circles", lambda: [C(-22, 0, 38), C(22, 0, 38)]),
    ("Tangent circles", lambda: [C(-30, 0, 30, FILL), C(30, 0, 30)]),
    ("Circle intersection", circle_intersection),
    ("Vesica piscis", lambda: [C(-22.5, 0, 45), C(22.5, 0, 45), L(0, -39, 0, 39), L(-22.5, 0, 22.5, 0)]),
    ("Circular cut-out", lambda: [CP([circ_d(0, 0, 60), circ_d(18, -18, 22)])]),
    ("Crescent", crescent),
    ("Triple overlap", triple_overlap),
    ("Circle row", lambda: [C(x, 0, 15, FILL if i % 2 == 0 else OUT) for i, x in enumerate((-45, -15, 15, 45))]),
    ("Ring and dot", lambda: [CP([circ_d(0, 0, 60), circ_d(0, 0, 48)]), C(0, 0, 16, FILL)]),
])

# --------------------------------------------------------------------------
# 2. Squares and rectangles
# --------------------------------------------------------------------------
S02 = ("Squares and Rectangles", [
    ("Square", lambda: [R(-60, -60, 120, 120)]),
    ("Square filled", lambda: [R(-60, -60, 120, 120, FILL)]),
    ("Square sizes", lambda: [R(-60, 8, 20, 20), R(-36, -8, 36, 36), R(4, -28, 56, 56)]),
    ("Rectangle 2:1", lambda: [R(-60, -30, 120, 60)]),
    ("Rectangle 3:1", lambda: [R(-60, -20, 120, 40, FILL)]),
    ("Rectangle 1:2", lambda: [R(-30, -60, 60, 120)]),
    ("Golden rectangle", lambda: [R(-60, -37.08, 120, 74.16), L(14.16, -37.08, 14.16, 37.08, GUIDE)]),
    ("Rounded square", lambda: [R(-58, -58, 116, 116, OUT, 24)]),
    ("Rounded rectangle", lambda: [R(-60, -36, 120, 72, FILL, 16)]),
    ("Nested squares", lambda: [R(-60, -60, 120, 120), R(-40, -40, 80, 80), R(-20, -20, 40, 40, FILL)]),
    ("Square in diamond", lambda: [R(-60, -60, 120, 120), PG([(0, -60), (60, 0), (0, 60), (-60, 0)]), R(-30, -30, 60, 60, FILL)]),
    ("Offset squares", lambda: [R(-60, -60, 70, 70), R(-35, -35, 70, 70), R(-10, -10, 70, 70, FILL)]),
    ("Overlapping squares", lambda: [R(-20, -20, 40, 40, f'fill="{GREY_FILL}" stroke="none"'), R(-60, -60, 80, 80), R(-20, -20, 80, 80)]),
    ("Square cut-out", lambda: [CP([rect_d(-60, -60, 120, 120), rect_d(-30, -30, 60, 60)])]),
    ("Circle in square", lambda: [R(-60, -60, 120, 120), C(0, 0, 60, FILL)]),
    ("Square in circle", lambda: [C(0, 0, 60), R(-42.43, -42.43, 84.85, 84.85, FILL)]),
    ("Square + circle", lambda: [R(-60, -20, 80, 80, FILL), C(20, -20, 40)]),
    ("Leaf square", lambda: [P("M-60,0 A60 60 0 0 1 0,-60 L60,-60 L60,0 A60 60 0 0 1 0,60 L-60,60 Z", FILL)]),
])

# --------------------------------------------------------------------------
# 3. Polygons
# --------------------------------------------------------------------------
def nested_triangles():
    a, b, c = eq_tri(64)
    return [PG([a, b, c]), PG([mid(a, b), mid(b, c), mid(c, a)], FILL)]


S03 = ("Polygons", [
    ("Triangle", lambda: [PG([(0, -60), (50, 60), (-50, 60)])]),
    ("Equilateral triangle", lambda: [PG(eq_tri(66))]),
    ("Equilateral filled", lambda: [PG(eq_tri(66), FILL)]),
    ("Inverted triangle", lambda: [PG(eq_tri(66, up=False), FILL)]),
    ("Right triangle", lambda: [PG([(-55, -55), (-55, 55), (55, 55)])]),
    ("Pentagon", lambda: [PG(shift(reg_poly(5, 62), 0, 6))]),
    ("Pentagon filled", lambda: [PG(shift(reg_poly(5, 62), 0, 6), FILL)]),
    ("Hexagon", lambda: [PG(reg_poly(6, 62, 0))]),
    ("Hexagon filled", lambda: [PG(reg_poly(6, 62), FILL)]),
    ("Octagon", lambda: [PG(reg_poly(8, 64, 22.5))]),
    ("Octagon filled", lambda: [PG(reg_poly(8, 64, 22.5), FILL)]),
    ("Diamond", lambda: [PG([(0, -62), (44, 0), (0, 62), (-44, 0)])]),
    ("Diamond filled", lambda: [PG([(0, -60), (60, 0), (0, 60), (-60, 0)], FILL)]),
    ("Rhombus 60°", lambda: [PG([(-60, 0), (0, -34.64), (60, 0), (0, 34.64)])]),
    ("Kite", lambda: [PG([(0, -60), (42, -18), (0, 60), (-42, -18)])]),
    ("Trapezoid", lambda: [PG([(-36, -40), (36, -40), (60, 40), (-60, 40)])]),
    ("Parallelogram", lambda: [PG([(-30, -40), (60, -40), (30, 40), (-60, 40)], FILL)]),
    ("Nested triangles", nested_triangles),
])

# --------------------------------------------------------------------------
# 4. Stars and radial shapes
# --------------------------------------------------------------------------
def pentagram():
    v = shift(reg_poly(5, 62), 0, 6)
    return [PG([v[0], v[2], v[4], v[1], v[3]])]


def spoked_wheel():
    els = [CP([circ_d(0, 0, 60), circ_d(0, 0, 52)])]
    for i in range(8):
        a = i * 45
        els.append(L(*polar(0, 0, 10, a), *polar(0, 0, 52, a)))
    els.append(C(0, 0, 10, FILL))
    return els


def radial_divisions():
    els = [C(0, 0, 60)]
    for i in range(4):
        a = i * 45
        els.append(L(*polar(0, 0, 60, a), *polar(0, 0, 60, a + 180)))
    return els


def radial_grid():
    els = [C(0, 0, r) for r in (20, 40, 60)]
    for i in range(12):
        els.append(L(*polar(0, 0, 20, i * 30), *polar(0, 0, 60, i * 30)))
    return els


def petal_rosette():
    els = []
    for i in range(6):
        x1, y1 = polar(0, 0, 60, -90 + i * 60)
        els.append(P(lens_d(0, 0, x1, y1, 40), FILL))
    return els


def seed_circles():
    els = [C(0, 0, 60), C(0, 0, 30)]
    els += [C(*polar(0, 0, 30, -90 + i * 60), 30) for i in range(6)]
    return els


def asterisk():
    return [PG(rot_rect(0, 0, 120, 16, a), FILL) for a in (90, 30, 150)]


def radial_triangles():
    els = []
    for i in range(8):
        a = -90 + i * 45
        els.append(PG([polar(0, 0, 62, a), polar(0, 0, 22, a + 14), polar(0, 0, 22, a - 14)], FILL))
    els.append(C(0, 0, 14))
    return els


S04 = ("Stars and Radial Shapes", [
    ("Five-point star", lambda: [PG(shift(star(5, 62, 25), 0, 6))]),
    ("Five-point star filled", lambda: [PG(shift(star(5, 62, 25), 0, 6), FILL)]),
    ("Pentagram", pentagram),
    ("Six-point star", lambda: [PG(reg_poly(3, 62)), PG(reg_poly(3, 62, 90))]),
    ("Six-point star filled", lambda: [PG(star(6, 62, 36), FILL)]),
    ("Eight-point star", lambda: [PG(star(8, 62, 26))]),
    ("Eight-point star filled", lambda: [PG(star(8, 62, 44), FILL)]),
    ("Octagram", lambda: [R(-44, -44, 88, 88), PG([(0, -62), (62, 0), (0, 62), (-62, 0)])]),
    ("Ten-point star", lambda: [PG(star(10, 62, 40), FILL)]),
    ("Twelve-point burst", lambda: [PG(star(12, 62, 48))]),
    ("Four-point star", lambda: [PG(star(4, 62, 16), FILL)]),
    ("Radial divisions", radial_divisions),
    ("Spoked wheel", spoked_wheel),
    ("Radial grid", radial_grid),
    ("Petal rosette", petal_rosette),
    ("Seed circles", seed_circles),
    ("Asterisk", asterisk),
    ("Radial triangles", radial_triangles),
])

# --------------------------------------------------------------------------
# 5. Circular segments
# --------------------------------------------------------------------------
def fan():
    els = []
    for i in range(6):
        a0 = 180 + i * 30
        els.append(P(sector_d(0, 30, 62, a0, a0 + 30), FILL if i % 2 == 0 else OUT))
    return els


def segmented_ring():
    return [P(ringseg_d(0, 0, 60, 42, -90 + i * 90 + 5, -90 + (i + 1) * 90 - 5), FILL) for i in range(4)]


def open_arcs():
    return [P(arc_d(0, 0, r, a, a + 270)) for r, a in ((60, 0), (45, 90), (30, 180), (15, 270))]


S05 = ("Circular Segments", [
    ("Quarter circle", lambda: [P(sector_d(-55, 55, 110, -90, 0), FILL)]),
    ("Half circle", lambda: [P(sector_d(0, 30, 60, 180, 360), FILL)]),
    ("Semicircle outline", lambda: [P(sector_d(-30, 0, 60, -90, 90))]),
    ("Sector 60°", lambda: [P(sector_d(0, 50, 100, -120, -60), FILL)]),
    ("Sector 120°", lambda: [P(sector_d(0, 30, 68, -150, -30), FILL)]),
    ("Arc 90°", lambda: [P(arc_d(-45, 45, 90, -90, 0))]),
    ("Arc 120°", lambda: [P(arc_d(0, 24, 60, -150, -30))]),
    ("Arc 180°", lambda: [P(arc_d(0, 30, 60, 180, 360))]),
    ("Arc 270°", lambda: [P(arc_d(0, 0, 60, 0, 270))]),
    ("Open arcs", open_arcs),
    ("Double arc", lambda: [P(arc_d(0, 24, 60, 180, 360)), P(arc_d(0, 24, 46, 180, 360))]),
    ("Ring segment 90°", lambda: [P(ringseg_d(-50, 50, 110, 70, -90, 0), FILL)]),
    ("Arch", lambda: [P(ringseg_d(0, 30, 60, 36, 180, 360), FILL)]),
    ("Quarter ring", lambda: [P(ringseg_d(-30, 30, 60, 36, -90, 0), FILL)]),
    ("Circular wedge", lambda: [P(sector_d(0, 60, 120, -105, -75), FILL)]),
    ("Fan", fan),
    ("Segmented ring", segmented_ring),
    ("Pie 270°", lambda: [P(sector_d(0, 0, 60, 0, 270), FILL)]),
])

# --------------------------------------------------------------------------
# 6. Geometric lines and structures
# --------------------------------------------------------------------------
def angled_lines(a, spacing=26, length=116):
    dx, dy = math.cos(math.radians(a)), -math.sin(math.radians(a))
    nx, ny = -dy, dx
    els = [L(-60, 56, 60, 56, GUIDE)]
    for k in (-1, 0, 1):
        cx, cy = nx * spacing * k, ny * spacing * k - 4
        els.append(L(cx - dx * length / 2, cy - dy * length / 2, cx + dx * length / 2, cy + dy * length / 2))
    return els


def diagonal_lines():
    els = []
    for c in (-80, -40, 0, 40, 80):
        seg = clip_line(c / 2, c / 2, 1, -1)
        if seg:
            els.append(L(*seg))
    return els


def chevron_right(a, w=40, h=50, t=20):
    return [(a, -h), (a + w, 0), (a, h), (a - t, h), (a + w - t, 0), (a - t, -h)]


S06 = ("Geometric Lines and Structures", [
    ("Horizontal lines", lambda: [L(-60, y, 60, y) for y in (-48, -24, 0, 24, 48)]),
    ("Vertical lines", lambda: [L(x, -60, x, 60) for x in (-48, -24, 0, 24, 48)]),
    ("Diagonal lines", diagonal_lines),
    ("30° lines", lambda: angled_lines(30)),
    ("45° lines", lambda: angled_lines(45)),
    ("60° lines", lambda: angled_lines(60)),
    ("Cross", lambda: [PG([(-15, -60), (15, -60), (15, -15), (60, -15), (60, 15), (15, 15), (15, 60), (-15, 60), (-15, 15), (-60, 15), (-60, -15), (-15, -15)], FILL)]),
    ("Diagonal cross", lambda: [P(poly_d(rot_rect(0, 0, 150, 26, 45)) + " " + poly_d(rot_rect(0, 0, 150, 26, -45)), FILL)]),
    ("T-shape", lambda: [PG([(-60, -60), (60, -60), (60, -30), (15, -30), (15, 60), (-15, 60), (-15, -30), (-60, -30)], FILL)]),
    ("L-shape", lambda: [PG([(-50, -60), (-20, -60), (-20, 30), (50, 30), (50, 60), (-50, 60)], FILL)]),
    ("U-shape", lambda: [PG([(-55, -60), (-25, -60), (-25, 30), (25, 30), (25, -60), (55, -60), (55, 60), (-55, 60)], FILL)]),
    ("Corner brackets", lambda: [PL([(-60, -30), (-60, -60), (-30, -60)]), PL([(30, -60), (60, -60), (60, -30)]),
                                 PL([(60, 30), (60, 60), (30, 60)]), PL([(-30, 60), (-60, 60), (-60, 30)])]),
    ("Chevron", lambda: [PG([(-60, -45), (0, 15), (60, -45), (60, -15), (0, 45), (-60, -15)], FILL)]),
    ("Double chevron", lambda: [PG(chevron_right(-25), FILL), PG(chevron_right(20), FILL)]),
    ("Arrow", lambda: [PG([(-60, -14), (10, -14), (10, -40), (60, 0), (10, 40), (10, 14), (-60, 14)], FILL)]),
    ("Line arrow", lambda: [L(-60, 0, 58, 0), PL([(26, -32), (58, 0), (26, 32)])]),
    ("Parallel bars", lambda: [R(x, -60, 22, 120, FILL) for x in (-55, -11, 33)]),
    ("Diagonal bars", lambda: [PG([(x, 60), (x + 18, 60), (x + 58, -60), (x + 40, -60)], FILL) for x in (-58, -30, -2)]),
    ("Steps", lambda: [PG([(-60, 60), (-60, 20), (-20, 20), (-20, -20), (20, -20), (20, -60), (60, -60), (60, 60)], FILL)]),
    ("Zigzag", lambda: [PL([(-60, 20), (-40, -20), (-20, 20), (0, -20), (20, 20), (40, -20), (60, 20)])]),
])

# --------------------------------------------------------------------------
# 7. Modular components
# --------------------------------------------------------------------------
def three_circles(r=26, st=FILL, dy=7):
    d = r / math.sin(math.radians(60))
    return [C(*polar(0, dy, d, a), r, st) for a in (-90, 30, 150)]


def offset_grid():
    els = []
    rows = [-60, -28, 4, 36]
    for i, y in enumerate(rows):
        bricks = [(-60, 36), (-18, 36), (24, 36)] if i % 2 == 0 else [(-60, 15), (-39, 36), (3, 36), (45, 15)]
        els += [R(x, y, w, 24) for x, w in bricks]
    return els


def mosaic():
    els = [P(sector_d(-60, 0, 60, -90, 0), FILL), P(sector_d(0, -60, 60, 0, 90), FILL),
           P(sector_d(0, 60, 60, 180, 270), FILL), P(sector_d(60, 0, 60, 90, 180), FILL)]
    els += [R(-60, -60, 60, 60), R(0, -60, 60, 60), R(-60, 0, 60, 60), R(0, 0, 60, 60)]
    return els


def diamond_lattice():
    els = []
    for i, y in enumerate((-45, -15, 15, 45)):
        for j, x in enumerate((-45, -15, 15, 45)):
            els.append(PG([(x, y - 15), (x + 15, y), (x, y + 15), (x - 15, y)], FILL if (i + j) % 2 == 0 else OUT))
    return els


def honeycomb(r=20, st=OUT):
    w = math.sqrt(3) * r
    centres = [(0, 0), (w, 0), (-w, 0), (w / 2, 1.5 * r), (-w / 2, 1.5 * r), (w / 2, -1.5 * r), (-w / 2, -1.5 * r)]
    return [PG(reg_poly(6, r, -90, cx, cy), st) for cx, cy in centres]


def four_triangles():
    g = 4
    return [PG(t, FILL) for t in (
        [(-60, -60), (-g, -60), (-60, -g)], [(60, -60), (60, -g), (g, -60)],
        [(60, 60), (g, 60), (60, g)], [(-60, 60), (-60, g), (-g, 60)])]


S07 = ("Modular Components", [
    ("Capsule", lambda: [R(-60, -25, 120, 50, OUT, 25)]),
    ("Pill filled", lambda: [R(-60, -18, 120, 36, FILL, 18)]),
    ("Vertical pill", lambda: [R(-22, -60, 44, 120, OUT, 22)]),
    ("Pill stack", lambda: [R(-60, y, 120, 24, FILL, 12) for y in (-48, -12, 24)]),
    ("Repeated circles", lambda: [C(x, y, 14, FILL) for y in (-40, 0, 40) for x in (-40, 0, 40)]),
    ("Repeated squares", lambda: [R(x - 14, y - 14, 28, 28) for y in (-42, 0, 42) for x in (-42, 0, 42)]),
    ("Three circles", three_circles),
    ("Three-part ring", lambda: [P(ringseg_d(0, 0, 60, 30, -90 + i * 120 + 4, -90 + (i + 1) * 120 - 4), FILL) for i in range(3)]),
    ("Four squares", lambda: [R(x, y, 54, 54, FILL) for y in (-60, 6) for x in (-60, 6)]),
    ("Four circles", lambda: [C(x, y, 28) for y in (-30, 30) for x in (-30, 30)]),
    ("Four triangles", four_triangles),
    ("Offset grid", offset_grid),
    ("Mosaic", mosaic),
    ("Interlocking rings", lambda: [CP([circ_d(-20, 0, 40), circ_d(-20, 0, 28)]), C(20, 0, 40), C(20, 0, 28)]),
    ("Diamond lattice", diamond_lattice),
    ("Nested components", lambda: [C(0, 0, 60), R(-42.43, -42.43, 84.85, 84.85), C(0, 0, 42.43), R(-30, -30, 60, 60, FILL)]),
    ("Honeycomb", honeycomb),
    ("Dash row", lambda: [R(-60, -8, 52, 16, FILL, 8), R(6, -8, 28, 16, FILL, 8), R(48, -8, 12, 16, FILL, 6)]),
])

# --------------------------------------------------------------------------
# 8. Negative-space components (compound paths with real holes)
# --------------------------------------------------------------------------
def keyhole_d():
    cy, r, hw = -12, 14, 6
    y0 = cy + math.sqrt(r * r - hw * hw)
    return f"M{p(-hw, y0)} A{n(r)} {n(r)} 0 1 1 {p(hw, y0)} L12,30 L-12,30 Z"


S08 = ("Negative Space", [
    ("Circle cut from square", lambda: [CP([rect_d(-60, -60, 120, 120), circ_d(0, 0, 36)])]),
    ("Square cut from circle", lambda: [CP([circ_d(0, 0, 60), rect_d(-28, -28, 56, 56)])]),
    ("Triangle cut from circle", lambda: [CP([circ_d(0, 0, 60), poly_d(reg_poly(3, 38))])]),
    ("Triangle cut from square", lambda: [CP([rect_d(-60, -60, 120, 120), poly_d([(0, -38), (40, 32), (-40, 32)])])]),
    ("Ring cut-out", lambda: [CP([rect_d(-60, -60, 120, 120), circ_d(0, 0, 48), circ_d(0, 0, 34)])]),
    ("Overlapping negative", lambda: [CP([circ_d(-20, 0, 40), circ_d(20, 0, 40)])]),
    ("Interlocking squares", lambda: [CP([rect_d(-60, -60, 80, 80), rect_d(-20, -20, 80, 80)])]),
    ("Triple negative", lambda: [CP([circ_d(*polar(0, 6, 20, a), 32) for a in (-90, 30, 150)])]),
    ("Geometric holes", lambda: [CP([rect_d(-60, -60, 120, 120)] + [circ_d(x, y, 10) for y in (-36, 0, 36) for x in (-36, 0, 36)])]),
    ("Split circle", lambda: [CP([circle_band_d(60, -60, -5), circle_band_d(60, 5, 60)])]),
    ("Split square", lambda: [CP([poly_d([(-60, -60), (48, -60), (-60, 48)]), poly_d([(60, 60), (-48, 60), (60, -48)])])]),
    ("Quartered square", lambda: [CP([rect_d(x, y, 55, 55) for y in (-60, 5) for x in (-60, 5)])]),
    ("Banded circle", lambda: [CP([circle_band_d(60, a, b) for a, b in ((-60, -41), (-34, -16), (-9, 9), (16, 34), (41, 60))])]),
    ("Hexagon frame", lambda: [CP([poly_d(reg_poly(6, 62)), poly_d(reg_poly(6, 40))])]),
    ("Star cut from circle", lambda: [CP([circ_d(0, 0, 60), poly_d(shift(star(5, 40, 16), 0, 4))])]),
    ("Keyhole", lambda: [CP([circ_d(0, 0, 60), keyhole_d()])]),
    ("Slot cut-out", lambda: [CP([rrect_d(-60, -60, 120, 120, 20), rrect_d(-36, -10, 72, 20, 10)])]),
    ("Concentric cut-outs", lambda: [CP([circ_d(0, 0, r) for r in (60, 45, 30, 15)])]),
])

# --------------------------------------------------------------------------
# 9. Curves and organic geometry
# --------------------------------------------------------------------------
def _shift_path_spiral(d, steps=5):
    # semicircle spiral alternating between two centres, recentred horizontally
    off = -d / 2
    pts = f"M{p(d + off, 6)}"
    for k in range(1, steps + 1):
        r = k * d
        if k % 2 == 1:
            nx = -r
        else:
            nx = d + r
        pts += f" A{n(r)} {n(r)} 0 0 0 {p(nx + off, 6)}"
    return pts


def reuleaux():
    v = shift(reg_poly(3, 58), 0, 8)
    s = math.dist(v[0], v[1])
    d = f"M{p(*v[0])}"
    for i in range(3):
        a, b, c = v[i], v[(i + 1) % 3], v[(i + 2) % 3]
        m = mid(a, b)
        d += arc_through(c[0], c[1], s, a, b, ang(c[0], c[1], *m))
    return [P(d + " Z")]


def concave_diamond():
    pts = [(0, -60), (60, 0), (0, 60), (-60, 0)]
    corners = [(60, -60), (60, 60), (-60, 60), (-60, -60)]
    d = f"M{p(*pts[0])}"
    for i in range(4):
        cx, cy = corners[i]
        d += arc_through(cx, cy, 60, pts[i], pts[(i + 1) % 4], ang(cx, cy, 0, 0))
    return [P(d + " Z", FILL)]


S09 = ("Curves and Organic Geometry", [
    ("S-curve", lambda: [P("M40,-55 C-60,-55 -60,0 0,0 C60,0 60,55 -40,55")]),
    ("Wave", lambda: [P("M-60,0 C-50,-25 -40,-25 -30,0 S-10,25 0,0 S20,-25 30,0 S50,25 60,0")]),
    ("Double wave", lambda: [P("M-60,-14 C-50,-39 -40,-39 -30,-14 S-10,11 0,-14 S20,-39 30,-14 S50,11 60,-14"),
                             P("M-60,14 C-50,-11 -40,-11 -30,14 S-10,39 0,14 S20,-11 30,14 S50,39 60,14")]),
    ("Spiral", lambda: [P(_shift_path_spiral(11))]),
    ("Infinity", lambda: [P("M0,0 C20,-40 60,-40 60,0 C60,40 20,40 0,0 C-20,-40 -60,-40 -60,0 C-60,40 -20,40 0,0 Z")]),
    ("Lens", lambda: [P(lens_d(-60, 0, 60, 0, 75), FILL)]),
    ("Eye", lambda: [P(lens_d(-60, 0, 60, 0, 75)), C(0, 0, 20, FILL)]),
    ("Rounded diamond", lambda: [P(rounded_poly_d([(0, -60), (60, 0), (0, 60), (-60, 0)], 18), FILL)]),
    ("Reuleaux triangle", reuleaux),
    ("Rounded triangle", lambda: [P(rounded_poly_d(eq_tri(70), 22), FILL)]),
    ("Leaf", lambda: [P("M-50,50 Q-50,-50 50,-50 Q50,50 -50,50 Z", FILL)]),
    ("Teardrop", lambda: [P("M0,-62 C0,-62 42,-6 42,18 A42 42 0 0 1 -42,18 C-42,-6 0,-62 0,-62 Z")]),
    ("Quatrefoil", lambda: [P("M30,-30 A30 30 0 0 1 30,30 A30 30 0 0 1 -30,30 A30 30 0 0 1 -30,-30 A30 30 0 0 1 30,-30 Z")]),
    ("Concave diamond", concave_diamond),
    ("S-split circle", lambda: [P("M0,-60 A60 60 0 0 1 0,60 A30 30 0 0 1 0,0 A30 30 0 0 0 0,-60 Z", FILL), C(0, 0, 60)]),
    ("Twisted ribbon", lambda: [P("M-60,0 C-30,-60 30,60 60,0 C30,-60 -30,60 -60,0 Z", FILL)]),
    ("Bell curve", lambda: [P("M-60,40 C-20,40 -20,-40 0,-40 C20,-40 20,40 60,40"), L(-60, 40, 60, 40, GUIDE)]),
])

# --------------------------------------------------------------------------
# 10. Construction grids
# --------------------------------------------------------------------------
def grid(k):
    els = [R(-60, -60, 120, 120, KEY)]
    step = 120 / k
    for i in range(1, k):
        v = -60 + i * step
        els += [L(v, -60, v, 60, GUIDE), L(-60, v, 60, v, GUIDE)]
    return els


def circular_grid():
    return [C(0, 0, r, GUIDE) for r in (12, 24, 36, 48)] + [C(0, 0, 60, KEY), L(-60, 0, 60, 0, GUIDE), L(0, -60, 0, 60, GUIDE)]


def radial_guide():
    els = [C(0, 0, r, GUIDE) for r in (20, 40)] + [C(0, 0, 60, KEY)]
    els += [L(0, 0, *polar(0, 0, 60, i * 15), GUIDE) for i in range(24)]
    return els


def triangular_grid(k=4):
    a, b, c = eq_tri(68)
    els = [PG([a, b, c], KEY)]
    for i in range(1, k):
        f = i / k

        def lerp(u, v):
            return u[0] + (v[0] - u[0]) * f, u[1] + (v[1] - u[1]) * f
        els += [L(*lerp(a, b), *lerp(a, c), GUIDE), L(*lerp(c, a), *lerp(c, b), GUIDE), L(*lerp(b, a), *lerp(b, c), GUIDE)]
    return els


def isometric_grid():
    els = [R(-60, -60, 120, 120, KEY)]
    h = 20
    for a in (30, 150, 90):
        dx, dy = math.cos(math.radians(a)), math.sin(math.radians(a))
        nx, ny = -dy, dx
        for k in range(-8, 9):
            seg = clip_line(nx * h * k, ny * h * k, dx, dy)
            if seg:
                els.append(L(*seg, GUIDE))
    return els


def diagonal_grid():
    els = [R(-60, -60, 120, 120, KEY)]
    for c in range(-90, 91, 30):
        for dx, dy in ((1, -1), (1, 1)):
            seg = clip_line(c / 2, c / 2 * (1 if dy == -1 else -1), dx, dy)
            if seg:
                els.append(L(*seg, GUIDE))
    return els


def golden_rectangle():
    phi = (1 + 5 ** 0.5) / 2
    w, h = 120, 120 / phi
    x, y = -60, -h / 2
    els = [R(x, y, w, h, KEY)]
    spiral = ""
    for i in range(7):
        side = i % 4
        if side == 0:      # square on the left of a landscape rect
            s = h
            sq, c = (x, y, s, s), (x + s, y + s)
            a, b = (x, y + s), (x + s, y)
            x, w = x + s, w - s
        elif side == 1:    # square on top of a portrait rect
            s = w
            sq, c = (x, y, s, s), (x, y + s)
            a, b = (x, y), (x + s, y + s)
            y, h = y + s, h - s
        elif side == 2:    # square on the right
            s = h
            sq, c = (x + w - s, y, s, s), (x + w - s, y)
            a, b = (x + w, y), (x + w - s, y + s)
            w = w - s
        else:              # square at the bottom
            s = w
            sq, c = (x, y + h - s, s, s), (x + s, y + h - s)
            a, b = (x + s, y + h), (x, y + h - s)
            h = h - s
        els.append(R(*sq, GUIDE))
        opp = (2 * (sq[0] + s / 2) - c[0], 2 * (sq[1] + s / 2) - c[1])
        if not spiral:
            spiral = f"M{p(*a)}"
        spiral += arc_through(c[0], c[1], s, a, b, ang(c[0], c[1], *opp))
    els.append(P(spiral, OUT))
    return els


def golden_circles():
    phi = (1 + 5 ** 0.5) / 2
    els = [L(-60, 60, 60, 60, GUIDE)]
    r = 60
    for i in range(5):
        els.append(C(0, 60 - r, r, KEY if i == 0 else GUIDE))
        r /= phi
    return els


def alignment_guide():
    return [C(0, 0, 59.4, GUIDE), C(0, 0, 42, GUIDE), L(-42, -42, 42, 42, GUIDE), L(-42, 42, 42, -42, GUIDE),
            L(-60, 0, 60, 0, GUIDE), L(0, -60, 0, 60, GUIDE), R(-42, -42, 84, 84, KEY)]


def hexagonal_construction():
    els = [C(0, 0, 60, GUIDE), C(0, 0, 51.96, GUIDE), PG(reg_poly(6, 30), GUIDE)]
    els += [L(*polar(0, 0, 60, a), *polar(0, 0, 60, a + 180), GUIDE) for a in (-90, -30, 30)]
    els.append(PG(reg_poly(6, 60), KEY))
    return els


def dot_grid():
    return [C(x, y, 2.2, DOT) for y in range(-60, 61, 20) for x in range(-60, 61, 20)]


def octagonal_construction():
    r = 64 * math.cos(math.radians(22.5))
    return [R(-r, -r, 2 * r, 2 * r, GUIDE), PG([(0, -64), (64, 0), (0, 64), (-64, 0)], GUIDE), C(0, 0, r, GUIDE),
            L(-64, 0, 64, 0, GUIDE), L(0, -64, 0, 64, GUIDE), PG(reg_poly(8, 64, 22.5), KEY)]


def pentagon_construction():
    v = reg_poly(5, 60)
    return [C(0, 0, 60, GUIDE), PG(v, GUIDE), L(0, -60, 0, 60, GUIDE), L(-60, 0, 60, 0, GUIDE),
            PG([v[0], v[2], v[4], v[1], v[3]], KEY)]


S10 = ("Construction Grids", [
    ("2 × 2 grid", lambda: grid(2)),
    ("3 × 3 grid", lambda: grid(3)),
    ("4 × 4 grid", lambda: grid(4)),
    ("5 × 5 grid", lambda: grid(5)),
    ("Circular grid", circular_grid),
    ("Radial grid 15°", radial_guide),
    ("Triangular grid", triangular_grid),
    ("Isometric grid", isometric_grid),
    ("Diagonal grid", diagonal_grid),
    ("Golden ratio rectangle", golden_rectangle),
    ("Golden ratio circles", golden_circles),
    ("Circle + square alignment", alignment_guide),
    ("Hexagonal construction", hexagonal_construction),
    ("Octagonal construction", octagonal_construction),
    ("Pentagon construction", pentagon_construction),
    ("Dot grid", dot_grid),
])

# --------------------------------------------------------------------------
# 11. Combination examples
# --------------------------------------------------------------------------
def triangle_stack():
    a, b, c = eq_tri(68)
    ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
    return [PG([a, ab, ca], FILL), PG([ab, b, bc], FILL), PG([ca, bc, c], FILL)]


def grid_circle():
    els = []
    for y in (-42, 0, 42):
        for x in (-42, 0, 42):
            els.append(C(0, 0, 17, FILL) if x == 0 and y == 0 else R(x - 17, y - 17, 34, 34))
    return els


S11 = ("Combination Examples", [
    ("Circle + square", lambda: [R(-60, -60, 80, 80, FILL), C(20, 20, 40)]),
    ("Triangle + circle", lambda: [C(0, -24, 34, FILL), PG([(0, -36), (56, 58), (-56, 58)])]),
    ("Circle chain", lambda: [CP([circ_d(x, 0, 30) for x in (-30, 0, 30)])]),
    ("Concentric + cross lines", lambda: [C(0, 0, r) for r in (18, 36, 54)] + [L(-60, 0, 60, 0), L(0, -60, 0, 60)]),
    ("Circle + speed lines", lambda: [C(24, 0, 34, FILL)] + [L(-60, y, -18, y) for y in (-20, 0, 20)]),
    ("Square + diagonal", lambda: [PG([(60, -60), (60, 60), (-60, 60)], FILL), R(-60, -60, 120, 120), L(-60, 60, 60, -60)]),
    ("Circle + triangle cut-out", lambda: [CP([circ_d(0, 0, 60), poly_d([(-18, -30), (34, 0), (-18, 30)])])]),
    ("Three-circle trefoil", lambda: three_circles(26, FILL, 0) + [C(0, 0, 56)]),
    ("Hexagon + circle cut-out", lambda: [CP([poly_d(reg_poly(6, 62)), circ_d(0, 0, 26)]), C(0, 0, 10, FILL)]),
    ("Quarter-circle pinwheel", lambda: [P(sector_d(cx, cy, 56, a, a + 90), FILL) for cx, cy, a in
                                         ((-58, -2, -90), (2, -58, 0), (58, 2, 90), (-2, 58, 180))]),
    ("Rainbow arches", lambda: [P(ringseg_d(0, 30, ro, ri, 180, 360), FILL) for ro, ri in ((60, 48), (42, 30), (24, 12))]),
    ("Diamond in circle", lambda: [PG([(0, -60), (60, 0), (0, 60), (-60, 0)], FILL), C(0, 0, 60)]),
    ("Offset half circles", lambda: [P(sector_d(-12, 0, 48, 180, 360), FILL), P(sector_d(12, 0, 48, 0, 180))]),
    ("Ring + bar", lambda: [CP([circ_d(0, 0, 56), circ_d(0, 0, 36)]), R(-8, -60, 16, 120, FILL)]),
    ("Grid + circle", grid_circle),
    ("Triangle stack", triangle_stack),
    ("Capsule + dot", lambda: [R(-60, -24, 120, 48, OUT, 24), C(36, 0, 14, FILL)]),
    ("Split diamond", lambda: [PG([(-4, -60), (-4, 60), (-64, 0)], FILL), PG([(4, -60), (64, 0), (4, 60)])]),
])

SECTIONS = [S01, S02, S03, S04, S05, S06, S07, S08, S09, S10, S11]

# --------------------------------------------------------------------------
# Layout
# --------------------------------------------------------------------------
TILE = 170
GAP_X = 20
LABEL_H = 28
ROW_GAP = 14
COLS = 10
MARGIN = 120
GUTTER = 160
HEADER_H = 52
BLOCK_GAP = 44
TOP = 270

BLOCK_W = COLS * TILE + (COLS - 1) * GAP_X
BLOCK_H = HEADER_H + 2 * (TILE + LABEL_H + ROW_GAP)
WIDTH = 2 * MARGIN + 2 * BLOCK_W + GUTTER
ROWS = (len(SECTIONS) + 2) // 2
HEIGHT = TOP + ROWS * BLOCK_H + (ROWS - 1) * BLOCK_GAP + 80


def slug(s):
    out = []
    for ch in s.lower().replace("×", "x").replace("°", "deg").replace("+", "plus"):
        out.append(ch if ch.isalnum() else "-")
    return "-".join(filter(None, "".join(out).split("-")))


def text(x, y, s, size, weight="normal", fill="#333333", anchor="start", tid=None):
    i = f' id="{tid}"' if tid else ""
    return (f'<text{i} x="{n(x)}" y="{n(y)}" {FONT} font-size="{size}" font-weight="{weight}" '
            f'fill="{fill}" text-anchor="{anchor}">{escape(s)}</text>')


def block_origin(idx):
    row, col = divmod(idx, 2)
    return MARGIN + col * (BLOCK_W + GUTTER), TOP + row * (BLOCK_H + BLOCK_GAP)


def tile_origin(bx, by, i):
    r, c = divmod(i, COLS)
    return bx + c * (TILE + GAP_X), by + HEADER_H + r * (TILE + LABEL_H + ROW_GAP)


def build():
    total = sum(len(items) for _, items in SECTIONS)
    bg, txt, layers = [], [], []

    bg.append(R(0, 0, WIDTH, HEIGHT, 'fill="#ffffff" stroke="none"'))

    txt.append(text(MARGIN, 128, "Geometric Logo Component Playground", 64, "bold", "#000000", tid="title"))
    txt.append(text(MARGIN, 178, "A library of editable vector building blocks for experimental logo construction. "
                    "Select, copy, combine, overlap, subtract, recolour and scale.", 24, fill="#555555", tid="subtitle"))
    txt.append(text(MARGIN, 214, f"{total} components  ·  {len(SECTIONS)} categories  ·  2 px black outline  ·  "
                    f"#9A9A9A fill  ·  even-odd compound paths for cut-outs  ·  0.75 px #8C8C8C construction guides",
                    16, fill="#777777", tid="meta"))
    bg.append(L(MARGIN, 236, WIDTH - MARGIN, 236, 'fill="none" stroke="#000000" stroke-width="1"'))

    for si, (title, items) in enumerate(SECTIONS, start=1):
        bx, by = block_origin(si - 1)
        sid = f"s{si:02d}"
        txt.append(text(bx, by + 30, f"{si:02d}", 22, "bold", "#9a9a9a"))
        txt.append(text(bx + 40, by + 30, title, 22, "bold", "#000000", tid=f"{sid}-title"))
        txt.append(text(bx + BLOCK_W, by + 30, f"{len(items)} components", 14, fill="#777777", anchor="end"))
        comps = []
        for ci, (name, fn) in enumerate(items, start=1):
            tx, ty = tile_origin(bx, by, ci - 1)
            bg.append(R(tx, ty, TILE, TILE, f'fill="{TILE_GREY}" stroke="none"', 8))
            txt.append(text(tx + TILE / 2, ty + TILE + 20, name, 13, anchor="middle"))
            cid = f"c{si:02d}-{ci:02d}-{slug(name)}"
            body = "\n      ".join(fn())
            comps.append(f'    <g id="{cid}" transform="translate({n(tx + TILE / 2)} {n(ty + TILE / 2)})">\n'
                         f'      {body}\n    </g>')
        layers.append(f'  <g id="{sid}-{slug(title)}">\n' + "\n".join(comps) + "\n  </g>")

    # Notes / legend panel in the free slot of the final row
    nx, ny = block_origin(len(SECTIONS))
    bg.append(R(nx, ny + HEADER_H, BLOCK_W, 2 * TILE + LABEL_H + ROW_GAP, f'fill="{TILE_GREY}" stroke="none"', 8))
    notes = []
    txt.append(text(nx, ny + 30, "Legend and Notes", 22, "bold", "#000000", tid="notes-title"))
    lx, ly = nx + 40, ny + HEADER_H + 50
    legend = [
        ("Outline  ·  2 px black stroke, no fill", [R(lx, ly - 22, 44, 30, OUT)]),
        ("Filled  ·  #9A9A9A fill with 2 px black stroke", [R(lx, ly + 38, 44, 30, FILL)]),
        ("Cut-out  ·  even-odd compound path (real hole, not a white shape)",
         [CP([rect_d(lx, ly + 98, 44, 30), circ_d(lx + 22, ly + 113, 9)])]),
        ("Construction guide  ·  0.75 px #8C8C8C stroke", [L(lx, ly + 173, lx + 44, ly + 173, GUIDE),
                                                         L(lx, ly + 163, lx + 44, ly + 163, GUIDE),
                                                         L(lx, ly + 183, lx + 44, ly + 183, GUIDE)]),
        ("Key construction line  ·  1 px black stroke", [L(lx, ly + 233, lx + 44, ly + 233, KEY)]),
    ]
    for i, (label, els) in enumerate(legend):
        notes += els
        txt.append(text(lx + 70, ly + i * 60, label, 18, fill="#333333"))
    tips = [
        "Every component is its own named group (ID pattern c<section>-<index>-<name>).",
        "Each section is a top-level layer; lock the 'background' layer to click components freely.",
        "Components are drawn in a 120 × 120 unit box centred in each tile.",
        "Use Pathfinder (Unite, Minus Front, Intersect, Divide) to merge or subtract pieces.",
        "Release compound paths (Object > Compound Path > Release) to edit holes separately.",
    ]
    tx0 = nx + 900
    for i, t in enumerate(tips):
        txt.append(text(tx0, ly + i * 34, "—  " + t, 15, fill="#555555"))
    layers.append('  <g id="legend-and-notes">\n    ' + "\n    ".join(notes) + "\n  </g>")

    svg = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="{WIDTH}px" height="{HEIGHT}px" '
        f'viewBox="0 0 {WIDTH} {HEIGHT}">',
        "  <title>Geometric Logo Component Playground</title>",
        '  <g id="background">\n    ' + "\n    ".join(bg) + "\n  </g>",
        '  <g id="text-and-labels">\n    ' + "\n    ".join(txt) + "\n  </g>",
        *layers,
        "</svg>",
        "",
    ]
    return "\n".join(svg), total


if __name__ == "__main__":
    out, total = build()
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "geometric-logo-component-playground.svg")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(out)
    print(f"Wrote {path}: {total} components, {WIDTH} x {HEIGHT}")
