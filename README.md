# Student Performance Report — Parent Portal

A website where a parent enters **1) Roll Number** and **2) Mode of Exam** and gets an
accurate performance report on screen plus a downloadable **PDF**. Each report also shows
the **highest mark in every subject across the whole class**.

The data is read **live from the Google Sheet**, so any change made in the sheet is
reflected on the site automatically (just reload, or click the status pill to refresh).
The portal is **read-only** — it never writes to the sheet.

- Sheet: `https://docs.google.com/spreadsheets/d/1C3p9hipQLxe4YbfA14s_0zF5seHISiL1fdKquWaMdJk/`
- Tabs used: `PE - Analysis`, `Bio - Maths`, `Bio - CS`, `Maths - CS`

## How to run

**Recommended — local server** (required for the *live* Google Sheets read, because Google
only grants cross-origin access to a real `http(s)` origin):

```
cd "student report generator"
python -m http.server 5177
```
Then open <http://localhost:5177>. The pill in the top-right shows **Live data** when the
sheet was read successfully.

**Double-clicking `index.html` (file://)** also works, but Google blocks the live read from
a `file://` origin, so the page falls back to the bundled **offline snapshot** (`data.js`)
and the pill shows *Offline snapshot*.

> To host it for parents (always live), put these files on any static host
> (GitHub Pages, Netlify, etc.) — the live read works from any real domain.

## Using it

1. Enter the Roll Number, e.g. `26H2309` (case doesn't matter).
2. Pick a **Mode of Exam**:
   - **PE - Analysis** — consolidated total marks + class rank for every student.
   - **Bio - Maths**, **Bio - CS**, **Maths - CS** — subject-wise marks, class-highest per
     subject, and percentile, for that stream.
3. Click **Get Report**. If the roll belongs to a different mode, the page tells you which
   mode(s) to use with one-click switch buttons.
4. **Download PDF** for a clean, printable copy (or use **Print**).

The **status pill** (top-right) shows whether data is live or a snapshot, and its last
refresh time. Click it to re-pull the latest data from the sheet.

## What the report shows

- **Student Information** — name, roll, group/stream, class strength, academic year.
- **Academic Performance** — marks per exam (CU 1 / TE 1 / CU 2 / TE 2), the class-highest
  mark per subject, and the student's percentile.
- **Highest mark in each subject** across the whole class.
- **Summary cards** — total marks, rank in the cohort, percentile.

> Only **CU 1** currently has marks in the sheet. `TE 1`, `CU 2`, `TE 2` show as *Pending*
> and populate automatically once their marks are entered in the sheet.

## Keeping the offline snapshot in sync (optional)

The live read is the source of truth. The bundled snapshot (`data.js`) is only used when the
sheet can't be reached. To refresh that snapshot from the current sheet:

```
python build_data.py     # reads the Excel export and rewrites data.js
```

## Files

| File | Purpose |
|------|---------|
| `index.html` | Page structure |
| `styles.css` | Styling / background |
| `datasource.js` | **Reads the Google Sheet live** and builds the report data |
| `app.js` | Lookup, rendering, and PDF export |
| `data.js` | Offline fallback snapshot (auto-generated) |
| `build_data.py` | Regenerates the offline snapshot from the workbook |
| `vendor/` | jsPDF + AutoTable (bundled for offline use) |
