# LinkedIn QA Job Applications Tracker

Daily log of Senior QA/SDET job applications, built by an automated agent from `applications-log.md`.

**Live page:** published via GitHub Pages from `docs/index.html` (one row per job, latest status, deduped across all runs).

## Files
- `applications-log.md` — append-only log (Date | Company | Title | Location | LinkedIn Job ID | Job URL | Method | Matched CV points | Status)
- `letters/` — tailored cover letters per application
- `build_page.js` — generates `docs/index.html` (standalone, GitHub Pages)
- `build_widget.js` — generates an embeddable widget variant for in-chat rendering
