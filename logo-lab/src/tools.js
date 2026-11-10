// Canvas tools. Each tool implements down / move / up (+ optional dblclick,
// key, finish). The context `c` carries the document point, modifiers and the
// DOM target; hit testing uses the rendered SVG itself.
import { S, select, selected, single, commit, touch, emit, on, setTool } from './state.js';
import { find, make, clone, cloneFresh, leaves, spliceChars } from './model.js';
import { toLocal, toWorld, rotv, seg, dist, simplify, smoothSegs, pathD, r3 } from './geom.js';
import { aabb, scaleLocal, scaleWorld, rotateWorld, localBounds } from './objects.js';
import { layoutText, indexAt } from './typography.js';
import { targets, snapPoint, snapMove } from './snap.js';
import { frame, handlePos, transient } from './overlay.js';
import { addObject, removeById } from './actions.js';

export const tools = {};
let drag = null;
const refresh = () => emit('overlay');

/** Topmost object under a client point (probes a few pixels around for thin strokes). */
export function hitObject(c) {
  const probe = (x, y) => {
    const el = document.elementFromPoint(x, y), og = el && el.closest && el.closest('#layers .obj');
    if (!og) return null;
    const f = find(S.doc, og.dataset.id);
    return f && { id: f.root.id, leaf: f.obj, ci: el.dataset.ci != null ? +el.dataset.ci : null };
  };
  const { clientX: x, clientY: y } = c.e;
  for (const [dx, dy] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3], [3, 3], [-3, -3], [3, -3], [-3, 3]]) { const h = probe(x + dx, y + dy); if (h) return h; }
  return null;
}
const snapshot = () => new Map(selected().flatMap(o => leaves(o)).map(o => [o.id, clone(o)]));
const restore = origs => { for (const [id, o] of origs) { const f = find(S.doc, id); if (f) Object.assign(f.obj, clone(o)); } };

