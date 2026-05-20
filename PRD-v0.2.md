# Kids Activities v0.2 — PRD

## Goal
Produce a source-backed weekend activity recommendation pipeline for Johan, Daisy, Andy, and Lennon around Yverdon / Suisse romande.

v0.2 is successful only if the output contains real, timely activities with enough evidence to send directly to Telegram without manual cleanup.

## Family fit profile
- Johan: sport, outdoor, mountain/nature, tech/science, culture, street-food.
- Daisy: walks, mountain, cosy cafés/tea, decoration/interior/art.
- Andy, 6: intellectual activities, tennis, climbing, dance/gym, water activities, Italian food.
- Lennon, 4: animals, insects, nature, exploration, discoveries.

## Scope v0.2
1. Collect events from explicit source-specific scrapers, not generic page scraping only.
2. Normalize each event into a stable schema.
3. Filter by date, location radius, age suitability, and family relevance.
4. Score and rank activities with transparent reasons.
5. Generate a Telegram-ready summary in French.
6. Persist logs and artifacts so a failed run is diagnosable.

## Non-goals
- Buying tickets or registering the family automatically.
- Sending external messages without review/explicit notification path.
- Covering all Switzerland; first target is Yverdon + reasonable family day-trip radius.

## Event schema
Each normalized event must contain:
- `id`: deterministic source + canonical URL/date/title hash.
- `source`: source slug.
- `title`: human-readable title.
- `startDate`: ISO date or datetime when known.
- `endDate`: ISO date/datetime optional.
- `locationName` and `locationText`.
- `city` when available.
- `url`: canonical source URL.
- `description`: short factual summary.
- `ageMin`, `ageMax`, `ageText`: null allowed only if source gives no clue.
- `priceText`.
- `tags`: normalized interests, e.g. `nature`, `animals`, `science`, `culture`, `sport`, `food`, `indoor`, `outdoor`.
- `evidence`: raw source snippet or fields used for normalization.

## Recommendation contract
Each recommended item must include:
- title;
- date/time;
- place;
- source link;
- why it fits this family;
- main caveat, e.g. weather, age mismatch, booking needed, travel time, missing price.

## Quality bar
- No placeholders in the final recommendation list.
- No generic directory/navigation entries.
- No event outside the target date window unless explicitly labelled “future idea”.
- No activity recommended for both kids if it clearly excludes one of their ages.
- Every recommendation must have a real source URL.
