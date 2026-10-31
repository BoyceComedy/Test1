# Milestone 1: data generator

```
pip install -r generator/requirements.txt
python generator/generate.py --seed 20261031 --scale medium
python generator/thumbnails.py --scale medium
python generator/check.py --scale medium
```

## Planted patterns and how check.py finds them (blind, then compared with truth.json)

| # | Pattern | Planted as | Simple query that finds it |
|---|---|---|---|
| 1 | August dip | activity x0.4-0.6 in August (APAC barely), fewer August launches | Aug / avg(Jul, Sep) per region per year |
| 2 | Web vs CRM disagree | DE and FR: web analytics records 40% (consent loss) vs 93% elsewhere | web-recorded / CRM-recorded registrations+downloads per country |
| 3 | Machine opens | contacts on privacy mail clients pre-fetch: open 0-4 s after send, flagged | flagged share of opens; seconds between send and open |
| 4 | Echoing report | one research report's visits/downloads have a long heavy tail | share of a campaign's activity >90 days after it ended |
| 5 | Attendance collapse | LATAM: 8% of registrants attend vs 42% elsewhere | registrations per contact and attendance per registration by region |
| 6 | Winning creative | one email variant gets 42% click/open from C-suite only | best creative vs siblings per campaign x seniority, ranked by z-score |
| 7 | Flattening returns | paid search clicks ~ spend^0.35, paid social ~ spend^1 | log-log slope of weekly volume vs weekly spend |
| 8 | Hidden segment | 25% of "Manufacturing" accounts behave like AI-hungry tech buyers, meet more | accounts whose share of AI & Data campaigns is far above their sector's (z>3) |
| 9 | Dirty data | 1.8% duplicates, 1.2% missing country, 0.8% impossible dates; 3% of closed opps close before created | exact duplicate rows, country 0, time outside the data range |

Events no system recorded are dropped (they would not exist in real data), which is why
row counts land a few percent under target.
