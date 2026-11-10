// Right-hand inspector: context-sensitive properties for the selection.
import { h, icon } from './dom.js';
import { S, on, selected, selectedLeaves, single, commit, touch, emit } from '../state.js';
import * as A from '../actions.js';
import { aabb, localBounds } from '../objects.js';
import { toWorld, toLocal, r3 } from '../geom.js';
import { fonts, families, describe, ensureFont, isAvailable, hasKerning } from '../fonts.js';
import { openFontBrowser } from './fontbrowser.js';
import { toast } from './dialogs.js';
import { setAnchorType, charOv, setLastFont } from '../tools.js';
import { HINTS } from './toolbar.js';

let host, picking = false;
const round = (v, d = 2) => +(+v).toFixed(d);

function section(title, ...kids) { return h('section', {}, h('h3', {}, title), ...kids); }
const grid = (...kids) => h('div', { class: 'fgrid' }, ...kids);
function num(label, value, set, o = {}) {
  const inp = h('input', { type: 'number', value: value == null || isNaN(value) ? '' : round(value, o.dp ?? 2), step: o.step || 1, min: o.min, max: o.max, data: { k: o.k || label }, disabled: o.disabled,
    onchange: e => { let v = parseFloat(e.target.value); if (isNaN(v)) return draw(); if (o.min != null) v = Math.max(o.min, v); if (o.max != null) v = Math.min(o.max, v); set(v); } });
  return h('label', { class: 'field' + (o.wide ? ' wide' : ''), title: o.title }, h('span', {}, label), inp, o.unit && h('i', {}, o.unit));
}
function colour(label, value, set, { noneLabel = 'None', k } = {}) {
  const none = !value || value === 'none', hex = none ? '#000000' : value;
  return h('div', { class: 'field colour wide' }, h('span', {}, label),
    h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#000000', class: none ? 'none' : '', data: { k: (k || label) + '-picker' },
      oninput: e => { picking = true; set(e.target.value, true); }, onchange: e => { picking = false; set(e.target.value); } }),
    h('input', { type: 'text', value: none ? '' : value, placeholder: noneLabel.toLowerCase(), spellcheck: false, data: { k: (k || label) + '-hex' },
      onchange: e => { let v = e.target.value.trim(); if (!v) return set('none'); if (/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v)) v = '#' + v; if (!CSS.supports('color', v)) { toast(`“${v}” is not a valid colour`, 'warn'); return draw(); } set(v); } }),
    h('button', { class: 'mini' + (none ? ' on' : ''), title: noneLabel, data: { k: (k || label) + '-none' }, onclick: () => set('none') }, noneLabel === 'None' ? '∅' : noneLabel));
}
const seg = (opts, value, set, k) => h('div', { class: 'seg', data: { k } }, opts.map(([v, label, title]) => h('button', { class: v === value ? 'on' : '', title, data: { v }, html: label, onclick: () => set(v) })));
const select = (opts, value, set, k) => h('select', { data: { k }, onchange: e => set(e.target.value) }, opts.map(([v, label]) => h('option', { value: v, selected: v === value }, label)));
const button = (label, onclick, title, k) => h('button', { class: 'btn', title, onclick, data: { k: k || label } }, label);
const row = (label, ctl) => h('div', { class: 'field wide' }, h('span', {}, label), ctl);

/** Applies a change to every selected leaf; `live` skips the history entry (colour dragging). */
function apply(fn, live, filter) {
  selectedLeaves().filter(filter || (() => true)).forEach(fn);
  live ? touch() : commit();
}
const isText = o => o.type === 'text';

function applyFont(key) {
  ensureFont(key).then(() => { setLastFont(key); apply(o => { o.font = key; }, false, isText); })
    .catch(e => toast(e.message, 'error'));
}

function documentPanel() {
  const d = S.doc;
  return [section('Document',
    row('Name', h('input', { type: 'text', value: d.name, data: { k: 'doc-name' }, onchange: e => { d.name = e.target.value.trim() || 'Untitled'; commit(); } })),
    grid(num('W', d.width, v => { d.width = v; commit(); }, { min: 1, k: 'doc-w' }), num('H', d.height, v => { d.height = v; commit(); }, { min: 1, k: 'doc-h' })),
    colour('Background', d.background, (v, live) => { d.background = v === 'none' ? null : v; live ? touch() : commit(); }, { noneLabel: 'None', k: 'doc-bg' }),
    grid(num('Grid', d.grid.size, v => { d.grid.size = v; commit(); }, { min: 1, k: 'grid-size', title: 'Grid spacing (major lines every 10 cells)' }))),
    section('Tool', h('p', { class: 'muted' }, HINTS[S.tool]))];
}

