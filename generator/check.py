"""Acceptance checks for Milestone 1.

    python generator/check.py --scale small            # all checks
    python generator/check.py --scale large --skip-rerun

Every planted pattern is found *blind* from the store with a simple query, then compared
with data/<scale>/truth.json. Prints PASS/FAIL per check with the numbers behind it.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from common import (Store, START, END, DAY, ET, PF, COUNTRY_REGION, REGION_CODES, COUNTRY_CODES,  # noqa: E402
                    SECTORS, SENIORITY, TOPICS, SPEND_CHANNELS, EVENT_FIELDS)
from generate import SCALES  # noqa: E402

results = []


def report(name, ok, detail):
    results.append((name, ok))
    print(f"{'PASS' if ok else 'FAIL'}  {name}\n      {detail}")


def tree_hash(root):
    h = {}
    for d, _, files in os.walk(root):
        for f in files:
            p = os.path.join(d, f)
            with open(p, "rb") as fh:
                h[os.path.relpath(p, root)] = hashlib.sha256(fh.read()).hexdigest()
    return h


# ------------------------------------------------------------------ checks
def check_rerun(scale, seed, root, with_thumbs):
    tmp = os.path.join(REPO, "data", "_rerun", scale)
    cmd = [sys.executable, os.path.join(HERE, "generate.py"), "--seed", str(seed), "--scale", scale, "--out", tmp]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL)
    if with_thumbs:
        subprocess.run([sys.executable, os.path.join(HERE, "thumbnails.py"), "--data", tmp],
                       check=True, stdout=subprocess.DEVNULL)
    a, b = tree_hash(root), tree_hash(tmp)
    diff = sorted(k for k in set(a) | set(b) if a.get(k) != b.get(k))
    shutil.rmtree(os.path.join(REPO, "data", "_rerun"))
    report("byte-identical rerun", not diff,
           f"{len(a)} files compared" + (f"; differing: {diff[:5]}" if diff else ", all identical"))


def check_counts(st, scale):
    target = SCALES[scale][0]
    n = st.manifest["events"]["rows"]
    ok = abs(n / target - 1) <= 0.15
    t = st.manifest["tables"]
    detail = f"events {n:,} vs target {target:,} ({n / target - 1:+.1%}); " + \
             ", ".join(f"{k} {v['rows']:,}" for k, v in t.items())
    report("row counts", ok and all(v["rows"] > 0 for v in t.values()), detail)


def month_index(ts):
    return ts.astype("datetime64[s]").astype("datetime64[M]").astype(int)  # months since 1970-01


def check_august(ev):
    ok_ts = (ev["ts"] >= START) & (ev["ts"] < END) & (ev["country"] > 0)
    m = month_index(ev["ts"][ok_ts])
    r = COUNTRY_REGION[ev["country"][ok_ts]]
    lines, ok_all = [], True
    for y in (2024, 2025, 2026):
        jul, aug, sep = [(y - 1970) * 12 + k for k in (6, 7, 8)]
        dips = []
        for reg in range(1, len(REGION_CODES)):
            c = [np.sum((m == k) & (r == reg)) for k in (jul, aug, sep)]
            ratio = c[1] / max((c[0] + c[2]) / 2, 1)
            dips.append((REGION_CODES[reg], ratio))
        n_dip = sum(x < 0.8 for _, x in dips)
        ok_all &= n_dip >= 3
        lines.append(f"{y}: " + " ".join(f"{k} {v:.2f}" for k, v in dips) + f" -> {n_dip}/5 dip")
    report("pattern 1: August dip (Aug / avg(Jul,Sep) < 0.8 in >=3 of 5 regions, every year)", ok_all,
           "\n      ".join(lines))


def check_web_crm(ev, truth):
    m = np.isin(ev["type"], [ET["registration"], ET["download"]]) & (ev["country"] > 0)
    c = ev["country"][m]
    pf = ev["platforms"][m]
    crm = np.bincount(c, weights=(pf & PF["crm"]) > 0, minlength=len(COUNTRY_CODES))
    web = np.bincount(c, weights=(pf & PF["web_analytics"]) > 0, minlength=len(COUNTRY_CODES))
    valid = crm >= 20
    ratio = np.where(valid, web / np.maximum(crm, 1), np.nan)
    found = sorted(COUNTRY_CODES[i] for i in np.flatnonzero(valid & (ratio < 0.65)))
    others = ratio[valid & (ratio >= 0.65)]
    detail = (f"web/CRM ratio for registrations+downloads: flagged {found} "
              f"({', '.join(f'{COUNTRY_CODES[i]} {ratio[i]:.2f}' for i in np.flatnonzero(valid & (ratio < 0.65)))}); "
              f"other {int(valid.sum()) - len(found)} countries median {np.median(others):.2f}; "
              f"truth {truth['consent_loss_countries']}")
    report("pattern 2: web analytics vs CRM disagree in two countries", found == sorted(truth["consent_loss_countries"]),
           detail)


def check_machine_opens(ev):
    opens = ev["type"] == ET["open"]
    sends = ev["type"] == ET["send"]
    flagged = opens & ((ev["flags"] & 1) > 0)
    share = flagged.sum() / max(opens.sum(), 1)
    # lag to the matching send (same contact + creative, latest send at or before the open)
    key = lambda mask: ev["contact"][mask].astype(np.int64) * 2**22 + ev["creative"][mask]  # noqa: E731
    s_key, s_ts = key(sends), ev["ts"][sends].astype(np.int64)
    o = np.lexsort((s_ts, s_key))
    s_key, s_ts = s_key[o], s_ts[o]
    comb = s_key * 2**31 + s_ts

    def lag(mask):
        k, t = key(mask), ev["ts"][mask].astype(np.int64)
        j = np.searchsorted(comb, k * 2**31 + t, side="right") - 1
        good = (j >= 0) & (s_key[np.maximum(j, 0)] == k) & (t >= START) & (t < END)
        return t[good] - s_ts[j[good]]

    lf, lh = lag(flagged), lag(opens & ~flagged)
    mf, mh = np.median(lf), np.median(lh)
    ok = 0.2 <= share <= 0.75 and mf <= 5 and mh >= 600
    report("pattern 3: machine (privacy pre-fetch) opens flagged", ok,
           f"{share:.1%} of {int(opens.sum()):,} opens flagged; median seconds after send: flagged {mf:.0f}s, "
           f"unflagged {mh:.0f}s")


def check_echo(ev, camp, truth):
    m = np.isin(ev["type"], [ET["visit"], ET["download"]]) & (ev["campaign"] >= 0) & (ev["ts"] < END) & (ev["ts"] >= START)
    c = ev["campaign"][m]
    late = ev["ts"][m].astype(np.int64) > camp["end_ts"][c].astype(np.int64) + 90 * DAY
    tot = np.bincount(c, minlength=len(camp["end_ts"]))
    lt = np.bincount(c, weights=late, minlength=len(camp["end_ts"]))
    share = np.where(tot >= 50, lt / np.maximum(tot, 1), 0)
    order = np.argsort(-share)
    top, second = int(order[0]), int(order[1])
    ok = top == truth["echo_campaign"] and share[top] > 0.25 and share[second] < share[top] / 2
    report("pattern 4: one report keeps echoing (share of visits/downloads >90 days after campaign end)", ok,
           f"top: campaign {top} '{camp['name'][top]}' {share[top]:.1%}; next {share[second]:.1%}; "
           f"median campaign {np.median(share[tot >= 50]):.1%}; truth campaign {truth['echo_campaign']}")


def check_attendance(ev, con, truth):
    def per_region(t):
        m = (ev["type"] == ET[t]) & (ev["country"] > 0) & (ev["contact"] >= 0)
        return np.bincount(COUNTRY_REGION[ev["country"][m]], minlength=len(REGION_CODES))

    reg, att = per_region("registration"), per_region("attendance")
    ncon = np.bincount(COUNTRY_REGION[con["country"]], minlength=len(REGION_CODES))
    reg_rate = reg / np.maximum(ncon, 1)
    att_rate = att / np.maximum(reg, 1)
    rr = list(range(1, len(REGION_CODES)))
    worst = min(rr, key=lambda i: att_rate[i])
    others = [i for i in rr if i != worst]
    ok = (REGION_CODES[worst] == truth["attendance_collapse_region"]
          and att_rate[worst] < 0.5 * np.median(att_rate[others])
          and 0.6 < reg_rate[worst] / np.median(reg_rate[others]) < 1.6)
    report("pattern 5: healthy registrations, collapsed attendance in one region", ok,
           " ".join(f"{REGION_CODES[i]} reg/contact {reg_rate[i]:.3f} attend/reg {att_rate[i]:.2f};" for i in rr)
           + f" -> {REGION_CODES[worst]}; truth {truth['attendance_collapse_region']}")


def check_creative(ev, con, cre, truth):
    """For every email campaign x seniority: does one creative's click/open beat its siblings?
    Ranked by a two-proportion z-score so small samples can't win on noise."""
    human_open = (ev["type"] == ET["open"]) & ((ev["flags"] & 1) == 0) & (ev["contact"] >= 0)
    click = (ev["type"] == ET["click"]) & (ev["contact"] >= 0)
    sen = con["seniority"][np.maximum(ev["contact"], 0)]
    best, rows = None, []
    for s in range(len(SENIORITY)):
        o = np.bincount(ev["creative"][human_open & (sen == s)], minlength=len(cre["campaign"]))
        c = np.bincount(ev["creative"][click & (sen == s)], minlength=len(cre["campaign"]))
        for camp in np.unique(cre["campaign"][cre["channel"] == 0]):
            sib = np.flatnonzero((cre["campaign"] == camp) & (cre["channel"] == 0))
            if len(sib) < 3 or (o[sib] < 15).any():
                continue
            ctr = c[sib] / o[sib]
            j = int(np.argmax(ctr))
            i, rest = sib[j], np.delete(sib, j)
            p1, p0 = ctr[j], c[rest].sum() / o[rest].sum()
            pp = (c[i] + c[rest].sum()) / (o[i] + o[rest].sum())
            z = (p1 - p0) / np.sqrt(max(pp * (1 - pp) * (1 / o[i] + 1 / o[rest].sum()), 1e-12))
            lift = p1 / max(p0, 1e-9)
            if best is None or z > best[0]:
                best = (z, int(i), s, p1, p0, int(camp), lift)
            if truth["winner_creative"] in sib:
                rows.append(f"{SENIORITY[s]} x{lift:.1f}")
    z, i, s, a, b, camp, lift = best
    ok = i == truth["winner_creative"] and SENIORITY[s] == truth["winner_audience"]["seniority"] and lift >= 2.5
    report("pattern 6: one creative beats its siblings for one audience", ok,
           f"strongest: creative {i} (campaign {camp}) for {SENIORITY[s]}: click/open {a:.2f} vs siblings {b:.2f} "
           f"(x{lift:.1f}, z={z:.1f}); truth creative {truth['winner_creative']} / {truth['winner_audience']['seniority']}"
           + ("\n      that campaign's best creative by audience: " + ", ".join(rows) if rows else ""))