// ── Selection ────────────────────────────────────────────────────────────
tools.select = {
  down(c) {
    const h = c.target.dataset && c.target.dataset.h;
    if (h) {
      const fr = frame(), b = fr.b, ctr = toWorld(fr.pose, { x: b.x + b.w / 2, y: b.y + b.h / 2 });
      drag = { mode: h === 'rot' ? 'rotate' : 'resize', h, fr: { pose: clone({ x: fr.pose.x, y: fr.pose.y, rotation: fr.pose.rotation || 0 }), b, single: !!fr.single },
        origs: snapshot(), ctr, a0: Math.atan2(c.p.y - ctr.y, c.p.x - ctr.x), changed: false };
      return;
    }
    const hit = hitObject(c);
    if (hit) {
      if (c.shift) { select(S.selection.includes(hit.id) ? S.selection.filter(i => i !== hit.id) : [...S.selection, hit.id]); if (!S.selection.includes(hit.id)) return; }
      else if (!S.selection.includes(hit.id)) select([hit.id]);
      drag = { mode: 'move', start: c.p, moved: false, hit: hit.id, origs: null, alt: c.alt };
    } else {
      if (!c.shift) select([]);
      drag = { mode: 'marquee', start: c.p, base: [...S.selection] };
    }
  },
  move(c) {
    if (!drag) return;
    if (drag.mode === 'move') {
      let dx = c.p.x - drag.start.x, dy = c.p.y - drag.start.y;
      if (!drag.moved) {
        if (Math.hypot(dx, dy) * S.zoom < 3) return;
        drag.moved = true;
        if (drag.alt) { // alt-drag duplicates
          const ids = [];
          for (const id of S.selection) { const f = find(S.doc, id), cp = cloneFresh(f.obj); f.arr.splice(f.index + 1, 0, cp); ids.push(cp.id); }
          select(ids);
        }
        drag.origs = snapshot(); drag.box = aabb(selected()); drag.T = targets(S.selection);
      }
      if (c.shift) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      ({ dx, dy } = snapMove(drag.box, dx, dy, drag.T, c.ctrl));
      for (const [id, o] of drag.origs) { const f = find(S.doc, id); f.obj.x = o.x + dx; f.obj.y = o.y + dy; }
      touch();
    } else if (drag.mode === 'marquee') {
      const m = { x: Math.min(drag.start.x, c.p.x), y: Math.min(drag.start.y, c.p.y), w: Math.abs(c.p.x - drag.start.x), h: Math.abs(c.p.y - drag.start.y) };
      transient.marquee = m;
      const ids = [...drag.base];
      for (const l of S.doc.layers) if (l.visible && !l.locked) for (const o of l.objects) {
        if (o.visible === false || o.locked) continue;
        const b = aabb(o);
        if (b && b.x < m.x + m.w && b.x + b.w > m.x && b.y < m.y + m.h && b.y + b.h > m.y && !ids.includes(o.id)) ids.push(o.id);
      }
      select(ids);
    } else if (drag.mode === 'rotate') {
      let da = (Math.atan2(c.p.y - drag.ctr.y, c.p.x - drag.ctr.x) - drag.a0) * 180 / Math.PI;
      if (c.shift) da = Math.round(da / 15) * 15;
      restore(drag.origs);
      for (const [id] of drag.origs) rotateWorld(find(S.doc, id).obj, da, drag.ctr);
      drag.changed = true; touch();
    } else if (drag.mode === 'resize') {
      const { pose, b, single: one } = drag.fr, [hx, hy] = handlePos(drag.h);
      const anchor = { x: b.x + (1 - hx) * b.w, y: b.y + (1 - hy) * b.h }, hl = { x: b.x + hx * b.w, y: b.y + hy * b.h };
      const p = snapPoint(c.p, null, c.ctrl || (pose.rotation || 0) !== 0), pl = toLocal(pose, p);
      let fx = hx === .5 || !b.w ? 1 : Math.max(0.01, (pl.x - anchor.x) / (hl.x - anchor.x));
      let fy = hy === .5 || !b.h ? 1 : Math.max(0.01, (pl.y - anchor.y) / (hl.y - anchor.y));
      restore(drag.origs);
      const [[id]] = drag.origs, o = one && find(S.doc, id).obj;
      if (o && o.type === 'text' && o.box && hy === .5) { // side handles of area text change the column width
        o.box = Math.max(10, o.box * fx);
        const sh = rotv(anchor.x * (1 - fx), 0, o.rotation || 0); if (hx === 0) { o.x += sh.x; o.y += sh.y; }
      } else {
        const uniform = !one || c.shift || (o && o.type === 'text');
        if (uniform) { const f = hx === .5 ? fy : hy === .5 ? fx : Math.max(fx, fy); fx = fy = f; }
        if (one) scaleLocal(o, fx, fy, anchor);
        else for (const [lid] of drag.origs) scaleWorld(find(S.doc, lid).obj, fx, anchor);
      }
      drag.changed = true; touch();
    }
  },
  up(c) {
    if (!drag) return;
    const d = drag; drag = null; transient.marquee = null; S.guides = [];
    if (d.mode === 'move') { if (d.moved) commit(); else if (!c.shift && S.selection.length > 1) select([d.hit]); }
    else if (d.changed) commit();
    refresh();
  },
  dblclick(c) {
    const hit = hitObject(c); if (!hit) return;
    if (hit.leaf.type === 'text') { setTool('text'); beginEdit(hit.leaf, indexAt(layoutText(hit.leaf), toLocal(hit.leaf, c.p))); }
    else if (hit.leaf.type === 'path') { select([hit.leaf.id]); setTool('direct'); }
  },
};

