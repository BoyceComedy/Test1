// Document commands shared by tools, shortcuts, the inspector and the layer panel.
import { S, select, selected, selectedLeaves, commit, setView, emit } from './state.js';
import { find, make, cloneFresh, activeLayer, leaves, clone } from './model.js';
import { aabb, toPath, localBounds, centre, scaleLocal, scaleWorld, rotateWorld } from './objects.js';
import { toast } from './ui/dialogs.js';

export function addObject(o) {
  const layer = activeLayer(S.doc);
  if (layer.locked || !layer.visible) toast(`Layer “${layer.name}” is ${layer.locked ? 'locked' : 'hidden'} — the new object was still added to it.`);
  layer.objects.push(o);
  return o;
}
export function removeById(id) { const f = find(S.doc, id); if (f) f.arr.splice(f.index, 1); }
export function deleteSelection() {
  if (!S.selection.length) return;
  S.selection.forEach(removeById); select([]); commit();
}
export function duplicate(offset = 10) {
  const ids = [];
  for (const id of S.selection) {
    const f = find(S.doc, id); if (!f) continue;
    const c = cloneFresh(f.obj);
    leaves(c).forEach(l => { l.x += offset; l.y += offset; });
    f.arr.splice(f.index + 1, 0, c); ids.push(c.id);
  }
  if (ids.length) { select(ids); commit(); }
  return ids;
}
let clipboard = [];
export function copy() { clipboard = selected().map(clone); return clipboard.length; }
export function cut() { if (copy()) deleteSelection(); }
export function paste() {
  if (!clipboard.length) return;
  const ids = [];
  clipboard = clipboard.map(o => { const c = cloneFresh(o); leaves(c).forEach(l => { l.x += 10; l.y += 10; }); return c; });
  for (const o of clipboard) { const c = clone(o); addObject(c); ids.push(c.id); }
  select(ids); commit();
}
export function selectAll() {
  const ids = [];
  for (const l of S.doc.layers) if (l.visible && !l.locked) for (const o of l.objects) if (o.visible !== false && !o.locked) ids.push(o.id);
  select(ids);
}
export function group() {
  const fs = S.selection.map(id => find(S.doc, id)).filter(Boolean);
  if (fs.length < 2) return;
  // keep stacking order; the group takes the place of the top-most member
  const order = []; for (const l of S.doc.layers) (function rec(a) { a.forEach(o => { order.push(o.id); if (o.children) rec(o.children); }); })(l.objects);
  fs.sort((a, b) => order.indexOf(a.obj.id) - order.indexOf(b.obj.id));
  const top = fs[fs.length - 1], g = make('group');
  const marker = {}; top.arr.splice(top.index, 1, marker);
  for (const f of fs) if (f !== top) removeById(f.obj.id);
  g.children = fs.map(f => f.obj);
  top.arr.splice(top.arr.indexOf(marker), 1, g);
  select([g.id]); commit();
}
export function ungroup() {
  const ids = [];
  for (const id of S.selection) {
    const f = find(S.doc, id);
    if (!f || f.obj.type !== 'group') { if (f) ids.push(id); continue; }
    f.arr.splice(f.index, 1, ...f.obj.children); ids.push(...f.obj.children.map(c => c.id));
  }
  select(ids); commit();
}
export function arrange(how) {
  const fs = S.selection.map(id => find(S.doc, id)).filter(Boolean);
  if (!fs.length) return;
  for (const f of how === 'front' || how === 'backward' ? fs : fs.slice().reverse()) {
    const g = find(S.doc, f.obj.id), a = g.arr, i = g.index;
    a.splice(i, 1);
    a.splice(how === 'front' ? a.length : how === 'back' ? 0 : Math.max(0, Math.min(a.length, i + (how === 'forward' ? 1 : -1))), 0, g.obj);
  }
  commit();
}
export function align(how) {
  const sel = selected(); if (!sel.length) return;
  const ref = sel.length > 1 ? aabb(sel) : { x: 0, y: 0, w: S.doc.width, h: S.doc.height };
  for (const o of sel) {
    const b = aabb(o); let dx = 0, dy = 0;
    if (how === 'left') dx = ref.x - b.x; if (how === 'hcentre') dx = ref.x + ref.w / 2 - (b.x + b.w / 2); if (how === 'right') dx = ref.x + ref.w - (b.x + b.w);
    if (how === 'top') dy = ref.y - b.y; if (how === 'vcentre') dy = ref.y + ref.h / 2 - (b.y + b.h / 2); if (how === 'bottom') dy = ref.y + ref.h - (b.y + b.h);
    leaves(o).forEach(l => { l.x += dx; l.y += dy; });
  }
  commit();
}
export function convertToPath() {
  const ls = selectedLeaves().filter(o => o.type !== 'path' && o.type !== 'text');
  if (!ls.length) return;
  ls.forEach(o => { const was = o.name; toPath(o); o.name = was; });
  commit(); emit('selection');
}
export function nudge(dx, dy) {
  const ls = selectedLeaves(); if (!ls.length) return;
  ls.forEach(o => { o.x += dx; o.y += dy; }); commit();
}
/** Inspector transforms. */
export function moveSelectionTo(x, y) {
  const b = aabb(selected()); if (!b) return;
  selectedLeaves().forEach(o => { if (x != null) o.x += x - b.x; if (y != null) o.y += y - b.y; }); commit();
}
export function resizeSelection(w, h) {
  const sel = selected(), ls = selectedLeaves(); if (!ls.length) return;
  if (sel.length === 1 && sel[0].type !== 'group') {
    const o = sel[0], b = localBounds(o), c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    let fx = w != null && b.w > 0 ? w / b.w : 1, fy = h != null && b.h > 0 ? h / b.h : 1;
    if (o.type === 'text') fx = fy = w != null ? fx : fy;
    scaleLocal(o, Math.max(fx, 1e-3), Math.max(fy, 1e-3), c);
  } else {
    const b = aabb(sel), f = w != null ? w / b.w : h / b.h;
    if (!(f > 0) || !isFinite(f)) return;
    ls.forEach(o => scaleWorld(o, f, { x: b.x, y: b.y }));
  }
  commit();
}
export function rotateSelectionTo(deg) {
  const sel = selected(), ls = selectedLeaves(); if (!ls.length) return;
  if (sel.length === 1 && sel[0].type !== 'group') { const o = sel[0]; rotateWorld(o, deg - (o.rotation || 0), centre(o)); }
  else { const b = aabb(sel); ls.forEach(o => rotateWorld(o, deg, { x: b.x + b.w / 2, y: b.y + b.h / 2 })); }
  commit();
}
// ── view ──
export function canvasSize() { const r = document.getElementById('canvas').getBoundingClientRect(); return { w: r.width, h: r.height }; }
export function zoomFit() {
  const { w, h } = canvasSize(), d = S.doc, z = Math.min((w - 120) / d.width, (h - 120) / d.height);
  const zoom = Math.max(0.05, Math.min(8, z));
  setView(zoom, { x: (w - d.width * zoom) / 2, y: (h - d.height * zoom) / 2 });
}
export function zoomBy(f, at) {
  const { w, h } = canvasSize(), c = at || { x: w / 2, y: h / 2 }, z = Math.max(0.05, Math.min(64, S.zoom * f)), k = z / S.zoom;
  setView(z, { x: c.x - (c.x - S.pan.x) * k, y: c.y - (c.y - S.pan.y) * k });
}
export function zoomTo(z) { zoomBy(z / S.zoom); }
