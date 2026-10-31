"""Synthetic data generator for Frontier Data Views.

    python generator/generate.py --seed 20261031 --scale medium

Writes data/<scale>/ in the store format (docs/store-format.md): the same format the
real-data pipeline will write later. Same seed + scale => identical bytes.

Ground truth for the planted patterns goes to data/<scale>/truth.json. That file is NOT
part of the store (real data has no truth file); only check.py reads it.
"""
import argparse
import datetime as dt
import json
import os
import shutil
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import (  # noqa: E402
    START, END, DAY, NDAYS, REGIONS, REGION_CODES, COUNTRY_CODES, COUNTRIES, COUNTRY_REGION,
    COUNTRY_WEIGHT, ET, CH, PF, EVENT_FLAGS, SECTORS, SIZE_BANDS, ROLES, SENIORITY,
    CAMPAIGN_TYPES, TEAMS, TOPICS, CONTENT_FORMATS, IMAGE_STYLES, OPP_STAGES, OPP_TYPES,
    SPEND_CHANNELS, ENUMS, FORMAT_NAME, FORMAT_VERSION, EVENT_FIELDS,
    write_table, write_events, write_manifest,
)

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)

SCALES = {
    #          events,   accounts, contacts, campaigns
    "small": (50_000, 600, 4_000, 120),
    "medium": (2_000_000, 20_000, 150_000, 300),
    "large": (20_000_000, 80_000, 800_000, 450),
}

R = {c: i for i, c in enumerate(REGION_CODES)}
CI = {c: i for i, c in enumerate(COUNTRY_CODES)}

# ---- planted-pattern settings (ground truth is also written to truth.json)
AUGUST_DIP = {"XX": 0.6, "NA": 0.5, "LATAM": 0.62, "EUR": 0.38, "MEA": 0.6, "APAC": 0.95}
CONSENT_LOSS_COUNTRIES = ["DE", "FR"]          # web analytics loses most of these
WEB_RECORD_P, WEB_RECORD_P_LOSS = 0.93, 0.40
ATTEND_P, ATTEND_P_COLLAPSE, COLLAPSE_REGION = 0.42, 0.08, "LATAM"
HIDDEN_SECTOR, HIDDEN_SHARE, HIDDEN_TOPIC = "Manufacturing", 0.25, "AI & Data"
WINNER_SENIORITY = "C-suite"
SEARCH_ELASTICITY, SOCIAL_ELASTICITY = 0.35, 1.0
DIRTY = {"duplicate": 0.018, "missing_country": 0.012, "impossible_date": 0.008}
PRIVACY_CLIENT_SHARE = 0.38


def rng_for(seed, stream):
    """Independent, stable random stream per component."""
    return np.random.default_rng([seed, stream])


