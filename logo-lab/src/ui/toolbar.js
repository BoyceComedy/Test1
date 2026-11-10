// Top toolbar, left tool palette and status bar.
import { h, icon } from './dom.js';
import { S, on, setTool, undo, redo, canUndo, canRedo, saveNow, commit, emit } from '../state.js';
import * as A from '../actions.js';
import { openProjects, openExport, newProject, toast } from './dialogs.js';
import { persistent } from '../storage.js';

const TOOLS = [
  ['Drawing', [['select', 'Selection', 'V'], ['direct', 'Direct selection — edit anchor points and handles', 'A'], ['pen', 'Pen / Bézier', 'P'], ['freehand', 'Freehand', 'N'],
    ['line', 'Line', 'L'], ['circle', 'Circle (from centre)', 'C'], ['ellipse', 'Ellipse', 'E'], ['arc', 'Arc (from centre)', 'U'], ['rect', 'Rectangle', 'R'], ['polygon', 'Polygon', 'Y'], ['star', 'Star', 'S']]],
  ['Typography', [['text', 'Text — click for point text, drag for area text', 'T'], ['char', 'Character — select and adjust individual letters', 'K']]],
];
export const HINTS = {
  select: 'Click to select · drag to move · Shift adds · Alt-drag duplicates · handles resize, round handle rotates · double-click text to edit',
  direct: 'Click a path, then drag anchors or handles · Shift-click adds anchors · double-click an anchor toggles corner / smooth · Alt-drag breaks a handle · Delete removes anchors',
  pen: 'Click for corner points · drag for curves · click the first point to close · Enter or Esc to finish',
  freehand: 'Drag to draw; the stroke is simplified into a smooth Bézier path',
  line: 'Drag to draw a line · Shift constrains to 45°', rect: 'Drag to draw · Shift = square · Alt = from centre', ellipse: 'Drag to draw · Shift = circle · Alt = from centre',
  circle: 'Drag out from the centre to set the radius', arc: 'Drag from the centre: distance sets the radius, direction the end angle · Shift = 15° steps',
  polygon: 'Drag from the centre · Shift keeps it upright · sides in the inspector', star: 'Drag from the centre · Shift keeps it upright · points and inner ratio in the inspector',
  text: 'Click to place point text · drag to create area text · click existing text to edit · Esc to finish',
  char: 'Click a letter (Shift for several) · drag to move · arrows nudge · Alt+←/→ kerns · more in the inspector',
};

export function initToolbar() {
  const top = document.getElementById('topbar'), left = document.getElementById('tools'), status = document.getElementById('status');
  const btn = (id, label, title, onclick, ic) => h('button', { class: 'tb', id, title, onclick, html: (ic ? icon(ic) : '') + (label ? `<span>${label}</span>` : '') });
  const name = h('input', { id: 'doc-name', class: 'doc-name', spellcheck: false, title: 'Project name', onchange: e => { S.doc.name = e.target.value.trim() || 'Untitled'; commit(); } });
  const zoom = h('button', { class: 'tb zoom', id: 'zoom-level', title: 'Zoom to 100% (Ctrl+1)', onclick: () => A.zoomTo(1) });
  const bUndo = btn('btn-undo', '', 'Undo (Ctrl+Z)', undo, 'undo'), bRedo = btn('btn-redo', '', 'Redo (Ctrl+Shift+Z)', redo, 'redo');
  const bGrid = btn('btn-grid', 'Grid', 'Show grid (snapping uses the grid while it is visible)', () => { S.doc.grid.visible = !S.doc.grid.visible; commit(); }, 'grid');
  const bSnap = btn('btn-snap', 'Snap', 'Snap to grid and smart guides (hold Ctrl to bypass)', () => { S.doc.snap = !S.doc.snap; commit(); }, 'snap');
  const bView = btn('btn-view', 'Outline', 'View mode: preview / outline', () => { S.viewMode = S.viewMode === 'outline' ? 'preview' : 'outline'; emit('doc'); }, 'outline');
  top.append(
    h('div', { class: 'brand' }, h('b', {}, 'LOGO'), ' LAB'), name, h('span', { class: 'sep' }),
    btn('btn-new', 'New', 'New project', newProject), btn('btn-open', 'Open', 'Projects and samples (Ctrl+O)', openProjects),
    btn('btn-save', 'Save', 'Save now (Ctrl+S) — projects also save automatically', () => saveNow().then(() => toast(persistent ? 'Project saved' : 'Saved in memory only — browser storage is unavailable', persistent ? 'info' : 'warn'))),
    h('span', { class: 'sep' }), bUndo, bRedo, h('span', { class: 'sep' }),
    btn('btn-zoom-out', '−', 'Zoom out (−)', () => A.zoomBy(0.8)), zoom, btn('btn-zoom-in', '+', 'Zoom in (+)', () => A.zoomBy(1.25)), btn('btn-fit', 'Fit', 'Fit artboard (Ctrl+0)', A.zoomFit),
    h('span', { class: 'sep' }), bGrid, bSnap, bView, h('span', { class: 'grow' }),
    btn('btn-export', 'Export', 'Export SVG, PNG or JSON (Ctrl+E)', openExport));
  top.lastChild.classList.add('primary');

  for (const [title, list] of TOOLS) {
    left.append(h('div', { class: 'tool-group', title }, list.map(([id, label, key]) => h('button', { class: 'tool', data: { tool: id }, title: `${label} (${key})`, html: icon(id), onclick: () => setTool(id) }))));
  }
  const sPos = h('span', { class: 'pos' }), sHint = h('span', { class: 'hint' }), sSave = h('span', { class: 'save' });
  status.append(sPos, sHint, sSave);

  const sync = () => {
    if (document.activeElement !== name) name.value = S.doc.name;
    bGrid.classList.toggle('on', S.doc.grid.visible); bSnap.classList.toggle('on', S.doc.snap); bView.classList.toggle('on', S.viewMode === 'outline');
    bUndo.disabled = !canUndo(); bRedo.disabled = !canRedo();
    document.title = `${S.doc.name} — Logo Lab`;
  };
  const syncTool = () => { left.querySelectorAll('.tool').forEach(b => b.classList.toggle('on', b.dataset.tool === S.tool)); sHint.textContent = HINTS[S.tool] || ''; };
  on('doc', sync); on('history', sync); on('tool', syncTool);
  on('view', () => { zoom.textContent = Math.round(S.zoom * 100) + '%'; });
  on('pointer', p => { sPos.textContent = `X ${p.x.toFixed(1)}  Y ${p.y.toFixed(1)}`; });
  on('save', () => { sSave.textContent = { saved: 'Saved', unsaved: 'Saving…', memory: 'Not persisted (storage unavailable)', error: 'Save failed' }[S.saveState]; sSave.dataset.state = S.saveState; });
  sync(); syncTool(); zoom.textContent = '100%';
}
