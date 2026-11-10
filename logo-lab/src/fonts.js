// Font registry. Every font — bundled, imported (OTF/TTF/WOFF) or read from the
// system through the Local Font Access API — is parsed with opentype.js so the
// canvas, the measurements and the outline export all use the same glyph data.
// A CSS FontFace is registered alongside for browser previews.
import opentype from 'opentype.js';
import bundled from './fonts-bundled.js';
import * as store from './storage.js';
import { DEFAULT_FONT } from './model.js';

export const fonts = new Map();   // key → { key, family, style, weight, italic, source, css, font, loader }
export const missing = new Set(); // keys requested but not available
export let favourites = new Set();
const listeners = new Set();
export const onFontsChanged = fn => listeners.add(fn);
const changed = () => listeners.forEach(fn => fn());

const b64 = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
let cssN = 0;
function register(e, buffer) {
  e.css = 'll-font-' + cssN++;
  try {
    const ff = buffer ? new FontFace(e.css, buffer) : new FontFace(e.css, `local("${e.postscript}")`);
    document.fonts.add(ff); ff.load().catch(() => {});
    // also under the real family name, so exported editable <text> previews correctly in this page
    if (buffer) { const real = new FontFace(e.family, buffer, { weight: String(e.weight || 400), style: e.italic ? 'italic' : 'normal' }); document.fonts.add(real); real.load().catch(() => {}); }
  } catch (err) { /* preview falls back to the UI font */ }
  fonts.set(e.key, e);
  missing.delete(e.key);
  return e;
}
const pick = (names, ...ids) => { for (const id of ids) { const n = names[id]; if (n) return n.en || Object.values(n)[0]; } return ''; };

export async function initFonts() {
  for (const b of bundled) {
    const buf = b64(b.data);
    register({ key: `b:${b.family}|${b.style}`, family: b.family, style: b.style, weight: b.weight, italic: b.italic, source: 'bundled', font: opentype.parse(buf) }, buf);
  }
  try {
    for (const rec of await store.all('fonts')) addParsed(rec.data, false);
    favourites = new Set((await store.get('kv', 'favourites')) || []);
  } catch (e) { console.warn('font store unavailable', e); }
}

function addParsed(buffer, persist) {
  const font = opentype.parse(buffer); // throws on unsupported data
  const family = pick(font.names, 'preferredFamily', 'fontFamily') || 'Unknown';
  const style = pick(font.names, 'preferredSubfamily', 'fontSubfamily') || 'Regular';
  const os2 = font.tables.os2 || {};
  const e = register({ key: `i:${family}|${style}`, family, style, weight: os2.usWeightClass || 400, italic: /italic|oblique/i.test(style), source: 'imported', font }, buffer);
  if (persist) store.put('fonts', { key: e.key, data: buffer }).catch(() => {});
  return e;
}

/** Imports OTF / TTF / WOFF files. Returns { added: [entries], errors: [string] }. */
export async function importFontFiles(files) {
  const added = [], errors = [];
  for (const f of files) {
    try { added.push(addParsed(await f.arrayBuffer(), true)); }
    catch (e) { errors.push(`${f.name}: ${/woff2|wOF2/i.test(e.message) || /\.woff2$/i.test(f.name) ? 'WOFF2 is not supported — use OTF, TTF or WOFF' : e.message}`); }
  }
  if (added.length) changed();
  return { added, errors };
}
export async function removeImported(key) { fonts.delete(key); await store.del('fonts', key).catch(() => {}); changed(); }

export const localFontsSupported = () => typeof window.queryLocalFonts === 'function';
/** Lists installed fonts (Chromium Local Font Access API; asks for permission). */
export async function loadLocalFonts() {
  if (!localFontsSupported()) throw new Error('This browser does not expose installed fonts (Local Font Access API). Import OTF/TTF files instead.');
  const list = await window.queryLocalFonts();
  let n = 0;
  for (const f of list) {
    const key = `l:${f.family}|${f.style}`;
    if (fonts.has(key)) continue;
    register({ key, family: f.family, style: f.style, weight: /bold|black|heavy/i.test(f.style) ? 700 : 400, italic: /italic|oblique/i.test(f.style), source: 'system', postscript: f.postscriptName, font: null,
      loader: async () => opentype.parse(await (await f.blob()).arrayBuffer()) }, null);
    n++;
  }
  changed();
  return n;
}
/** If permission was granted earlier, restore system fonts silently. */
export async function restoreLocalFonts() {
  try {
    if (!localFontsSupported() || !navigator.permissions) return;
    const p = await navigator.permissions.query({ name: 'local-fonts' });
    if (p.state === 'granted') await loadLocalFonts();
  } catch (e) { /* not available */ }
}

const loading = new Map();
/** Ensures the opentype data for a key is parsed (system fonts load lazily). */
export function ensureFont(key) {
  const e = fonts.get(key);
  if (!e) return Promise.reject(new Error('Font not available'));
  if (e.font) return Promise.resolve(e);
  if (!loading.has(key)) loading.set(key, e.loader().then(f => { e.font = f; changed(); return e; }).catch(err => { e.failed = err.message; loading.delete(key); throw new Error(`${e.family} ${e.style} cannot be used: ${err.message}`); }));
  return loading.get(key);
}

/** Synchronous lookup for rendering; falls back to the default font and records the miss. */
export function fontFor(key) {
  const e = fonts.get(key);
  if (e && e.font) return e.font;
  if (e && e.loader && !e.failed) ensureFont(key).catch(() => {}); else missing.add(key);
  return fonts.get(DEFAULT_FONT).font;
}
export const isAvailable = key => { const e = fonts.get(key); return !!(e && (e.font || e.loader)); };
export const describe = key => { const e = fonts.get(key); if (e) return e; const [family, style] = key.slice(2).split('|'); return { key, family, style: style || 'Regular', source: 'missing' }; };
export function families() {
  const m = new Map();
  for (const e of fonts.values()) { if (!m.has(e.family)) m.set(e.family, []); m.get(e.family).push(e); }
  for (const l of m.values()) l.sort((a, b) => a.weight - b.weight || a.italic - b.italic);
  return m;
}
export function hasKerning(key) {
  const f = fontFor(key);
  return !!((f.position && f.position.defaultKerningTables && f.position.defaultKerningTables.length) || (f.kerningPairs && Object.keys(f.kerningPairs).length));
}
export function toggleFavourite(key) {
  favourites.has(key) ? favourites.delete(key) : favourites.add(key);
  store.put('kv', [...favourites], 'favourites').catch(() => {});
  changed();
}
