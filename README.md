# Benchmark Atlas

An interactive companion to the systematic review *Benchmarks for Evaluating Generative Large Language Models in Mental Health* (Matthews, Mudambi, Yu, Torous, Suh, Nagata, Pataranutaporn, Cantor, McBain). It presents all 453 benchmarks and 433 studies from the review's supplementary tables, with filters, charts, an evidence map, and a detail page for every record.

- **To preview:** double-click `site/index.html`.
- **To publish:** see [DEPLOY.md](DEPLOY.md).
- **To update the data:** replace the workbook in `data/` and rebuild (see below).

## What is in this folder

```
mh-benchmark-atlas/
├── site/                     The website itself: this is what gets published
│   ├── index.html
│   ├── assets/css/atlas.css  All styling (colors and fonts are set at the top)
│   ├── assets/js/            The application (plain JavaScript, no frameworks)
│   ├── assets/data/          atlas-data.js, generated from the workbook
│   ├── assets/fonts/         Newsreader and Public Sans (SIL Open Font License)
│   ├── assets/img/           Favicon and the link-preview image
│   └── downloads/            CSV and Excel files offered on the About page
├── data/
│   ├── *.xlsx                The supplementary workbook (the source of truth)
│   ├── study_links.json      Paper links found by title lookup
│   └── link_overrides.csv    Manual link corrections (these always win)
├── build/
│   ├── build_data.py         Turns the workbook into the site's data
│   ├── validation_report.txt What the last build checked and found
│   ├── og-image.html         Template for the link-preview image
│   └── make_og_image.py      Regenerates the link-preview image (optional)
├── .github/workflows/        Automatic build and publish on GitHub Pages
└── DEPLOY.md                 Step-by-step hosting instructions
```

## Updating the data

The site computes every number from the workbook. Nothing is typed in by hand except a few facts about the search and screening that the workbook does not hold: the databases, the search dates, and the counts of 3,454 records and 751 full-text reports. Those are near the top of `site/assets/js/pages.js` under `A.review`, along with the author list and citation.

1. Put the new workbook in `data/` and remove the old one. Keep the sheet names (one containing "Benchmark", one containing "stud") and the column headers. Column order does not matter. Extra columns are allowed and reported as unused.
2. Run `python3 build/build_data.py`. If you use GitHub Pages, this happens automatically when you upload.
3. Read `build/validation_report.txt`. It lists every vocabulary with counts, so typos and near-duplicates stand out.

The build **stops with an error and changes nothing** if a required column is missing, a benchmark name is duplicated, or a study lists a benchmark that is not in the benchmark sheet.

### What the build does to the data

- **Splits multi-value cells** on semicolons, but not inside parentheses. For example, "Not applicable (knowledge items; no person depicted)" stays one value, as do benchmark names such as "D4 (author-modified; Gu 2024)".
- **Links studies and benchmarks** using the exact names in "Benchmarks used". Each benchmark's study count is checked against the "Studies using benchmark, No." column.
- **Harmonizes construct labels** in the study sheet to the benchmark sheet's wording. For example, "Guideline adherence / information quality" becomes "Guideline adherence or information quality", and "Other (cognitive distortion detection)" becomes "Cognitive distortion detection". The report lists every change.
- **Separates the tie flag:** "(tie across studies)" is removed from construct names and kept as a separate field.
- **Splits quality ratings:** "High (lowest Adequate)" becomes rating High, lowest Adequate.
- **Parses sizes** into a number, a unit, and the source footnote letter (a–e).
- **Separates notes from model lists:** "None (benchmark proposed without model results)" means no models, and bracketed abstractor notes are shown as notes rather than model names.
- **Flags likely workbook slips** as warnings in the report, without stopping the build: model counts that don't match the list, duplicate models, parent names that only match after ignoring spaces or underscores, and study counts that don't match.
- **Adds derived fields:** the years each benchmark was used, language coverage, size and reuse bands, whether an LLM judge was used, and the quality presets. As in the review's summary statistics, a reference standard rated NR counts as poor for the "Poor on at least one" preset.

### Paper links

`data/study_links.json` holds links found by matching each study's exact title against Crossref, arXiv, OpenAlex, DataCite, and Europe PMC. Matches were confirmed by first author and year. Only confident matches are shown as direct links; any other study links to a Google Scholar search for its exact title.

To fix or add a link, add a row to `data/link_overrides.csv` with the study's exact title and the correct URL, then rebuild. Overrides always win. Studies added in a future workbook will link to a title search until you add an override or rerun the lookup.

## Changing the look or the wording

- **Colors and type** are CSS variables at the top of `site/assets/css/atlas.css`. The quality scale is `--navy` (high), `--blue` (adequate), and `--sky` (poor). It echoes the review's figures; keep it ordinal (darker means better).
- **The site name** "Benchmark Atlas" appears in `site/index.html` (header, footer, and page title) and in `site/assets/js/main.js` (the `SITE` constant).
- **Page text** for the Overview, Methods, and About pages is in `site/assets/js/pages.js`. Field definitions for the glossary are at the end of `site/assets/js/model.js`.
- **Filters, columns, and charts** are defined in `site/assets/js/model.js` (filters and sorting) and `site/assets/js/explorers.js` (table columns, charts, and map dimensions).

## Design notes

- The quality "signature" (three stacked cells: inputs, reference standard, scoring) is the site's single visual unit. It is used in the hero field, the detail pages, and the study pages. The table shows the same ratings as three sortable columns.
- There is deliberately **no composite quality score**. The three ratings stay separate. The presets ("High on all three", "No Poor ratings", "Poor on at least one") follow the review's own definitions.
- Every chart doubles as a filter, and all state lives in the URL, so any filtered view or record can be bookmarked or shared.
- Accessibility: axe-core 4.14 (WCAG 2.0, 2.1, and 2.2 AA plus best practices) reports no violations on every page and view at 1440, 1024, and 390 pixels wide, including the open record panel and the mobile filter sheet. The site works by keyboard alone: the drawer traps focus and returns it, arrow keys move through the overview field, and focus is restored after the view redraws. It respects reduced-motion settings and works from a local folder, on any static host, and without cookies or tracking.
- Paper links: studies whose link could not be confirmed link to a Google Scholar search for the exact title. Confirmed corrections go in `data/link_overrides.csv`.
