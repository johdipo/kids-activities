#!/usr/bin/env python3
"""Minimal public-endpoint probe for agenda.ch.

Scope:
- anonymous public endpoints only
- low-volume requests
- no auth/CAPTCHA/paywall bypass

This is an investigation aid, not a production scraper.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
import urllib.request
from html.parser import HTMLParser

UA = "Mozilla/5.0 (compatible; kids-activities agenda.ch probe; low-volume)"
BASE_PRO = "https://pro.agenda.ch/fr/s"
BASE_PUBLIC = "https://agenda.ch/fr/s"


class ResultLinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = dict(attrs)
        href = attrs_dict.get("href")
        if href and "/fr/s/" in href and href not in self.links:
            self.links.append(href)


def fetch(url: str, *, accept: str | None = None) -> tuple[str, bytes]:
    headers = {"User-Agent": UA, "Referer": "https://www.agenda.ch/"}
    if accept:
        headers["Accept"] = accept
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as response:
        return response.geturl(), response.read()


def autocomplete(term: str) -> dict:
    url = f"{BASE_PRO}/live_search_form?term={urllib.parse.quote(term)}"
    _, body = fetch(url)
    return json.loads(body.decode("utf-8"))


def localities(term: str) -> list[str]:
    url = f"{BASE_PRO}/localities?term={urllib.parse.quote(term)}"
    _, body = fetch(url)
    return json.loads(body.decode("utf-8"))


def jsresults(what: str, where: str, distance: int) -> dict:
    qs = urllib.parse.urlencode({"what": what, "where": where, "distance": distance})
    url = f"{BASE_PUBLIC}/jsresults?{qs}"
    final_url, body = fetch(url, accept="text/javascript")
    html = body.decode("utf-8", errors="ignore")
    parser = ResultLinkParser()
    parser.feed(html)
    return {"url": final_url, "bytes": len(body), "links": parser.links[:20]}


def main() -> int:
    parser = argparse.ArgumentParser(description="Probe public agenda.ch search endpoints")
    parser.add_argument("--where", default="Yverdon-les-Bains")
    parser.add_argument("--distance", type=int, default=10000)
    parser.add_argument("terms", nargs="*", default=["enfant", "famille", "loisirs", "cours", "tennis"])
    args = parser.parse_args()

    print("# agenda.ch public endpoint probe")
    print(json.dumps({"localities": localities(args.where.split("-")[0])}, ensure_ascii=False, indent=2))

    for term in args.terms:
        print(f"\n## term={term}")
        data = autocomplete(term)
        summary = {
            "occupations": data.get("occupations", [])[:10],
            "pro_users_count": len(data.get("pro_users", [])),
            "agendas_count": len(data.get("agendas", [])),
            "sample_pro_users": data.get("pro_users", [])[:3],
            "sample_agendas": data.get("agendas", [])[:3],
        }
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        if term in {"loisirs", "cours", "tennis"}:
            print(json.dumps({"jsresults": jsresults(term, args.where, args.distance)}, ensure_ascii=False, indent=2))

    return 0


if __name__ == "__main__":
    sys.exit(main())
