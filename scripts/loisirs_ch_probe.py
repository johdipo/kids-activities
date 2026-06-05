#!/usr/bin/env python3
"""Minimal public-endpoint probe for loisirs.ch (WordPress REST + JSON-LD).

Scope / ethics:
- anonymous public endpoints only (the WP REST API and public agenda pages);
- low-volume requests with a polite delay (robots.txt declares Crawl-delay: 1);
- a neutral probe User-Agent (NOT one of the AI UAs disallowed in robots.txt);
- no auth / CAPTCHA / paywall / protection bypass;
- avoids the robots-disallowed search paths (/?s=, /recherche/) — uses the REST API.

Data path:
  1. GET /wp-json/wp/v2/agenda            -> list: title, link, category slugs
  2. GET <event page> -> <script ld+json> -> Event: startDate, endDate, location

The agenda REST objects do NOT carry the event date (acf is empty), so the
event date/location/description are read from the schema.org Event JSON-LD
embedded in each public event page.

This is an investigation aid, not a production scraper.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from html import unescape

UA = "Mozilla/5.0 (compatible; kids-activities loisirs.ch probe; low-volume)"
BASE = "https://www.loisirs.ch"
REST_AGENDA = f"{BASE}/wp-json/wp/v2/agenda"
SOURCE = "loisirs.ch"

# Canton (region) categories observed in the loisirs.ch taxonomy.
CANTONS = {
    "vaud": 201, "fribourg": 202, "valais": 205, "geneve": 203,
    "neuchatel": 206, "berne": 204, "jura": 207, "grison": 215,
    "lucerne": 210, "zug": 244, "zurich": 216, "soleure": 208,
    "argovie": 211, "bale": 238, "tessin": 213, "uri": 214,
    "thurgovie": 219, "obwald": 221, "nidwald": 222,
}

# A few kid/family-relevant theme categories (intersection done via `search`,
# since comma-separated `categories` are combined as OR by WP core).
KID_THEMES = {
    "zoo": 54, "places-de-jeux": 126, "parcs-dattractions-et-parcs-de-loisirs": 96,
    "piscines": 124, "escape-games": 101, "jeux": 158, "patinoires": 180,
    "centres-de-loisirs": 88, "sentiers-didactiques": 107, "musees": 113,
}

JSONLD_RE = re.compile(
    r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.S | re.I,
)
AGE_RE = re.compile(r"(\d{1,2})\s*(?:[-–à]\s*(\d{1,2}))?\s*ans", re.I)


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": BASE + "/"})
    with urllib.request.urlopen(req, timeout=25) as resp:
        return resp.read()


def fetch_json(url: str) -> object:
    return json.loads(fetch(url).decode("utf-8"))


def list_agenda(canton_id: int | None, search: str | None, theme_id: int | None,
                per_page: int) -> list[dict]:
    params = {
        "per_page": per_page,
        "orderby": "date",
        "order": "desc",
        "_fields": "id,title,link,slug,class_list,date",
    }
    cats = [c for c in (canton_id, theme_id) if c]
    if cats:
        params["categories"] = ",".join(str(c) for c in cats)
    if search:
        params["search"] = search
    url = f"{REST_AGENDA}?{urllib.parse.urlencode(params)}"
    data = fetch_json(url)
    return data if isinstance(data, list) else []


def iter_jsonld_objects(html: str):
    for block in JSONLD_RE.findall(html):
        try:
            data = json.loads(block)
        except Exception:
            continue
        stack = data if isinstance(data, list) else [data]
        while stack:
            obj = stack.pop()
            if isinstance(obj, dict):
                if "@graph" in obj and isinstance(obj["@graph"], list):
                    stack.extend(obj["@graph"])
                yield obj


def extract_event(html: str) -> dict | None:
    for obj in iter_jsonld_objects(html):
        t = obj.get("@type")
        types = t if isinstance(t, list) else [t]
        if any(isinstance(x, str) and "Event" in x for x in types):
            return obj
    return None


def format_location(place: object) -> str | None:
    if not isinstance(place, dict):
        return None
    addr = place.get("address") if isinstance(place.get("address"), dict) else {}
    parts = [
        place.get("name"),
        addr.get("streetAddress"),
        " ".join(p for p in [addr.get("postalCode"), addr.get("addressLocality")] if p),
        addr.get("addressRegion"),
    ]
    seen, out = set(), []
    for p in parts:
        p = (p or "").strip()
        if p and p.lower() not in seen:
            seen.add(p.lower())
            out.append(p)
    return ", ".join(out) or None


def clean_date(value: object) -> str | None:
    # Some event pages emit an epoch-zero placeholder (1970-01-01) for a missing
    # start or end bound; treat those as unknown rather than a real date.
    if not isinstance(value, str) or not value:
        return None
    return None if value.startswith("1970-01-01") else value


def age_hint(*texts: str) -> str | None:
    for text in texts:
        if not text:
            continue
        m = AGE_RE.search(text)
        if m:
            return m.group(0).strip()
    return None


def category_slugs(class_list: list[str]) -> list[str]:
    return [c[len("category-"):] for c in (class_list or []) if c.startswith("category-")]


def normalize(item: dict, event: dict | None) -> dict:
    title = unescape(item.get("title", {}).get("rendered", "")).strip()
    cats = category_slugs(item.get("class_list", []))
    desc = unescape((event or {}).get("description", "") or "").strip() or None
    return {
        "source": SOURCE,
        "title": title,
        "startDate": clean_date((event or {}).get("startDate")),
        "endDate": clean_date((event or {}).get("endDate")),
        "location": format_location((event or {}).get("location")),
        "url": item.get("link"),
        "categories": cats,
        "ageText": age_hint(title, desc or ""),
        "description": desc,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Probe public loisirs.ch agenda endpoints")
    ap.add_argument("--canton", default="vaud",
                    help="canton slug for region filter (default: vaud; 'none' to skip)")
    ap.add_argument("--search", default=None, help="optional full-text filter, e.g. 'enfant'")
    ap.add_argument("--theme", default=None,
                    help="optional kid theme slug, e.g. 'zoo' (OR-combined with canton)")
    ap.add_argument("--limit", type=int, default=5, help="max events to detail-fetch (default 5)")
    ap.add_argument("--delay", type=float, default=1.0, help="seconds between requests (>=1)")
    args = ap.parse_args()

    canton_id = None if args.canton.lower() == "none" else CANTONS.get(args.canton.lower())
    if args.canton.lower() != "none" and canton_id is None:
        print(f"unknown canton: {args.canton}; known: {sorted(CANTONS)}", file=sys.stderr)
        return 2
    theme_id = KID_THEMES.get(args.theme.lower()) if args.theme else None
    if args.theme and theme_id is None:
        print(f"unknown theme: {args.theme}; known: {sorted(KID_THEMES)}", file=sys.stderr)
        return 2

    delay = max(1.0, args.delay)
    items = list_agenda(canton_id, args.search, theme_id, args.limit)
    results = []
    for item in items[: args.limit]:
        event = None
        link = item.get("link")
        if link:
            try:
                time.sleep(delay)
                event = extract_event(fetch(link).decode("utf-8", "ignore"))
            except Exception as exc:  # noqa: BLE001 - probe is best-effort
                print(f"warn: detail fetch failed for {link}: {exc}", file=sys.stderr)
        results.append(normalize(item, event))

    print(json.dumps(results, ensure_ascii=False, indent=2))
    with_date = sum(1 for r in results if r["startDate"])
    print(f"\n# {len(results)} events, {with_date} with a start date "
          f"(canton={args.canton}, search={args.search}, theme={args.theme})",
          file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
