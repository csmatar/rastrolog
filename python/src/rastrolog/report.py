"""Aggregate LogRecords into the crawler table, the referral table and a per-page pivot."""

from __future__ import annotations

import re
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from rastrolog.classify import Match, classify_referrer, classify_user_agent
from rastrolog.formats import LogRecord

PageCount = tuple[str, int]


@dataclass(frozen=True, slots=True)
class CrawlerRow:
    id: str
    vendor: str
    vendor_name: str
    token: str
    purpose: str
    ai_specific: bool
    requests: int
    unique_pages: int
    last_seen: datetime
    top_pages: tuple[PageCount, ...]


@dataclass(frozen=True, slots=True)
class ReferralRow:
    id: str
    vendor: str
    vendor_name: str
    product: str
    visits: int
    unique_pages: int
    last_seen: datetime
    top_pages: tuple[PageCount, ...]


@dataclass(frozen=True, slots=True)
class PageRow:
    path: str
    crawler_requests: int
    referral_visits: int
    crawlers: tuple[tuple[str, int], ...]  # (token, count)
    referrals: tuple[tuple[str, int], ...]  # (product, count)

    @property
    def total(self) -> int:
        return self.crawler_requests + self.referral_visits


@dataclass(frozen=True, slots=True)
class Report:
    records: int
    skipped: int
    crawlers: tuple[CrawlerRow, ...]
    referrals: tuple[ReferralRow, ...]
    pages: tuple[PageRow, ...]

    @property
    def ai_crawler_requests(self) -> int:
        return sum(row.requests for row in self.crawlers if row.ai_specific)

    @property
    def ai_referral_visits(self) -> int:
        return sum(row.visits for row in self.referrals)

    def to_dict(self) -> dict[str, Any]:
        return {
            "summary": {
                "records": self.records,
                "skipped": self.skipped,
                "ai_crawler_requests": self.ai_crawler_requests,
                "ai_referral_visits": self.ai_referral_visits,
            },
            "crawlers": [
                {
                    "id": r.id,
                    "vendor": r.vendor,
                    "vendor_name": r.vendor_name,
                    "token": r.token,
                    "purpose": r.purpose,
                    "ai_specific": r.ai_specific,
                    "requests": r.requests,
                    "unique_pages": r.unique_pages,
                    "last_seen": r.last_seen.isoformat(),
                    "top_pages": _page_list(r.top_pages),
                }
                for r in self.crawlers
            ],
            "referrals": [
                {
                    "id": r.id,
                    "vendor": r.vendor,
                    "vendor_name": r.vendor_name,
                    "product": r.product,
                    "visits": r.visits,
                    "unique_pages": r.unique_pages,
                    "last_seen": r.last_seen.isoformat(),
                    "top_pages": _page_list(r.top_pages),
                }
                for r in self.referrals
            ],
            "pages": [
                {
                    "path": p.path,
                    "crawler_requests": p.crawler_requests,
                    "referral_visits": p.referral_visits,
                    "crawlers": [{"token": t, "count": c} for t, c in p.crawlers],
                    "referrals": [{"product": n, "count": c} for n, c in p.referrals],
                }
                for p in self.pages
            ],
        }


def _page_list(pages: tuple[PageCount, ...]) -> list[dict[str, Any]]:
    return [{"path": path, "count": count} for path, count in pages]


def _top(counter: Counter[str], limit: int) -> tuple[PageCount, ...]:
    return tuple(sorted(counter.items(), key=lambda item: (-item[1], item[0]))[:limit])


@dataclass(slots=True)
class _Tally:
    match: Match
    count: int = 0
    pages: Counter[str] = field(default_factory=Counter)
    last_seen: datetime | None = None

    def add(self, record: LogRecord) -> None:
        self.count += 1
        self.pages[record.path] += 1
        if self.last_seen is None or record.ts > self.last_seen:
            self.last_seen = record.ts


