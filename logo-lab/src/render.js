// Document → SVG. Elements are reconciled by id and only rebuilt when the
// object's JSON changed, so dragging one object does not re-lay-out the rest.
import { S, on } from './state.js';
import { objD } from './objects.js';
import { layoutText } from './typography.js';
import { r3 } from './geom.js';

const NS = 'http://www.w3.org/2000/svg';
export const svgEl = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};
let svg, viewport, artboard, gridRect, layersG, patMinor, patMajor, pathMinor, pathMajor;
const els = new Map();

export function initRender(root) {
  svg = root;
  const defs = svgEl('defs', {}, svg);
  patMinor = svgEl('pattern', { id: 'grid-minor', patternUnits: 'userSpaceOnUse' }, defs);
  pathMinor = svgEl('path', { fill: 'none', class: 'grid-minor' }, patMinor);
  patMajor = svgEl('pattern', { id: 'grid-major', patternUnits: 'userSpaceOnUse' }, defs);
  svgEl('rect', { fill: 'url(#grid-minor)', class: 'grid-minor-fill' }, patMajor);
  pathMajor = svgEl('path', { fill: 'none', class: 'grid-major' }, patMajor);
  viewport = svgEl('g', { id: 'viewport' }, svg);
  artboard = svgEl('rect', { id: 'artboard' }, viewport);
  gridRect = svgEl('rect', { id: 'grid', x: -50000, y: -50000, width: 100000, height: 100000, fill: 'url(#grid-major)', 'pointer-events': 'none' }, viewport);
  layersG = svgEl('g', { id: 'layers' }, viewport);
  svgEl('g', { id: 'overlay' }, svg);
  on('doc', render); on('view', renderView); on('load', () => { els.clear(); layersG.textContent = ''; });
  renderView(); render();
}

function renderView() {
  viewport.setAttribute('transform', `translate(${r3(S.pan.x)} ${r3(S.pan.y)}) scale(${S.zoom})`);
  renderGrid();
}
function renderGrid() {
  const g = S.doc.grid, size = Math.max(0.5, g.size), px = 1 / S.zoom, major = size * 10;
  gridRect.style.display = g.visible ? '' : 'none';
  patMinor.setAttribute('width', size); patMinor.setAttribute('height', size);
  pathMinor.setAttribute('d', `M${size} 0H0V${size}`); pathMinor.setAttribute('stroke-width', px);
  pathMinor.style.display = size * S.zoom < 6 ? 'none' : '';
  patMajor.setAttribute('width', major); patMajor.setAttribute('height', major);
  const r = patMajor.firstChild; r.setAttribute('width', major); r.setAttribute('height', major);
  pathMajor.setAttribute('d', `M${major} 0H0V${major}`); pathMajor.setAttribute('stroke-width', px);
  pathMajor.style.display = major * S.zoom < 6 ? 'none' : '';
}

function paint(el, o, layer) {
  if (layer.kind === 'construction') { // construction geometry has its own drawing style
    el.setAttribute('fill', 'none'); el.setAttribute('stroke', layer.color || '#2aa9ff');
    el.setAttribute('stroke-width', 1); el.setAttribute('vector-effect', 'non-scaling-stroke');
    el.setAttribute('stroke-dasharray', '5 3');
    return;
  }
  el.setAttribute('fill', o.fill || 'none');
  if (o.stroke && o.stroke !== 'none' && o.strokeWidth > 0) {
    el.setAttribute('stroke', o.stroke); el.setAttribute('stroke-width', o.strokeWidth);
    el.setAttribute('stroke-linecap', o.cap || 'butt'); el.setAttribute('stroke-linejoin', o.join || 'miter');
  }
}

function build(o, layer) {
  const g = svgEl('g', { class: 'obj', 'data-id': o.id });
  if (o.type === 'group') return g;
  if (o.type === 'text') {
    const L = layoutText(o), b = L.bounds;
    svgEl('rect', { x: r3(b.x), y: r3(b.y), width: r3(b.w), height: r3(b.h), fill: 'none', 'pointer-events': 'all', class: 'text-hit' }, g);
    for (const gl of L.glyphs) {
      if (!gl.d) continue;
      const p = svgEl('path', { d: gl.d, 'data-ci': gl.ci }, g);
      paint(p, gl.fill ? { ...o, fill: gl.fill } : o, layer);
    }
  } else paint(svgEl('path', { d: objD(o) }, g), o, layer);
  return g;
}

function sync(arr, parent, layer) {
  let prevEl = null;
  for (const o of arr) {
    const key = JSON.stringify(o.type === 'group' ? { ...o, children: 0 } : o) + layer.kind + (layer.color || '') + fontRev;
    let el = els.get(o.id);
    if (!el || el.__key !== key) {
      const fresh = build(o, layer);
      if (el) { if (o.type === 'group') while (el.firstChild) fresh.appendChild(el.firstChild); el.replaceWith(fresh); }
      el = fresh; el.__key = key; els.set(o.id, el);
      if (o.type !== 'group') el.setAttribute('transform', `translate(${r3(o.x)} ${r3(o.y)}) rotate(${r3(o.rotation || 0)})`);
      el.style.display = o.visible === false ? 'none' : '';
      if (o.type !== 'group' && o.opacity != null && o.opacity < 1 && layer.kind !== 'construction') el.setAttribute('opacity', o.opacity);
      if (o.locked) el.classList.add('locked');
    }
    el.__seen = stamp;
    const want = prevEl ? prevEl.nextSibling : parent.firstChild;
    if (el.parentNode !== parent || want !== el) parent.insertBefore(el, want);
    if (o.type === 'group') sync(o.children, el, layer);
    prevEl = el;
  }
}

let stamp = 0, fontRev = 0;
export function fontsUpdated() { fontRev++; render(); }
export function render() {
  if (!svg) return;
  stamp++;
  const d = S.doc;
  artboard.setAttribute('width', d.width); artboard.setAttribute('height', d.height);
  artboard.setAttribute('fill', d.background || '#ffffff');
  renderGrid();
  let prev = null;
  for (const layer of d.layers) {
    let g = els.get(layer.id);
    if (!g) { g = svgEl('g', { class: 'layer', 'data-layer': layer.id }); els.set(layer.id, g); }
    g.__seen = stamp;
    g.style.display = layer.visible ? '' : 'none';
    g.classList.toggle('locked', !!layer.locked);
    g.setAttribute('opacity', layer.kind === 'construction' ? layer.opacity ?? 0.9 : 1);
    const want = prev ? prev.nextSibling : layersG.firstChild;
    if (g.parentNode !== layersG || want !== g) layersG.insertBefore(g, want);
    sync(layer.objects, g, layer);
    prev = g;
  }
  for (const [id, el] of els) if (el.__seen !== stamp) { el.remove(); els.delete(id); }
  svg.classList.toggle('outline-mode', S.viewMode === 'outline');
}
export const elementFor = id => els.get(id);
