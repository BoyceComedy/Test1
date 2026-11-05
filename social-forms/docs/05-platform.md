# 5. Platform

## Needs

- Works on **Windows and Mac**, in the browser.
- **SharePoint** stores everything.
- **Many** marketers can add jobs at once.
- Feels as much like Excel / WYSIWYG as possible.

## Plan

| Part | Built with |
| --- | --- |
| Storage | SharePoint Lists: Batches, Socials, Slides, and the rule lists |
| Rule set-up | SharePoint Lists grid view (Excel-like). Ticks are Yes/No columns. |
| Marketer form | Power Apps if available, otherwise a custom page inside SharePoint |
| Hand-off | The social creative app reads finished socials from SharePoint |

## Why not plain SharePoint list forms

A plain list form can't narrow one dropdown based on another (category → allowed CTAs). It also can't show different boxes for each layout. The rules couldn't be enforced.

## Marketer form idea

- A grid with one row per slide, like Excel.
- Dropdowns only show allowed choices.
- Only the chosen layout's boxes appear.
- Text over its limit turns red.
- Optional: a simple preview beside the grid.

## To check

**Power Apps:** sign in to make.powerapps.com with a work account. If it opens, it's available. If it's blocked, use a custom SharePoint page. The storage and rules stay the same either way.
