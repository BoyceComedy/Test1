// Application state, change notification, undo history and autosave.
import { newDoc, find, leaves } from './model.js';
import * as store from './storage.js';

export const S = {
  doc: newDoc(),
  selection: [],          // object ids
  tool: 'select',
  zoom: 1, pan: { x: 0, y: 0 },
  viewMode: 'preview',    // or 'outline'
  anchors: [],            // selected anchor indices (direct selection)
  chars: [],              // selected character indices (character tool)
  editing: null,          // id of the text object being typed into
  guides: [],             // transient smart-guide lines
  saveState: 'saved',
};

const handlers = {};
export const on = (ev, fn) => (handlers[ev] || (handlers[ev] = [])).push(fn);
export const emit = (ev, arg) => (handlers[ev] || []).forEach(fn => fn(arg));

// ── selection ────────────────────────────────────────────────────────────
export function select(ids, keepSub) {
  S.selection = [...new Set(ids)];
  if (!keepSub) { S.anchors = []; S.chars = []; }
  emit('selection');
}
export const selected = () => S.selection.map(id => find(S.doc, id)).filter(Boolean).map(f => f.obj);
export const selectedLeaves = () => selected().flatMap(o => leaves(o));
export const single = () => { const s = selected(); return s.length === 1 ? s[0] : null; };

// ── history (snapshot based: documents are small, snapshots are robust) ───
let history = [], hi = -1;
const LIMIT = 200;
export function resetHistory() { history = [JSON.stringify(S.doc)]; hi = 0; emit('history'); }
/** Live update without a history entry (used while dragging). */
export function touch() { emit('doc'); }
/** Records an undo step and schedules an autosave. */
export function commit() {
  const snap = JSON.stringify(S.doc);
  if (snap !== history[hi]) {
    history = history.slice(0, hi + 1); history.push(snap);
    if (history.length > LIMIT) history.shift();
    hi = history.length - 1;
    scheduleSave();
  }
  emit('doc'); emit('history');
}
function restore() {
  S.doc = JSON.parse(history[hi]);
  S.selection = S.selection.filter(id => find(S.doc, id));
  S.anchors = []; S.chars = [];
  scheduleSave(); emit('doc'); emit('selection'); emit('history');
}
export function undo() { if (hi > 0) { emit('before-history'); hi--; restore(); } }
export function redo() { if (hi < history.length - 1) { emit('before-history'); hi++; restore(); } }
export const canUndo = () => hi > 0;
export const canRedo = () => hi < history.length - 1;

// ── persistence ──────────────────────────────────────────────────────────
let timer = null;
function scheduleSave() {
  S.saveState = 'unsaved'; emit('save');
  clearTimeout(timer); timer = setTimeout(saveNow, 1200);
}
export async function saveNow() {
  clearTimeout(timer);
  S.doc.updated = Date.now();
  try {
    await store.put('projects', JSON.parse(JSON.stringify(S.doc)));
    await store.put('kv', S.doc.id, 'lastProject');
    S.saveState = store.persistent ? 'saved' : 'memory';
  } catch (e) { console.error(e); S.saveState = 'error'; }
  emit('save');
}
export function loadDoc(doc) {
  S.doc = doc; S.selection = []; S.anchors = []; S.chars = []; S.editing = null;
  resetHistory(); emit('load'); emit('doc'); emit('selection');
}
export function setTool(t) { if (S.tool === t) return; emit('before-tool', t); S.tool = t; emit('tool'); }

// ── view ─────────────────────────────────────────────────────────────────
export const toScreen = p => ({ x: p.x * S.zoom + S.pan.x, y: p.y * S.zoom + S.pan.y });
export const toDoc = p => ({ x: (p.x - S.pan.x) / S.zoom, y: (p.y - S.pan.y) / S.zoom });
export function setView(zoom, pan) { S.zoom = Math.max(0.05, Math.min(64, zoom)); if (pan) S.pan = pan; emit('view'); }
