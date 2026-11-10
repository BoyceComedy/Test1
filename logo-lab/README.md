# Logo Lab

A browser-based logo, typography and construction studio. **Phase 1 — drawing and typography foundation.**

Open `index.html` in a Chromium-based browser (Chrome, Edge). No server, account or install is needed; it runs from `file://`. Firefox and Safari run everything except listing installed system fonts.

## What Phase 1 contains

| Area | Working now |
| --- | --- |
| Canvas | SVG artboard, wheel zoom about the cursor, Space/middle-button pan, fit, grid, snap to grid, smart guides, preview/outline view |
| Drawing | Selection, direct selection, pen (Bézier), freehand, line, circle, ellipse, arc, rectangle (corner radius), polygon, star |
| Editing | Move, resize in the object's own frame, rotate, nudge, duplicate, copy/paste, group/ungroup, align, stacking order, convert shape to path, anchor and handle editing (corner / smooth / symmetric), delete anchors |
| Typography | Point and area text typed on the canvas, font family and style, size, leading, tracking, word spacing, horizontal/vertical scale, baseline shift, alignment, font kerning |
| Letters | Character tool: select individual letters, drag them, per-letter kern, offset, baseline, rotation, scale and colour. The text stays editable text and adjustments follow their letter when the text is edited |
| Fonts | 17 bundled open-licence fonts, OTF/TTF/WOFF import (stored locally), installed system fonts where the browser allows, searchable browser with own-words preview and favourites, missing-font warning with the reference preserved |
| Layers | Artwork and construction layers, visibility, lock, rename, drag-and-drop reorder, groups |
| Projects | Autosave to IndexedDB, project list, duplicate, delete, JSON import/export, four samples |
| Export | SVG with editable text or outlines, transparent PNG at 1×–8×, JSON project; artboard or artwork bounds; construction geometry optional |

Not in Phase 1 (later phases of the specification): text on path, permanent convert-to-outlines and glyph editing, OpenType feature controls and variable axes, Boolean operations and offset paths, measurement tools, the blueprint generator, the presentation studio, SVG/PNG import and PDF export. No control for these is shown, because every visible control has to work.

## Development

```
npm install      # opentype.js, esbuild, font packages
npm run build    # regenerates src/fonts-bundled.js and bundles to dist/logo-lab.js
npm test         # end-to-end test in headless Chromium (needs Playwright)
```

Source is plain ES modules in `src/`. Browsers refuse to load ES modules from `file://`, so esbuild bundles them into one classic script, `dist/logo-lab.js`, which is committed so the app opens without a build step.

`npm test` drives the real interface — every tool, the inspector, layers, font browser, export, persistence across a reload — and currently runs 100 checks.

## Architecture decisions

- **Four systems kept apart.** Artwork and construction geometry live on separate layer kinds; construction layers draw as guide lines and are left out of artwork exports. Text is its own object type. Presentation is not built yet and will read the document without changing it.
- **The document is plain JSON** (`src/model.js`). Undo snapshots, IndexedDB records and exported project files are the same serialisation, which keeps undo and persistence simple and reliable.
- **Every leaf object has a pose (x, y, rotation) and geometry in its own local frame.** Resizing changes the local geometry, so strokes never distort and a rotated rectangle stays a rectangle. Groups have no transform of their own; group and multi-selection scaling is proportional for that reason.
- **All shapes reduce to Bézier segments** (`geom.js`: anchor plus two relative handles). That is the same shape as a Paper.js segment, so Phase 3 can pass them to Paper.js for Boolean operations without a model change.
- **Text is laid out glyph by glyph from the font file** with opentype.js (`typography.js`), not by the browser. The canvas, measurements, per-letter transforms and outline export therefore agree exactly, and the text string is never converted. Per-letter overrides are stored beside the string in 1/1000 em, so they scale with the type size.
- **Rendering reconciles SVG elements by object id** and rebuilds an element only when that object's JSON changed (`render.js`). Selection handles, anchors and guides are drawn in a separate screen-space overlay.
- **Hit testing uses the rendered SVG**, so what you click is what is drawn.
- **No framework.** The only runtime dependency is opentype.js.

### Departures from the specification

- **Paper.js and Pave are not included yet.** Phase 1 has no Boolean or curve-offset operations, and the rules ask to avoid unnecessary dependencies; they come in with Phase 3.
- **Kerning.** opentype.js reads `kern` tables and plain GPOS pair lookups. Fonts that keep kerning only in GPOS extension lookups (Inter, Playfair Display and DM Serif Display in the bundled set) report "no kerning data" in the inspector instead of silently applying none. Manual per-letter kerning works for every font.
- **WOFF2 cannot be imported** (opentype.js has no Brotli decoder); the importer says so.
- **Installed fonts** need the Local Font Access API (Chromium on desktop) and the user's permission. Elsewhere the font browser says it is unsupported.
- **Editable-text SVG export** writes one positioned `<tspan>` per letter. Text that combines non-uniform scaling with rotated letters is exported as outlines, because SVG text cannot express it. Fonts are referenced by name, not embedded.

## Fonts

The bundled fonts are under the SIL Open Font License 1.1: Inter, Space Grotesk, Jost, Archivo Black, Bebas Neue, Playfair Display, DM Serif Display, Cormorant Garamond and IBM Plex Mono (Latin subsets from the Fontsource packages).