class Aggregator:
    """Streaming aggregation: feed records with ``add`` and read a Report with ``result``."""

    def __init__(self, *, since: datetime | None = None, own_host: str | None = None) -> None:
        self._since = since
        self._own_host = own_host
        self.records = 0
        self._crawlers: dict[str, _Tally] = {}
        self._referrals: dict[str, _Tally] = {}
        self._page_crawlers: dict[str, Counter[str]] = {}
        self._page_referrals: dict[str, Counter[str]] = {}

    def add(self, record: LogRecord) -> None:
        self.records += 1
        if self._since is not None and record.ts < self._since:
            return
        crawler = classify_user_agent(record.ua)
        if crawler is not None:
            self._tally(self._crawlers, crawler, record)
            if crawler.ai_specific:
                label = crawler.token or crawler.id
                self._page_crawlers.setdefault(record.path, Counter())[label] += 1
            return
        referral = classify_referrer(record.referrer, own_host=self._own_host)
        if referral is not None:
            self._tally(self._referrals, referral, record)
            label = referral.product or referral.id
            self._page_referrals.setdefault(record.path, Counter())[label] += 1

    def add_all(self, records: Iterable[LogRecord]) -> None:
        for record in records:
            self.add(record)

    @staticmethod
    def _tally(bucket: dict[str, _Tally], match: Match, record: LogRecord) -> None:
        tally = bucket.get(match.id)
        if tally is None:
            tally = bucket[match.id] = _Tally(match)
        tally.add(record)

    def result(self, *, top: int = 10, skipped: int = 0) -> Report:
        crawlers = sorted(
            (self._crawler_row(t, top) for t in self._crawlers.values()),
            key=lambda r: (-r.requests, r.id),
        )
        referrals = sorted(
            (self._referral_row(t, top) for t in self._referrals.values()),
            key=lambda r: (-r.visits, r.id),
        )
        paths = set(self._page_crawlers) | set(self._page_referrals)
        pages = sorted((self._page_row(p) for p in paths), key=lambda r: (-r.total, r.path))
        return Report(
            records=self.records,
            skipped=skipped,
            crawlers=tuple(crawlers),
            referrals=tuple(referrals),
            pages=tuple(pages[:top]),
        )

    @staticmethod
    def _crawler_row(tally: _Tally, top: int) -> CrawlerRow:
        m = tally.match
        assert tally.last_seen is not None
        return CrawlerRow(
            id=m.id,
            vendor=m.vendor,
            vendor_name=m.vendor_name,
            token=m.token or m.id,
            purpose=m.purpose or "",
            ai_specific=m.ai_specific,
            requests=tally.count,
            unique_pages=len(tally.pages),
            last_seen=tally.last_seen,
            top_pages=_top(tally.pages, top),
        )

    @staticmethod
    def _referral_row(tally: _Tally, top: int) -> ReferralRow:
        m = tally.match
        assert tally.last_seen is not None
        return ReferralRow(
            id=m.id,
            vendor=m.vendor,
            vendor_name=m.vendor_name,
            product=m.product or m.id,
            visits=tally.count,
            unique_pages=len(tally.pages),
            last_seen=tally.last_seen,
            top_pages=_top(tally.pages, top),
        )

    def _page_row(self, path: str) -> PageRow:
        crawlers = self._page_crawlers.get(path, Counter())
        referrals = self._page_referrals.get(path, Counter())
        return PageRow(
            path=path,
            crawler_requests=sum(crawlers.values()),
            referral_visits=sum(referrals.values()),
            crawlers=_top(crawlers, len(crawlers)),
            referrals=_top(referrals, len(referrals)),
        )


_RELATIVE = re.compile(r"^\s*(\d+)\s*([mhdw])\s*$", re.IGNORECASE)
_UNITS = {"m": "minutes", "h": "hours", "d": "days", "w": "weeks"}


def parse_since(value: str, *, now: datetime | None = None) -> datetime:
    """``30m`` / ``24h`` / ``7d`` / ``2w`` before now, or an ISO date/datetime (naive = UTC)."""
    now = now or datetime.now(timezone.utc)
    relative = _RELATIVE.match(value)
    if relative:
        amount, unit = int(relative.group(1)), relative.group(2).lower()
        return now - timedelta(**{_UNITS[unit]: amount})
    try:
        parsed = datetime.fromisoformat(value.strip())
    except ValueError as exc:
        msg = f"invalid --since value {value!r}: use 30m, 24h, 7d, 2w or a date like 2026-09-01"
        raise ValueError(msg) from exc
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
