# Manual Johan event intake procedure

Use this when Johan sends a programme by photo, PDF, text, or direct indication.

1. Save the original file path or message provenance. Never replace OCR with a cleaned summary without keeping the source file/reference.
2. Extract candidate events into `data/manual-events.json` with:
   - `title`, `dates[]`, `venue`, `city`
   - `sourceFiles[]` and/or `sourceMessage`
   - `status`: `candidate` or `needs_review` for OCR/text not officially verified; `confirmed` only after checking an official venue/organiser source
   - `notes`, `ocrEvidence`, `tags`, `ageText`, and optional `officialSources[]`
3. If an official page/PDF exists, correct the manual entry from the official source, add the URL to `officialSources[]`, and keep the original photo/PDF as secondary provenance.
4. Leave uncertain OCR-only entries in `needs_review`. They will appear in `normalized-events.json` for tracking/review but are rejected from firm recommendations until confirmed.
5. Run:
   ```bash
   cd kids-activities && node kids_activities_v1.js --fixture-test
   ```
6. For a live sanity check, run the pipeline with a window covering one manual occurrence and inspect `automation/out/.../normalized-events.json`, `fetch-log.json`, and `quality-inspection.json`.
7. When a new repeated source appears, add it to `data/source-candidates.json` before building a scraper. Use verified root URLs when deep paths are not confirmed.
