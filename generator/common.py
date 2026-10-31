"""Shared definitions for the generator, checks and (later) the real-data pipeline.

Holds the reference tables (regions, countries, enums) and the store writer/reader.
Store format is documented in docs/store-format.md.
"""
import json
import os
import datetime as _dt

import numpy as np

FORMAT_NAME = "fdv-store"
FORMAT_VERSION = 1

DAY = 86400
START = int(_dt.datetime(2023, 11, 1, tzinfo=_dt.timezone.utc).timestamp())
END = int(_dt.datetime(2026, 11, 1, tzinfo=_dt.timezone.utc).timestamp())  # exclusive
NDAYS = (END - START) // DAY

# ---------------------------------------------------------------- regions
# index 0 is "unknown" so a missing country maps to a real row.
REGIONS = [
    ("XX", "Unknown"),
    ("NA", "North America"),
    ("LATAM", "Latin America"),
    ("EUR", "Europe"),
    ("MEA", "Middle East & Africa"),
    ("APAC", "Asia-Pacific"),
]
REGION_CODES = [r[0] for r in REGIONS]

# ---------------------------------------------------------------- countries
# (ISO code, name, region, relative activity weight, approx centroid lat, lon)
COUNTRIES = [
    ("XX", "Unknown", "XX", 0.0, 0.0, 0.0),
    ("US", "United States", "NA", 30.0, 39.8, -98.6),
    ("CA", "Canada", "NA", 4.0, 56.1, -106.3),
    ("MX", "Mexico", "LATAM", 2.0, 23.6, -102.5),
    ("BR", "Brazil", "LATAM", 2.5, -14.2, -51.9),
    ("AR", "Argentina", "LATAM", 0.8, -38.4, -63.6),
    ("CL", "Chile", "LATAM", 0.6, -35.7, -71.5),
    ("CO", "Colombia", "LATAM", 0.6, 4.6, -74.3),
    ("PE", "Peru", "LATAM", 0.3, -9.2, -75.0),
    ("UY", "Uruguay", "LATAM", 0.15, -32.5, -55.8),
    ("CR", "Costa Rica", "LATAM", 0.15, 9.7, -83.8),
    ("PA", "Panama", "LATAM", 0.15, 8.5, -80.8),
    ("GB", "United Kingdom", "EUR", 7.0, 55.4, -3.4),
    ("DE", "Germany", "EUR", 5.0, 51.2, 10.5),
    ("FR", "France", "EUR", 4.0, 46.2, 2.2),
    ("NL", "Netherlands", "EUR", 2.5, 52.1, 5.3),
    ("IE", "Ireland", "EUR", 1.5, 53.4, -8.2),
    ("ES", "Spain", "EUR", 2.0, 40.5, -3.7),
    ("IT", "Italy", "EUR", 2.0, 41.9, 12.6),
    ("CH", "Switzerland", "EUR", 1.8, 46.8, 8.2),
    ("SE", "Sweden", "EUR", 1.2, 60.1, 18.6),
    ("NO", "Norway", "EUR", 0.8, 60.5, 8.5),
    ("DK", "Denmark", "EUR", 0.8, 56.3, 9.5),
    ("FI", "Finland", "EUR", 0.6, 61.9, 25.7),
    ("BE", "Belgium", "EUR", 1.0, 50.5, 4.5),
    ("AT", "Austria", "EUR", 0.8, 47.5, 14.6),
    ("PL", "Poland", "EUR", 1.0, 51.9, 19.1),
    ("PT", "Portugal", "EUR", 0.5, 39.4, -8.2),
    ("CZ", "Czechia", "EUR", 0.4, 49.8, 15.5),
    ("GR", "Greece", "EUR", 0.3, 39.1, 21.8),
    ("HU", "Hungary", "EUR", 0.3, 47.2, 19.5),
    ("RO", "Romania", "EUR", 0.3, 45.9, 25.0),
    ("LU", "Luxembourg", "EUR", 0.3, 49.8, 6.1),
    ("EE", "Estonia", "EUR", 0.1, 58.6, 25.0),
    ("AE", "United Arab Emirates", "MEA", 1.5, 23.4, 53.8),
    ("SA", "Saudi Arabia", "MEA", 1.0, 23.9, 45.1),
    ("IL", "Israel", "MEA", 0.8, 31.0, 34.9),
    ("ZA", "South Africa", "MEA", 1.0, -30.6, 22.9),
    ("NG", "Nigeria", "MEA", 0.4, 9.1, 8.7),
    ("KE", "Kenya", "MEA", 0.3, -0.0, 37.9),
    ("EG", "Egypt", "MEA", 0.4, 26.8, 30.8),
    ("QA", "Qatar", "MEA", 0.4, 25.4, 51.2),
    ("TR", "Turkey", "MEA", 0.6, 39.0, 35.2),
    ("MA", "Morocco", "MEA", 0.2, 31.8, -7.1),
    ("JP", "Japan", "APAC", 3.0, 36.2, 138.3),
    ("CN", "China", "APAC", 2.0, 35.9, 104.2),
    ("IN", "India", "APAC", 3.0, 20.6, 79.0),
    ("AU", "Australia", "APAC", 3.0, -25.3, 133.8),
    ("SG", "Singapore", "APAC", 2.5, 1.35, 103.8),
    ("HK", "Hong Kong", "APAC", 1.8, 22.3, 114.2),
    ("KR", "South Korea", "APAC", 1.5, 35.9, 127.8),
    ("NZ", "New Zealand", "APAC", 0.6, -40.9, 174.9),
    ("TW", "Taiwan", "APAC", 0.8, 23.7, 121.0),
    ("MY", "Malaysia", "APAC", 0.6, 4.2, 102.0),
    ("TH", "Thailand", "APAC", 0.5, 15.9, 100.99),
    ("ID", "Indonesia", "APAC", 0.6, -0.8, 113.9),
    ("PH", "Philippines", "APAC", 0.4, 12.9, 121.8),
    ("VN", "Vietnam", "APAC", 0.4, 14.1, 108.3),
]
COUNTRY_CODES = [c[0] for c in COUNTRIES]
COUNTRY_REGION = np.array([REGION_CODES.index(c[2]) for c in COUNTRIES], dtype=np.uint8)
COUNTRY_WEIGHT = np.array([c[3] for c in COUNTRIES], dtype=np.float64)

