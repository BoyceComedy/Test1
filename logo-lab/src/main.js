// Logo Lab — entry point.
import { S, on, emit, loadDoc, saveNow, resetHistory } from './state.js';
import { initRender, fontsUpdated } from './render.js';
import { initOverlay } from './overlay.js';
import { initCanvas } from './canvas.js';
import { initTextInput } from './tools.js';
import { initToolbar } from './ui/toolbar.js';
import { initInspector } from './ui/inspector.js';
import { initLayers } from './ui/layers.js';
import { toast, warnMissingFonts } from './ui/dialogs.js';
import { initFonts, onFontsChanged, restoreLocalFonts, ensureFont, fonts } from './fonts.js';
import { zoomFit } from './actions.js';
import { buildSample } from './samples.js';
import { usedFonts } from './model.js';
import * as store from './storage.js';

async function boot() {
  await initFonts();
  let doc = null, first = false;
  try { const last = await store.get('kv', 'lastProject'); if (last) doc = await store.get('projects', last); } catch (e) { console.warn(e); }
  if (!doc) { doc = buildSample('combo'); first = true; }
  S.doc = doc; resetHistory();

  const svg = document.getElementById('canvas');
  initRender(svg); initOverlay(); initCanvas(svg); initTextInput(document.getElementById('text-input'));
  initToolbar(); initInspector(); initLayers();
  on('fit', zoomFit);
  onFontsChanged(() => { fontsUpdated(); emit('selection'); });
  new ResizeObserver(() => emit('view')).observe(svg);
  zoomFit(); emit('doc'); emit('save');
  window.addEventListener('beforeunload', () => { saveNow(); });
  window.addEventListener('error', e => toast('Unexpected error: ' + e.message, 'error'));
  window.addEventListener('unhandledrejection', e => toast('Unexpected error: ' + (e.reason && e.reason.message || e.reason), 'error'));

  if (first) await saveNow();
  await restoreLocalFonts();
  for (const k of usedFonts(S.doc)) if (fonts.has(k)) ensureFont(k).catch(() => {});
  warnMissingFonts(S.doc);
  if (!store.persistent) toast('Browser storage (IndexedDB) is unavailable — projects will not persist after this tab closes. Use Export → JSON project to keep your work.', 'warn', 6000);
  void loadDoc;
  window.LogoLab = { S, emit }; // handy for debugging in the console
  document.body.classList.add('ready');
}
boot().catch(e => { console.error(e); document.body.append(Object.assign(document.createElement('pre'), { className: 'fatal', textContent: 'Logo Lab failed to start:\n' + (e.stack || e) })); });
