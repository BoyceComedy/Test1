// Font browser: search, preview with your own words, compare, favourites,
// OTF/TTF/WOFF import and (where the browser allows) installed fonts.
import { h, icon } from './dom.js';
import { modal, toast } from './dialogs.js';
import { fonts, favourites, toggleFavourite, importFontFiles, loadLocalFonts, localFontsSupported, removeImported, onFontsChanged } from '../fonts.js';

let ui = { q: '', source: 'all', sample: '' };
/** opts: current (font key), sample (text), onPick(key) */
export function openFontBrowser(opts) {
  if (opts.sample && !ui.sample) ui.sample = opts.sample;
  let current = opts.current;
  const list = h('div', { class: 'font-list' }), count = h('span', { class: 'muted' });
  const file = h('input', { type: 'file', accept: '.otf,.ttf,.woff', multiple: true, style: { display: 'none' }, onchange: async e => {
    const { added, errors } = await importFontFiles([...e.target.files]);
    if (added.length) { toast(`Imported ${added.map(f => f.family + ' ' + f.style).join(', ')}`); ui.source = 'imported'; ui.q = ''; }
    errors.forEach(x => toast('Font import failed — ' + x, 'error'));
    e.target.value = ''; draw();
  } });
  const srcBtn = (v, label) => h('button', { class: ui.source === v ? 'on' : '', data: { src: v }, onclick: () => { ui.source = v; draw(); } }, label);
  const bar = h('div', { class: 'font-bar' });
  function draw() {
    bar.textContent = '';
    bar.append(
      h('input', { type: 'search', placeholder: 'Search fonts', value: ui.q, id: 'font-search', oninput: e => { ui.q = e.target.value; drawList(); } }),
      h('input', { type: 'text', placeholder: 'Preview text', value: ui.sample, id: 'font-sample', oninput: e => { ui.sample = e.target.value; drawList(); } }),
      h('div', { class: 'seg' }, srcBtn('all', 'All'), srcBtn('bundled', 'Bundled'), srcBtn('imported', 'Imported'), srcBtn('system', 'System'), srcBtn('fav', '★ Favourites')),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: () => file.click() }, 'Import OTF / TTF…'), file,
      h('button', { class: 'btn', id: 'load-system-fonts', title: localFontsSupported() ? 'Ask the browser for the fonts installed on this computer' : 'Not supported by this browser', onclick: async () => {
        try { const n = await loadLocalFonts(); toast(n ? `${n} installed fonts available` : 'No additional installed fonts were returned'); ui.source = 'system'; draw(); }
        catch (e) { toast(e.name === 'SecurityError' || e.name === 'NotAllowedError' ? 'Access to installed fonts was not granted.' : e.message, 'warn'); }
      } }, 'Load system fonts'));
    drawList();
  }
  function drawList() {
    list.textContent = '';
    const q = ui.q.trim().toLowerCase();
    const items = [...fonts.values()].filter(f => (ui.source === 'all' || (ui.source === 'fav' ? favourites.has(f.key) : f.source === ui.source)) && (!q || (f.family + ' ' + f.style).toLowerCase().includes(q)))
      .sort((a, b) => a.family.localeCompare(b.family) || a.weight - b.weight || a.italic - b.italic);
    count.textContent = `${items.length} of ${fonts.size} fonts`;
    for (const f of items) {
      list.append(h('div', { class: 'font-row' + (f.key === current ? ' current' : ''), data: { key: f.key }, onclick: () => { current = f.key; opts.onPick(f.key); drawList(); } },
        h('button', { class: 'star' + (favourites.has(f.key) ? ' on' : ''), title: 'Favourite', html: icon('star2', favourites.has(f.key)), onclick: e => { e.stopPropagation(); toggleFavourite(f.key); drawList(); } }),
        h('div', { class: 'font-meta' }, h('b', {}, f.family), h('small', {}, `${f.style} · ${f.source}`)),
        h('div', { class: 'font-preview', style: { fontFamily: `"${f.css}", sans-serif` } }, ui.sample || f.family),
        f.source === 'imported' && h('button', { class: 'btn danger small', title: 'Remove imported font', onclick: async e => { e.stopPropagation(); await removeImported(f.key); drawList(); } }, 'Remove')));
    }
    if (!items.length) list.append(h('p', { class: 'muted pad' }, ui.source === 'system' ? (localFontsSupported() ? 'Press “Load system fonts” to list the fonts installed on this computer.' : 'This browser cannot list installed fonts. Import OTF or TTF files instead.') : ui.source === 'fav' ? 'No favourites yet — star a font to keep it here for side-by-side comparison.' : 'No fonts match.'));
  }
  const m = modal('Fonts', h('div', { class: 'dlg-body fonts' }, bar, list, h('div', { class: 'dlg-foot' }, count, h('span', { class: 'grow' }), h('button', { class: 'btn primary', onclick: () => m.close() }, 'Done'))), { width: 860 });
  draw();
  void onFontsChanged;
  return m;
}