# ---------------------------------------------------------------- enums
EVENT_TYPES = ["send", "open", "click", "visit", "search_click", "social_impression",
               "social_engagement", "registration", "attendance", "download", "meeting"]
ET = {n: i for i, n in enumerate(EVENT_TYPES)}

CHANNELS = ["email", "web_direct", "organic_search", "paid_search", "organic_social",
            "paid_social", "events", "sales"]
CH = {n: i for i, n in enumerate(CHANNELS)}

# Source systems. Bit flags in events.platforms.
PLATFORMS = ["crm", "email", "web_analytics", "search", "social", "events"]
PF = {n: 1 << i for i, n in enumerate(PLATFORMS)}

EVENT_FLAGS = {"machine_open": 1}  # bit flags in events.flags

SECTORS = ["Manufacturing", "Technology", "Healthcare", "Energy", "Retail & Consumer",
           "Public Sector", "Logistics", "Professional Services", "Telecoms"]
SIZE_BANDS = ["small", "mid", "large", "enterprise"]
ROLES = ["Strategy", "Operations", "Technology", "Finance", "Marketing", "HR", "Legal", "Procurement"]
SENIORITY = ["Analyst", "Manager", "Director", "VP", "C-suite"]
CONSENT = ["unknown", "opted_in", "opted_out"]

CAMPAIGN_TYPES = ["research_report", "webinar", "conference", "newsletter",
                  "executive_commentary", "news"]