function transformPanel(sel) {
  const one = sel.length === 1 && sel[0].type !== 'group' ? sel[0] : null, b = aabb(sel), lb = one ? localBounds(one) : b;
  if (!b) return null;
  return section('Transform',
    grid(num('X', b.x, v => A.moveSelectionTo(v, null)), num('Y', b.y, v => A.moveSelectionTo(null, v)),
      num('W', lb.w, v => A.resizeSelection(v, null), { min: 0.01, title: one ? 'Width in the object’s own frame' : 'Selection width (scales proportionally)' }),
      num('H', lb.h, v => A.resizeSelection(null, v), { min: 0.01 }),
      num('Rot', one ? one.rotation || 0 : 0, v => A.rotateSelectionTo(v), { unit: '°', k: 'rot', title: one ? 'Rotation' : 'Rotate selection by this angle' })));
}

function shapePanel(o) {
  const set = k => v => apply(x => { x[k] = v; });
  switch (o.type) {
    case 'rect': return section('Rectangle', grid(num('Radius', o.r || 0, set('r'), { min: 0, k: 'corner-r', title: 'Corner radius' })));
    case 'ellipse': return section('Ellipse', grid(num('Rx', o.rx, set('rx'), { min: 0.01 }), num('Ry', o.ry, set('ry'), { min: 0.01 }),
      num('Radius', o.rx === o.ry ? o.rx : NaN, v => apply(x => { x.rx = x.ry = v; }), { min: 0.01, k: 'radius', title: 'Sets both radii (circle)' })));
    case 'arc': return section('Arc', grid(num('Radius', o.rx, v => apply(x => { x.rx = x.ry = v; }), { min: 0.01, k: 'radius' }), num('Start', o.a0, set('a0'), { unit: '°' }), num('End', o.a1, set('a1'), { unit: '°' })),
      row('Close', seg([['open', 'Open'], ['chord', 'Chord'], ['pie', 'Pie']], o.mode, set('mode'), 'arc-mode')));
    case 'polygon': return section('Polygon', grid(num('Sides', o.sides, set('sides'), { min: 3, max: 64 }), num('Radius', o.rx === o.ry ? o.rx : NaN, v => apply(x => { x.rx = x.ry = v; }), { min: 0.01, k: 'radius' })));
    case 'star': return section('Star', grid(num('Points', o.sides, set('sides'), { min: 3, max: 64 }), num('Inner', (o.inner ?? 0.5) * 100, v => apply(x => { x.inner = v / 100; }), { min: 1, max: 100, unit: '%' }),
      num('Radius', o.rx === o.ry ? o.rx : NaN, v => apply(x => { x.rx = x.ry = v; }), { min: 0.01, k: 'radius' })));
    case 'path': return pathPanel(o);
  }
  return null;
}

function pathPanel(o) {
  const kids = [h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: o.closed, data: { k: 'closed' }, onchange: e => { o.closed = e.target.checked; commit(); } }), 'Closed path'),
    h('p', { class: 'muted' }, `${o.segs.length} anchor points${S.tool === 'direct' ? '' : ' — use Direct selection (A) to edit them'}`)];
  if (S.tool === 'direct' && S.anchors.length) {
    const i = S.anchors[0], s = o.segs[i]; if (!s) return section('Path', ...kids);
    const w = toWorld(o, s), move = (x, y) => { const l = toLocal(o, { x: x ?? w.x, y: y ?? w.y }), dx = l.x - s.x, dy = l.y - s.y; for (const k of S.anchors) { o.segs[k].x += dx; o.segs[k].y += dy; } commit(); };
    kids.push(h('h4', {}, S.anchors.length > 1 ? `${S.anchors.length} anchors` : `Anchor ${i + 1}`),
      grid(num('X', w.x, v => move(v, null), { k: 'anchor-x' }), num('Y', w.y, v => move(null, v), { k: 'anchor-y' })),
      row('Type', seg([['corner', 'Corner', 'No handles'], ['smooth', 'Smooth', 'Handles stay in line, independent lengths'], ['sym', 'Symmetric', 'Handles mirror each other']], s.t, setAnchorType, 'anchor-type')));
  }
  return section('Path', ...kids);
}

