// Screen-space overlay: selection frame and handles, anchors, character
// boxes, text caret, smart guides, marquee and drawing previews.
import { S, on, selected, single, toScreen } from './state.js';
import { svgEl } from './render.js';
import { localBounds, aabb, objD } from './objects.js';
import { toWorld, rotv, r3 } from './geom.js';
import { layoutText, caretAt } from './typography.js';
import { leaves } from './model.js';

let g;
export const transient = { marquee: null, pen: null, free: null };
const HANDLES = { nw: [0, 0], n: [.5, 0], ne: [1, 0], e: [1, .5], se: [1, 1], s: [.5, 1], sw: [0, 1], w: [0, .5] };
export const handlePos = h => HANDLES[h];

/** The selection frame: a pose plus a box in that pose's local space. */
export function frame() {
  const sel = selected(); if (!sel.length) return null;
  if (sel.length === 1 && sel[0].type !== 'group') return { pose: sel[0], b: localBounds(sel[0]), single: sel[0] };
  const b = aabb(sel); return b && { pose: { x: 0, y: 0, rotation: 0 }, b, single: null };
}
const P = (pose, x, y) => toScreen(toWorld(pose, { x, y }));
const pts = a => a.map(p => `${r3(p.x)},${r3(p.y)}`).join(' ');
const objMatrix = o => `translate(${r3(S.pan.x)} ${r3(S.pan.y)}) scale(${S.zoom}) translate(${r3(o.x)} ${r3(o.y)}) rotate(${r3(o.rotation || 0)})`;

export function initOverlay() {
  g = document.getElementById('overlay');
  let raf = 0; const draw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; drawOverlay(); }); };
  for (const ev of ['doc', 'selection', 'view', 'tool', 'overlay']) on(ev, draw);
  document.addEventListener('selectionchange', draw);
}

export function drawOverlay() {
  g.textContent = '';
  const tool = S.tool, one = single();
  // smart guides
  for (const gd of S.guides) {
    if (gd.x != null) { const x = r3(gd.x * S.zoom + S.pan.x); svgEl('line', { x1: x, x2: x, y1: -1e4, y2: 1e4, class: 'ov-guide' }, g); }
    else { const y = r3(gd.y * S.zoom + S.pan.y); svgEl('line', { y1: y, y2: y, x1: -1e4, x2: 1e4, class: 'ov-guide' }, g); }
  }
  if (S.editing && one && one.type === 'text') drawEditing(one);
  else if (tool === 'char' && one && one.type === 'text') drawChars(one);
  else if (tool === 'direct') { for (const o of selected().flatMap(x => leaves(x))) drawOutline(o); if (one && one.type === 'path') drawAnchors(one); }
  else drawFrame(tool === 'select');
  if (transient.marquee) {
    const m = transient.marquee, a = toScreen(m), b = toScreen({ x: m.x + m.w, y: m.y + m.h });
    svgEl('rect', { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y, class: 'ov-marquee' }, g);
  }
  if (transient.pen) svgEl('path', { d: transient.pen, transform: `translate(${S.pan.x} ${S.pan.y}) scale(${S.zoom})`, class: 'ov-preview' }, g);
  if (transient.free) svgEl('polyline', { points: pts(transient.free.map(toScreen)), class: 'ov-preview' }, g);
}

