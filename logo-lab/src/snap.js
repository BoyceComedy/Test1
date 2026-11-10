// Snapping: smart guides (edges and centres of other objects and the artboard)
// take priority inside a small screen-space threshold; otherwise the visible grid.
import { S } from './state.js';
import { aabb } from './objects.js';

const PX = 6;
/** Collects snap lines once per drag. `exclude` = ids of root objects being moved. */
export function targets(exclude = []) {
  const xs = [0, S.doc.width / 2, S.doc.width], ys = [0, S.doc.height / 2, S.doc.height];
  for (const layer of S.doc.layers) {
    if (!layer.visible) continue;
    for (const o of layer.objects) {
      if (o.visible === false || exclude.includes(o.id)) continue;
      const b = aabb(o); if (!b) continue;
      xs.push(b.x, b.x + b.w / 2, b.x + b.w); ys.push(b.y, b.y + b.h / 2, b.y + b.h);
    }
  }
  return { xs, ys };
}
function nearest(vals, list) {
  let best = null;
  for (const v of vals) for (const t of list) { const d = t - v; if (Math.abs(d) <= PX / S.zoom && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, t }; }
  return best;
}
const gridOn = () => S.doc.grid.visible && S.doc.grid.size > 0;
const gridDelta = v => Math.round(v / S.doc.grid.size) * S.doc.grid.size - v;

export function snapPoint(p, T, off) {
  S.guides = [];
  if (!S.doc.snap || off) return p;
  const out = { ...p }, sx = T && nearest([p.x], T.xs), sy = T && nearest([p.y], T.ys);
  if (sx) { out.x = sx.t; S.guides.push({ x: sx.t }); } else if (gridOn()) out.x += gridDelta(p.x);
  if (sy) { out.y = sy.t; S.guides.push({ y: sy.t }); } else if (gridOn()) out.y += gridDelta(p.y);
  return out;
}
/** Snaps a moving box (its start bounds + proposed delta). Returns the adjusted delta. */
export function snapMove(box, dx, dy, T, off) {
  S.guides = [];
  if (!S.doc.snap || off) return { dx, dy };
  const x = box.x + dx, y = box.y + dy;
  const sx = nearest([x, x + box.w / 2, x + box.w], T.xs), sy = nearest([y, y + box.h / 2, y + box.h], T.ys);
  if (sx) { dx += sx.d; S.guides.push({ x: sx.t }); } else if (gridOn()) dx += gridDelta(x);
  if (sy) { dy += sy.d; S.guides.push({ y: sy.t }); } else if (gridOn()) dy += gridDelta(y);
  return { dx, dy };
}
