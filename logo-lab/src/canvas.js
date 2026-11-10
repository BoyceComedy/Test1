// Pointer, wheel and keyboard plumbing for the canvas.
import { S, on, emit, toDoc, setView, setTool, undo, redo, saveNow, select } from './state.js';
import { tools } from './tools.js';
import * as A from './actions.js';
import { openProjects, openExport, toast } from './ui/dialogs.js';

export const TOOL_KEYS = { v: 'select', a: 'direct', p: 'pen', n: 'freehand', l: 'line', r: 'rect', e: 'ellipse', c: 'circle', u: 'arc', y: 'polygon', s: 'star', t: 'text', k: 'char' };
let space = false, panning = null, svg;

function ctx(e) {
  const r = svg.getBoundingClientRect(), sp = { x: e.clientX - r.left, y: e.clientY - r.top };
  return { e, sp, p: toDoc(sp), target: e.target, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey };
}
const isField = el => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

export function initCanvas(root) {
  svg = root;
  svg.addEventListener('pointerdown', e => {
    const ae = document.activeElement;
    if (isField(ae) && ae.id !== 'text-input') ae.blur();
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
    if (e.button === 1 || space) { panning = { x: e.clientX, y: e.clientY, pan: { ...S.pan } }; svg.classList.add('panning'); return; }
    if (e.button !== 0) return;
    tools[S.tool].down(ctx(e));
  });
  svg.addEventListener('pointermove', e => {
    const c = ctx(e);
    emit('pointer', c.p);
    if (panning) { setView(S.zoom, { x: panning.pan.x + e.clientX - panning.x, y: panning.pan.y + e.clientY - panning.y }); return; }
    tools[S.tool].move && tools[S.tool].move(c);
  });
  const up = e => {
    if (panning) { panning = null; svg.classList.remove('panning'); return; }
    if (e.button !== 0) return;
    tools[S.tool].up && tools[S.tool].up(ctx(e));
  };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
  svg.addEventListener('dblclick', e => { const t = tools[S.tool]; t.dblclick && t.dblclick(ctx(e)); });
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const c = ctx(e);
    if (e.shiftKey) setView(S.zoom, { x: S.pan.x - e.deltaY, y: S.pan.y });
    else A.zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), c.sp);
  }, { passive: false });
  svg.addEventListener('contextmenu', e => e.preventDefault());
  on('tool', () => { svg.dataset.tool = S.tool; });
  svg.dataset.tool = S.tool;

  window.addEventListener('keydown', e => {
    if (isField(e.target)) { if (e.key === 'Escape' && e.target.id !== 'text-input') e.target.blur(); return; }
    if (document.querySelector('.modal')) { if (e.key === 'Escape') document.querySelector('.modal').remove(); return; }
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (e.code === 'Space') { space = true; svg.classList.add('pan-ready'); e.preventDefault(); return; }
    const t = tools[S.tool];
    if (t.key && t.key(e)) { e.preventDefault(); return; }
    let done = true;
    if (mod && k === 'z') e.shiftKey ? redo() : undo();
    else if (mod && k === 'y') redo();
    else if (mod && k === 's') saveNow().then(() => toast('Project saved'));
    else if (mod && k === 'o') openProjects();
    else if (mod && k === 'e') openExport();
    else if (mod && k === 'a') A.selectAll();
    else if (mod && k === 'c') A.copy();
    else if (mod && k === 'x') A.cut();
    else if (mod && k === 'v') A.paste();
    else if (mod && k === 'd') A.duplicate();
    else if (mod && k === 'g') e.shiftKey ? A.ungroup() : A.group();
    else if (mod && k === ']') A.arrange(e.shiftKey ? 'front' : 'forward');
    else if (mod && k === '[') A.arrange(e.shiftKey ? 'back' : 'backward');
    else if (mod && k === '0') A.zoomFit();
    else if (mod && k === '1') A.zoomTo(1);
    else if (k === '=' || k === '+') A.zoomBy(1.25);
    else if (k === '-') A.zoomBy(0.8);
    else if (k === 'delete' || k === 'backspace') A.deleteSelection();
    else if (k === 'escape') { select([]); setTool('select'); }
    else if (k.startsWith('arrow')) { const s = e.shiftKey ? 10 : 1; A.nudge(k === 'arrowleft' ? -s : k === 'arrowright' ? s : 0, k === 'arrowup' ? -s : k === 'arrowdown' ? s : 0); }
    else if (!mod && !e.altKey && TOOL_KEYS[k]) setTool(TOOL_KEYS[k]);
    else done = false;
    if (done) e.preventDefault();
  });
  window.addEventListener('keyup', e => { if (e.code === 'Space') { space = false; svg.classList.remove('pan-ready'); } });
}