def check_returns(ev, spend):
    weeks_ts = spend["week_ts"].astype(np.int64)
    out = {}
    for ch, et in (("paid_search", "search_click"), ("paid_social", "social_impression")):
        m = (ev["type"] == ET[et]) & (ev["channel"] == ["email", "web_direct", "organic_search", "paid_search",
                                                         "organic_social", "paid_social"].index(ch)) \
            & (ev["country"] > 0) & (ev["ts"] >= START) & (ev["ts"] < END)
        w = (ev["ts"][m].astype(np.int64) - START) // (7 * DAY)
        r = COUNTRY_REGION[ev["country"][m]]
        slopes = []
        for reg in range(1, len(REGION_CODES)):
            sel = (spend["channel"] == SPEND_CHANNELS.index(ch)) & (spend["region"] == reg)
            wi = (weeks_ts[sel] - START) // (7 * DAY)
            y = np.bincount(w[r == reg], minlength=int(wi.max()) + 1)[wi]
            x = spend["amount"][sel]
            g = y > 0
            if g.sum() > 20:
                slopes.append(np.polyfit(np.log(x[g]), np.log(y[g]), 1)[0])
        out[ch] = float(np.median(slopes))
    ok = out["paid_search"] < 0.6 and out["paid_social"] > 0.8
    report("pattern 7: one channel's returns flatten as spend rises (log-log slope of weekly volume vs spend)", ok,
           f"paid_search slope {out['paid_search']:.2f}, paid_social slope {out['paid_social']:.2f} (1.0 = linear)")


