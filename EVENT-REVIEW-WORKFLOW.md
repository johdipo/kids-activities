# Kids Activities — Dedicated Event Review Workflow

This workflow is mandatory for any final/high-confidence family activity recommendation.

## Principle
Do not trust the scraper/scorer alone. For every shortlisted event, open a dedicated isolated agent/session whose only job is to verify that event from the canonical source page and challenge the recommendation.

## When to trigger
Run this after scoring and before sending/presenting a final Telegram summary.

## One agent per event
Each event review agent receives:
- event id, title, URL, date/time, place, scraper evidence, score/reasons/caveats;
- family profile: Johan outdoor/tech/culture/food, Daisy walks/cosy/art, Andy intellectual/sport/water/Italian food, Lennon animals/nature/exploration;
- target date window and base location: Yverdon.

The agent must:
1. Open/read the canonical event page.
2. Verify: date/time, place, source credibility, price, booking/registration, duration if available, age suitability, indoor/outdoor, weather sensitivity, accessibility/practical friction.
3. Challenge the ranking: should this be recommended, secondary, or dropped?
4. Write a compact review artifact with:
   - verdict: `recommend`, `secondary`, `drop`, or `uncertain`;
   - verified facts;
   - unresolved questions;
   - family-fit reasoning;
   - summary wording to use in Telegram;
   - source URL and access status.

## Artifact location
For a run directory like:

`automation/out/v02-YYYY-MM-DDTHH-mm-ss-sssZ/`

store reviews under:

`automation/out/v02-.../event-reviews/<event-id>.md`

Also create:

`automation/out/v02-.../event-reviews/INDEX.md`

with all verdicts and final ordering recommendations.

## Final summary rule
A final Telegram summary must incorporate the dedicated review verdicts. If a review could not verify an important point, say so explicitly instead of smoothing it over.