TEAMS = ["US", "EMEA", "APAC", "LATAM"]
TOPICS = ["Supply Chain Resilience", "AI & Data", "Talent & Workforce", "Regulation & Risk",
          "Energy Transition", "Customer Growth", "Cyber Security", "Mergers & Integration"]
CONTENT_FORMATS = ["report", "article", "video", "webinar_recording", "landing_page",
                   "newsletter_issue", "podcast", "slide_deck"]
CREATIVE_CHANNELS = ["email", "social"]
IMAGE_STYLES = ["abstract_photo", "geometric", "gradient", "line_art", "data_pattern", "typographic"]
OPP_STAGES = ["MQL", "SAL", "SQL", "opportunity", "won", "lost"]
OPP_TYPES = ["new", "renewal", "cross_sell"]
SPEND_CHANNELS = ["paid_search", "paid_social"]

ENUMS = {
    "region": REGION_CODES, "country": COUNTRY_CODES, "event_type": EVENT_TYPES,
    "channel": CHANNELS, "platform_bits": PLATFORMS, "event_flag_bits": list(EVENT_FLAGS),
    "sector": SECTORS, "size_band": SIZE_BANDS, "role": ROLES, "seniority": SENIORITY,
    "consent": CONSENT, "campaign_type": CAMPAIGN_TYPES, "team": TEAMS, "topic": TOPICS,
    "content_format": CONTENT_FORMATS, "creative_channel": CREATIVE_CHANNELS,
    "image_style": IMAGE_STYLES, "opp_stage": OPP_STAGES, "opp_type": OPP_TYPES,
    "spend_channel": SPEND_CHANNELS,
}

# ---------------------------------------------------------------- event schema
# (field, dtype, enum or None, description). Little-endian everywhere.
EVENT_FIELDS = [
    ("ts", "<u4", None, "unix seconds, UTC"),
    ("type", "u1", "event_type", "event type"),
    ("channel", "u1", "channel", "channel"),
    ("country", "u1", "country", "row in countries table; 0 = missing"),
    ("contact", "<i4", None, "row in contacts; -1 = anonymous"),
    ("account", "<i4", None, "row in accounts; -1 = unknown"),
    ("campaign", "<i4", None, "row in campaigns; -1 = none"),
    ("content", "<i4", None, "row in content; -1 = none"),
    ("creative", "<i4", None, "row in creatives; -1 = none"),
    ("platforms", "u1", "platform_bits", "which source systems recorded this event (bit flags)"),
    ("flags", "u1", "event_flag_bits", "bit 0 = machine open (privacy pre-fetch)"),
]


def bucket_key(ts, country):
    """Tile id for each event: '<YYYY>Q<n>-<REGION>' or 'invalid-<REGION>' for out-of-range times."""
    region = COUNTRY_REGION[country]
    d = ts.astype("datetime64[s]")
    years = d.astype("datetime64[Y]").astype(int) + 1970
    months = d.astype("datetime64[M]").astype(int) % 12
    q = months // 3 + 1
    valid = (ts >= START) & (ts < END)
    return years, q, region, valid


# ---------------------------------------------------------------- store writer
def _write_array(path, arr, dtype):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    np.ascontiguousarray(arr, dtype=np.dtype(dtype)).tofile(path)


def write_table(root, name, columns, descr):
    """columns: dict field -> (np.array | list[str], dtype or 'str', enum|None). Returns manifest entry."""
    fields = []
    nrows = None
    for field, (values, dtype, enum) in columns.items():
        base = os.path.join(root, "tables", name, field)
        if dtype == "str":
            enc = [s.encode("utf-8") for s in values]
            offsets = np.zeros(len(enc) + 1, dtype="<u4")
            offsets[1:] = np.cumsum([len(b) for b in enc]) if enc else []
            _write_array(base + ".offsets.bin", offsets, "<u4")
            with open(base + ".utf8.bin", "wb") as f:
                f.write(b"".join(enc))
            n = len(values)
            fields.append({"name": field, "dtype": "str", "files": [
                f"tables/{name}/{field}.offsets.bin", f"tables/{name}/{field}.utf8.bin"]})
        else:
            _write_array(base + ".bin", values, dtype)
            n = len(values)
            entry = {"name": field, "dtype": dtype, "files": [f"tables/{name}/{field}.bin"]}
            if enum:
                entry["enum"] = enum
            fields.append(entry)
        if nrows is None:
            nrows = n
        assert n == nrows, (name, field, n, nrows)
    return {"rows": int(nrows), "description": descr, "fields": fields}