// ── Direct selection (anchor points and handles) ─────────────────────────
tools.direct = {
  down(c) {
    const ds = c.target.dataset || {}, o = single();
    if (ds.a != null && o) {
      const i = +ds.a;
      if (c.shift) S.anchors = S.anchors.includes(i) ? S.anchors.filter(k => k !== i) : [...S.anchors, i];
      else if (!S.anchors.includes(i)) S.anchors = [i];
      drag = { mode: 'anchor', i, start: c.p, segs: clone(o.segs), T: targets([find(S.doc, o.id).root.id]), changed: false };
      emit('selection'); return;
    }
    if (ds.hd && o) { drag = { mode: 'handle', i: +ds.i, which: ds.hd, changed: false }; return; }
    const hit = hitObject(c);
    S.anchors = [];
    select(hit ? [hit.leaf.id] : []);
  },
  move(c) {
    const o = single(); if (!drag || !o) return;
    if (drag.mode === 'anchor') {
      const s0 = drag.segs[drag.i], w0 = toWorld(o, s0);
      const wp = snapPoint({ x: w0.x + c.p.x - drag.start.x, y: w0.y + c.p.y - drag.start.y }, drag.T, c.ctrl), l = toLocal(o, wp);
      const dx = l.x - s0.x, dy = l.y - s0.y;
      for (const i of S.anchors) { o.segs[i].x = drag.segs[i].x + dx; o.segs[i].y = drag.segs[i].y + dy; }
    } else {
      const s = o.segs[drag.i], l = toLocal(o, c.p), hx = l.x - s.x, hy = l.y - s.y, a = drag.which === 'in' ? 'i' : 'o', b = a === 'i' ? 'o' : 'i';
      s[a + 'x'] = hx; s[a + 'y'] = hy;
      if (c.alt) s.t = 'corner';
      if (s.t === 'sym') { s[b + 'x'] = -hx; s[b + 'y'] = -hy; }
      else if (s.t === 'smooth') { const len = Math.hypot(s[b + 'x'], s[b + 'y']), hl = Math.hypot(hx, hy) || 1; s[b + 'x'] = -hx / hl * len; s[b + 'y'] = -hy / hl * len; }
    }
    drag.changed = true; touch();
  },
  up() { const d = drag; drag = null; S.guides = []; if (d && d.changed) commit(); refresh(); },
  dblclick(c) {
    const ds = c.target.dataset || {}, o = single();
    if (ds.a != null && o && o.type === 'path') { const s = o.segs[+ds.a]; setAnchorType(s.ix || s.iy || s.ox || s.oy ? 'corner' : 'smooth'); }
  },
  key(e) {
    const o = single();
    if ((e.key === 'Delete' || e.key === 'Backspace') && o && o.type === 'path' && S.anchors.length) {
      o.segs = o.segs.filter((_, i) => !S.anchors.includes(i)); S.anchors = [];
      if (o.segs.length < 2) { removeById(o.id); select([]); }
      commit(); emit('selection'); return true;
    }
  },
};
export function setAnchorType(t) {
  const o = single(); if (!o || o.type !== 'path') return;
  const n = o.segs.length;
  for (const i of S.anchors) {
    const s = o.segs[i]; s.t = t;
    if (t === 'corner') { s.ix = s.iy = s.ox = s.oy = 0; continue; }
    const has = s.ix || s.iy || s.ox || s.oy;
    if (!has) { // derive tangent from neighbours
      const p = o.segs[o.closed ? (i - 1 + n) % n : Math.max(0, i - 1)], q = o.segs[o.closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
      const tx = (q.x - p.x) / 6, ty = (q.y - p.y) / 6; s.ix = -tx; s.iy = -ty; s.ox = tx; s.oy = ty;
    } else {
      const ux = s.ox - s.ix, uy = s.oy - s.iy, ul = Math.hypot(ux, uy) || 1, li = Math.hypot(s.ix, s.iy), lo = Math.hypot(s.ox, s.oy), m = (li + lo) / 2;
      const a = t === 'sym' ? m : lo || m, b = t === 'sym' ? m : li || m;
      s.ox = ux / ul * a; s.oy = uy / ul * a; s.ix = -ux / ul * b; s.iy = -uy / ul * b;
    }
  }
  commit(); emit('selection');
}

// ── Pen (Bézier) ─────────────────────────────────────────────────────────
let pen = null;
function penFinish() {
  if (!pen) return;
  const f = find(S.doc, pen.id); pen = null; transient.pen = null; S.guides = [];
  if (f) { if (f.obj.segs.length < 2) { removeById(f.obj.id); select([]); } commit(); }
  refresh();
}
tools.pen = {
  down(c) {
    const p = snapPoint(c.p, pen ? pen.T : targets(), c.ctrl);
    if (!pen) {
      const o = addObject(make('path', { segs: [seg(p.x, p.y)] }));
      pen = { id: o.id, T: targets([o.id]) }; select([o.id]); drag = { i: 0 };
    } else {
      const o = find(S.doc, pen.id).obj, first = o.segs[0];
      if (o.segs.length >= 2 && dist(first, c.p) * S.zoom < 9) { o.closed = true; drag = { i: 0, closing: true }; }
      else { o.segs.push(seg(p.x, p.y)); drag = { i: o.segs.length - 1 }; }
    }
    transient.pen = null; touch();
  },
  move(c) {
    if (!pen) return;
    const o = find(S.doc, pen.id).obj;
    if (drag) {
      const s = o.segs[drag.i], dx = c.p.x - s.x, dy = c.p.y - s.y;
      if (Math.hypot(dx, dy) * S.zoom < 3) return;
      s.t = 'sym'; s.ix = -dx; s.iy = -dy;
      if (!drag.closing) { s.ox = dx; s.oy = dy; }
      touch();
    } else if (!o.closed) {
      const last = o.segs[o.segs.length - 1], p = snapPoint(c.p, pen.T, c.ctrl);
      transient.pen = pathD([last, seg(p.x, p.y)], false); refresh();
    }
  },
  up() { const d = drag; drag = null; if (d && d.closing) penFinish(); },
  dblclick() { penFinish(); },
  key(e) { if (pen && (e.key === 'Enter' || e.key === 'Escape')) { penFinish(); return true; } },
  finish: penFinish,
};

// ── Freehand ─────────────────────────────────────────────────────────────
tools.freehand = {
  down(c) { drag = { pts: [c.p] }; },
  move(c) { if (!drag) return; drag.pts.push(c.p); transient.free = drag.pts; refresh(); },
  up() {
    if (!drag) return;
    const pts = drag.pts; drag = null; transient.free = null;
    const closed = pts.length > 8 && dist(pts[0], pts[pts.length - 1]) * S.zoom < 10;
    const sp = simplify(closed ? pts.slice(0, -1) : pts, 2 / S.zoom);
    if (sp.length >= 2) { const o = addObject(make('path', { segs: smoothSegs(sp, closed), closed })); select([o.id]); commit(); }
    refresh();
  },
};

// ── Shape tools ──────────────────────────────────────────────────────────
function shapeTool(kind) {
  const create = () => {
    if (kind === 'line') return make('path', { name: 'Line', segs: [seg(0, 0), seg(0, 0)] });
    if (kind === 'circle') return make('ellipse', { name: 'Circle' });
    return make(kind);
  };
  const update = (o, a, b, c) => {
    let dx = b.x - a.x, dy = b.y - a.y; const r = Math.max(0.01, Math.hypot(dx, dy)), ang = Math.atan2(dy, dx) * 180 / Math.PI;
    if (kind === 'rect' || kind === 'ellipse') {
      if (c.shift) { const m = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * m; dy = Math.sign(dy || 1) * m; }
      const w = Math.max(0.01, Math.abs(dx) * (c.alt ? 2 : 1)), h = Math.max(0.01, Math.abs(dy) * (c.alt ? 2 : 1));
      o.x = c.alt ? a.x : a.x + dx / 2; o.y = c.alt ? a.y : a.y + dy / 2;
      if (kind === 'rect') { o.w = w; o.h = h; } else { o.rx = w / 2; o.ry = h / 2; }
    } else if (kind === 'line') {
      if (c.shift) { const q = Math.round(ang / 45) * 45 * Math.PI / 180; dx = Math.cos(q) * r; dy = Math.sin(q) * r; }
      o.segs = [seg(a.x, a.y), seg(a.x + dx, a.y + dy)];
    } else {
      o.x = a.x; o.y = a.y; o.rx = o.ry = r;
      if (kind === 'polygon' || kind === 'star') o.rotation = c.shift ? 0 : ((ang + 90) % 360 + 360) % 360;
      if (kind === 'arc') { let e = ((c.shift ? Math.round(ang / 15) * 15 : ang) % 360 + 360) % 360; o.a0 = 0; o.a1 = e < 0.5 ? 360 : r3(e); }
    }
  };
  return {
    down(c) { const T = targets(); drag = { a: snapPoint(c.p, T, c.ctrl), T, o: null }; },
    move(c) {
      if (!drag) return;
      const b = snapPoint(c.p, drag.T, c.ctrl);
      if (!drag.o) { if (dist(drag.a, c.p) * S.zoom < 3) return; drag.o = addObject(create()); select([drag.o.id]); }
      update(drag.o, drag.a, b, c); touch();
    },
    up(c) {
      if (!drag) return;
      let o = drag.o; const a = drag.a; drag = null; S.guides = [];
      if (!o) { // plain click → default size
        o = addObject(create());
        if (kind === 'line') o.segs = [seg(a.x - 50, a.y), seg(a.x + 50, a.y)]; else { o.x = a.x; o.y = a.y; }
        select([o.id]);
      }
      commit(); void c;
    },
  };
}
for (const k of ['rect', 'ellipse', 'circle', 'line', 'polygon', 'star', 'arc']) tools[k] = shapeTool(k);

// ── Text ─────────────────────────────────────────────────────────────────
let ta = null, lastFont = null;
export function initTextInput(el) {
  ta = el;
  ta.addEventListener('input', () => {
    const f = S.editing && find(S.doc, S.editing); if (!f) return;
    const o = f.obj, old = o.text; o.text = ta.value; spliceChars(o, old, o.text);
    if (!o.named) o.name = o.text.replace(/\s+/g, ' ').slice(0, 24) || 'Text';
    touch();
  });
  ta.addEventListener('keydown', e => {
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); finishEdit(); setTool('select'); }
    e.stopPropagation();
  });
  on('before-tool', () => { finishEdit(); penFinish(); });
  on('before-history', () => { finishEdit(); penFinish(); });
  on('load', () => { S.editing = null; pen = null; });
}
export function beginEdit(o, idx) {
  S.editing = o.id; select([o.id]);
  ta.value = o.text; ta.focus({ preventScroll: true }); ta.setSelectionRange(idx, idx);
  emit('selection');
}
export function finishEdit() {
  if (!S.editing) return;
  const f = find(S.doc, S.editing); S.editing = null; ta.blur();
  if (f) { lastFont = f.obj.font; if (!f.obj.text.trim()) { removeById(f.obj.id); select([]); } }
  commit(); emit('selection');
}
export const setLastFont = k => { lastFont = k; };
tools.text = {
  down(c) {
    const hit = hitObject(c), was = S.editing;
    if (hit && hit.leaf.type === 'text') {
      const i = indexAt(layoutText(hit.leaf), toLocal(hit.leaf, c.p));
      if (was === hit.leaf.id) { ta.focus({ preventScroll: true }); ta.setSelectionRange(c.shift ? ta.selectionStart : i, i); refresh(); return; }
      finishEdit(); beginEdit(hit.leaf, i); return;
    }
    if (was) { finishEdit(); return; }
    drag = { start: snapPoint(c.p, targets(), c.ctrl) };
  },
  move(c) {
    if (!drag) return;
    transient.marquee = { x: Math.min(drag.start.x, c.p.x), y: Math.min(drag.start.y, c.p.y), w: Math.abs(c.p.x - drag.start.x), h: Math.abs(c.p.y - drag.start.y) }; refresh();
  },
  up(c) {
    if (!drag) return;
    const a = drag.start, w = Math.abs(c.p.x - a.x); drag = null; transient.marquee = null; S.guides = [];
    const props = { x: a.x, y: a.y }; if (lastFont) props.font = lastFont;
    if (w * S.zoom > 14) { props.x = Math.min(a.x, c.p.x); props.y = Math.min(a.y, c.p.y); props.box = w; props.size = 32; }
    const o = addObject(make('text', props));
    touch(); beginEdit(o, 0);
  },
  finish: finishEdit,
};

