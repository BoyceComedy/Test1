// Document model: plain JSON, so undo snapshots, IndexedDB persistence and
// project export are all the same serialisation.
//   doc.layers[]  bottom → top; layer.kind is 'artwork' or 'construction'
//   layer.objects[] bottom → top; groups nest through .children
// Every leaf has a pose (x, y, rotation) and geometry in its own local frame.
let counter = 0;
export const uid = (p = 'o') => p + Date.now().toString(36) + (counter++).toString(36) + Math.floor(Math.random() * 1296).toString(36);

export const DEFAULT_FONT = 'b:Inter|Bold';
export const LABELS = { rect: 'Rectangle', ellipse: 'Ellipse', arc: 'Arc', polygon: 'Polygon', star: 'Star', path: 'Path', text: 'Text', group: 'Group' };

export function newLayer(name, kind = 'artwork') {
  return { id: uid('l'), name, kind, visible: true, locked: false, objects: [], ...(kind === 'construction' ? { color: '#2aa9ff', opacity: 0.9 } : {}) };
}

export function newDoc(name = 'Untitled') {
  const art = newLayer('Artwork'), con = newLayer('Construction', 'construction');
  return { app: 'logo-lab', version: 1, id: uid('p'), name, width: 800, height: 600, background: null,
    grid: { size: 10, visible: true }, snap: true, layers: [art, con], activeLayer: art.id, updated: Date.now() };
}

const STYLE = { fill: '#16181d', stroke: 'none', strokeWidth: 2, opacity: 1, cap: 'butt', join: 'miter' };
const LINE = { fill: 'none', stroke: '#16181d' };

export function make(type, props = {}) {
  const base = { id: uid(), type, name: LABELS[type], visible: true, locked: false, x: 0, y: 0, rotation: 0 };
  if (type === 'group') return { id: base.id, type, name: 'Group', visible: true, locked: false, children: [], ...props };
  const geo = {
    rect: { w: 100, h: 100, r: 0 }, ellipse: { rx: 50, ry: 50 }, arc: { rx: 50, ry: 50, a0: 0, a1: 90, mode: 'open', ...LINE },
    polygon: { rx: 50, ry: 50, sides: 6 }, star: { rx: 50, ry: 50, sides: 5, inner: 0.5 },
    path: { segs: [], closed: false, ...LINE },
    text: { text: '', font: DEFAULT_FONT, size: 72, tracking: 0, wordSpacing: 0, lineHeight: 1.2, align: 'left', hScale: 1, vScale: 1, baseline: 0, kerning: true, box: 0, chars: [] },
  }[type];
  return { ...base, ...STYLE, ...geo, ...props };
}

export const clone = o => JSON.parse(JSON.stringify(o));
export function cloneFresh(o) { const c = clone(o); (function re(x) { x.id = uid(); (x.children || []).forEach(re); })(c); return c; }

export function leaves(o, out = []) { if (o.type === 'group') o.children.forEach(c => leaves(c, out)); else out.push(o); return out; }
export function walk(doc, fn) {
  for (const layer of doc.layers) (function rec(arr, group) { arr.forEach((o, i) => { fn(o, arr, layer, group, i); if (o.type === 'group') rec(o.children, o); }); })(layer.objects, null);
}
/** → { obj, arr (containing array), layer, group, index, root } or null */
export function find(doc, id) {
  for (const layer of doc.layers) {
    const r = (function rec(arr, group, root) {
      for (let i = 0; i < arr.length; i++) {
        const o = arr[i], rt = root || o;
        if (o.id === id) return { obj: o, arr, layer, group, index: i, root: rt };
        if (o.type === 'group') { const f = rec(o.children, o, rt); if (f) return f; }
      }
      return null;
    })(layer.objects, null, null);
    if (r) return r;
  }
  return null;
}
export const layerById = (doc, id) => doc.layers.find(l => l.id === id);
export function activeLayer(doc) {
  return layerById(doc, doc.activeLayer) || doc.layers.find(l => l.kind === 'artwork') || doc.layers[0];
}
/** Keeps the per-character override array aligned with the text after an edit. */
export function spliceChars(o, oldText, newText) {
  const ch = o.chars || (o.chars = []);
  while (ch.length < oldText.length) ch.push(null);
  let p = 0; const max = Math.min(oldText.length, newText.length);
  while (p < max && oldText[p] === newText[p]) p++;
  let s = 0;
  while (s < max - p && oldText[oldText.length - 1 - s] === newText[newText.length - 1 - s]) s++;
  ch.splice(p, oldText.length - p - s, ...new Array(newText.length - p - s).fill(null));
  ch.length = newText.length;
  for (let i = 0; i < ch.length; i++) if (ch[i] === undefined) ch[i] = null;
}
export function usedFonts(doc) { const s = new Set(); walk(doc, o => { if (o.type === 'text') s.add(o.font); }); return [...s]; }