def check_hidden(ev, con, acc, camp, truth, min_events):
    eng = np.isin(ev["type"], [ET["click"], ET["visit"], ET["download"], ET["registration"]]) | \
          ((ev["type"] == ET["open"]) & ((ev["flags"] & 1) == 0))
    m = eng & (ev["account"] >= 0) & (ev["campaign"] >= 0)
    # distinct campaigns each account engaged with (one webinar = one data point, not five events)
    pair = np.unique(ev["account"][m].astype(np.int64) * 100000 + ev["campaign"][m])
    a, cmp = pair // 100000, pair % 100000
    ai = camp["topic"][cmp] == TOPICS.index(truth["hidden_segment"]["behaves_like_topic"])
    n = np.bincount(a, minlength=len(acc["sector"]))
    k = np.bincount(a, weights=ai, minlength=len(acc["sector"]))
    share = k / np.maximum(n, 1)
    enough = n >= min_events
    # an account stands out when its AI share is well above its own sector's pooled share (z > 3)
    p0 = np.array([k[acc["sector"] == s].sum() / max(n[acc["sector"] == s].sum(), 1) for s in range(len(SECTORS))])
    p = p0[acc["sector"]]
    z = (k - n * p) / np.sqrt(np.maximum(n * p * (1 - p), 1e-9))
    high = enough & (z > 3)
    frac = [high[acc["sector"] == s].sum() / max((enough & (acc["sector"] == s)).sum(), 1) for s in range(len(SECTORS))]
    order = np.argsort(frac)[::-1]
    top = int(order[0])
    hidden = set(truth["hidden_segment"]["accounts"])
    flagged = np.flatnonzero(high & (acc["sector"] == top))
    precision = np.mean([i in hidden for i in flagged]) if len(flagged) else 0
    mt = (ev["type"] == ET["meeting"]) & (ev["account"] >= 0)
    meet = np.bincount(ev["account"][mt], minlength=len(acc["sector"]))
    in_seg = high & (acc["sector"] == top)
    rest = enough & (acc["sector"] == top) & ~high
    ok = SECTORS[top] == truth["hidden_segment"]["declared_sector"] and frac[top] >= 0.03 and frac[order[1]] < frac[top] / 3 and precision >= 0.8
    report("pattern 8: hidden segment inside a declared sector", ok,
           f"accounts whose share of engaged campaigns on {truth['hidden_segment']['behaves_like_topic']} is far above their sector's (z>3): "
           + ", ".join(f"{SECTORS[i]} {frac[i]:.0%}" for i in order[:4])
           + f"\n      {SECTORS[top]} sub-group: {len(flagged)} accounts, {precision:.0%} match truth; meetings per account "
           f"{meet[in_seg].mean():.2f} vs rest of sector {meet[rest].mean():.2f}")


