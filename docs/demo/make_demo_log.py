"""Write docs/demo/access.log.gz, the sample nginx log used by docs/demo.tape.

Deterministic (fixed seed, fixed gzip mtime), so re-running it produces an
identical file. The traffic mix is picked to fit one terminal screen in the demo:
six AI crawlers covering all three purposes, two search engines, four AI chat
referrers and ordinary browser traffic. It is demo data only; tests don't use it.

    python3 docs/demo/make_demo_log.py
"""

from __future__ import annotations

import gzip
import json
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / "access.log.gz"
MONTHS = (
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
)

PAGES = [
    "/",
    "/pricing",
    "/docs/getting-started",
    "/docs/api",
    "/blog/ai-traffic-in-2026",
    "/blog/robots-txt-guide",
    "/changelog",
    "/about",
]

# fixture id -> (requests, page weights)
CRAWLERS = {
    "openai-gptbot": (412, [9, 3, 6, 5, 4, 3, 2, 1]),
    "anthropic-claudebot": (287, [4, 2, 7, 6, 3, 3, 2, 1]),
    "bytedance-bytespider": (231, [6, 5, 3, 2, 3, 2, 1, 1]),
    "meta-meta-externalagent": (164, [5, 2, 3, 2, 6, 2, 1, 1]),
    "perplexity-perplexitybot": (118, [2, 3, 4, 2, 5, 6, 1, 1]),
    "openai-chatgpt-user": (57, [1, 8, 5, 2, 3, 1, 0, 0]),
    "google-googlebot": (203, [5, 3, 3, 3, 2, 2, 2, 2]),
    "microsoft-bingbot": (86, [5, 3, 2, 2, 2, 2, 1, 1]),
}

# referrer URL -> (visits, landing-page weights): referrals land on a couple of pages
REFERRALS = {
    "https://chatgpt.com/": (94, [0, 7, 3, 0, 0, 0, 0, 0]),
    "https://www.perplexity.ai/search?q=ai+traffic+analytics": (
        41,
        [0, 0, 0, 0, 5, 2, 0, 0],
    ),
    "https://claude.ai/": (19, [0, 0, 4, 3, 0, 0, 0, 0]),
    "https://gemini.google.com/app": (12, [0, 3, 0, 0, 2, 0, 0, 0]),
}
BROWSER_REQUESTS = 640
OTHER_REFERRERS = ["-", "https://www.google.com/", "https://news.ycombinator.com/", "-"]


def first_ua(key: str) -> str:
    cases = json.loads(
        (ROOT / "conformance" / "user_agents.json").read_text(encoding="utf-8")
    )
    for case in cases:
        if case.get("label") == key or (case["expect"] and case["expect"]["id"] == key):
            return str(case["ua"])
    raise KeyError(key)


def clf(ts: datetime) -> str:
    return f"{ts.day:02d}/{MONTHS[ts.month - 1]}/{ts.year}:{ts:%H:%M:%S} +0000"


def main() -> None:
    rng = random.Random(2026)
    end = datetime(2026, 9, 28, 23, 0, tzinfo=timezone.utc)
    events: list[tuple[datetime, str, str, str]] = []

    def when() -> datetime:
        return end - timedelta(seconds=rng.randrange(7 * 24 * 3600))

    for fixture_id, (count, weights) in CRAWLERS.items():
        ua = first_ua(fixture_id)
        for _ in range(count):
            events.append((when(), rng.choices(PAGES, weights)[0], "-", ua))

    browser = first_ua("browser-chrome")
    for referrer, (count, weights) in REFERRALS.items():
        for _ in range(count):
            events.append((when(), rng.choices(PAGES, weights)[0], referrer, browser))
    for _ in range(BROWSER_REQUESTS):
        events.append((when(), rng.choice(PAGES), rng.choice(OTHER_REFERRERS), browser))

    events.sort(key=lambda e: e[0])
    lines = [
        f'198.51.100.{rng.randrange(1, 255)} - - [{clf(ts)}] "GET {path} HTTP/1.1" 200 '
        f'{rng.randrange(900, 48000)} "{referrer}" "{ua}"'
        for ts, path, referrer, ua in events
    ]
    data = ("\n".join(lines) + "\n").encode("utf-8")
    with (
        OUT.open("wb") as raw,
        gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as gz,
    ):
        gz.write(data)
    print(
        f"wrote {OUT.relative_to(ROOT)} ({len(lines)} lines, {OUT.stat().st_size} bytes)"
    )


if __name__ == "__main__":
    main()
