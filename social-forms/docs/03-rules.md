# 3. Rules

The designer can't easily put rules into words, so she never writes any. She ticks boxes. The form then only offers marketers what she's ticked, so they can't break a rule.

## The rules

| Rule | Decided by | Sets what's allowed for |
| --- | --- | --- |
| Backgrounds | Category | Background |
| Layouts | Category | Slide layout |
| Pill texts | Category | Pill text |
| CTAs | Category + Paid/Free/Other | CTA |
| Layout boxes | Layout | Which boxes appear and their limits |

These tick grids replace the designer's Venn diagram of CTAs and categories.

## Tick sheet (`designer-tick-sheet.xlsx`)

| Tab | Fills in | Becomes |
| --- | --- | --- |
| Start here | Nothing (instructions, key, example, checks) | |
| Names | Categories, Backgrounds, Layouts, CTAs, Pill texts, Campaign types | One list for each |
| Backgrounds | Category × Background ticks | Category → allowed backgrounds |
| Layouts | Category × Layout ticks | Category → allowed layouts |
| Pills | Category × Pill ticks | Category → allowed pill texts |
| CTAs | (Category · Paid/Free/Other) × CTA ticks | Category + type → allowed CTAs |
| Layout boxes | Layout × Box, max characters | Layout → boxes and limits |
| Settings | Lead time, busy-week warning | Batch settings |

### How to use it

- **Yellow:** type or tick here. Everything else fills itself in.
- **Ticking:** pick ✓ from the list, or type x. Empty means not allowed.
- **Red count:** something has been named but nothing is ticked for it.
- **Grey heading:** a spare slot that hasn't been named.
- **Notes column:** anything that doesn't fit a tick goes here in plain words. It gets turned into ticks later.
- **Checks panel** on Start here: she's done when all the red numbers are 0.

### Room

| List | Slots |
| --- | --- |
| Categories | 12 |
| Backgrounds | 10 |
| Layouts | 10 |
| CTAs | 12 |
| Pill texts | 12 |

Adding a layout later means naming it on Names, then ticking it and filling in its boxes. No code changes.

## Later: in SharePoint

Each tab becomes a SharePoint list. The designer keeps the rules up to date in the browser, in the Excel-like grid view, with Yes/No columns as the ticks. The tick sheet is how the first set of rules gets captured.
