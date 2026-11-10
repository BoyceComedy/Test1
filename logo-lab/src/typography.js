// Text layout engine. Lays out a text object glyph by glyph from the font's
// own outlines and metrics, applying text-level settings (tracking, word
// spacing, scale, kerning) and per-character overrides (kern, offset,
// baseline, rotation, scale, colour). The text itself stays an editable string.
import { fontFor } from './fonts.js';
import { r3, D2R } from './geom.js';

function cmdsToD(cmds, a, b, c, d, e, f) {
  let s = '';
  const X = (x, y) => r3(a * x + c * y + e), Y = (x, y) => r3(b * x + d * y + f);
  for (const k of cmds) {
    if (k.type === 'M') s += `M${X(k.x, k.y)} ${Y(k.x, k.y)}`;
    else if (k.type === 'L') s += `L${X(k.x, k.y)} ${Y(k.x, k.y)}`;
    else if (k.type === 'C') s += `C${X(k.x1, k.y1)} ${Y(k.x1, k.y1)} ${X(k.x2, k.y2)} ${Y(k.x2, k.y2)} ${X(k.x, k.y)} ${Y(k.x, k.y)}`;
    else if (k.type === 'Q') s += `Q${X(k.x1, k.y1)} ${Y(k.x1, k.y1)} ${X(k.x, k.y)} ${Y(k.x, k.y)}`;
    else if (k.type === 'Z') s += 'Z';
  }
  return s;
}

export function layoutText(o) {
  const font = fontFor(o.font), s = o.size / font.unitsPerEm, hS = o.hScale || 1, vS = o.vScale || 1;
  const os2 = font.tables.os2 || {}, em = o.size / 1000;
  const asc = font.ascender * s * vS, desc = -font.descender * s * vS;
  const capH = (os2.sCapHeight || font.ascender * 0.7) * s * vS, xH = (os2.sxHeight || font.ascender * 0.5) * s * vS;
  const lh = (o.lineHeight || 1.2) * o.size * vS, text = o.text || '', chars = o.chars || [], area = o.box > 0;

  // 1. paragraphs → items with advances
  let lines = [], cur = { start: 0, items: [] }, prev = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n') { cur.end = i; lines.push(cur); cur = { start: i + 1, items: [] }; prev = null; continue; }
    const g = font.charToGlyph(ch), ov = chars[i] || {}, cs = ov.scale || 1;
    let k = prev && o.kerning !== false ? font.getKerningValue(prev, g) * s * hS : 0;
    const gw = (g.advanceWidth || 0) * s * hS * cs;
    cur.items.push({ ci: i, ch, g, k, uk: (ov.kern || 0) * em, gw, adv: gw + (o.tracking || 0) * em + (ch === ' ' ? (o.wordSpacing || 0) * em : 0), ov, cs });
    prev = g;
  }
  cur.end = text.length; lines.push(cur);

  // 2. wrap area text at word boundaries
  if (area) {
    const out = [];
    for (const L of lines) {
      let start = 0, x = 0, lastSpace = -1;
      for (let i = 0; i < L.items.length; i++) {
        const it = L.items[i];
        x += (i === start ? 0 : it.k) + it.uk + it.adv;
        if (it.ch === ' ') lastSpace = i;
        else if (x > o.box && lastSpace >= start) {
          out.push({ start: L.items[start].ci, end: L.items[lastSpace].ci + 1, items: L.items.slice(start, lastSpace + 1), soft: true });
          start = lastSpace + 1; lastSpace = -1; x = 0; i = start - 1;
        }
      }
      out.push({ start: L.items[start] ? L.items[start].ci : L.start, end: L.end, items: L.items.slice(start) });
    }
    lines = out;
  }

  // 3. position glyphs
  const glyphs = [];
  lines.forEach((L, li) => {
    let w = 0;
    L.items.forEach((it, i) => { w += (i ? it.k : 0) + it.uk + it.adv; });
    const y = (area ? asc : 0) + li * lh - (o.baseline || 0);
    const span = area ? o.box : 0;
    let pen = o.align === 'center' ? (span - w) / 2 : o.align === 'right' ? span - w : 0;
    L.y = y; L.x0 = pen; L.carets = [];
    L.items.forEach((it, i) => {
      pen += (i ? it.k : 0) + it.uk;
      L.carets.push(pen);
      const ov = it.ov, tx = pen + (ov.dx || 0) * em, ty = y + (ov.dy || 0) * em;
      const sx = hS * it.cs, sy = vS * it.cs, a = (ov.rot || 0) * D2R, c = Math.cos(a), sn = Math.sin(a);
      const cx = it.gw / 2, cy = -capH * it.cs / 2;
      const e = tx + cx - (c * cx - sn * cy), f = ty + cy - (sn * cx + c * cy);
      const cmds = it.g.getPath(0, 0, o.size).commands;
      glyphs.push({ ci: it.ci, ch: it.ch, d: cmds.length ? cmdsToD(cmds, c * sx, sn * sx, -sn * sy, c * sy, e, f) : '', fill: ov.fill || null,
        box: { x: tx, y: ty - asc * it.cs, w: it.gw, h: (asc + desc) * it.cs }, cx: tx + cx, cy: ty + cy, rot: ov.rot || 0, ox: e, oy: f, fontSize: o.size * it.cs });
      pen += it.adv;
    });
    L.carets.push(pen); L.x1 = pen;
  });

  // 4. bounds
  let bounds;
  const n = lines.length;
  if (area) bounds = { x: 0, y: 0, w: o.box, h: asc + (n - 1) * lh + desc };
  else {
    let x0 = Math.min(...lines.map(L => L.x0)), x1 = Math.max(...lines.map(L => L.x1));
    if (x1 - x0 < o.size * 0.25) { const m = (x0 + x1) / 2, hw = o.size * 0.125; x0 = Math.min(x0, m - hw); x1 = Math.max(x1, m + hw); }
    bounds = { x: x0, y: -asc - (o.baseline || 0), w: x1 - x0, h: asc + (n - 1) * lh + desc };
  }
  return { glyphs, lines, bounds, metrics: { asc, desc, capH, xH, lh } };
}

/** Caret position (local) in front of character index i. */
export function caretAt(layout, i) {
  let L = layout.lines[0];
  for (const l of layout.lines) if (i >= l.start && i <= l.end) L = l;
  const k = Math.max(0, Math.min(i - L.start, L.carets.length - 1));
  return { x: L.carets[k], y: L.y, asc: layout.metrics.asc, desc: layout.metrics.desc };
}
/** Character index nearest to a local point. */
export function indexAt(layout, p) {
  let L = layout.lines[0], best = Infinity;
  for (const l of layout.lines) { const d = Math.abs(p.y - (l.y - layout.metrics.capH / 2)); if (d < best) { best = d; L = l; } }
  let k = 0; best = Infinity;
  L.carets.forEach((x, i) => { const d = Math.abs(p.x - x); if (d < best) { best = d; k = i; } });
  return Math.min(L.start + k, L.end);
}
