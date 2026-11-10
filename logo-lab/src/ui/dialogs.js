// Toasts, modal shell, project browser and export dialog.
import { h } from './dom.js';
import { S, loadDoc, saveNow, emit } from '../state.js';
import * as store from '../storage.js';
import { newDoc, uid, usedFonts, clone } from '../model.js';
import { SAMPLES, buildSample } from '../samples.js';
import { buildSVG, download, renderPNG, fileBase } from '../exporter.js';
import { isAvailable, describe } from '../fonts.js';

export function toast(msg, kind = 'info', ms = 3200) {
  const host = document.getElementById('toasts'), t = h('div', { class: 'toast ' + kind }, msg);
  if (kind !== 'info') t.append(h('button', { class: 'x', title: 'Dismiss', onclick: () => t.remove() }, '×'));
  host.append(t);
  if (ms) setTimeout(() => t.remove(), kind === 'info' ? ms : ms * 3);
  return t;
}
export function modal(title, body, { width = 560, onclose } = {}) {
  document.querySelectorAll('.modal').forEach(m => m.remove());
  const close = () => { wrap.remove(); onclose && onclose(); };
  const wrap = h('div', { class: 'modal', onpointerdown: e => { if (e.target === wrap) close(); } },
    h('div', { class: 'dialog', style: { width: width + 'px' } },
      h('header', {}, h('span', {}, title), h('button', { class: 'x', title: 'Close (Esc)', onclick: close }, '×')), body));
  wrap.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  document.body.append(wrap);
  return { el: wrap, close };
}

export function warnMissingFonts(doc) {
  const miss = usedFonts(doc).filter(k => !isAvailable(k));
  if (miss.length) toast(`Font unavailable: ${miss.map(k => { const f = describe(k); return `${f.family} ${f.style}`; }).join(', ')}. Affected text is shown in the fallback font until the font is imported or system fonts are loaded; the original font reference is kept.`, 'warn', 5000);
  return miss;
}
export async function openDocument(doc) {
  if (S.doc) await saveNow();
  loadDoc(doc); await saveNow(); emit('fit'); warnMissingFonts(doc);
}
export async function newProject() { await openDocument(newDoc('Untitled')); toast('New project created'); }

const thumb = doc => { try { return buildSVG(doc, { text: 'outline', construction: false }).svg.replace(/ width="[^"]+" height="[^"]+"/, ''); } catch (e) { return ''; } };

export async function openProjects() {
  const body = h('div', { class: 'dlg-body projects' });
  const m = modal('Projects', body, { width: 720 });
  const fileIn = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' }, onchange: async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (d.app !== 'logo-lab' || !Array.isArray(d.layers)) throw new Error('not a Logo Lab project file');
      d.id = uid('p'); await openDocument(d); m.close(); toast(`Imported “${d.name}”`);
    } catch (err) { toast('Import failed: ' + err.message, 'error'); }
  } });
  async function draw() {
    body.textContent = '';
    const list = (await store.all('projects')).sort((a, b) => b.updated - a.updated);
    body.append(h('div', { class: 'dlg-bar' }, h('h4', {}, `Saved on this computer (${list.length})`), h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: () => fileIn.click() }, 'Import project (.json)…'), fileIn,
      h('button', { class: 'btn', onclick: async () => { await newProject(); m.close(); } }, 'New project')));
    const rows = h('div', { class: 'proj-list' });
    for (const p of list) {
      rows.append(h('div', { class: 'proj' + (p.id === S.doc.id ? ' current' : ''), data: { id: p.id } },
        h('div', { class: 'thumb', html: thumb(p) }),
        h('div', { class: 'meta' }, h('b', {}, p.name), h('small', {}, `${p.width} × ${p.height} · ${new Date(p.updated).toLocaleString()}${p.id === S.doc.id ? ' · open' : ''}`)),
        h('button', { class: 'btn', onclick: async () => { await openDocument(p); m.close(); } }, 'Open'),
        h('button', { class: 'btn', onclick: async () => { const c = clone(p); c.id = uid('p'); c.name = p.name + ' copy'; c.updated = Date.now(); await store.put('projects', c); toast(`Duplicated as “${c.name}”`); draw(); } }, 'Duplicate'),
        h('button', { class: 'btn danger', disabled: p.id === S.doc.id, title: p.id === S.doc.id ? 'The open project cannot be deleted' : 'Delete project', onclick: async () => { if (confirm(`Delete “${p.name}”? This cannot be undone.`)) { await store.del('projects', p.id); draw(); } } }, 'Delete')));
    }
    if (!list.length) rows.append(h('p', { class: 'muted' }, 'No saved projects yet.'));
    body.append(rows, h('div', { class: 'dlg-bar' }, h('h4', {}, 'Samples')));
    const grid = h('div', { class: 'sample-grid' });
    for (const s of SAMPLES) {
      const d = s.build();
      grid.append(h('button', { class: 'sample', data: { sample: s.key }, onclick: async () => { await openDocument(buildSample(s.key)); m.close(); } },
        h('div', { class: 'thumb', html: thumb(d) }), h('b', {}, s.title), h('small', {}, s.note)));
    }
    body.append(grid);
  }
  await draw();
}

