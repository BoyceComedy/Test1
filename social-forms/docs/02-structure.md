# 2. Structure

```
Batch            (a group of socials with one go-live date)
└── Social       (settings filled in once)
    ├── Slide 1  (layout + its boxes)
    ├── Slide 2
    ├── ...
    └── Outro    (automatic, nothing to fill in)
```

## Batch

| Field | Filled by | Notes |
| --- | --- | --- |
| Name | Marketer | |
| Go-live date | Marketer | Has to be at least the lead time away. See [04](04-batches-and-deadlines.md). |
| Cut-off | Automatic | Go-live minus 3 working days |

## Social (filled in once per social)

| Field | Filled by | Choices limited by |
| --- | --- | --- |
| Category | Marketer | List of categories |
| Campaign type | Marketer | Paid / Free / Other |
| CTA | Marketer picks | Category **and** campaign type |
| Pill text | Marketer picks | Category (fixed list, not free text) |
| Background | Marketer picks | Category |

## Slide (one row per slide)

| Field | Filled by | Notes |
| --- | --- | --- |
| Layout | Marketer picks | Only layouts allowed for the social's category |
| Layout boxes | Marketer | Only the boxes this layout has. Each has a character limit. |
| Background | Automatic | Same as the social's. The marketer can change it per slide, to another allowed background. |
| Image link | Marketer | Link to the source, e.g. a report |
| Image note | Marketer | Note for the designer, e.g. "photo on page 4" |

### Box types a layout can have

| Box | Limit |
| --- | --- |
| Title | max characters |
| Subtitle | max characters |
| Header | max characters |
| Body | max characters |
| Bullets | max number of bullets |
| Each bullet | max characters |
| Time / date | max characters |
| Place | max characters |
| Image | yes/no (a picture space) |
| Other box 1, Other box 2 | spare, the designer can rename them |

## Automatic (nobody fills in)

- 10 seconds per slide, 3 seconds for the outro
- Outro added to every social
- Page dots
- Cut-off date

## Output

One record per social (with its batch and slides) handed to the social creative app. The format is still open; see [06](06-open-questions.md).