# ------------------------------------------------------------------ seasonality
def season_table(rng):
    """Activity multiplier per region (rows) per day (cols)."""
    days = START + np.arange(NDAYS) * DAY
    d = days.astype("datetime64[s]")
    dow = (days // DAY + 3) % 7                         # 0 = Monday
    month = d.astype("datetime64[M]").astype(int) % 12 + 1
    dom = (d.astype("datetime64[D]") - d.astype("datetime64[M]")).astype(int) + 1
    base = np.where(dow < 5, 1.0, np.where(dow == 5, 0.3, 0.25))
    trend = 1 + 0.15 * np.arange(NDAYS) / 365
    xmas = ((month == 12) & (dom >= 20)) | ((month == 1) & (dom <= 2))
    weekly_noise = np.repeat(rng.lognormal(0, 0.08, NDAYS // 7 + 1), 7)[:NDAYS]
    s = np.zeros((len(REGION_CODES), NDAYS))
    for r, code in enumerate(REGION_CODES):
        f = base * trend * weekly_noise * np.where(xmas, 0.4, 1.0)
        f = f * np.where(month == 8, AUGUST_DIP[code], 1.0)
        s[r] = f
    return s


# ------------------------------------------------------------------ names
SYL = ["vor", "an", "eth", "mir", "cal", "dren", "ost", "ul", "bry", "ten", "quis", "lom", "sar",
       "vel", "dor", "nik", "pha", "run", "tor", "wyn", "zel", "ha", "ko", "ri", "sta", "mon", "bel",
       "gra", "fen", "lio", "tav", "ques", "orn", "ix", "sel", "dru", "ama", "kel", "pry", "ven"]
SUFFIX = {
    "Manufacturing": ["Materials", "Works", "Fabrication", "Components", "Industrial"],
    "Technology": ["Systems", "Labs", "Digital", "Networks", "Software"],
    "Healthcare": ["Health", "Care", "Life Sciences", "Medical", "Clinics"],
    "Energy": ["Energy", "Power", "Utilities", "Renewables", "Fuels"],
    "Retail & Consumer": ["Brands", "Foods", "Stores", "Goods", "Outfitters"],
    "Public Sector": ["Authority", "Agency", "Council", "Board", "Institute"],
    "Logistics": ["Freight", "Logistics", "Shipping", "Transit", "Haulage"],
    "Professional Services": ["Advisory", "Consulting", "Associates", "Group", "Counsel"],
    "Telecoms": ["Telecom", "Connect", "Mobile", "Broadband", "Wireless"],
}
HEADLINES = ["What's next for {t}", "{T}: the {y} outlook", "Five questions on {t}", "Rethinking {t}",
             "The practical guide to {t}", "{T} in a volatile world", "Inside {t}",
             "Leading through {t}", "{T}: what boards are asking", "The hidden cost of {t}",
             "{T} by the numbers", "Where {t} goes from here"]
SUMMIT_ADJ = ["Horizon", "Meridian", "Northfield", "Keystone", "Lantern", "Summitline", "Clearwater"]
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def make_name(rng):
    n = rng.integers(2, 4)
    w = "".join(SYL[i] for i in rng.integers(0, len(SYL), n))
    return w[0].upper() + w[1:]


def year_of(ts):
    return dt.datetime.fromtimestamp(int(ts), dt.timezone.utc).year


def month_of(ts):
    return dt.datetime.fromtimestamp(int(ts), dt.timezone.utc).month


def headline(rng, topic, ts):
    t = TOPICS[topic]
    h = HEADLINES[rng.integers(len(HEADLINES))]
    return h.format(t=t.lower().replace("ai &", "AI &"), T=t, y=year_of(ts))


# ------------------------------------------------------------------ entities
def gen_accounts(rng, n):
    w = COUNTRY_WEIGHT[1:] / COUNTRY_WEIGHT[1:].sum()
    country = (rng.choice(len(w), n, p=w) + 1).astype(np.uint8)
    sector = rng.choice(len(SECTORS), n, p=[.16, .14, .12, .09, .12, .08, .09, .11, .09]).astype(np.uint8)
    size = rng.choice(4, n, p=[.35, .35, .2, .1]).astype(np.uint8)
    emp_mu = np.array([np.log(80), np.log(600), np.log(4000), np.log(30000)])
    employees = np.round(rng.lognormal(emp_mu[size], 0.5)).astype(np.uint32)
    existing = (rng.random(n) < np.array([.1, .2, .35, .5])[size]).astype(np.uint8)
    names = [f"{make_name(rng)} {SUFFIX[SECTORS[s]][rng.integers(5)]}" for s in sector]
    hidden = (sector == SECTORS.index(HIDDEN_SECTOR)) & (rng.random(n) < HIDDEN_SHARE)
    propensity = rng.lognormal(0, 0.7, n) * np.array([.6, 1, 1.5, 2.2])[size]
    return dict(country=country, sector=sector, size=size, employees=employees,
                existing=existing, name=names, hidden=hidden, propensity=propensity)


def gen_contacts(rng, n, acc):
    w = np.array([1, 2, 4, 8.0])[acc["size"]]
    account = rng.choice(len(w), n, p=w / w.sum()).astype(np.int32)
    cw = COUNTRY_WEIGHT[1:] / COUNTRY_WEIGHT[1:].sum()
    other = (rng.choice(len(cw), n, p=cw) + 1).astype(np.uint8)
    country = np.where(rng.random(n) < 0.9, acc["country"][account], other).astype(np.uint8)
    role = rng.choice(len(ROLES), n).astype(np.uint8)
    seniority = rng.choice(len(SENIORITY), n, p=[.3, .32, .2, .12, .06]).astype(np.uint8)
    eur = COUNTRY_REGION[country] == R["EUR"]

    def consent(p_in, p_out):
        u = rng.random(n)
        pin = np.where(eur, p_in - 0.12, p_in)
        return np.where(u < pin, 1, np.where(u < pin + p_out, 2, 0)).astype(np.uint8)

    c_email, c_social, c_phone = consent(.72, .1), consent(.55, .1), consent(.35, .2)
    profile = np.where(acc["hidden"][account], len(SECTORS), acc["sector"][account])
    privacy = rng.random(n) < PRIVACY_CLIENT_SHARE
    propensity = acc["propensity"][account] * rng.lognormal(0, 0.5, n)
    return dict(account=account, country=country, role=role, seniority=seniority,
                consent_email=c_email, consent_social=c_social, consent_phone=c_phone,
                profile=profile, privacy=privacy, propensity=propensity)


def affinity_matrix(rng):
    """Hidden engagement multiplier: profile (sector or hidden segment) x topic."""
    a = rng.lognormal(0, 0.25, (len(SECTORS) + 1, len(TOPICS)))
    ai, tech, man = TOPICS.index(HIDDEN_TOPIC), SECTORS.index("Technology"), SECTORS.index(HIDDEN_SECTOR)
    a[man, ai] = 0.6
    a[tech, ai] = 2.2
    a[len(SECTORS)] = 0.45          # hidden segment: low on everything ...
    a[len(SECTORS), ai] = 5.0       # ... except AI & Data
    return a


def gen_campaigns(rng, n, season):
    ctype = rng.choice(len(CAMPAIGN_TYPES), n, p=[.2, .25, .08, .15, .17, .15])
    team = rng.choice(len(TEAMS), n, p=[.55, .25, .13, .07])
    target = np.zeros(n, dtype=np.uint8)
    u = rng.random(n)
    target[team == 0] = np.where(u[team == 0] < 0.4, 0, R["NA"])
    target[team == 1] = np.where(u[team == 1] < 0.7, R["EUR"], R["MEA"])
    target[team == 2] = R["APAC"]
    target[team == 3] = R["LATAM"]
    topic = rng.permutation(np.tile(np.arange(len(TOPICS)), n // len(TOPICS) + 1)[:n])  # balanced topics
    dur_weeks = {0: (6, 10), 1: (3, 5), 2: (6, 12), 3: (1, 2), 4: (2, 4), 5: (1, 2)}
    dur = np.array([rng.integers(*dur_weeks[t]) * 7 * DAY for t in ctype])
    # launch days follow the target region's activity: few launches in August or at year end
    last = NDAYS - 40
    start = np.zeros(n, dtype=np.int64)
    for r in np.unique(target):
        m = target == r
        w = (season[1:].mean(axis=0) if r == 0 else season[r])[:last] ** 2
        start[m] = START + rng.choice(last, int(m.sum()), p=w / w.sum()) * DAY
    end = np.minimum(start + dur, END - DAY)
    budget_mu = np.log(np.array([60e3, 25e3, 180e3, 8e3, 12e3, 5e3]))[ctype]
    budget = rng.lognormal(budget_mu, 0.5)
    uses_email = rng.random(n) < np.where(ctype == 3, 1.0, 0.9)
    uses_social = rng.random(n) < np.where(ctype == 3, 0.3, 0.8)

    # -- planted: echo report (pattern 4) and creative winner (pattern 6)
    perm = rng.permutation(n)
    echo, winner = int(perm[0]), int(perm[1])
    ctype[echo], team[echo], target[echo], topic[echo] = 0, 0, 0, TOPICS.index("Supply Chain Resilience")
    start[echo] = int(dt.datetime(2024, 3, 4, tzinfo=dt.timezone.utc).timestamp())
    end[echo] = start[echo] + 8 * 7 * DAY
    budget[echo] = 250e3
    uses_email[echo] = uses_social[echo] = True
    ctype[winner], team[winner], target[winner] = 4, 0, 0
    start[winner] = int(dt.datetime(2025, 2, 3, tzinfo=dt.timezone.utc).timestamp())
    end[winner] = start[winner] + 4 * 7 * DAY
    uses_email[winner] = True

    names = []
    for i in range(n):
        t, y = TOPICS[topic[i]], year_of(start[i])
        k = CAMPAIGN_TYPES[ctype[i]]
        if i == echo:
            names.append(f"{t} Index {y}")
        elif k == "research_report":
            names.append(f"{t} {['Index', 'Outlook', 'Barometer', 'Survey'][rng.integers(4)]} {y}")
        elif k == "webinar":
            names.append("Webinar: " + headline(rng, topic[i], start[i]))
        elif k == "conference":
            names.append(f"{SUMMIT_ADJ[rng.integers(len(SUMMIT_ADJ))]} Summit {y}")
        elif k == "newsletter":
            names.append(f"{t} Brief, {MONTHS[month_of(start[i]) - 1]} {y}")
        elif k == "executive_commentary":
            names.append("Leadership View: " + headline(rng, topic[i], start[i]))
        else:
            names.append("News: " + headline(rng, topic[i], start[i]))

    weight = budget / budget.sum()
    n_waves = rng.integers(1, 4, n)
    waves = np.zeros((n, 3), dtype=np.int64)
    for i in range(n):
        span = max(end[i] - start[i] - 2 * DAY, DAY)
        waves[i, 0] = start[i] + DAY
        waves[i, 1:] = start[i] + DAY + (np.sort(rng.random(2)) * span).astype(np.int64)
    return dict(type=ctype.astype(np.uint8), team=team.astype(np.uint8), target=target, topic=topic.astype(np.uint8),
                start=start, end=end, budget=budget, uses_email=uses_email, uses_social=uses_social,
                name=names, weight=weight, n_waves=n_waves, waves=waves, echo=echo, winner=winner)


FORMATS_BY_TYPE = {
    "research_report": ["report", "article", "slide_deck", "podcast"],
    "webinar": ["landing_page", "webinar_recording", "slide_deck"],
    "conference": ["landing_page", "video", "slide_deck", "article"],
    "newsletter": ["newsletter_issue"],
    "executive_commentary": ["article", "podcast", "video"],
    "news": ["article"],
}
DOWNLOADABLE = {"report", "slide_deck", "webinar_recording", "podcast", "video"}


def gen_content(rng, camp):
    rows = dict(campaign=[], title=[], topic=[], format=[], publish=[], downloadable=[])
    start_idx = np.zeros(len(camp["type"]), dtype=np.int64)
    count = np.zeros(len(camp["type"]), dtype=np.int64)
    for i in range(len(camp["type"])):
        fmts = FORMATS_BY_TYPE[CAMPAIGN_TYPES[camp["type"][i]]]
        k = len(fmts) if i == camp["echo"] else int(rng.integers(1, len(fmts) + 1))
        start_idx[i] = len(rows["campaign"])
        count[i] = k
        for j in range(k):
            f = fmts[j]
            pub = camp["start"][i] if j == 0 else camp["start"][i] + int(rng.random() * (camp["end"][i] - camp["start"][i]))
            rows["campaign"].append(i)
            rows["title"].append(camp["name"][i] if j == 0 else headline(rng, camp["topic"][i], pub))
            rows["topic"].append(camp["topic"][i])
            rows["format"].append(CONTENT_FORMATS.index(f))
            rows["publish"].append(pub)
            rows["downloadable"].append(f in DOWNLOADABLE)
    out = {k: np.array(v) if k != "title" else v for k, v in rows.items()}
    out["start_idx"], out["count"] = start_idx, count
    return out


def gen_creatives(rng, camp, n_palettes):
    rows = dict(campaign=[], channel=[], template=[], palette=[], headline=[], image_style=[],
                layout=[], seed=[], quality=[])
    idx = {0: (np.zeros(len(camp["type"]), np.int64), np.zeros(len(camp["type"]), np.int64)),
           1: (np.zeros(len(camp["type"]), np.int64), np.zeros(len(camp["type"]), np.int64))}
    winner_creative = None
    for i in range(len(camp["type"])):
        for ch, uses, lo, hi in ((0, camp["uses_email"][i], 2, 6), (1, camp["uses_social"][i], 1, 5)):
            if not uses:
                continue
            k = 4 if (i == camp["winner"] and ch == 0) else int(rng.integers(lo, hi))
            idx[ch][0][i], idx[ch][1][i] = len(rows["campaign"]), k
            for j in range(k):
                if i == camp["winner"] and ch == 0 and j == 2:
                    winner_creative = len(rows["campaign"])
                rows["campaign"].append(i)
                rows["channel"].append(ch)
                rows["template"].append(int(rng.integers(0, 4)) + 4 * ch)
                rows["palette"].append(int(rng.integers(n_palettes)))
                rows["headline"].append(headline(rng, camp["topic"][i], camp["start"][i]))
                rows["image_style"].append(int(rng.integers(len(IMAGE_STYLES))))
                rows["layout"].append(int(rng.integers(6)))
                rows["seed"].append(int(rng.integers(0, 2**32 - 1)))
                rows["quality"].append(float(rng.lognormal(0, 0.15)))
    out = {k: (np.array(v) if k != "headline" else v) for k, v in rows.items()}
    out["quality"][winner_creative] = 1.0
    out["email_idx"], out["social_idx"], out["winner_creative"] = idx[0], idx[1], winner_creative
    return out


# ------------------------------------------------------------------ event helpers
class Ctx:
    pass


def thinned(ctx, rng, n, make):
    """Draw candidates with make(k) and keep them in proportion to seasonality until n are kept."""
    parts, got = [], 0
    smax = ctx.season.max()
    while got < n:
        k = int((n - got) * 1.9) + 64
        c = make(k)
        ts = c["ts"]
        ok = (ts >= START) & (ts < END)
        day = np.clip((ts - START) // DAY, 0, NDAYS - 1)
        p = ctx.season[COUNTRY_REGION[c["country"]], day] / smax
        ok &= rng.random(k) < p
        c = {f: v[ok] for f, v in c.items()}
        parts.append(c)
        got += int(ok.sum())
    out = {f: np.concatenate([p[f] for p in parts])[:n] for f in parts[0]}
    return out


def campaign_times(ctx, rng, c, kind="default"):
    s, e = ctx.camp["start"][c], ctx.camp["end"][c]
    span = (e - s).astype(np.float64)
    u = rng.random(len(c))
    if kind == "registration":
        return (s + span * rng.beta(1.6, 1.0, len(c))).astype(np.int64)
    within = s + span * rng.beta(1.0, 2.2, len(c))
    tail = e + rng.exponential(10 * DAY, len(c))
    is_echo = c == ctx.camp["echo"]
    echo_tail = e + rng.pareto(1.1, len(c)) * 90 * DAY
    ts = np.where(u < 0.82, within, tail)
    ts = np.where(is_echo & (u < 0.3), within, np.where(is_echo, echo_tail, ts))
    return np.minimum(ts, 2**31).astype(np.int64)


def sample_countries(rng, region, n=None):
    """Country for each target region code (0 = global)."""
    out = np.zeros(len(region), dtype=np.uint8)
    for r in np.unique(region):
        m = region == r
        w = COUNTRY_WEIGHT.copy()
        if r != 0:
            w = w * (COUNTRY_REGION == r)
        w[0] = 0
        out[m] = rng.choice(len(w), int(m.sum()), p=w / w.sum())
    return out


def empty_like(n):
    return dict(contact=np.full(n, -1, np.int32), account=np.full(n, -1, np.int32),
                campaign=np.full(n, -1, np.int32), content=np.full(n, -1, np.int32),
                creative=np.full(n, -1, np.int32), flags=np.zeros(n, np.uint8))


def pick_content(rng, ctx, c, downloadable=False):
    st, ct = ctx.content["start_idx"][c], ctx.content["count"][c]
    k = st + (rng.random(len(c)) * ct).astype(np.int64)
    if downloadable:  # walk forward to a downloadable item when one exists
        dl = ctx.content["downloadable"]
        for j in range(4):
            bad = ~dl[k]
            if not bad.any():
                break
            k = np.where(bad, st + (k - st + 1) % np.maximum(ct, 1), k)
    return k.astype(np.int32)


def pick_creative(rng, idx, c):
    st, ct = idx[0][c], idx[1][c]
    return np.where(ct > 0, st + (rng.random(len(c)) * ct).astype(np.int64), -1).astype(np.int32)


def finish(d, etype, channel):
    n = len(d["ts"])
    d["type"] = np.full(n, ET[etype], np.uint8)
    if np.isscalar(channel):
        d["channel"] = np.full(n, CH[channel], np.uint8)
    else:
        d["channel"] = channel.astype(np.uint8)
    return d


# ------------------------------------------------------------------ event generators
def gen_sends(ctx, rng, n):
    camp, con = ctx.camp, ctx.con
    email_c = np.flatnonzero(camp["uses_email"])
    w = camp["weight"][email_c].copy()
    wi = np.flatnonzero(email_c == camp["winner"])[0]
    w[wi] = 0
    w = w / w.sum() * 0.92
    w[wi] = 0.08
    consented = con["consent_email"] == 1
    creg = COUNTRY_REGION[con["country"]]
    pools = {r: np.flatnonzero(consented & ((creg == r) | (r == 0))) for r in range(len(REGION_CODES))}
    senior = np.flatnonzero(consented & (con["seniority"] == SENIORITY.index(WINNER_SENIORITY)))

    def make(k):
        c = email_c[rng.choice(len(email_c), k, p=w)]
        wave = (rng.random(k) * camp["n_waves"][c]).astype(np.int64)
        ts = camp["waves"][c, wave] + (rng.random(k) * 4 * 3600).astype(np.int64)
        contact = np.zeros(k, np.int64)
        tgt = camp["target"][c]
        for r in np.unique(tgt):
            m = tgt == r
            contact[m] = pools[r][rng.integers(0, len(pools[r]), int(m.sum()))]
        mw = (c == camp["winner"]) & (rng.random(k) < 0.5)
        contact[mw] = senior[rng.integers(0, len(senior), int(mw.sum()))]
        d = empty_like(k)
        d.update(ts=ts, country=con["country"][contact], contact=contact.astype(np.int32),
                 account=con["account"][contact], campaign=c.astype(np.int32),
                 content=ctx.content["start_idx"][c].astype(np.int32),
                 creative=pick_creative(rng, ctx.cre["email_idx"], c))
        return d

    return finish(thinned(ctx, rng, n, make), "send", "email")


def gen_opens_clicks(ctx, rng, sends):
    con, camp, cre = ctx.con, ctx.camp, ctx.cre
    contact, c, cr = sends["contact"], sends["campaign"], sends["creative"]
    aff = ctx.aff[con["profile"][contact], camp["topic"][c]]
    q = cre["quality"][cr]
    n = len(contact)
    machine = con["privacy"][contact] & (rng.random(n) < 0.95)
    human = rng.random(n) < np.clip(0.2 * aff * q, 0, 0.9)

    def sub(mask, ts):
        d = {f: v[mask] for f, v in sends.items() if f not in ("type", "channel")}
        d["ts"] = ts
        return d

    m_open = sub(machine, sends["ts"][machine] + rng.integers(0, 5, int(machine.sum())))
    m_open["flags"] = np.full(len(m_open["ts"]), EVENT_FLAGS["machine_open"], np.uint8)
    h_ts = sends["ts"][human] + rng.lognormal(np.log(3 * 3600), 1.2, int(human.sum())).astype(np.int64)
    h_open = sub(human, h_ts)

    hc, hcr = h_open["contact"], h_open["creative"]
    p_click = np.clip(0.10 * ctx.aff[con["profile"][hc], camp["topic"][h_open["campaign"]]] * cre["quality"][hcr], 0, 0.8)
    winner_aud = (hcr == cre["winner_creative"]) & (con["seniority"][hc] == SENIORITY.index(WINNER_SENIORITY))
    p_click = np.where(winner_aud, 0.42, p_click)
    clicked = rng.random(len(hc)) < p_click
    clicks = {f: v[clicked] for f, v in h_open.items()}
    clicks["ts"] = clicks["ts"] + rng.integers(5, 600, int(clicked.sum()))

    opens = {f: np.concatenate([m_open[f], h_open[f]]) for f in m_open}
    opens = {f: v[opens["ts"] < END] for f, v in opens.items()}
    clicks = {f: v[clicks["ts"] < END] for f, v in clicks.items()}
    return finish(opens, "open", "email"), finish(clicks, "click", "email")


def contact_driven(ctx, rng, n, kind, type_mask=None):
    """Known contacts seeking out content: pick contact, then a campaign by topic affinity."""
    con, camp = ctx.con, ctx.camp
    cw = np.cumsum(con["propensity"])
    creg = COUNTRY_REGION[con["country"]]
    nprof = len(SECTORS) + 1
    base = camp["weight"] * (type_mask if type_mask is not None else 1.0)
    weights = {}
    for p in range(nprof):
        for r in range(len(REGION_CODES)):
            w = base * ctx.aff[p, camp["topic"]] * ((camp["target"] == 0) | (camp["target"] == r))
            weights[(p, r)] = w / w.sum() if w.sum() > 0 else None

    def make(k):
        contact = np.searchsorted(cw, rng.random(k) * cw[-1]).clip(0, len(cw) - 1)
        g = con["profile"][contact] * 10 + creg[contact]
        c = np.zeros(k, np.int64)
        keep = np.ones(k, bool)
        for key in np.unique(g):
            m = g == key
            w = weights[(int(key // 10), int(key % 10))]
            if w is None:
                keep[m] = False
                continue
            c[m] = rng.choice(len(w), int(m.sum()), p=w)
        d = empty_like(k)
        d.update(ts=campaign_times(ctx, rng, c, "registration" if kind == "registration" else "default"),
                 country=con["country"][contact], contact=contact.astype(np.int32),
                 account=con["account"][contact], campaign=c.astype(np.int32),
                 content=pick_content(rng, ctx, c, downloadable=(kind == "download")))
        d["ts"] = np.where(keep, d["ts"], -1)
        return d

    return thinned(ctx, rng, n, make)


def gen_anon_visits(ctx, rng, n):
    camp = ctx.camp

    def make(k):
        c = rng.choice(len(camp["weight"]), k, p=camp["weight"])
        d = empty_like(k)
        d.update(ts=campaign_times(ctx, rng, c), country=sample_countries(rng, camp["target"][c]),
                 campaign=c.astype(np.int32), content=pick_content(rng, ctx, c))
        return d

    d = thinned(ctx, rng, n, make)
    ch = rng.choice([CH["web_direct"], CH["organic_search"], CH["organic_social"]], n, p=[.6, .2, .2])
    return finish(d, "visit", ch)


def gen_organic_search(ctx, rng, n):
    order = np.argsort(ctx.content["publish"], kind="stable")
    pub_sorted = ctx.content["publish"][order]

    def make(k):
        ts = rng.integers(START, END, k)
        avail = np.searchsorted(pub_sorted, ts, side="right")
        ok = avail > 0
        content = order[(rng.random(k) * np.maximum(avail, 1)).astype(np.int64)]
        d = empty_like(k)
        d.update(ts=np.where(ok, ts, -1), country=sample_countries(rng, np.zeros(k, np.uint8)),
                 content=content.astype(np.int32))
        return d

    return finish(thinned(ctx, rng, n, make), "search_click", "organic_search")


def gen_spend(ctx, rng):
    """Weekly spend per region and paid channel. Independent of season on purpose."""
    weeks = np.arange(START, END, 7 * DAY)
    ref = {"NA": 40e3, "LATAM": 5e3, "EUR": 25e3, "MEA": 5e3, "APAC": 15e3}
    rows = dict(week=[], region=[], channel=[], amount=[])
    for ch in range(len(SPEND_CHANNELS)):
        for code, base in ref.items():
            amt = base * rng.lognormal(0, 0.7, len(weeks))
            rows["week"].append(weeks)
            rows["region"].append(np.full(len(weeks), R[code]))
            rows["channel"].append(np.full(len(weeks), ch))
            rows["amount"].append(amt)
    out = {k: np.concatenate(v) for k, v in rows.items()}
    out["ref"] = np.array([ref.get(c, 1.0) for c in REGION_CODES])[out["region"]]
    return out


def gen_spend_driven(ctx, rng, spend, channel, n_target):
    """Paid search clicks (diminishing returns) or paid social impressions (linear)."""
    camp = ctx.camp
    sel = spend["channel"] == SPEND_CHANNELS.index(channel)
    wk, reg, amt, ref = spend["week"][sel], spend["region"][sel], spend["amount"][sel], spend["ref"][sel]
    elasticity = SEARCH_ELASTICITY if channel == "paid_search" else SOCIAL_ELASTICITY
    wday = np.clip((wk - START) // DAY, 0, NDAYS - 7)
    seas = np.array([ctx.season[r, d:d + 7].mean() for r, d in zip(reg, wday)])
    region_share = np.array([COUNTRY_WEIGHT[COUNTRY_REGION == r].sum() for r in range(len(REGION_CODES))])[reg]
    rate = region_share * (amt / ref) ** elasticity * seas
    counts = rng.poisson(rate / rate.sum() * n_target)
    n = int(counts.sum())
    cell = np.repeat(np.arange(len(counts)), counts)
    dw = np.array([1, 1, 1, 1, 1, .3, .25])
    day = rng.choice(7, n, p=dw / dw.sum())
    ts = wk[cell] + day * DAY + rng.integers(0, DAY, n)
    region = reg[cell]
    d = empty_like(n)
    d.update(ts=ts, country=sample_countries(rng, region.astype(np.uint8)))
    need_social = channel == "paid_social"
    weights = camp["weight"] * (camp["uses_social"] if need_social else 1.0)
    c = np.full(n, -1, np.int64)
    cell_start = np.concatenate([[0], np.cumsum(counts)])
    for i in np.flatnonzero(counts):   # campaigns live in this region that week
        active = np.flatnonzero((camp["start"] <= wk[i] + 7 * DAY) & (camp["end"] >= wk[i]) &
                                ((camp["target"] == 0) | (camp["target"] == reg[i])) & (weights > 0))
        if len(active) == 0:
            continue
        w = weights[active]
        c[cell_start[i]:cell_start[i + 1]] = active[rng.choice(len(active), int(counts[i]), p=w / w.sum())]
    has = c >= 0
    d["campaign"] = c.astype(np.int32)
    d["content"] = np.where(has, ctx.content["start_idx"][np.maximum(c, 0)], -1).astype(np.int32)
    if need_social:
        d["creative"] = np.where(has, pick_creative(rng, ctx.cre["social_idx"], np.maximum(c, 0)), -1).astype(np.int32)
        d = {f: v[ts < END] for f, v in d.items()}
        return finish(d, "social_impression", "paid_social")
    d = {f: v[ts < END] for f, v in d.items()}
    return finish(d, "search_click", "paid_search")


def gen_organic_social(ctx, rng, n):
    camp = ctx.camp
    sc = np.flatnonzero(camp["uses_social"])
    w = camp["weight"][sc] / camp["weight"][sc].sum()

    def make(k):
        c = sc[rng.choice(len(sc), k, p=w)]
        d = empty_like(k)
        d.update(ts=campaign_times(ctx, rng, c), country=sample_countries(rng, camp["target"][c]),
                 campaign=c.astype(np.int32), content=ctx.content["start_idx"][c].astype(np.int32),
                 creative=pick_creative(rng, ctx.cre["social_idx"], c))
        return d

    return finish(thinned(ctx, rng, n, make), "social_impression", "organic_social")


def gen_engagements(ctx, rng, imps):
    con = ctx.con
    m = rng.random(len(imps["ts"])) < 0.013
    d = {f: v[m] for f, v in imps.items() if f not in ("type", "channel")}
    k = len(d["ts"])
    d["ts"] = d["ts"] + rng.integers(1, 120, k)
    known = rng.random(k) < 0.3
    creg = COUNTRY_REGION[con["country"]]
    for r in np.unique(COUNTRY_REGION[d["country"]]):
        mm = known & (COUNTRY_REGION[d["country"]] == r)
        pool = np.flatnonzero((creg == r) & (con["consent_social"] == 1))
        if len(pool) == 0 or not mm.any():
            continue
        pick = pool[rng.integers(0, len(pool), int(mm.sum()))]
        d["contact"][mm] = pick
        d["account"][mm] = con["account"][pick]
        d["country"][mm] = con["country"][pick]
    d["channel"] = imps["channel"][m]
    d = {f: v[d["ts"] < END] for f, v in d.items()}
    ch = d.pop("channel")
    return finish(d, "social_engagement", ch)


def gen_attendance(ctx, rng, regs):
    camp = ctx.camp
    region = COUNTRY_REGION[regs["country"]]
    p = np.where(region == R[COLLAPSE_REGION], ATTEND_P_COLLAPSE, ATTEND_P)
    m = rng.random(len(p)) < p
    d = {f: v[m] for f, v in regs.items() if f not in ("type", "channel")}
    c = d["campaign"]
    conf = camp["type"][c] == CAMPAIGN_TYPES.index("conference")
    d["ts"] = camp["end"][c] + np.where(conf, rng.integers(0, 2 * DAY, len(c)), rng.integers(0, 2 * 3600, len(c)))
    d = {f: v[d["ts"] < END] for f, v in d.items()}
    return finish(d, "attendance", "events")


def gen_meetings(ctx, rng, n):
    con, acc = ctx.con, ctx.acc
    w = con["propensity"] * np.array([.3, .6, 1, 1.5, 2])[con["seniority"]] * \
        np.where(acc["hidden"][con["account"]], 3.0, 1.0) * np.where(acc["existing"][con["account"]], 1.5, 1.0)
    cw = np.cumsum(w)

    def make(k):
        contact = np.searchsorted(cw, rng.random(k) * cw[-1]).clip(0, len(cw) - 1)
        d = empty_like(k)
        d.update(ts=rng.integers(START, END, k), country=con["country"][contact],
                 contact=contact.astype(np.int32), account=con["account"][contact])
        return d

    return finish(thinned(ctx, rng, n, make), "meeting", "sales")


def gen_opportunities(ctx, rng, meetings):
    acc = ctx.acc
    m = rng.random(len(meetings["ts"])) < 0.45
    account, contact = meetings["account"][m], meetings["contact"][m]
    n = len(account)
    created = meetings["ts"][m] + rng.integers(0, 14 * DAY, n)
    # stage progression MQL -> SAL -> SQL -> opportunity -> won/lost
    stage = np.zeros(n, np.int64)
    for s, p in ((1, .7), (2, .6), (3, .55)):
        stage = np.where((stage == s - 1) & (rng.random(n) < p), s, stage)
    closes = stage == 3
    closed = np.where(closes, created + rng.gamma(2.0, 45 * DAY, n).astype(np.int64), 0)
    still_open = closed >= END
    won = rng.random(n) < np.where(acc["existing"][account] == 1, .45, .3)
    stage = np.where(closes & ~still_open, np.where(won, 4, 5), stage)
    closed = np.where(closes & ~still_open, closed, 0)
    # earlier stages that stalled are closed-lost at some point too (kept open here: real CRMs are messy)
    value = rng.lognormal(np.log(np.array([20e3, 60e3, 180e3, 500e3]))[acc["size"][account]], 0.6)
    otype = np.where(acc["existing"][account] == 1, np.where(rng.random(n) < .55, 1, 2), 0)
    # dirty: impossible dates (closed before created)
    bad = (closed > 0) & (rng.random(n) < 0.03)
    closed = np.where(bad, created - rng.integers(DAY, 60 * DAY, n), closed)
    keep = created < END
    return dict(account=account[keep], contact=contact[keep], value=value[keep].astype(np.float32),
                stage=stage[keep].astype(np.uint8), type=otype[keep].astype(np.uint8),
                created=created[keep], closed=closed[keep], n_bad=int((bad & keep).sum()))


# ------------------------------------------------------------------ platforms + dirt
def assign_platforms(rng, ev):
    n = len(ev["ts"])
    t = ev["type"]
    loss = np.isin(ev["country"], [CI[c] for c in CONSENT_LOSS_COUNTRIES])
    pw = np.where(loss, WEB_RECORD_P_LOSS, WEB_RECORD_P)
    u = rng.random((4, n))
    web = u[0] < pw
    known = ev["contact"] >= 0
    pf = np.zeros(n, np.uint8)

    def setb(mask, bits):
        pf[mask] |= np.asarray(bits, np.uint8)[mask] if np.ndim(bits) else np.uint8(bits)

    E = ET
    setb(t == E["send"], PF["email"])
    setb((t == E["send"]) & (u[1] < 0.85), PF["crm"])
    setb(t == E["open"], PF["email"])
    setb(t == E["click"], PF["email"])
    setb((t == E["click"]) & web, PF["web_analytics"])
    setb((t == E["click"]) & (u[1] < 0.3), PF["crm"])
    setb((t == E["visit"]) & web, PF["web_analytics"])
    setb((t == E["visit"]) & known & (u[1] < 0.5), PF["crm"])
    setb(t == E["search_click"], PF["search"])
    setb((t == E["search_click"]) & web, PF["web_analytics"])
    setb(t == E["social_impression"], PF["social"])
    setb(t == E["social_engagement"], PF["social"])
    setb((t == E["social_engagement"]) & (u[2] < 0.2 * pw), PF["web_analytics"])
    setb(t == E["registration"], PF["events"])
    setb((t == E["registration"]) & (u[1] < 0.95), PF["crm"])
    setb((t == E["registration"]) & web, PF["web_analytics"])
    setb(t == E["attendance"], PF["events"])
    setb((t == E["attendance"]) & (u[1] < 0.9), PF["crm"])
    setb((t == E["download"]) & web, PF["web_analytics"])
    setb((t == E["download"]) & (u[1] < 0.92), PF["crm"])
    setb(t == E["meeting"], PF["crm"])
    ev["platforms"] = pf
    keep = pf != 0          # nobody recorded it => it is not in anyone's data
    return {f: v[keep] for f, v in ev.items()}, int((~keep).sum())


def add_dirt(rng, ev):
    n = len(ev["ts"])
    nd = {k: int(round(v * n)) for k, v in DIRTY.items()}
    perm = rng.permutation(n)
    miss = perm[:nd["missing_country"]]
    imp = perm[nd["missing_country"]:nd["missing_country"] + nd["impossible_date"]]
    ev["country"][miss] = 0
    half = len(imp) // 2
    ev["ts"][imp[:half]] = 0                                                 # 1970-01-01
    ev["ts"][imp[half:]] = rng.integers(END + 365 * DAY, END + 6 * 365 * DAY, len(imp) - half)  # future
    dup = rng.choice(n, nd["duplicate"], replace=False)
    ev = {f: np.concatenate([v, v[dup]]) for f, v in ev.items()}
    return ev, nd


# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=20261031)
    ap.add_argument("--scale", choices=list(SCALES), default="small")
    ap.add_argument("--out", default=None, help="output folder (default data/<scale>)")
    ap.add_argument("--no-parquet", action="store_true", help="skip the archival Parquet copy")
    a = ap.parse_args()
    n_events, n_acc, n_con, n_camp = SCALES[a.scale]
    out = a.out or os.path.join(REPO, "data", a.scale)
    if os.path.isdir(out):
        shutil.rmtree(out)
    os.makedirs(out)

    with open(os.path.join(HERE, "brand.json"), encoding="utf-8") as f:
        n_palettes = len(json.load(f)["creative_palettes"])

    ctx = Ctx()
    ctx.season = season_table(rng_for(a.seed, 1))
    ctx.acc = gen_accounts(rng_for(a.seed, 2), n_acc)
    ctx.con = gen_contacts(rng_for(a.seed, 3), n_con, ctx.acc)
    ctx.aff = affinity_matrix(rng_for(a.seed, 4))
    ctx.camp = gen_campaigns(rng_for(a.seed, 5), n_camp, ctx.season)
    ctx.content = gen_content(rng_for(a.seed, 6), ctx.camp)
    ctx.cre = gen_creatives(rng_for(a.seed, 7), ctx.camp, n_palettes)
    spend = gen_spend(ctx, rng_for(a.seed, 8))
    print(f"[{a.scale}] entities: {n_acc} accounts, {n_con} contacts, {n_camp} campaigns, "
          f"{len(ctx.content['campaign'])} content, {len(ctx.cre['campaign'])} creatives")

    N = n_events
    ctype = ctx.camp["type"]
    sends = gen_sends(ctx, rng_for(a.seed, 10), int(.33 * N))
    opens, clicks = gen_opens_clicks(ctx, rng_for(a.seed, 11), sends)
    kv = contact_driven(ctx, rng_for(a.seed, 12), int(.17 * N * .4), "visit")
    known_visits = finish(kv, "visit", "web_direct")
    anon_visits = gen_anon_visits(ctx, rng_for(a.seed, 13), int(.17 * N * .6))
    reg_mask = np.isin(ctype, [CAMPAIGN_TYPES.index("webinar"), CAMPAIGN_TYPES.index("conference")]).astype(float)
    regs = finish(contact_driven(ctx, rng_for(a.seed, 14), int(.016 * N), "registration", reg_mask),
                  "registration", "events")
    attend = gen_attendance(ctx, rng_for(a.seed, 15), regs)
    dl_mask = np.isin(ctype, [CAMPAIGN_TYPES.index(t) for t in
                              ("research_report", "webinar", "conference", "executive_commentary")]).astype(float)
    downloads = finish(contact_driven(ctx, rng_for(a.seed, 16), int(.016 * N), "download", dl_mask),
                       "download", "web_direct")
    paid_search = gen_spend_driven(ctx, rng_for(a.seed, 17), spend, "paid_search", int(.08 * N * .7))
    org_search = gen_organic_search(ctx, rng_for(a.seed, 18), int(.08 * N * .3))
    paid_social = gen_spend_driven(ctx, rng_for(a.seed, 19), spend, "paid_social", int(.15 * N * .75))
    org_social = gen_organic_social(ctx, rng_for(a.seed, 20), int(.15 * N * .25))
    engage = gen_engagements(ctx, rng_for(a.seed, 21), {f: np.concatenate([paid_social[f], org_social[f]])
                                                        for f in paid_social})
    meetings = gen_meetings(ctx, rng_for(a.seed, 22), int(.0025 * N))
    opps = gen_opportunities(ctx, rng_for(a.seed, 23), meetings)

    parts = [sends, opens, clicks, known_visits, anon_visits, regs, attend, downloads,
             paid_search, org_search, paid_social, org_social, engage, meetings]
    fields = [f for f, *_ in EVENT_FIELDS if f != "platforms"]
    ev = {f: np.concatenate([p[f] for p in parts]) for f in fields}
    ev["ts"] = ev["ts"].astype(np.int64)
    ev, dropped = assign_platforms(rng_for(a.seed, 30), ev)
    ev, dirt = add_dirt(rng_for(a.seed, 31), ev)
    ev["ts"] = ev["ts"].astype(np.uint32)
    print(f"[{a.scale}] events: {len(ev['ts']):,} (dropped {dropped:,} unrecorded, dirt {dirt})")

    # ---------------------------------------------------------- write store
    acc, con, camp, content, cre = ctx.acc, ctx.con, ctx.camp, ctx.content, ctx.cre
    tables = {}
    tables["regions"] = write_table(out, "regions", {
        "code": (REGION_CODES, "str", None), "name": ([r for _, r in REGIONS], "str", None)},
        "Regions; row 0 = unknown.")
    tables["countries"] = write_table(out, "countries", {
        "code": (COUNTRY_CODES, "str", None), "name": ([c[1] for c in COUNTRIES], "str", None),
        "region": (COUNTRY_REGION, "u1", "region"),
        "lat": (np.array([c[4] for c in COUNTRIES]), "<f4", None),
        "lon": (np.array([c[5] for c in COUNTRIES]), "<f4", None)},
        "Countries (ISO 3166-1 alpha-2); row 0 = missing/unknown.")
    tables["accounts"] = write_table(out, "accounts", {
        "name": (acc["name"], "str", None), "sector": (acc["sector"], "u1", "sector"),
        "size_band": (acc["size"], "u1", "size_band"), "employees": (acc["employees"], "<u4", None),
        "country": (acc["country"], "u1", "country"), "existing_client": (acc["existing"], "u1", None)},
        "Client organisations.")
    tables["contacts"] = write_table(out, "contacts", {
        "account": (con["account"], "<i4", None), "country": (con["country"], "u1", "country"),
        "role": (con["role"], "u1", "role"), "seniority": (con["seniority"], "u1", "seniority"),
        "consent_email": (con["consent_email"], "u1", "consent"),
        "consent_social": (con["consent_social"], "u1", "consent"),
        "consent_phone": (con["consent_phone"], "u1", "consent")},
        "People at client organisations (no personal names stored).")
    tables["campaigns"] = write_table(out, "campaigns", {
        "name": (camp["name"], "str", None), "type": (camp["type"], "u1", "campaign_type"),
        "team": (camp["team"], "u1", "team"), "target_region": (camp["target"], "u1", "region"),
        "topic": (camp["topic"], "u1", "topic"), "start_ts": (camp["start"], "<u4", None),
        "end_ts": (camp["end"], "<u4", None), "budget": (camp["budget"], "<f4", None),
        "uses_email": (camp["uses_email"], "u1", None), "uses_social": (camp["uses_social"], "u1", None)},
        "Campaigns. target_region 0 = global. Budget in an unnamed currency unit.")
    tables["content"] = write_table(out, "content", {
        "campaign": (content["campaign"], "<i4", None), "title": (content["title"], "str", None),
        "topic": (content["topic"], "u1", "topic"), "format": (content["format"], "u1", "content_format"),
        "publish_ts": (content["publish"], "<u4", None)},
        "Content pieces.")
    tables["creatives"] = write_table(out, "creatives", {
        "campaign": (cre["campaign"], "<i4", None), "channel": (cre["channel"], "u1", "creative_channel"),
        "template": (cre["template"], "u1", None), "palette": (cre["palette"], "u1", None),
        "headline": (cre["headline"], "str", None), "image_style": (cre["image_style"], "u1", "image_style"),
        "layout": (cre["layout"], "u1", None), "variant_seed": (cre["seed"], "<u4", None)},
        "Email and social creative variations; palette indexes brand.json creative_palettes.")
    tables["opportunities"] = write_table(out, "opportunities", {
        "account": (opps["account"], "<i4", None), "contact": (opps["contact"], "<i4", None),
        "value": (opps["value"], "<f4", None), "stage": (opps["stage"], "u1", "opp_stage"),
        "type": (opps["type"], "u1", "opp_type"), "created_ts": (opps["created"], "<u4", None),
        "closed_ts": (opps["closed"], "<u4", None)},
        "Sales opportunities. closed_ts 0 = still open.")
    tables["spend"] = write_table(out, "spend", {
        "week_ts": (spend["week"], "<u4", None), "region": (spend["region"], "u1", "region"),
        "channel": (spend["channel"], "u1", "spend_channel"), "amount": (spend["amount"], "<f4", None)},
        "Weekly paid media spend per region and channel.")
    events = write_events(out, ev)

    manifest = {
        "format": FORMAT_NAME, "version": FORMAT_VERSION, "source": "synthetic",
        "generator": {"seed": a.seed, "scale": a.scale},
        "time_range": {"start": START, "end": END},
        "enums": ENUMS, "tables": tables, "events": events,
    }
    write_manifest(out, manifest)

    if not a.no_parquet:
        write_parquet(out, ev, ctx, opps, spend)

    truth = {
        "_note": "Ground truth of planted patterns. Not part of the store; only check.py reads it.",
        "august_dip": AUGUST_DIP,
        "consent_loss_countries": CONSENT_LOSS_COUNTRIES,
        "machine_open_flag": EVENT_FLAGS["machine_open"], "privacy_client_share": PRIVACY_CLIENT_SHARE,
        "echo_campaign": camp["echo"],
        "attendance_collapse_region": COLLAPSE_REGION,
        "winner_campaign": camp["winner"], "winner_creative": int(cre["winner_creative"]),
        "winner_audience": {"seniority": WINNER_SENIORITY},
        "diminishing_channel": "paid_search",
        "elasticity": {"paid_search": SEARCH_ELASTICITY, "paid_social": SOCIAL_ELASTICITY},
        "hidden_segment": {"declared_sector": HIDDEN_SECTOR, "behaves_like_topic": HIDDEN_TOPIC,
                           "accounts": np.flatnonzero(acc["hidden"]).tolist()},
        "dirty_events": dirt, "dirty_opportunities": opps["n_bad"],
        "unrecorded_events_dropped": dropped,
    }
    with open(os.path.join(out, "truth.json"), "w", encoding="utf-8") as f:
        json.dump(truth, f, indent=1, sort_keys=True)
        f.write("\n")
    print(f"[{a.scale}] wrote {out}")


def write_parquet(out, ev, ctx, opps, spend):
    try:
        import pyarrow as pa
        import pyarrow.parquet as pq
    except ImportError:
        print("pyarrow not installed: skipped the Parquet archive (pip install pyarrow)")
        return
    arch = os.path.join(out, "archive")
    os.makedirs(arch, exist_ok=True)
    tbl = pa.table({f: ev[f].astype(np.dtype(d)) for f, d, *_ in EVENT_FIELDS})
    pq.write_table(tbl, os.path.join(arch, "events.parquet"), compression="zstd", row_group_size=1_000_000)
    from common import Store
    st = Store(out)
    for name in st.manifest["tables"]:
        pq.write_table(pa.table(st.table(name)), os.path.join(arch, f"{name}.parquet"), compression="zstd")


if __name__ == "__main__":
    main()