function typographyPanel(o) {
  const f = describe(o.font), avail = isAvailable(o.font), fam = families().get(f.family) || [];
  const set = k => v => apply(x => { x[k] = v; }, false, isText);
  const kern = hasKerning(o.font);
  return section('Typography',
    h('button', { class: 'font-button' + (avail ? '' : ' missing'), id: 'font-family', title: 'Open the font browser', onclick: () => openFontBrowser({ current: o.font, sample: o.text.split('\n')[0].slice(0, 40), onPick: applyFont }) },
      h('span', { style: avail && fonts.get(o.font) ? { fontFamily: `"${fonts.get(o.font).css}", sans-serif` } : {} }, f.family), h('i', {}, avail ? 'Browse…' : 'missing')),
    !avail && h('p', { class: 'warn' }, `“${f.family} ${f.style}” is not available. The text is drawn in the fallback font; the reference is kept.`),
    row('Style', select(fam.length ? fam.map(e => [e.key, e.style]) : [[o.font, f.style]], o.font, applyFont, 'font-style')),
    grid(num('Size', o.size, set('size'), { min: 1, k: 'font-size' }), num('Leading', o.lineHeight, set('lineHeight'), { step: 0.05, min: 0.1, title: 'Line height (× size)' }),
      num('Tracking', o.tracking, set('tracking'), { step: 5, title: 'Letter spacing in 1/1000 em' }), num('Word sp.', o.wordSpacing, set('wordSpacing'), { step: 10, title: 'Extra word spacing in 1/1000 em' }),
      num('H scale', (o.hScale || 1) * 100, v => set('hScale')(v / 100), { min: 1, unit: '%' }), num('V scale', (o.vScale || 1) * 100, v => set('vScale')(v / 100), { min: 1, unit: '%' }),
      num('Baseline', o.baseline || 0, set('baseline'), { title: 'Baseline shift (positive = up)' }),
      o.box ? num('Column', o.box, set('box'), { min: 10, title: 'Area text width' }) : null),
    row('Align', seg([['left', icon('txL'), 'Align left'], ['center', icon('txC'), 'Align centre'], ['right', icon('txR'), 'Align right']], o.align, set('align'), 'text-align')),
    h('label', { class: 'check' + (kern ? '' : ' disabled') }, h('input', { type: 'checkbox', checked: kern && o.kerning !== false, disabled: !kern, data: { k: 'kerning' }, onchange: e => set('kerning')(e.target.checked) }), 'Font kerning'),
    !kern && h('p', { class: 'muted' }, 'This font has no kerning data Logo Lab can read (no kern table or GPOS pair lookup) — per-letter kerning in the Character tool still works.'),
    row('Type', seg([['point', 'Point text'], ['area', 'Area text']], o.box ? 'area' : 'point', v => apply(x => { x.box = v === 'area' ? Math.max(60, localBounds(x).w) : 0; }, false, isText), 'text-kind')));
}

function characterPanel(o) {
  if (S.tool !== 'char') return null;
  if (!S.chars.length) return section('Character', h('p', { class: 'muted' }, 'Click a letter on the canvas to adjust it on its own.'),
    (o.chars || []).some(Boolean) && button('Reset all letters', () => { o.chars = []; commit(); }, 'Remove every per-letter adjustment', 'reset-all-chars'));
  const i = S.chars[0], ov = (o.chars || [])[i] || {};
  const set = (k, d) => v => { for (const c of S.chars) { const x = charOv(o, c); if (v === d) delete x[k]; else x[k] = v; } commit(); };
  return section('Character', h('h4', {}, S.chars.length > 1 ? `${S.chars.length} letters` : `“${o.text[i]}” — letter ${i + 1}`),
    grid(num('Kern', ov.kern || 0, set('kern', 0), { step: 5, title: 'Space before this letter; following letters move too (1/1000 em)', k: 'ch-kern' }),
      num('Offset X', ov.dx || 0, set('dx', 0), { step: 5, title: 'Moves only this letter (1/1000 em)', k: 'ch-dx' }),
      num('Baseline', -(ov.dy || 0), v => set('dy', 0)(-v), { step: 5, title: 'Raises or lowers this letter (1/1000 em)', k: 'ch-dy' }),
      num('Rotate', ov.rot || 0, set('rot', 0), { unit: '°', k: 'ch-rot' }),
      num('Scale', (ov.scale || 1) * 100, v => set('scale', 1)(v / 100), { min: 5, unit: '%', k: 'ch-scale' })),
    colour('Fill', ov.fill, (v, live) => { for (const c of S.chars) { const x = charOv(o, c); if (v === 'none') delete x.fill; else x.fill = v; } live ? touch() : commit(); }, { noneLabel: 'Auto', k: 'ch-fill' }),
    button('Reset letter', () => { for (const c of S.chars) o.chars[c] = null; commit(); }, 'Remove this letter’s adjustments', 'reset-char'));
}