function drawOutline(o) {
  if (o.type === 'text') { const b = localBounds(o); svgEl('polygon', { points: pts([[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => P(o, b.x + b.w * u, b.y + b.h * v))), class: 'ov-frame' }, g); }
  else svgEl('path', { d: objD(o), transform: objMatrix(o), class: 'ov-outline' }, g);
}

function drawFrame(withHandles) {
  const f = frame(); if (!f) return;
  const { pose, b } = f, c = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => P(pose, b.x + b.w * u, b.y + b.h * v));
  if (selected().length > 1) for (const o of selected()) { const bb = aabb(o); if (bb) { const a = toScreen(bb); svgEl('rect', { x: a.x, y: a.y, width: bb.w * S.zoom, height: bb.h * S.zoom, class: 'ov-frame faint' }, g); } }
  svgEl('polygon', { points: pts(c), class: 'ov-frame' }, g);
  if (!withHandles) return;
  const up = rotv(0, -1, pose.rotation || 0), top = P(pose, b.x + b.w / 2, b.y), rp = { x: top.x + up.x * 24, y: top.y + up.y * 24 };
  svgEl('line', { x1: top.x, y1: top.y, x2: rp.x, y2: rp.y, class: 'ov-frame' }, g);
  svgEl('circle', { cx: rp.x, cy: rp.y, r: 4.5, class: 'ov-handle rot', 'data-h': 'rot' }, g);
  for (const h in HANDLES) {
    const [u, v] = HANDLES[h], p = P(pose, b.x + b.w * u, b.y + b.h * v);
    svgEl('rect', { x: p.x - 4, y: p.y - 4, width: 8, height: 8, class: 'ov-handle', 'data-h': h, transform: `rotate(${pose.rotation || 0} ${r3(p.x)} ${r3(p.y)})` }, g);
  }
}

function drawAnchors(o) {
  const n = o.segs.length;
  o.segs.forEach((s, i) => {
    if (!S.anchors.includes(i)) return;
    for (const [k, hx, hy] of [['in', s.ix, s.iy], ['out', s.ox, s.oy]]) {
      if (!hx && !hy) continue;
      const a = P(o, s.x, s.y), h = P(o, s.x + hx, s.y + hy);
      svgEl('line', { x1: a.x, y1: a.y, x2: h.x, y2: h.y, class: 'ov-hline' }, g);
      svgEl('circle', { cx: h.x, cy: h.y, r: 4, class: 'ov-hdot', 'data-hd': k, 'data-i': i }, g);
    }
  });
  o.segs.forEach((s, i) => {
    const p = P(o, s.x, s.y);
    svgEl('rect', { x: p.x - 4, y: p.y - 4, width: 8, height: 8, class: 'ov-anchor' + (S.anchors.includes(i) ? ' sel' : '') + (i === 0 ? ' first' : ''), 'data-a': i }, g);
  });
  void n;
}

function glyphPoly(o, gl) {
  const b = gl.box;
  return [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map(([x, y]) => {
    const r = rotv(x - gl.cx, y - gl.cy, gl.rot); return P(o, gl.cx + r.x, gl.cy + r.y);
  });
}
function drawChars(o) {
  const L = layoutText(o);
  for (const line of L.lines) { const a = P(o, line.x0, line.y), b = P(o, line.x1, line.y); svgEl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'ov-baseline' }, g); }
  for (const gl of L.glyphs) {
    if (gl.ch === ' ') continue;
    svgEl('polygon', { points: pts(glyphPoly(o, gl)), class: 'ov-char' + (S.chars.includes(gl.ci) ? ' sel' : ''), 'data-ci': gl.ci }, g);
  }
}
function drawEditing(o) {
  const L = layoutText(o), b = L.bounds, ta = document.getElementById('text-input');
  svgEl('polygon', { points: pts([[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => P(o, b.x + b.w * u, b.y + b.h * v))), class: 'ov-frame edit' }, g);
  const a = Math.min(ta.selectionStart, ta.selectionEnd), z = Math.max(ta.selectionStart, ta.selectionEnd);
  for (const gl of L.glyphs) if (gl.ci >= a && gl.ci < z) svgEl('polygon', { points: pts(glyphPoly(o, gl)), class: 'ov-textsel' }, g);
  const c = caretAt(L, ta.selectionEnd), p1 = P(o, c.x, c.y - c.asc), p2 = P(o, c.x, c.y + c.desc);
  svgEl('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, class: 'ov-caret' }, g);
}
