"""Perf smoke test: parser throughput on a realistic 1M-line access log.

Deliberately *not* a cycled handful of lines: real logs have unique client IPs,
mostly-unique paths and a wide (but bounded) pool of user agents and referrers.
A cache keyed on the exact input (a whole line, or a rare full-URL repeat) would
show a near-100% hit rate on a cycled fixture but near-0% here, which is the
point -- this measures parser throughput, not cache-hit throughput.
"""

from __future__ import annotations

import json
import platform
import random
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from helpers import CONFORMANCE

from rastrolog.parse import ParseStats, iter_records
from rastrolog.report import Aggregator

_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
_SEED = 20260928


def _clf_time(dt: datetime) -> str:
    return (
        f"{dt.day:02d}/{_MONTHS[dt.month - 1]}/{dt.year}:"
        f"{dt.hour:02d}:{dt.minute:02d}:{dt.second:02d} +0000"
    )


def _pool(filename: str, key: str) -> list[str]:
    data = json.loads((CONFORMANCE / filename).read_text(encoding="utf-8"))
    return [item[key] for item in data]


def _referrer_and_ua_pools() -> tuple[list[str], list[str]]:
    ua_cases = json.loads((CONFORMANCE / "user_agents.json").read_text(encoding="utf-8"))
    uas = [case["ua"] for case in ua_cases]
    # Picked by its fixture label, not by sniffing for "Macintosh"/"Chrome": several
    # AI crawler UAs also contain those substrings (e.g. OAI-SearchBot), so that
    # naive match previously picked a crawler, not an actual browser, as "the
    # browser UA" the brief calls for adding to the pool.
    browser_ua = next(case["ua"] for case in ua_cases if case.get("label") == "browser-chrome")
    uas = [*uas, browser_ua]
    referrers = [*_pool("referrers.json", "referrer"), "-"]
    return uas, referrers


def _write_realistic_log(path: Path, n: int, *, seed: int = _SEED) -> None:
    rng = random.Random(seed)
    uas, referrers = _referrer_and_ua_pools()
    start = datetime(2026, 9, 1, tzinfo=timezone.utc)
    with path.open("w", encoding="utf-8") as fh:
        for i in range(n):
            ts = start + timedelta(seconds=i // 20)
            ip = (
                f"{rng.randint(1, 223)}.{rng.randint(0, 255)}."
                f"{rng.randint(0, 255)}.{rng.randint(1, 254)}"
            )
            target = f"/page/{i % 5000}"
            if rng.random() < 0.3:
                target += f"?ref={i % 37}&x={rng.randint(0, 999)}"
            status = 200 if rng.random() > 0.05 else rng.choice((301, 304, 404))
            size = rng.randint(200, 20_000)
            ua = rng.choice(uas)
            referrer = rng.choice(referrers)
            fh.write(
                f'{ip} - - [{_clf_time(ts)}] "GET {target} HTTP/1.1" {status} {size} '
                f'"{referrer}" "{ua}"\n'
            )


@pytest.mark.perf
def test_one_million_realistic_lines_parse_within_budget(tmp_path: Path) -> None:
    path = tmp_path / "realistic.log"
    _write_realistic_log(path, 1_000_000)
    stats = ParseStats()
    aggregator = Aggregator()
    start = time.perf_counter()
    aggregator.add_all(iter_records(path, stats=stats))
    aggregator.result()
    elapsed = time.perf_counter() - start
    assert stats.records == 1_000_000
    # Measured 11.9s / 12.0s (best of 2) on Darwin x86_64, Python 3.14.3,
    # 2026-09-28. The spec target was < 10s; this realistic (non-repeating)
    # 1M-line benchmark does not clear that on this machine, so per the
    # controller's ruling the threshold below is that measurement (11.9s)
    # x1.5, rounded up to a whole second -- not raised arbitrarily.
    assert elapsed < 18, f"1M realistic lines took {elapsed:.1f}s on {platform.machine()}"