export function openExport() {
  const o = { format: 'svg', text: 'editable', area: 'artboard', construction: false, background: true, scale: 2 };
  const body = h('div', { class: 'dlg-body export' }), preview = h('div', { class: 'export-preview' }), info = h('p', { class: 'muted' });
  const radio = (key, opts) => h('div', { class: 'seg' }, opts.map(([v, label, tip]) => h('button', { class: o[key] === v ? 'on' : '', title: tip, data: { v: key + ':' + v }, onclick: () => { o[key] = v; draw(); } }, label)));
  const check = (key, label) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: o[key], onchange: e => { o[key] = e.target.checked; draw(); } }), label);
  const opts = () => ({ text: o.format === 'svg' ? o.text : 'outline', area: o.area, construction: o.construction, background: o.background });
  function draw() {
    body.textContent = '';
    const { svg, box } = buildSVG(S.doc, opts());
    preview.innerHTML = svg.replace(/ width="[^"]+" height="[^"]+"/, '');
    info.textContent = o.format === 'png' ? `${Math.round(box.w * o.scale)} × ${Math.round(box.h * o.scale)} px, transparent unless a document background is included. Text is rasterised from outlines.`
      : o.format === 'json' ? 'Complete project: artwork, text objects, font references, construction geometry, layers and document settings.'
      : o.text === 'editable' ? 'Text stays as editable <text> elements (one positioned span per character). The receiving application needs the same fonts installed.'
      : 'All text is converted to outlines in the exported file only — the project keeps its editable text.';
    body.append(
      h('div', { class: 'export-cols' }, preview, h('div', { class: 'form' },
        h('label', {}, 'Format'), radio('format', [['svg', 'SVG'], ['png', 'PNG'], ['json', 'JSON project']]),
        o.format === 'svg' && h('label', {}, 'Text'), o.format === 'svg' && radio('text', [['editable', 'Editable text'], ['outline', 'Outlines']]),
        o.format === 'png' && h('label', {}, 'Scale'), o.format === 'png' && radio('scale', [[1, '1×'], [2, '2×'], [4, '4×'], [8, '8×']]),
        o.format !== 'json' && h('label', {}, 'Area'), o.format !== 'json' && radio('area', [['artboard', 'Artboard'], ['artwork', 'Artwork bounds']]),
        o.format !== 'json' && check('background', 'Include document background'),
        o.format !== 'json' && check('construction', 'Include construction geometry'),
        info)),
      h('div', { class: 'dlg-foot' }, h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'),
        h('button', { class: 'btn primary', id: 'do-export', onclick: run }, 'Export')));
  }
  async function run() {
    const name = fileBase(S.doc);
    try {
      if (o.format === 'svg') download(name + '.svg', buildSVG(S.doc, opts()).svg, 'image/svg+xml');
      else if (o.format === 'json') download(name + '.logolab.json', JSON.stringify(S.doc, null, 1), 'application/json');
      else { const r = await renderPNG(S.doc, opts(), o.scale); download(`${name}@${o.scale}x.png`, r.blob); }
      toast('Exported ' + o.format.toUpperCase()); m.close();
    } catch (e) { toast('Export failed: ' + e.message, 'error'); }
  }
  const m = modal('Export', body, { width: 680 });
  draw();
}
