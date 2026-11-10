// Bottom panel: layers and objects — visibility, locking, naming, selection,
// drag-and-drop reordering, grouping.
import { h, icon } from './dom.js';
import { S, on, select, commit, emit } from '../state.js';
import { find, newLayer, layerById } from '../model.js';
import * as A from '../actions.js';
import { toast } from './dialogs.js';

const TYPE_ICON = { rect: 'rect', ellipse: 'ellipse', arc: 'arc', polygon: 'polygon', star: 'star', path: 'pen', text: 'text', group: 'group' };
let dragging = null;

export function initLayers() {
  const host = document.getElementById('layers-panel');
  const body = h('div', { class: 'layers-body' });
  const b = (ic, title, onclick, id) => h('button', { class: 'pbtn', title, id, html: icon(ic), onclick });
  host.append(h('div', { class: 'panel-head' }, h('span', {}, 'LAYERS & OBJECTS'), h('span', { class: 'grow' }),
    b('group', 'Group selection (Ctrl+G)', A.group, 'btn-group'), b('up', 'Bring forward (Ctrl+])', () => A.arrange('forward'), 'btn-forward'), b('down', 'Send backward (Ctrl+[)', () => A.arrange('backward'), 'btn-backward'),
    h('span', { class: 'sep' }),
    b('layer', 'New artwork layer', () => addLayer('artwork'), 'btn-add-layer'), b('compass', 'New construction layer — guide geometry kept separate from artwork', () => addLayer('construction'), 'btn-add-construction'),
    b('trash', 'Delete active layer', deleteLayer, 'btn-del-layer')), body);

  function addLayer(kind) {
    const n = S.doc.layers.filter(l => l.kind === kind).length + 1, l = newLayer(kind === 'construction' ? `Construction ${n}` : `Artwork ${n}`, kind);
    S.doc.layers.push(l); S.doc.activeLayer = l.id; commit();
  }
  function deleteLayer() {
    if (S.doc.layers.length < 2) return toast('A document needs at least one layer.', 'warn');
    const l = layerById(S.doc, S.doc.activeLayer) || S.doc.layers[S.doc.layers.length - 1];
    if (l.objects.length && !confirm(`Delete layer “${l.name}” and its ${l.objects.length} object(s)?`)) return;
    S.doc.layers.splice(S.doc.layers.indexOf(l), 1); S.doc.activeLayer = S.doc.layers[S.doc.layers.length - 1].id;
    select(S.selection.filter(id => find(S.doc, id))); commit();
  }
  function rename(span, target, isLayer) {
    const inp = h('input', { class: 'rename', value: target.name });
    const done = ok => { if (ok && inp.value.trim()) { target.name = inp.value.trim(); if (!isLayer) target.named = true; commit(); } else draw(); };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.value = ''; inp.blur(); } e.stopPropagation(); });
    inp.addEventListener('blur', () => done(true));
    span.replaceWith(inp); inp.focus(); inp.select();
  }
  const toggle = (obj, key, def) => e => { e.stopPropagation(); obj[key] = !(obj[key] ?? def); commit(); };

  function dropHandlers(row, kind, id) {
    row.draggable = true;
    row.addEventListener('dragstart', e => { dragging = { kind, id }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); e.stopPropagation(); });
    row.addEventListener('dragend', () => { dragging = null; body.querySelectorAll('.drop-above,.drop-below,.drop-into').forEach(x => x.classList.remove('drop-above', 'drop-below', 'drop-into')); });
    row.addEventListener('dragover', e => {
      if (!dragging || dragging.id === id) return;
      if (dragging.kind === 'layer' && kind !== 'layer') return;
      e.preventDefault(); e.stopPropagation();
      const r = row.getBoundingClientRect(), above = e.clientY < r.top + r.height / 2;
      row.classList.remove('drop-above', 'drop-below', 'drop-into');
      row.classList.add(kind === 'layer' && dragging.kind === 'obj' ? 'drop-into' : above ? 'drop-above' : 'drop-below');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop-above', 'drop-below', 'drop-into'));
    row.addEventListener('drop', e => {
      if (!dragging || dragging.id === id) return;
      e.preventDefault(); e.stopPropagation();
      const r = row.getBoundingClientRect(), above = e.clientY < r.top + r.height / 2, d = dragging; dragging = null;
      if (d.kind === 'layer') {
        if (kind !== 'layer') return;
        const L = S.doc.layers, from = L.findIndex(l => l.id === d.id), [m] = L.splice(from, 1), to = L.findIndex(l => l.id === id);
        L.splice(above ? to + 1 : to, 0, m); // the panel lists top-most first
      } else {
        const src = find(S.doc, d.id); if (!src) return;
        if (kind === 'layer') { src.arr.splice(src.index, 1); layerById(S.doc, id).objects.push(src.obj); }
        else {
          if (src.obj.type === 'group' && (function inside(g) { return g.children.some(c => c.id === id || (c.children && inside(c))); })(src.obj)) return toast('A group cannot be moved inside itself.', 'warn');
          src.arr.splice(src.index, 1);
          const dst = find(S.doc, id); dst.arr.splice(above ? dst.index + 1 : dst.index, 0, src.obj);
        }
      }
      commit();
    });
  }

  function objRow(o, depth, layer) {
    const sel = S.selection.includes(o.id), nameEl = h('span', { class: 'name' }, o.name);
    const row = h('div', { class: 'row obj' + (sel ? ' sel' : '') + (o.visible === false ? ' off' : ''), data: { id: o.id }, style: { paddingLeft: 8 + depth * 14 + 'px' },
      onclick: e => { S.doc.activeLayer = layer.id; select(e.shiftKey || e.ctrlKey || e.metaKey ? (sel ? S.selection.filter(i => i !== o.id) : [...S.selection, o.id]) : [o.id]); emit('doc'); },
      ondblclick: e => { e.stopPropagation(); rename(nameEl, o, false); } },
      h('button', { class: 'ibtn vis', title: 'Visibility', html: icon(o.visible === false ? 'eyeoff' : 'eye'), onclick: toggle(o, 'visible', true) }),
      h('button', { class: 'ibtn lock' + (o.locked ? ' on' : ''), title: 'Lock', html: icon(o.locked ? 'lock' : 'unlock'), onclick: toggle(o, 'locked', false) }),
      h('span', { class: 'ticon', html: icon(TYPE_ICON[o.type]) }), nameEl, h('span', { class: 'kind' }, o.type));
    dropHandlers(row, 'obj', o.id);
    const out = [row];
    if (o.type === 'group') for (const c of o.children.slice().reverse()) out.push(...objRow(c, depth + 1, layer));
    return out;
  }
  function draw() {
    if (body.querySelector('.rename')) return;
    const scroll = body.scrollTop; body.textContent = '';
    for (const layer of S.doc.layers.slice().reverse()) {
      const active = S.doc.activeLayer === layer.id, nameEl = h('span', { class: 'name' }, layer.name);
      const row = h('div', { class: 'row layer' + (active ? ' active' : '') + (layer.visible ? '' : ' off') + ' ' + layer.kind, data: { layer: layer.id },
        onclick: () => { S.doc.activeLayer = layer.id; emit('doc'); }, ondblclick: () => rename(nameEl, layer, true) },
        h('button', { class: 'ibtn vis', title: 'Layer visibility', html: icon(layer.visible ? 'eye' : 'eyeoff'), onclick: toggle(layer, 'visible', true) }),
        h('button', { class: 'ibtn lock' + (layer.locked ? ' on' : ''), title: 'Lock layer', html: icon(layer.locked ? 'lock' : 'unlock'), onclick: toggle(layer, 'locked', false) }),
        h('span', { class: 'ticon', html: icon(layer.kind === 'construction' ? 'compass' : 'layer') }), nameEl,
        h('span', { class: 'kind' }, `${layer.kind} · ${layer.objects.length}`));
      dropHandlers(row, 'layer', layer.id);
      body.append(row);
      for (const o of layer.objects.slice().reverse()) body.append(...objRow(o, 1, layer));
    }
    body.scrollTop = scroll;
  }
  let raf = 0; const later = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
  on('doc', later); on('selection', later);
  draw();
}
