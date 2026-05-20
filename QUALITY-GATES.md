# Kids Activities v0.2 — Quality Gates

## Gate 1 — Source scraper correctness
For each source scraper:
- Fetch succeeds or logs a clear source-level error.
- Extracts event cards, not navigation/footer/menu items.
- Produces at least one canonical URL for every event.
- Date parsing is tested with real source snippets.

## Gate 2 — Event quality inspection
Run output must be inspected for:
- percentage of items with valid date;
- percentage with non-empty location;
- duplicate count;
- top rejected items and rejection reasons;
- sample of 5 accepted events with raw evidence.

Minimum pass threshold for a source to be used in recommendations:
- 80% accepted events have a date or explicit date range;
- 90% accepted events have a source URL;
- fewer than 10% obvious non-event/navigation false positives in a random sample.

## Gate 3 — Family scoring
Each scored event must expose component scores:
- age fit for Andy and Lennon;
- date/weekend fit;
- location/travel burden;
- interest fit;
- practical confidence.

A recommendation must score at least 70/100 or be labelled as “option secondaire”.

## Gate 4 — Telegram summary
Before sending or scheduling:
- Summary is in French.
- No markdown table.
- Top 3–7 items max.
- Each item has date, place, one-line why, caveat, and link.
- Output can be pasted directly into Telegram.

## Gate 5 — Operational self-monitoring
Every run stores:
- raw fetch status per source;
- normalized event artifact;
- scoring artifact;
- final summary artifact;
- error log.

If all sources fail, the run must alert as a real blocker instead of sending an empty or fake summary.