def write_events(root, ev):
    """ev: dict field -> np.array. Splits into tiles by quarter and region, sorted by time."""
    years, q, region, valid = bucket_key(ev["ts"], ev["country"])
    tkey = np.where(valid, (years * 10 + q).astype(np.int64), 0) * 10 + region
    order = np.lexsort((ev["ts"], tkey))
    tkey_sorted = tkey[order]
    bounds = np.flatnonzero(np.diff(tkey_sorted)) + 1
    starts = np.concatenate([[0], bounds])
    ends = np.concatenate([bounds, [len(order)]])
    tiles = []
    for s, e in zip(starts, ends):
        k = int(tkey_sorted[s])
        reg = REGION_CODES[k % 10]
        yq = k // 10
        if yq == 0:
            tid, t0, t1 = f"invalid-{reg}", None, None
        else:
            y, qq = yq // 10, yq % 10
            tid = f"{y}Q{qq}-{reg}"
            t0 = int(_dt.datetime(y, 3 * qq - 2, 1, tzinfo=_dt.timezone.utc).timestamp())
            t1 = int((_dt.datetime(y + 1, 1, 1) if qq == 4 else _dt.datetime(y, 3 * qq + 1, 1))
                     .replace(tzinfo=_dt.timezone.utc).timestamp())
        idx = order[s:e]
        for field, dtype, _, _ in EVENT_FIELDS:
            _write_array(os.path.join(root, "events", tid, field + ".bin"), ev[field][idx], dtype)
        tiles.append({"id": tid, "region": reg, "t0": t0, "t1": t1, "rows": int(e - s),
                      "path": f"events/{tid}/"})
    return {
        "rows": int(len(order)),
        "fields": [dict(name=f, dtype=d, description=desc, **({"enum": en} if en else {}))
                   for f, d, en, desc in EVENT_FIELDS],
        "tiles": tiles,
    }


def write_manifest(root, manifest):
    with open(os.path.join(root, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=1, sort_keys=True)
        f.write("\n")


# ---------------------------------------------------------------- store reader
class Store:
    """Minimal reader used by check.py (and a reference for the browser loader)."""

    def __init__(self, root):
        self.root = root
        with open(os.path.join(root, "manifest.json"), encoding="utf-8") as f:
            self.manifest = json.load(f)

    def table(self, name):
        t = self.manifest["tables"][name]
        out = {}
        for fdef in t["fields"]:
            if fdef["dtype"] == "str":
                off = np.fromfile(os.path.join(self.root, fdef["files"][0]), dtype="<u4")
                with open(os.path.join(self.root, fdef["files"][1]), "rb") as f:
                    blob = f.read()
                out[fdef["name"]] = [blob[off[i]:off[i + 1]].decode("utf-8") for i in range(len(off) - 1)]
            else:
                out[fdef["name"]] = np.fromfile(os.path.join(self.root, fdef["files"][0]), dtype=fdef["dtype"])
        return out

    def events(self, fields=None, tiles=None):
        ev = self.manifest["events"]
        fields = fields or [f["name"] for f in ev["fields"]]
        dt = {f["name"]: f["dtype"] for f in ev["fields"]}
        parts = {f: [] for f in fields}
        for t in ev["tiles"]:
            if tiles and t["id"] not in tiles:
                continue
            for f in fields:
                parts[f].append(np.fromfile(os.path.join(self.root, t["path"], f + ".bin"), dtype=dt[f]))
        return {f: (np.concatenate(v) if v else np.zeros(0, dt[f])) for f, v in parts.items()}