def check_dirty(ev, opp):
    n = len(ev["ts"])
    cols = np.stack([ev[f].astype(np.int64) for f, *_ in EVENT_FIELDS])
    o = np.lexsort(cols[::-1])
    srt = cols[:, o]
    dup = int(np.all(srt[:, 1:] == srt[:, :-1], axis=0).sum())
    miss = int((ev["country"] == 0).sum())
    imp = int(((ev["ts"] < START) | (ev["ts"] >= END)).sum())
    share = (dup + miss + imp) / n
    bad_opp = int(((opp["closed_ts"] > 0) & (opp["closed_ts"] < opp["created_ts"])).sum())
    report("pattern 9: dirty data share 3-5%", 0.03 <= share <= 0.05,
           f"events: {dup:,} duplicates, {miss:,} missing country, {imp:,} impossible dates = {share:.2%} of {n:,}; "
           f"opportunities closed before created: {bad_opp} of {len(opp['created_ts'])}")


def check_brand():
    with open(os.path.join(HERE, "brand.json"), encoding="utf-8") as f:
        brand = json.load(f)
    needles = {brand["company_name"].lower()} | {w.lower() for w in brand["company_name"].split() if len(w) > 4}
    hexes = set(brand["colours"].values()) | {c for p in brand["creative_palettes"] for c in p}
    needles |= {h.lower() for h in hexes} | {h.lower().lstrip("#") for h in hexes}
    allowed = {os.path.join(HERE, "brand.json"), os.path.join(REPO, "CLAUDE.md")}
    hits = []
    scanned = 0
    for d, dirs, files in os.walk(REPO):
        dirs[:] = [x for x in dirs if x not in (".git", "node_modules", "_rerun", ".idea")]
        for fn in files:
            p = os.path.join(d, fn)
            if p in allowed or fn.endswith((".bin", ".parquet", ".png", ".jar")):
                continue
            try:
                with open(p, encoding="utf-8") as fh:
                    text = fh.read().lower()
            except (UnicodeDecodeError, OSError):
                continue
            scanned += 1
            for nd in needles:
                if re.search(r"(?<![0-9a-f])" + re.escape(nd) + r"(?![0-9a-f])", text):
                    hits.append(f"{os.path.relpath(p, REPO)}: '{nd}'")
    # binary string columns too (names, titles, headlines)
    for d, _, files in os.walk(os.path.join(REPO, "data")):
        for fn in files:
            if fn.endswith(".utf8.bin"):
                with open(os.path.join(d, fn), "rb") as fh:
                    t = fh.read().decode("utf-8").lower()
                scanned += 1
                hits += [f"{os.path.relpath(os.path.join(d, fn), REPO)}: '{nd}'" for nd in needles if nd in t]
    report("brand isolation (name and colours only in generator/brand.json)", not hits,
           f"{scanned} text files scanned (CLAUDE.md brief excluded)" + (f"; found: {hits[:8]}" if hits else ", clean"))


