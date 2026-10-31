"""Render email and social thumbnails from the creative-variation parameters.

    python generator/thumbnails.py --scale medium

Reads data/<scale>/tables/creatives and generator/brand.json, writes
data/<scale>/thumbs/atlas_NNN.png + index.json. Creative i sits in atlas i // per_atlas,
slot i % per_atlas, at x = (slot % cols) * cell, y = (slot // cols) * cell.
Deterministic: same creatives table => identical PNG bytes.
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from common import Store, IMAGE_STYLES  # noqa: E402

CELL, ATLAS = 128, 2048
COLS = ATLAS // CELL
PER_ATLAS = COLS * COLS


def hex2rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(int(round(a[i] * (1 - t) + b[i] * t)) for i in range(3))


FONT_CACHE = {}


def font(size):
    if size not in FONT_CACHE:
        FONT_CACHE[size] = ImageFont.load_default(size)   # Pillow's bundled font: same everywhere
    return FONT_CACHE[size]


def wrap(draw, text, f, width):
    lines, cur = [], ""
    for w in text.split():
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=f) <= width or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def picture(rng, style, w, h, pal):
    """The image area, drawn from the image_style parameter."""
    bg, fg, hi = pal
    img = Image.new("RGB", (w, h), mix(bg, fg, 0.15))
    d = ImageDraw.Draw(img)
    s = IMAGE_STYLES[style]
    if s == "abstract_photo":
        for _ in range(7):
            x, y, r = rng.integers(0, w), rng.integers(0, h), rng.integers(h // 4, h)
            d.ellipse([x - r, y - r, x + r, y + r], fill=mix([bg, fg, hi][rng.integers(3)], (128, 128, 128), rng.random() * .4))
        img = img.filter(ImageFilter.GaussianBlur(6))
    elif s == "geometric":
        for _ in range(6):
            x, y, r = rng.integers(0, w), rng.integers(0, h), rng.integers(6, h // 2)
            c = [fg, hi, mix(fg, hi, .5)][rng.integers(3)]
            if rng.random() < .5:
                d.rectangle([x - r, y - r, x + r, y + r], fill=c)
            else:
                d.polygon([(x, y - r), (x + r, y + r), (x - r, y + r)], fill=c)
    elif s == "gradient":
        a, b = [fg, hi, bg][rng.integers(3)], [fg, hi, bg][rng.integers(3)]
        for x in range(w):
            d.line([(x, 0), (x, h)], fill=mix(a, b, x / max(w - 1, 1)))
    elif s == "line_art":
        img.paste(mix(bg, (255, 255, 255), .3), [0, 0, w, h])
        for _ in range(14):
            pts = [(int(rng.integers(0, w)), int(rng.integers(0, h))) for _ in range(3)]
            d.line(pts, fill=fg, width=1)
        r = rng.integers(h // 5, h // 2)
        cx, cy = rng.integers(r, w - r + 1), rng.integers(0, h)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=hi, width=2)
    elif s == "data_pattern":
        n = int(rng.integers(6, 14))
        bw = w / n
        vals = np.cumsum(rng.normal(0, 1, n))
        vals = (vals - vals.min()) / max(np.ptp(vals), 1e-9)
        for i, v in enumerate(vals):
            top = int(h - 4 - v * (h - 12))
            d.rectangle([int(i * bw) + 1, top, int((i + 1) * bw) - 2, h], fill=hi if i == n - 1 else fg)
    else:  # typographic
        img.paste(fg, [0, 0, w, h])
        ch = "ABCDEFGHKMNPRSTVWXZ"[rng.integers(19)]
        d.text((w // 2, h // 2), ch, font=font(int(h * 0.9)), fill=hi, anchor="mm")
    return img


def mark(d, x, y, pal, letters):
    """Invented brand mark: a small square monogram."""
    bg, fg, hi = pal
    d.rectangle([x, y, x + 15, y + 15], fill=fg)
    d.rectangle([x + 11, y, x + 15, y + 4], fill=hi)
    d.text((x + 8, y + 8), letters, font=font(8), fill=bg, anchor="mm")


def render(cre_i, cre, palettes, letters):
    rng = np.random.default_rng(int(cre["variant_seed"][cre_i]))
    pal = [hex2rgb(c) for c in palettes[int(cre["palette"][cre_i]) % len(palettes)]]
    bg, fg, hi = pal
    layout = int(cre["layout"][cre_i])
    style = int(cre["image_style"][cre_i])
    head = cre["headline"][cre_i]
    is_email = cre["channel"][cre_i] == 0
    im = Image.new("RGB", (CELL, CELL), (230, 230, 230))
    d = ImageDraw.Draw(im)
    if is_email:
        # portrait email card centred in the square cell
        x0, w = 20, 88
        d.rectangle([x0, 0, x0 + w - 1, CELL - 1], fill=bg)
        d.rectangle([x0, 0, x0 + w - 1, 17], fill=mix(bg, fg, .08))
        mark(d, x0 + 3, 1, pal, letters)
        pic_h = [44, 52, 36, 56, 48, 40][layout]
        top = layout % 2 == 0                       # picture above or below the text
        pic_y = 20 if top else CELL - pic_h - 4
        im.paste(picture(rng, style, w - 8, pic_h, pal), (x0 + 4, pic_y))
        ty = pic_y + pic_h + 4 if top else 21
        by = CELL - 13 if top else pic_y - 13      # call-to-action button
        f = font(9)
        lines = wrap(d, head, f, w - 10)[:max((by - 3 - ty) // 10, 1)]
        for ln in lines:
            d.text((x0 + 5, ty), ln, font=f, fill=fg)
            ty += 10
        for k in range(3):  # body-text placeholder lines
            yy = ty + 2 + k * 4
            if yy < by - 3:
                d.line([(x0 + 5, yy), (x0 + w - 8 - k * 9, yy)], fill=mix(bg, fg, .35))
        d.rectangle([x0 + 5, by, x0 + 45, by + 8], fill=hi)
    else:
        im.paste(picture(rng, style, CELL, CELL, pal), (0, 0))
        band_h = [44, 52, 38, 60, 48, 56][layout]
        band_y = CELL - band_h if layout < 3 else 0
        band = Image.new("RGB", (CELL, band_h), bg)
        im.paste(Image.blend(im.crop((0, band_y, CELL, band_y + band_h)), band, 0.88), (0, band_y))
        f = font(11)
        ty = band_y + 5
        for ln in wrap(d, head, f, CELL - 12)[:3]:
            d.text((6, ty), ln, font=f, fill=fg)
            ty += 12
        mx, my = (CELL - 20, 4) if layout < 3 else (CELL - 20, CELL - 20)
        mark(d, mx, my, pal, letters)
    return im


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scale", default="small")
    ap.add_argument("--data", default=None, help="store folder (default data/<scale>)")
    a = ap.parse_args()
    root = a.data or os.path.join(REPO, "data", a.scale)
    with open(os.path.join(HERE, "brand.json"), encoding="utf-8") as f:
        brand = json.load(f)
    cre = Store(root).table("creatives")
    n = len(cre["campaign"])
    out = os.path.join(root, "thumbs")
    os.makedirs(out, exist_ok=True)
    atlases = []
    for a_i in range((n + PER_ATLAS - 1) // PER_ATLAS):
        atlas = Image.new("RGB", (ATLAS, ATLAS), (0, 0, 0))
        for slot in range(PER_ATLAS):
            i = a_i * PER_ATLAS + slot
            if i >= n:
                break
            atlas.paste(render(i, cre, brand["creative_palettes"], brand["mark_letters"]),
                        ((slot % COLS) * CELL, (slot // COLS) * CELL))
        name = f"atlas_{a_i:03d}.png"
        atlas.save(os.path.join(out, name), optimize=False, compress_level=6)
        atlases.append(name)
    index = {"count": n, "cell": CELL, "atlas_size": ATLAS, "cols": COLS, "per_atlas": PER_ATLAS,
             "atlases": atlases,
             "layout": "creative i -> atlases[i // per_atlas], slot = i % per_atlas, "
                       "x = (slot % cols) * cell, y = (slot // cols) * cell"}
    with open(os.path.join(out, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, indent=1, sort_keys=True)
        f.write("\n")
    print(f"{n} thumbnails in {len(atlases)} atlases -> {out}")


if __name__ == "__main__":
    main()
