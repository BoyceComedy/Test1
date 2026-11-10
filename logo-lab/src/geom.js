// Geometry primitives. Every non-text object reduces to a list of Bézier
// segments {x,y,ix,iy,ox,oy,t} (anchor + handles relative to the anchor — the
// same shape as a Paper.js Segment, so Phase 3 can hand these straight to
// Paper for Boolean operations).
export const D2R = Math.PI / 180;
export const r3 = n => +(+n).toFixed(3);

export function rotv(x, y, deg) {
  const a = deg * D2R, c = Math.cos(a), s = Math.sin(a);
  return { x: x * c - y * s, y: x * s + y * c };
}
export function toWorld(o, p) { const r = rotv(p.x, p.y, o.rotation || 0); return { x: r.x + o.x, y: r.y + o.y }; }
export function toLocal(o, p) { return rotv(p.x - o.x, p.y - o.y, -(o.rotation || 0)); }
export const seg = (x, y, ix = 0, iy = 0, ox = 0, oy = 0, t = 'corner') => ({ x, y, ix, iy, ox, oy, t });
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function arcSegs(rx, ry, a0, a1) {
  let sw = (((a1 - a0) % 360) + 360) % 360;
  if (sw < 1e-9) sw = 360;
  const n = Math.max(1, Math.ceil(sw / 90 - 1e-9)), st = (sw / n) * D2R, k = (4 / 3) * Math.tan(st / 4), out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 * D2R + st * i, c = Math.cos(a), s = Math.sin(a);
    out.push(seg(rx * c, ry * s, i > 0 ? rx * s * k : 0, i > 0 ? -ry * c * k : 0, i < n ? -rx * s * k : 0, i < n ? ry * c * k : 0, 'smooth'));
  }
  return out;
}

/** Bézier segments (local coordinates) for any non-text, non-group object. */
export function objectSegments(o) {
  switch (o.type) {
    case 'path': return { segs: o.segs, closed: !!o.closed };
    case 'rect': {
      const w = o.w / 2, h = o.h / 2, r = Math.max(0, Math.min(o.r || 0, w, h));
      if (!r) return { segs: [seg(-w, -h), seg(w, -h), seg(w, h), seg(-w, h)], closed: true };
      const k = r * 0.5522847;
      return { closed: true, segs: [
        seg(-w + r, -h, -k, 0, 0, 0), seg(w - r, -h, 0, 0, k, 0), seg(w, -h + r, 0, -k, 0, 0), seg(w, h - r, 0, 0, 0, k),
        seg(w - r, h, k, 0, 0, 0), seg(-w + r, h, 0, 0, -k, 0), seg(-w, h - r, 0, k, 0, 0), seg(-w, -h + r, 0, 0, 0, -k)] };
    }
    case 'ellipse': {
      const s = arcSegs(o.rx, o.ry, 0, 360), last = s.pop();
      s[0].ix = last.ix; s[0].iy = last.iy;
      return { segs: s, closed: true };
    }
    case 'arc': {
      const s = arcSegs(o.rx, o.ry, o.a0, o.a1);
      s[0].t = s[s.length - 1].t = 'corner';
      if (o.mode === 'pie') s.push(seg(0, 0));
      return { segs: s, closed: o.mode === 'pie' || o.mode === 'chord' };
    }
    case 'polygon': case 'star': {
      const star = o.type === 'star', n = Math.max(3, Math.round(o.sides || 5)), m = star ? n * 2 : n, s = [];
      for (let i = 0; i < m; i++) {
        const a = (-90 + (i * 360) / m) * D2R, f = star && i % 2 ? (o.inner ?? 0.5) : 1;
        s.push(seg(o.rx * f * Math.cos(a), o.ry * f * Math.sin(a)));
      }
      return { segs: s, closed: true };
    }
  }
  return { segs: [], closed: false };
}

export function pathD(segs, closed) {
  if (!segs.length) return '';
  let d = `M${r3(segs[0].x)} ${r3(segs[0].y)}`;
  const n = segs.length, m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const a = segs[i], b = segs[(i + 1) % n];
    if (!a.ox && !a.oy && !b.ix && !b.iy) d += `L${r3(b.x)} ${r3(b.y)}`;
    else d += `C${r3(a.x + a.ox)} ${r3(a.y + a.oy)} ${r3(b.x + b.ix)} ${r3(b.y + b.iy)} ${r3(b.x)} ${r3(b.y)}`;
  }
  return closed ? d + 'Z' : d;
}

function cubicExtrema(p0, p1, p2, p3) {
  // roots of derivative of a 1-D cubic Bézier
  const a = -p0 + 3 * p1 - 3 * p2 + p3, b = 2 * (p0 - 2 * p1 + p2), c = p1 - p0, ts = [];
  if (Math.abs(a) < 1e-12) { if (Math.abs(b) > 1e-12) ts.push(-c / b); }
  else { const D = b * b - 4 * a * c; if (D >= 0) { const q = Math.sqrt(D); ts.push((-b + q) / (2 * a), (-b - q) / (2 * a)); } }
  return ts.filter(t => t > 0 && t < 1).map(t => { const u = 1 - t; return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3; });
}

export function segsBounds(segs, closed) {
  if (!segs.length) return { x: 0, y: 0, w: 0, h: 0 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
  const n = segs.length, m = closed ? n : n - 1;
  add(segs[0].x, segs[0].y);
  for (let i = 0; i < m; i++) {
    const a = segs[i], b = segs[(i + 1) % n];
    add(b.x, b.y);
    if (a.ox || a.oy || b.ix || b.iy) {
      for (const x of cubicExtrema(a.x, a.x + a.ox, b.x + b.ix, b.x)) add(x, a.y);
      for (const y of cubicExtrema(a.y, a.y + a.oy, b.y + b.iy, b.y)) add(a.x, y);
    }
  }
  // extrema were added with a dummy other-axis value that is always inside the box
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Ramer–Douglas–Peucker simplification. */
export function simplify(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let md = 0, mi = -1;
    const A = pts[a], B = pts[b], dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i].x - A.x) * dy - (pts[i].y - A.y) * dx) / L; if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Catmull-Rom style smoothing: gives every interior point tangent handles. */
export function smoothSegs(pts, closed) {
  const n = pts.length;
  return pts.map((p, i) => {
    const prev = pts[(i - 1 + n) % n], next = pts[(i + 1) % n];
    if (!closed && (i === 0 || i === n - 1)) return seg(p.x, p.y);
    const tx = (next.x - prev.x) / 6, ty = (next.y - prev.y) / 6;
    return seg(p.x, p.y, -tx, -ty, tx, ty, 'smooth');
  });
}

export function boxUnion(boxes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of boxes) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
