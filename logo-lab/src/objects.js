// Operations shared by tools, renderer and exporter: bounds, transforms.
import { objectSegments, segsBounds, pathD, toWorld, rotv, boxUnion, seg } from './geom.js';
import { layoutText } from './typography.js';
import { leaves } from './model.js';

export function localBounds(o) {
  if (o.type === 'text') return layoutText(o).bounds;
  const { segs, closed } = objectSegments(o);
  return segsBounds(segs, closed);
}
export function objD(o) { const { segs, closed } = objectSegments(o); return pathD(segs, closed); }
export function corners(o) {
  const b = localBounds(o);
  return [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map(([x, y]) => toWorld(o, { x, y }));
}
export function centre(o) { const b = localBounds(o); return toWorld(o, { x: b.x + b.w / 2, y: b.y + b.h / 2 }); }
/** World axis-aligned bounds of one or more objects (groups included). */
export function aabb(objs) {
  const boxes = [];
  for (const root of [].concat(objs)) for (const o of leaves(root)) {
    const c = corners(o), xs = c.map(p => p.x), ys = c.map(p => p.y);
    const x = Math.min(...xs), y = Math.min(...ys);
    boxes.push({ x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y });
  }
  return boxUnion(boxes);
}

/** Scales geometry about the object's local origin (pose untouched). */
export function scaleGeometry(o, fx, fy) {
  switch (o.type) {
    case 'rect': o.w *= fx; o.h *= fy; o.r = (o.r || 0) * Math.min(fx, fy); break;
    case 'ellipse': case 'arc': case 'polygon': case 'star': o.rx *= fx; o.ry *= fy; break;
    case 'path': for (const s of o.segs) { s.x *= fx; s.y *= fy; s.ix *= fx; s.iy *= fy; s.ox *= fx; s.oy *= fy; } break;
    case 'text': o.size = Math.max(1, o.size * fx); if (o.box) o.box *= fx; break; // text scales uniformly
  }
}
/** Scales an object in its own frame keeping `anchor` (local) fixed. */
export function scaleLocal(o, fx, fy, anchor) {
  if (o.type === 'text') fy = fx;
  scaleGeometry(o, fx, fy);
  const sh = rotv(anchor.x * (1 - fx), anchor.y * (1 - fy), o.rotation || 0);
  o.x += sh.x; o.y += sh.y;
}
/** Uniform scale about a world point (used for groups and multi-selection). */
export function scaleWorld(o, f, origin) {
  scaleGeometry(o, f, f);
  o.x = origin.x + (o.x - origin.x) * f; o.y = origin.y + (o.y - origin.y) * f;
}
export function rotateWorld(o, deg, origin) {
  const p = rotv(o.x - origin.x, o.y - origin.y, deg);
  o.x = origin.x + p.x; o.y = origin.y + p.y; o.rotation = (((o.rotation || 0) + deg) % 360 + 360) % 360;
}
/** Converts a parametric shape into an editable Bézier path in place. */
export function toPath(o) {
  if (o.type === 'path' || o.type === 'text' || o.type === 'group') return o;
  const { segs, closed } = objectSegments(o);
  for (const k of ['w', 'h', 'r', 'rx', 'ry', 'a0', 'a1', 'mode', 'sides', 'inner']) delete o[k];
  o.type = 'path'; o.segs = segs.map(s => seg(s.x, s.y, s.ix, s.iy, s.ox, s.oy, s.t)); o.closed = closed;
  return o;
}
