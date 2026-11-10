// Sample projects, built from the same model the editor uses.
import { newDoc, make, uid } from './model.js';

const INK = '#16181d', RED = '#e4572e', TEAL = '#0f766e', SAND = '#f4efe6';
function base(name, w, h, bg) {
  const d = newDoc(name); d.width = w; d.height = h; d.background = bg || null;
  return { d, art: d.layers[0].objects, con: d.layers[1].objects };
}
const ch = (n, map) => { const a = new Array(n).fill(null); for (const i in map) a[i] = map[i]; return a; };

function geometricSymbol() {
  const { d, art, con } = base('Geometric symbol', 600, 600, SAND);
  // three interlocking rings on a triangular lattice, capped by a hexagon
  const R = 110, cx = 300, cy = 310, k = 75;
  const pts = [[cx, cy - k], [cx - k * 0.866, cy + k * 0.5], [cx + k * 0.866, cy + k * 0.5]];
  const cols = [RED, INK, TEAL];
  pts.forEach(([x, y], i) => art.push(make('ellipse', { name: `Ring ${i + 1}`, x, y, rx: R, ry: R, fill: 'none', stroke: cols[i], strokeWidth: 26 })));
  art.push(make('polygon', { name: 'Core', x: cx, y: cy, rx: 34, ry: 34, sides: 6, fill: INK }));
  pts.forEach(([x, y], i) => con.push(make('ellipse', { name: `Ring centre-line ${i + 1}`, x, y, rx: R, ry: R })));
  con.push(make('polygon', { name: 'Lattice triangle', x: cx, y: cy, rx: k, ry: k, sides: 3 }));
  con.push(make('ellipse', { name: 'Outer bound', x: cx, y: cy, rx: R + k + 13, ry: R + k + 13 }));
  con.push(make('path', { name: 'Vertical axis', segs: [{ x: cx, y: 60, ix: 0, iy: 0, ox: 0, oy: 0, t: 'corner' }, { x: cx, y: 560, ix: 0, iy: 0, ox: 0, oy: 0, t: 'corner' }] }));
  return d;
}

function wordmark() {
  const { d, art, con } = base('Typographic wordmark', 900, 420, '#101216');
  art.push(make('text', { name: 'NORDLYS', text: 'NORDLYS', font: 'b:Jost|Medium', size: 132, tracking: 180, align: 'center', x: 462, y: 232, fill: '#f3f1ec', named: true,
    chars: ch(7, { 1: { fill: RED, scale: 1 }, 5: { dy: 0, rot: 0 } }) }));
  art.push(make('text', { name: 'Tagline', text: 'LIGHT · NORTH · FORM', font: 'b:IBM Plex Mono|Regular', size: 17, tracking: 420, align: 'center', x: 455, y: 296, fill: '#8a8f98', named: true }));
  art.push(make('rect', { name: 'Rule', x: 450, y: 262, w: 640, h: 1.5, fill: '#3a3e46' }));
  const line = (name, y) => con.push(make('path', { name, segs: [{ x: 70, y, ix: 0, iy: 0, ox: 0, oy: 0, t: 'corner' }, { x: 830, y, ix: 0, iy: 0, ox: 0, oy: 0, t: 'corner' }] }));
  line('Baseline', 232); line('Cap height', 232 - 132 * 0.7);
  return d;
}

function monogram() {
  const { d, art, con } = base('Monogram', 600, 600, '#ffffff');
  art.push(make('ellipse', { name: 'Seal', x: 300, y: 300, rx: 210, ry: 210, fill: INK }));
  art.push(make('ellipse', { name: 'Inner ring', x: 300, y: 300, rx: 188, ry: 188, fill: 'none', stroke: '#c9a45c', strokeWidth: 2 }));
  // one editable text object: the letters overlap through per-character offsets
  art.push(make('text', { name: 'HB monogram', text: 'HB', font: 'b:Playfair Display|Bold', size: 250, align: 'center', x: 310, y: 386, fill: '#f6f1e7', named: true,
    chars: [{ dx: 52, dy: -30 }, { dx: -58, dy: 40, fill: '#c9a45c' }] }));
  art.push(make('text', { name: 'Est.', text: 'EST. 2026', font: 'b:Jost|Medium', size: 15, tracking: 400, align: 'center', x: 303, y: 462, fill: '#c9a45c', named: true }));
  con.push(make('ellipse', { name: 'Seal guide', x: 300, y: 300, rx: 210, ry: 210 }));
  con.push(make('rect', { name: 'Letter block', x: 300, y: 300, w: 250, h: 250 }));
  return d;
}

function combination() {
  const { d, art, con } = base('Combination mark', 960, 420, '#ffffff');
  const sym = make('group', { name: 'Symbol' });
  sym.children.push(make('rect', { name: 'Tile', x: 190, y: 210, w: 200, h: 200, r: 44, fill: INK }));
  sym.children.push(make('arc', { name: 'Arc outer', x: 140, y: 260, rx: 100, ry: 100, a0: 270, a1: 0, mode: 'open', fill: 'none', stroke: '#ffffff', strokeWidth: 26, cap: 'butt' }));
  sym.children.push(make('arc', { name: 'Arc inner', x: 140, y: 260, rx: 52, ry: 52, a0: 270, a1: 0, mode: 'open', fill: 'none', stroke: RED, strokeWidth: 26 }));
  sym.children.push(make('ellipse', { name: 'Dot', x: 140, y: 260, rx: 15, ry: 15, fill: '#ffffff' }));
  art.push(sym);
  art.push(make('text', { name: 'arcade', text: 'arcade', font: 'b:Space Grotesk|Bold', size: 128, tracking: -30, x: 330, y: 248, fill: INK, named: true, chars: ch(6, { 2: { fill: RED } }) }));
  art.push(make('text', { name: 'Descriptor', text: 'SOUND & PICTURE STUDIO', font: 'b:Inter|Regular', size: 19, tracking: 330, x: 336, y: 300, fill: '#6b7078', named: true }));
  con.push(make('ellipse', { name: 'Arc centre r100', x: 140, y: 260, rx: 100, ry: 100 }));
  con.push(make('ellipse', { name: 'Arc centre r52', x: 140, y: 260, rx: 52, ry: 52 }));
  con.push(make('path', { name: 'Baseline', segs: [{ x: 60, y: 248, ix: 0, iy: 0, ox: 0, oy: 0, t: 'corner' }, { x: 900, y: 248, ix: 0, iy: 0, ox: 0, oy: 0, t: 'corner' }] }));
  return d;
}

export const SAMPLES = [
  { key: 'symbol', title: 'Geometric symbol', note: 'Rings on a triangular lattice with construction circles', build: geometricSymbol },
  { key: 'wordmark', title: 'Typographic wordmark', note: 'Tracked capitals with a per-letter colour accent', build: wordmark },
  { key: 'monogram', title: 'Monogram', note: 'Two overlapping letters kept as live, editable text', build: monogram },
  { key: 'combo', title: 'Combination mark', note: 'Grouped symbol with wordmark and descriptor', build: combination },
];
export function buildSample(key) { const s = SAMPLES.find(x => x.key === key), d = s.build(); d.id = uid('p'); return d; }