function appearancePanel(ls) {
  const o = ls[0], set = k => (v, live) => apply(x => { x[k] = v; }, live);
  const strokeOn = o.stroke && o.stroke !== 'none';
  return section('Appearance',
    colour('Fill', o.fill, set('fill')), colour('Stroke', o.stroke, set('stroke')),
    grid(num('Weight', o.strokeWidth, v => apply(x => { x.strokeWidth = v; }), { min: 0, step: 0.5, k: 'stroke-w', disabled: !strokeOn }),
      num('Opacity', (o.opacity ?? 1) * 100, v => apply(x => { x.opacity = v / 100; }), { min: 0, max: 100, unit: '%' })),
    strokeOn && row('Cap', seg([['butt', 'Butt'], ['round', 'Round'], ['square', 'Square']], o.cap || 'butt', v => apply(x => { x.cap = v; }), 'cap')),
    strokeOn && row('Join', seg([['miter', 'Miter'], ['round', 'Round'], ['bevel', 'Bevel']], o.join || 'miter', v => apply(x => { x.join = v; }), 'join')));
}

function arrangePanel(sel) {
  const ib = (ic, title, fn, k) => h('button', { class: 'mini', title, html: icon(ic), onclick: fn, data: { k } });
  const many = sel.length > 1, canPath = selectedLeaves().some(o => o.type !== 'path' && o.type !== 'text');
  return section('Align & arrange',
    h('div', { class: 'btnrow' }, ib('alL', many ? 'Align left edges' : 'Align to artboard left', () => A.align('left'), 'al-left'), ib('alC', 'Centre horizontally', () => A.align('hcentre'), 'al-hc'), ib('alR', 'Align right', () => A.align('right'), 'al-right'),
      ib('alT', 'Align top', () => A.align('top'), 'al-top'), ib('alM', 'Centre vertically', () => A.align('vcentre'), 'al-vc'), ib('alB', 'Align bottom', () => A.align('bottom'), 'al-bottom')),
    h('p', { class: 'muted' }, many ? 'Aligns objects to the selection bounds.' : 'Aligns to the artboard.'),
    h('div', { class: 'btnrow' }, ib('front', 'Bring to front (Ctrl+Shift+])', () => A.arrange('front'), 'to-front'), ib('up', 'Bring forward', () => A.arrange('forward'), 'fwd'), ib('down', 'Send backward', () => A.arrange('backward'), 'bwd'), ib('back', 'Send to back', () => A.arrange('back'), 'to-back')),
    h('div', { class: 'btnrow wrap' },
      many && button('Group', A.group, 'Ctrl+G'), sel.some(o => o.type === 'group') && button('Ungroup', A.ungroup, 'Ctrl+Shift+G'),
      button('Duplicate', () => A.duplicate(), 'Ctrl+D'), button('Delete', A.deleteSelection, 'Delete'),
      canPath && button('Convert to path', A.convertToPath, 'Turn the shape into an editable Bézier path (its shape parameters are replaced by anchor points)')));
}

function draw() {
  if (picking) return;
  const ae = document.activeElement, key = host.contains(ae) && ae.dataset ? ae.dataset.k : null, scroll = host.scrollTop;
  host.textContent = '';
  const sel = selected(), ls = selectedLeaves(), one = single();
  if (!sel.length) host.append(...documentPanel());
  else {
    const title = sel.length > 1 ? `${sel.length} objects` : sel[0].name;
    host.append(h('div', { class: 'insp-title' }, h('b', {}, title), h('small', {}, sel.length > 1 ? 'selection' : sel[0].type)));
    const text = ls.find(isText), allText = ls.length && ls.every(isText);
    const add = x => x && host.append(x);
    if (one && one.type === 'text') add(characterPanel(one));
    add(transformPanel(sel));
    if (one) add(shapePanel(one));
    if (allText) add(typographyPanel(text));
    if (ls.length) add(appearancePanel(ls));
    add(arrangePanel(sel));
  }
  host.scrollTop = scroll;
  if (key) { const el = host.querySelector(`[data-k="${CSS.escape(key)}"]`); if (el && el.focus) { el.focus(); if (el.select && el.type !== 'color') try { el.select(); } catch (e) { /* not selectable */ } } }
  void r3; void emit;
}

export function initInspector() {
  host = document.getElementById('inspector');
  // Enter commits a field and returns the keyboard to the canvas shortcuts
  host.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur(); });
  let raf = 0; const later = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
  for (const ev of ['doc', 'selection', 'tool', 'load']) on(ev, later);
  draw();
}
export const redrawInspector = () => draw();