// ── Character tool (individual letter manipulation) ──────────────────────
export function charOv(o, i) {
  const ch = o.chars || (o.chars = []);
  while (ch.length < o.text.length) ch.push(null);
  return ch[i] || (ch[i] = {});
}
tools.char = {
  down(c) {
    const ds = c.target.dataset || {}, hit = hitObject(c);
    let o = single(), ci = ds.ci != null ? +ds.ci : null;
    if (ci != null && !c.target.closest('#overlay')) { if (hit && hit.leaf.type === 'text') { o = hit.leaf; if (!S.selection.includes(o.id)) select([o.id]); } }
    if (ci == null || !o || o.type !== 'text') { S.chars = []; select(hit && hit.leaf.type === 'text' ? [hit.leaf.id] : []); return; }
    if (c.shift) S.chars = S.chars.includes(ci) ? S.chars.filter(k => k !== ci) : [...S.chars, ci];
    else if (!S.chars.includes(ci)) S.chars = [ci];
    drag = { start: c.p, chars: clone(o.chars || []), changed: false };
    emit('selection');
  },
  move(c) {
    const o = single(); if (!drag || !o) return;
    let d = rotv(c.p.x - drag.start.x, c.p.y - drag.start.y, -(o.rotation || 0));
    if (Math.hypot(d.x, d.y) * S.zoom < 3 && !drag.changed) return;
    if (c.shift) { if (Math.abs(d.x) > Math.abs(d.y)) d.y = 0; else d.x = 0; }
    const k = 1000 / o.size;
    for (const i of S.chars) { const b = drag.chars[i] || {}, ov = charOv(o, i); ov.dx = Math.round((b.dx || 0) + d.x * k); ov.dy = Math.round((b.dy || 0) + d.y * k); }
    drag.changed = true; touch();
  },
  up() { const d = drag; drag = null; if (d && d.changed) commit(); },
  key(e) {
    const o = single(); if (!o || o.type !== 'text' || !S.chars.length) return;
    const step = e.shiftKey ? 25 : 5, m = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!m) return;
    for (const i of S.chars) { const ov = charOv(o, i); if (e.altKey) ov.kern = (ov.kern || 0) + m[0] * step; else { ov.dx = (ov.dx || 0) + m[0] * step; ov.dy = (ov.dy || 0) + m[1] * step; } }
    commit(); return true;
  },
};