def check_thumbs(root, cre):
    idx_path = os.path.join(root, "thumbs", "index.json")
    if not os.path.exists(idx_path):
        report("thumbnails", False, "not generated yet: run python generator/thumbnails.py --scale <scale>")
        return
    with open(idx_path, encoding="utf-8") as f:
        idx = json.load(f)
    n = len(cre["campaign"])
    ok = idx["count"] == n and all(os.path.exists(os.path.join(root, "thumbs", a)) for a in idx["atlases"])
    report("thumbnails", ok, f"{idx['count']:,} thumbnails for {n:,} creatives in {len(idx['atlases'])} atlases "
                             f"of {idx['atlas_size']}px")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scale", default="small", choices=list(SCALES))
    ap.add_argument("--seed", type=int, default=20261031)
    ap.add_argument("--skip-rerun", action="store_true")
    a = ap.parse_args()
    root = os.path.join(REPO, "data", a.scale)
    st = Store(root)
    with open(os.path.join(root, "truth.json"), encoding="utf-8") as f:
        truth = json.load(f)
    print(f"Checking {root} (seed {st.manifest['generator']['seed']})\n")
    ev = st.events()
    con, acc, camp, cre = st.table("contacts"), st.table("accounts"), st.table("campaigns"), st.table("creatives")
    check_counts(st, a.scale)
    check_august(ev)
    check_web_crm(ev, truth)
    check_machine_opens(ev)
    check_echo(ev, camp, truth)
    check_attendance(ev, con, truth)
    check_creative(ev, con, cre, truth)
    check_returns(ev, st.table("spend"))
    check_hidden(ev, con, acc, camp, truth, min_events=5 if a.scale == "small" else 10)
    check_dirty(ev, st.table("opportunities"))
    check_thumbs(root, cre)
    check_brand()
    if not a.skip_rerun:
        check_rerun(a.scale, a.seed, root, os.path.exists(os.path.join(root, "thumbs", "index.json")))
    bad = [n for n, ok in results if not ok]
    print(f"\n{len(results) - len(bad)}/{len(results)} checks passed" + (f"; FAILED: {bad}" if bad else ""))
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
