// End-to-end smoke test: drives the real UI in headless Chromium over file://.
// Run: npm test   (requires a Playwright install with Chromium)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? '  ok  ' : 'FAIL  '}${name}${cond ? '' : '  ' + extra}`); };
const near = (a, b, t = 0.6) => Math.abs(a - b) <= t;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  await page.goto(URL); await page.waitForSelector('body.ready');

  const S = fn => page.evaluate(fn);
  const tick = () => page.waitForTimeout(60);
  const pt = async (x, y) => page.evaluate(([x, y]) => { const s = LogoLab.S, r = document.getElementById('canvas').getBoundingClientRect(); return [r.left + x * s.zoom + s.pan.x, r.top + y * s.zoom + s.pan.y]; }, [x, y]);
  const drag = async (a, b, opts = {}) => { const [x1, y1] = await pt(...a), [x2, y2] = await pt(...b); await page.mouse.move(x1, y1); await page.mouse.down(); await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 }); await page.mouse.move(x2, y2, { steps: 4 }); if (opts.hold) { await tick(); return; } await page.mouse.up(); await tick(); };
  const click = async (x, y, o) => { const [cx, cy] = await pt(x, y); await page.mouse.click(cx, cy, o); await tick(); };
  const bbox = async q => { for (let i = 0; i < 20; i++) { const b = await page.locator(q).first().boundingBox().catch(() => null); if (b) return b; await tick(); } throw new Error('no box for ' + q); };
  const tool = t => page.click(`.tool[data-tool=${t}]`);
  const objs = () => S(() => LogoLab.S.doc.layers.flatMap(l => l.objects));
  const sel = () => S(() => { const s = LogoLab.S; const all = []; (function w(a) { a.forEach(o => { all.push(o); if (o.children) w(o.children); }); })(s.doc.layers.flatMap(l => l.objects)); return s.selection.map(id => all.find(o => o.id === id)); });
  const field = async (k, v) => { await page.fill(`#inspector [data-k="${k}"]`, String(v)); await page.press(`#inspector [data-k="${k}"]`, 'Enter'); await page.waitForTimeout(60); };

  // ── boot ──
  ok((await objs()).length >= 3, 'boots with the combination-mark sample');
  ok(await S(() => document.querySelectorAll('#layers .obj path').length > 10), 'sample artwork rendered as SVG paths');

  // ── new project ──
  await page.click('#btn-new'); await tick();
  ok((await objs()).length === 0 && await S(() => LogoLab.S.doc.name === 'Untitled'), 'New project creates an empty document');

  // ── shape tools ──
  await tool('rect'); await drag([100, 100], [300, 220]);
  let o = (await sel())[0];
  ok(o && o.type === 'rect' && near(o.w, 200) && near(o.h, 120) && near(o.x, 200) && near(o.y, 160), 'Rectangle tool draws 200×120 (grid-snapped)', JSON.stringify(o));
  await field('corner-r', 20);
  ok((await sel())[0].r === 20, 'inspector sets corner radius');
  await tool('ellipse'); await drag([400, 100], [560, 200]); o = (await sel())[0];
  ok(o.type === 'ellipse' && near(o.rx, 80) && near(o.ry, 50), 'Ellipse tool');
  await tool('circle'); await drag([650, 150], [700, 150]); o = (await sel())[0];
  ok(o.type === 'ellipse' && near(o.rx, 50) && near(o.ry, 50) && near(o.x, 650), 'Circle tool draws from the centre');
  await tool('line'); await drag([100, 300], [300, 300]); o = (await sel())[0];
  ok(o.type === 'path' && o.segs.length === 2 && near(o.segs[1].x, 300), 'Line tool');
  await tool('polygon'); await page.keyboard.down('Shift'); await drag([400, 320], [400, 380]); await page.keyboard.up('Shift'); o = (await sel())[0];
  ok(o.type === 'polygon' && near(o.rx, 60) && o.rotation === 0, 'Polygon tool (Shift keeps upright)', JSON.stringify(o));
  await field('Sides', 8); ok((await sel())[0].sides === 8, 'inspector sets polygon sides');
  await tool('star'); await drag([560, 320], [560, 260]); o = (await sel())[0];
  ok(o.type === 'star' && near(o.rx, 60), 'Star tool');
  await tool('arc'); await drag([680, 320], [680, 380]); o = (await sel())[0];
  ok(o.type === 'arc' && near(o.rx, 60) && near(o.a1, 90, 1), 'Arc tool sets radius and end angle', JSON.stringify(o));
  await page.click('#inspector [data-k="arc-mode"] [data-v="pie"]'); await tick();
  ok((await sel())[0].mode === 'pie', 'arc close mode');

  // ── pen ──
  await tool('pen');
  await click(100, 420); await drag([200, 420], [240, 460]); await click(150, 520); await click(100, 420); await tick();
  o = (await sel())[0];
  ok(o && o.type === 'path' && o.closed && o.segs.length === 3 && near(o.segs[1].ox, 40) && near(o.segs[1].ix, -40), 'Pen draws corner + smooth points and closes on the first point', JSON.stringify(o));
  const penId = o.id;
  await click(300, 430); await click(360, 500); await page.keyboard.press('Enter'); await tick();
  o = (await sel())[0]; ok(o.type === 'path' && !o.closed && o.segs.length === 2, 'Pen: Enter finishes an open path');

  // ── freehand ──
  await tool('freehand');
  { const [x, y] = await pt(430, 430); await page.mouse.move(x, y); await page.mouse.down(); for (let i = 1; i <= 30; i++) await page.mouse.move(x + i * 5, y + Math.sin(i / 4) * 30); await page.mouse.up(); }
  o = (await sel())[0]; ok(o.type === 'path' && o.segs.length >= 3 && o.segs.length < 30 && o.segs.some(s => s.ox || s.oy), `Freehand simplifies to a smooth path (${o.segs.length} anchors)`);

  // ── selection: move / resize / rotate / undo ──
  await tool('select'); await click(200, 160); o = (await sel())[0];
  ok(o && o.type === 'rect', 'Selection tool picks the rectangle');
  await page.keyboard.down('Control'); await drag([200, 160], [250, 200]); o = (await sel())[0];
  ok(near(o.x, 250) && near(o.y, 200), 'drag moves the object', `${o.x},${o.y}`);
  await drag([350, 260], [390, 300]); await page.keyboard.up('Control'); o = (await sel())[0]; // se handle
  ok(near(o.w, 240) && near(o.h, 160) && near(o.x, 270) && near(o.y, 220), 'corner handle resizes, opposite corner fixed', JSON.stringify(o));
  { const h = await bbox('#overlay [data-h=rot]'); const [cx, cy] = await pt(270, 220); await page.mouse.move(h.x + 4, h.y + 4); await page.mouse.down(); await page.keyboard.down('Shift'); await page.mouse.move(cx + 150, cy - 2, { steps: 6 }); await page.mouse.up(); await page.keyboard.up('Shift'); }
  o = (await sel())[0]; ok(near(o.rotation, 90) && near(o.x, 270), 'rotate handle rotates about the centre (Shift = 15° steps)', String(o.rotation));
  await page.click('#btn-undo'); ok(near((await sel())[0].rotation, 0), 'Undo');
  await page.click('#btn-redo'); ok(near((await sel())[0].rotation, 90), 'Redo');
  await page.keyboard.press('Control+z'); await field('rot', 30); ok(near((await sel())[0].rotation, 30), 'inspector rotation');
  await field('rot', 0); await field('X', 100); await field('W', 200);
  o = (await sel())[0]; ok(near(o.w, 200) && near(o.x - o.w / 2, 110, 12), 'inspector X / W', JSON.stringify(o));
  await page.keyboard.press('ArrowRight'); const x0 = o.x; ok(near((await sel())[0].x, x0 + 1), 'arrow keys nudge');

  // ── appearance ──
  await page.fill('#inspector [data-k="Fill-hex"]', '#ff0000'); await page.press('#inspector [data-k="Fill-hex"]', 'Enter'); await tick();
  await page.fill('#inspector [data-k="Stroke-hex"]', '#0000ff'); await page.press('#inspector [data-k="Stroke-hex"]', 'Enter'); await tick();
  await field('stroke-w', 6);
  o = (await sel())[0];
  const painted = await S(() => { const p = document.querySelector(`#layers [data-id="${LogoLab.S.selection[0]}"] path`); return [p.getAttribute('fill'), p.getAttribute('stroke'), p.getAttribute('stroke-width')]; });
  ok(o.fill === '#ff0000' && painted.join() === '#ff0000,#0000ff,6', 'fill / stroke / weight apply to the rendered path', painted.join());

  // ── convert to path + direct selection ──
  await page.click('#inspector [data-k="Convert to path"]'); await tick();
  o = (await sel())[0]; ok(o.type === 'path' && o.segs.length === 8 && o.closed, 'Convert to path keeps the rounded rectangle as 8 Bézier anchors');
  await tool('direct'); await tick();
  { const bb = await bbox('#overlay [data-a="0"]'); const before = o.segs[0]; await page.keyboard.down('Control'); await page.mouse.move(bb.x + 4, bb.y + 4); await page.mouse.down(); await page.mouse.move(bb.x + 4, bb.y - 26, { steps: 4 }); await page.mouse.up(); await page.keyboard.up('Control');
    o = (await sel())[0]; ok(near(o.segs[0].y, before.y - 30 / (await S(() => LogoLab.S.zoom)), 1) && near(o.segs[0].x, before.x, 0.1), 'Direct selection drags an anchor point', `${before.y} → ${o.segs[0].y}`); }
  ok(await page.locator('#overlay [data-hd]').count() >= 1, 'selected anchor shows its Bézier handle');
  { const bb = await bbox('#overlay [data-hd]'); const before = JSON.stringify((await sel())[0].segs[0]); await page.mouse.move(bb.x + 4, bb.y + 4); await page.mouse.down(); await page.mouse.move(bb.x + 34, bb.y - 26, { steps: 4 }); await page.mouse.up();
    ok(JSON.stringify((await sel())[0].segs[0]) !== before, 'dragging a handle reshapes the curve'); }
  await page.click('#inspector [data-k="anchor-type"] [data-v="corner"]'); await tick();
  o = (await sel())[0]; ok(o.segs[0].t === 'corner' && !o.segs[0].ix && !o.segs[0].ox, 'anchor type → corner removes handles');
  await page.click('#inspector [data-k="anchor-type"] [data-v="sym"]'); await tick();
  o = (await sel())[0]; ok(o.segs[0].t === 'sym' && near(o.segs[0].ix, -o.segs[0].ox, 0.01) && o.segs[0].ox !== 0, 'anchor type → symmetric creates mirrored handles');
  await page.keyboard.press('Delete'); await tick();
  ok((await sel())[0].segs.length === 7, 'Delete removes the selected anchor');

  // ── text ──
  await tool('text'); await page.keyboard.down('Control'); await click(120, 120); await page.keyboard.up('Control'); await page.keyboard.type('Hamburg'); await tick();
  ok(await S(() => !!LogoLab.S.editing) && await page.locator('#overlay .ov-caret').count() === 1, 'Text tool places point text with a caret');
  await page.keyboard.press('Escape'); await tick();
  o = (await sel())[0];
  ok(o && o.type === 'text' && o.text === 'Hamburg' && o.name === 'Hamburg', 'typing creates an editable text object', JSON.stringify(o && o.text));
  const textId = o.id;
  ok(await S(() => document.querySelectorAll(`#layers [data-id="${LogoLab.S.selection[0]}"] path`).length) === 7, 'each letter is rendered from the font outlines');
  const w1 = await S(() => document.querySelector(`#layers [data-id="${LogoLab.S.selection[0]}"] .text-hit`).getBBox().width);
  await field('Tracking', 200);
  const w2 = await S(() => document.querySelector(`#layers [data-id="${LogoLab.S.selection[0]}"] .text-hit`).getBBox().width);
  ok(w2 > w1 + 50, 'letter spacing widens the text', `${w1} → ${w2}`);
  await field('font-size', 100); ok((await sel())[0].size === 100, 'font size');
  await page.click('#inspector [data-k="text-align"] [data-v="center"]'); await tick(); ok((await sel())[0].align === 'center', 'alignment');
  await page.click('#inspector [data-k="text-align"] [data-v="left"]'); await tick();
  // edit existing text: double-click with selection tool, add a line
  await page.dblclick('#layers [data-id="' + textId + '"] path >> nth=2'); await tick();
  ok(await S(() => LogoLab.S.tool === 'text' && !!LogoLab.S.editing), 'double-click enters text editing');
  await page.keyboard.press('Control+End'); await page.keyboard.type('s'); await page.keyboard.press('Escape'); await tick();
  ok((await sel())[0].text === 'Hamburgs', 'existing text stays editable');

  // ── font browser ──
  await page.click('#font-family'); await page.fill('#font-search', 'playfair');
  ok(await page.locator('.font-row').count() === 3, 'font browser search filters the list');
  await page.fill('#font-sample', 'Quick Zephyr');
  ok((await page.locator('.font-row .font-preview').first().textContent()) === 'Quick Zephyr', 'preview uses the user’s own words');
  const fam = await page.locator('.font-row .font-preview').first().evaluate(e => getComputedStyle(e).fontFamily);
  ok(await S(() => [...document.fonts].filter(f => f.status === 'loaded').length >= 17) && /ll-font-/.test(fam), 'previews are set in the actual fonts');
  await page.click('.font-row[data-key="b:Playfair Display|Bold"]'); await tick();
  ok((await sel())[0].font === 'b:Playfair Display|Bold', 'picking a font applies it to the selected text');
  await page.click('.font-row[data-key="b:Playfair Display|Bold"] .star'); await page.click('.font-bar [data-src=fav]');
  ok(await page.locator('.font-row').count() === 1, 'favourites collection');
  // import a font file that is not bundled
  const woff = path.resolve(__dirname, '../node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-300-normal.woff');
  if (fs.existsSync(woff)) {
    await page.setInputFiles('.font-bar input[type=file]', woff); await page.waitForTimeout(300);
    const imp = await page.locator('.font-row').evaluateAll(r => r.map(x => x.dataset.key));
    ok(imp.length === 1 && imp[0].startsWith('i:Cormorant Garamond'), 'OTF/TTF/WOFF import adds the font', imp.join());
    await page.click('.font-row'); await tick();
    ok((await sel())[0].font.startsWith('i:Cormorant'), 'imported font can be applied');
  } else console.log('  skip  font import (dev dependency not installed)');
  const bad = path.join(os.tmpdir(), 'not-a-font.ttf'); fs.writeFileSync(bad, 'nope');
  await page.setInputFiles('.font-bar input[type=file]', bad); await page.waitForTimeout(200);
  ok(await page.locator('.toast.error').count() >= 1, 'invalid font files are reported, not silently ignored');
  await page.click('#load-system-fonts'); await page.waitForTimeout(300);
  ok(await page.locator('.toast').count() >= 1, 'system-font loading reports its outcome');
  await page.keyboard.press('Escape'); await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
  await page.selectOption('#inspector [data-k="font-style"]', { index: 0 }); await tick();

  // ── character tool ──
  await tool('char'); await tick();
  ok(await page.locator('#overlay .ov-char').count() === 8, 'Character tool outlines every letter');
  await page.click('#overlay .ov-char[data-ci="2"]'); await tick();
  ok(await S(() => LogoLab.S.chars.join() === '2'), 'clicking selects an individual letter');
  { const bb = await bbox('#overlay .ov-char[data-ci="2"]'); await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.mouse.move(bb.x + bb.width / 2 + 10, bb.y + bb.height / 2 - 30, { steps: 4 }); await page.mouse.up(); }
  o = (await sel())[0]; ok(o.chars[2] && o.chars[2].dy < 0 && o.chars[2].dx > 0 && o.text === 'Hamburgs', 'dragging moves one letter; the text stays text', JSON.stringify(o.chars[2]));
  await field('ch-rot', 15); await field('ch-scale', 130); await field('ch-kern', 40);
  await page.fill('#inspector [data-k="ch-fill-hex"]', '#e4572e'); await page.press('#inspector [data-k="ch-fill-hex"]', 'Enter'); await tick();
  o = (await sel())[0]; const c2 = o.chars[2];
  ok(c2.rot === 15 && c2.scale === 1.3 && c2.kern === 40 && c2.fill === '#e4572e', 'per-letter rotation, scale, kerning and colour', JSON.stringify(c2));
  ok(await S(() => document.querySelector(`#layers [data-id="${LogoLab.S.selection[0]}"] path[data-ci="2"]`).getAttribute('fill')) === '#e4572e', 'letter colour is rendered');
  await page.keyboard.press('Alt+ArrowRight'); ok((await sel())[0].chars[2].kern === 45, 'Alt+arrow kerns');
  // editing text keeps per-letter overrides attached to the right letter
  await tool('text'); await page.click(`#layers [data-id="${textId}"] .text-hit`, { position: { x: 2, y: 30 } }); await page.keyboard.press('Control+Home'); await page.keyboard.type('X'); await page.keyboard.press('Escape'); await tick();
  o = (await sel())[0]; ok(o.text === 'XHamburgs' && o.chars[3] && o.chars[3].rot === 15 && !o.chars[2], 'letter adjustments follow their letter when the text is edited', JSON.stringify(o.chars));

  // ── area text ──
  await tool('text'); await drag([420, 480], [640, 560]); await page.keyboard.type('one two three four five six seven'); await page.keyboard.press('Escape'); await tick();
  o = (await sel())[0]; const lines = await S(() => new Set([...document.querySelectorAll(`#layers [data-id="${LogoLab.S.selection[0]}"] path`)].map(p => Math.round(p.getBBox().y / 20))).size);
  ok(o.box > 200 && lines >= 2, `Area text wraps inside its column (${lines} line bands)`);

  // ── layers panel ──
  const nLayers = () => S(() => LogoLab.S.doc.layers.length);
  await page.click('#btn-add-construction'); ok(await nLayers() === 3, 'add construction layer');
  await tool('circle'); await drag([650, 450], [700, 450]); await tick();
  const con = await S(() => { const p = document.querySelector(`#layers [data-id="${LogoLab.S.selection[0]}"] path`); return [p.getAttribute('fill'), p.getAttribute('stroke-dasharray'), LogoLab.S.doc.layers[2].kind, LogoLab.S.doc.layers[2].objects.length]; });
  ok(con.join() === 'none,5 3,construction,1', 'construction geometry lives on its own layer and draws as guide lines', con.join());
  await page.click(`.row.layer[data-layer="${await S(() => LogoLab.S.doc.layers[2].id)}"] .vis`); await tick();
  ok(await S(() => document.querySelector(`#layers [data-layer="${LogoLab.S.doc.layers[2].id}"]`).style.display === 'none'), 'layer visibility');
  await page.click(`.row.layer[data-layer="${await S(() => LogoLab.S.doc.layers[2].id)}"] .vis`);
  await page.click(`.row.obj[data-id="${textId}"] .lock`); await tick();
  await tool('select'); await page.keyboard.press('Escape'); await click(130, 100); await tick();
  ok(!(await S(() => LogoLab.S.selection)).includes(textId), 'locked objects cannot be picked on the canvas');
  await page.click(`.row.obj[data-id="${textId}"] .lock`);
  await page.dblclick(`.row.obj[data-id="${penId}"] .name`); await page.keyboard.type('Sail'); await page.keyboard.press('Enter'); await tick();
  ok(await S(() => LogoLab.S.doc.layers[0].objects.some(o => o.name === 'Sail')), 'rename in the layers panel');
  const order = () => S(() => LogoLab.S.doc.layers[0].objects.map(o => o.id));
  const before = await order();
  await page.dragAndDrop(`.row.obj[data-id="${before[0]}"]`, `.row.obj[data-id="${before[3]}"]`, { targetPosition: { x: 200, y: 3 } }); await tick();
  const after = await order();
  ok(after.indexOf(before[0]) === 3 && after.length === before.length, 'drag-and-drop reorders objects', `${before.indexOf(before[0])} → ${after.indexOf(before[0])}`);
  await page.click(`.row.obj[data-id="${before[1]}"]`); await page.click(`.row.obj[data-id="${before[2]}"]`, { modifiers: ['Shift'] }); await tick();
  ok((await S(() => LogoLab.S.selection.length)) === 2, 'Shift-click multi-selects in the panel');
  await page.click('#btn-group'); o = (await sel())[0];
  ok(o.type === 'group' && o.children.length === 2, 'Group');
  const gb = await S(() => { const f = document.querySelector('#overlay .ov-frame:not(.faint)').getBBox(); return f.width; });
  await field('W', 150); const gb2 = await S(() => document.querySelector('#overlay .ov-frame:not(.faint)').getBBox().width);
  ok(gb2 !== gb, 'groups scale proportionally from the inspector');
  await page.keyboard.press('Control+Shift+G'); ok((await sel()).length === 2 && (await sel()).every(x => x.type !== 'group'), 'Ungroup');
  await page.click('#inspector [data-k="al-left"]'); await tick();
  const lefts = await S(() => [...document.querySelectorAll('#overlay .ov-frame.faint')].map(e => Math.round(e.getBBox().x)));
  ok(lefts.length === 2 && lefts[0] === lefts[1], 'Align left edges', lefts.join());
  const n0 = (await order()).length; await page.keyboard.press('Control+d'); ok((await order()).length === n0 + 2, 'Duplicate');
  await page.keyboard.press('Delete'); ok((await order()).length === n0, 'Delete');
  await page.keyboard.press('Control+a'); const all = (await S(() => LogoLab.S.selection.length)); ok(all >= n0, 'Select all');
  await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v'); ok((await S(() => LogoLab.S.doc.layers.flatMap(l => l.objects).length)) >= n0 * 2, 'Copy / paste');
  await page.keyboard.press('Control+z');
  // marquee
  await page.keyboard.press('Escape'); await drag([380, 250], [760, 400]); ok((await S(() => LogoLab.S.selection.length)) >= 3, 'marquee selection');
  await page.keyboard.press('Escape');

  // ── view ──
  const z0 = await S(() => LogoLab.S.zoom); await page.click('#btn-zoom-in'); ok(await S(() => LogoLab.S.zoom) > z0, 'zoom in');
  { const [x, y] = await pt(400, 300); await page.mouse.move(x, y); await page.mouse.wheel(0, -300); const [x2, y2] = await pt(400, 300); ok(near(x, x2, 1) && near(y, y2, 1) && await S(() => LogoLab.S.zoom) > z0 * 1.3, 'wheel zooms about the cursor'); }
  { const p0 = await S(() => LogoLab.S.pan.x); await page.keyboard.down('Space'); const [x, y] = await pt(400, 300); await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 40, y, { steps: 2 }); await page.mouse.up(); await page.keyboard.up('Space'); ok(near(await S(() => LogoLab.S.pan.x), p0 + 40, 1), 'Space-drag pans'); }
  await page.click('#btn-fit'); ok(near(await S(() => LogoLab.S.zoom), z0, 0.01), 'Fit');
  await page.click('#btn-grid'); ok(await S(() => document.getElementById('grid').style.display === 'none'), 'grid toggle');
  await page.click('#btn-grid');
  await page.click('#btn-snap'); await tool('rect'); await drag([103.3, 533.3], [163.7, 571.2]); o = (await sel())[0];
  ok(!near(o.w, 60, 0.2), 'with Snap off, drawing is free'); await page.keyboard.press('Control+z'); await page.click('#btn-snap');
  await page.click('#btn-view'); ok(await S(() => getComputedStyle(document.querySelector('#layers .obj path')).fill === 'none'), 'outline view mode'); await page.click('#btn-view');
  // smart guides
  await tool('select'); await page.click('#btn-grid'); await page.keyboard.press('Escape');
  await tool('rect'); await drag([40, 20], [80, 60]); await tool('select'); await drag([60, 40], [61, 300], { hold: true });
  const guides = await page.locator('#overlay .ov-guide').count(); await page.mouse.up();
  ok(guides >= 1, 'smart guides appear while dragging near other geometry'); await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z'); await page.click('#btn-grid');

  // ── export ──
  await page.click('#btn-export');
  let [dl] = await Promise.all([page.waitForEvent('download'), page.click('#do-export')]);
  let svg = fs.readFileSync(await dl.path(), 'utf8');
  ok(/<text[^>]+font-family="/.test(svg) && svg.includes('<tspan') && !svg.includes('stroke-dasharray'), 'SVG export keeps editable <text> and omits construction geometry');
  await page.click('#btn-export'); await page.click('[data-v="text:outline"]'); await page.click('[data-v="area:artwork"]');
  [dl] = await Promise.all([page.waitForEvent('download'), page.click('#do-export')]); svg = fs.readFileSync(await dl.path(), 'utf8');
  ok(!svg.includes('<text') && svg.includes('<path'), 'SVG export with text converted to outlines');
  ok(await S(() => LogoLab.S.doc.layers.flatMap(l => l.objects).some(o => o.type === 'text')), 'project text is still editable after an outlined export');
  await page.click('#btn-export'); await page.click('[data-v="format:png"]'); await page.click('[data-v="scale:4"]');
  [dl] = await Promise.all([page.waitForEvent('download'), page.click('#do-export')]);
  const png = fs.readFileSync(await dl.path());
  ok(png.slice(1, 4).toString() === 'PNG' && png.readUInt32BE(16) > 800 && png.length > 3000, `PNG export (${png.readUInt32BE(16)}×${png.readUInt32BE(20)})`);
  await page.click('#btn-export'); await page.click('[data-v="format:json"]');
  [dl] = await Promise.all([page.waitForEvent('download'), page.click('#do-export')]);
  const jsonPath = path.join(os.tmpdir(), 'logolab-test.json'); fs.copyFileSync(await dl.path(), jsonPath);
  const proj = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  ok(proj.app === 'logo-lab' && proj.layers.length === 3, 'JSON project export');

  // ── persistence ──
  await page.fill('#doc-name', 'Persist test'); await page.press('#doc-name', 'Enter'); await page.click('#btn-save'); await page.waitForTimeout(200);
  const snap = await S(() => JSON.stringify(LogoLab.S.doc.layers));
  await page.reload(); await page.waitForSelector('body.ready');
  ok(await S(() => LogoLab.S.doc.name) === 'Persist test' && await S(() => JSON.stringify(LogoLab.S.doc.layers)) === snap, 'project persists in IndexedDB across a reload');
  if (fs.existsSync(woff)) ok(await S(() => !document.querySelector('.toast.warn')), 'imported font is restored from IndexedDB (no missing-font warning)');
  // autosave without pressing Save
  await tool('rect'); await drag([700, 500], [760, 560]); await page.waitForTimeout(1700);
  ok(await S(() => LogoLab.S.saveState) === 'saved', 'autosave after an edit');

  // ── projects dialog: samples, duplicate, import, missing font ──
  await page.click('#btn-open'); await page.waitForSelector('.sample');
  ok(await page.locator('.sample').count() === 4, 'four sample projects are offered');
  for (const k of ['symbol', 'wordmark', 'monogram', 'combo']) {
    if (!(await page.locator('.modal').count())) await page.click('#btn-open');
    await page.waitForSelector('.sample');
    await page.click(`.sample[data-sample=${k}]`); await page.waitForTimeout(150);
    const info = await S(() => ({ n: document.querySelectorAll('#layers .obj path').length, con: LogoLab.S.doc.layers[1].objects.length, text: LogoLab.S.doc.layers[0].objects.filter(o => o.type === 'text').length }));
    ok(info.n > 3 && info.con > 0, `sample “${k}” opens (${info.n} paths, ${info.text} text objects, ${info.con} construction objects)`);
    await page.screenshot({ path: path.join(os.tmpdir(), `logolab-${k}.png`) });
  }
  await page.click('#btn-open'); await page.waitForSelector('.proj'); const np = await page.locator('.proj').count();
  await page.click('.proj >> nth=1 >> text=Duplicate'); await page.waitForTimeout(300);
  ok(await page.locator('.proj').count() === np + 1, 'project duplication');
  proj.name = 'Imported with missing font'; proj.layers[0].objects.find(o => o.type === 'text').font = 'i:Nonexistent Sans|Bold';
  fs.writeFileSync(jsonPath, JSON.stringify(proj));
  await page.setInputFiles('.projects input[type=file]', jsonPath); await page.waitForTimeout(300);
  ok(await S(() => LogoLab.S.doc.name) === 'Imported with missing font', 'JSON project import');
  ok(/Nonexistent Sans/.test(await page.locator('.toast.warn').first().textContent()), 'missing fonts are reported when a project opens');
  ok(await S(() => LogoLab.S.doc.layers[0].objects.find(o => o.type === 'text').font) === 'i:Nonexistent Sans|Bold', 'the original font reference is preserved');

  ok(errors.length === 0, 'no console or page errors', errors.join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
