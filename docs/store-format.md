# Store format (version 1)

The one format every maker writes and every view reads. The synthetic generator writes it now;
the real-data pipeline will write exactly the same thing later.

```
data/<name>/
  manifest.json            schema, enums, tables, event tiles
  tables/<table>/<field>.bin                 one typed array per field
  tables/<table>/<field>.offsets.bin + .utf8.bin   string fields
  events/<tile>/<field>.bin                  the big table, split into tiles
  archive/*.parquet        archival copy (optional, needs pyarrow)
  thumbs/atlas_NNN.png + index.json   creative thumbnails (from thumbnails.py)
  truth.json               SYNTHETIC ONLY: planted-pattern answers for check.py. Not part of the store.
```

**Typed arrays.** Little-endian, no header. `dtype` in the manifest uses numpy codes:
`u1` = Uint8Array, `<u4` = Uint32Array, `<i4` = Int32Array, `<f4` = Float32Array.
Row *i* of every field file is the same record; the row number is the record's id.

**Strings.** `offsets` is Uint32 with rows+1 entries; string *i* is UTF-8 bytes `offsets[i]..offsets[i+1]`.

**Enums.** Small-integer fields name an enum in `manifest.enums`; the value is an index into that list.
Bit-flag fields (`platforms`, `flags`) list bit names in order: bit 0 first.

**Tiles.** Events are split by calendar quarter and region: `2025Q3-EUR`. Each tile lists
`t0`/`t1` (unix seconds), region and row count, so the browser loads only what is in view.
Rows inside a tile are sorted by time. Events whose time is impossible go to `invalid-<REGION>`;
events with no country go to region `XX`.

**Missing values.** Row references use -1 (contacts, accounts, campaigns, content, creatives).
Country 0 / region 0 = unknown. `closed_ts` 0 = still open.

**Honesty.** `manifest.source` is `synthetic` or `real`. Views must show synthetic data as such.
Events carry `platforms`: which of the six source systems (CRM, email, web analytics, search,
social, events) recorded them, so views can show where the systems disagree.
