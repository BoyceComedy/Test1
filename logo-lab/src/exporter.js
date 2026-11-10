// Export: SVG (editable text or outlines), PNG, JSON project.
import { objD, aabb } from './objects.js';
import { layoutText } from './typography.js';
import { describe } from './fonts.js';
import { r3 } from './geom.js';
import { leaves } from './model.js';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const tf = o => { const r = o.rotation || 0; return `translate(${r3(o.x)} ${r3(o.y)})${r ? ` rotate(${r3(r)})` : ''}`; };

function paintAttrs(o, layer) {
  if (layer.kind === 'construction') return ` fill="none" stroke="${layer.color || '#2aa9ff'}" stroke-width="1" stroke-dasharray="5 3"`;
  let s = ` fill="${o.fill || 'none'}"`;
  if (o.stroke && o.stroke !== 'none' && o.strokeWidth > 0) s += ` stroke="${o.stroke}" stroke-width="${r3(o.strokeWidth)}" stroke-linecap="${o.cap || 'butt'}" stroke-linejoin="${o.join || 'miter'}"`;
  if (o.opacity != null && o.opacity < 1) s += ` opacity="${r3(o.opacity)}"`;
  return s;
}

function textSVG(o, layer, mode) {
  const L = layoutText(o), name = ` data-name="${esc(o.name)}"`;
  const scaled = (o.hScale || 1) !== 1 || (o.vScale || 1) !== 1;
  const outline = mode === 'outline' || layer.kind === 'construction' || (scaled && L.glyphs.some(g => g.rot));
  if (outline) {
    const groups = new Map();
    for (const g of L.glyphs) if (g.d) { const k = g.fill || ''; groups.set(k, (groups.get(k) || '') + g.d); }
    return `<g transform="${tf(o)}"${name}>${[...groups].map(([fill, d]) => `<path d="${d}"${paintAttrs(fill ? { ...o, fill } : o, layer)}/>`).join('')}</g>`;
  }
  // Editable <text>: one positioned <tspan> per character keeps tracking, kerning and per-letter edits.
  const f = describe(o.font), hS = o.hScale || 1, vS = o.vScale || 1;
  const spans = L.glyphs.map(g => `<tspan x="${r3(g.ox / hS)}" y="${r3(g.oy / vS)}"${g.rot ? ` rotate="${r3(g.rot)}"` : ''}${g.fontSize !== o.size ? ` font-size="${r3(g.fontSize)}"` : ''}${g.fill ? ` fill="${g.fill}"` : ''}>${esc(g.ch)}</tspan>`).join('');
  return `<text transform="${tf(o)}${scaled ? ` scale(${r3(hS)} ${r3(vS)})` : ''}"${name} xml:space="preserve" font-family="${esc(f.family)}" font-weight="${f.weight || 400}"${f.italic ? ' font-style="italic"' : ''} font-size="${r3(o.size)}"${paintAttrs(o, layer)}>${spans}</text>`;
}

function objSVG(o, layer, mode) {
  if (o.visible === false) return '';
  if (o.type === 'group') return `<g data-name="${esc(o.name)}">${o.children.map(c => objSVG(c, layer, mode)).join('')}</g>`;
  if (o.type === 'text') return textSVG(o, layer, mode);
  return `<path data-name="${esc(o.name)}" transform="${tf(o)}" d="${objD(o)}"${paintAttrs(o, layer)}/>`;
}

/** opts: text 'editable'|'outline', construction bool, artwork bool, area 'artboard'|'artwork', background bool */
export function buildSVG(doc, opts = {}) {
  const { text = 'editable', construction = false, artwork = true, area = 'artboard', background = true } = opts;
  const layers = doc.layers.filter(l => l.visible && (l.kind === 'construction' ? construction : artwork));
  let box = { x: 0, y: 0, w: doc.width, h: doc.height };
  if (area === 'artwork') {
    const objs = layers.flatMap(l => l.objects.filter(o => o.visible !== false));
    const b = aabb(objs);
    if (b) { const pad = Math.max(0, ...objs.flatMap(o => leaves(o)).map(o => (o.stroke && o.stroke !== 'none' ? o.strokeWidth / 2 : 0))); box = { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 }; }
  }
  const body = layers.map(l => `<g data-layer="${esc(l.name)}"${l.kind === 'construction' ? ` opacity="${l.opacity ?? 0.9}"` : ''}>${l.objects.map(o => objSVG(o, l, text)).join('')}</g>`).join('\n');
  const bg = background && doc.background ? `<rect x="${r3(box.x)}" y="${r3(box.y)}" width="${r3(box.w)}" height="${r3(box.h)}" fill="${doc.background}"/>\n` : '';
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r3(box.x)} ${r3(box.y)} ${r3(box.w)} ${r3(box.h)}" width="${r3(box.w)}" height="${r3(box.h)}">\n${bg}${body}\n</svg>`, box };
}

export function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function renderPNG(doc, opts, scale) {
  const { svg, box } = buildSVG(doc, { ...opts, text: 'outline' });
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(box.w * scale)); cv.height = Math.max(1, Math.round(box.h * scale));
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      cv.toBlob(b => (b ? resolve({ blob: b, width: cv.width, height: cv.height }) : reject(new Error('PNG encoding failed'))), 'image/png');
    };
    img.onerror = () => reject(new Error('Could not rasterise the artwork'));
    img.src = url;
  });
}
export const fileBase = doc => (doc.name || 'logo').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'logo';
