"""Load the bundled signals.json once and expose a typed, read-only view of it.

In a built wheel the file sits next to this module. In an editable/dev install it
does not (the canonical copy lives at the repo root), so fall back to that.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import cache
from importlib.resources import files
from pathlib import Path
from typing import Any, Literal

SCHEMA_VERSION = 1
Purpose = Literal["training", "user_fetch", "search_index"]


@dataclass(frozen=True, slots=True)
class CrawlerSignal:
    id: str
    vendor: str
    vendor_name: str
    token: str
    match: Literal["user_agent", "robots_only"]
    purpose: Purpose
    ai_specific: bool
    docs_url: str
    vendor_documented: bool = True


@dataclass(frozen=True, slots=True)
class ReferrerSignal:
    id: str
    vendor: str
    vendor_name: str
    product: str
    hosts: tuple[str, ...]
    source_url: str


@dataclass(frozen=True, slots=True)
class Signals:
    schema_version: int
    updated: str
    crawlers: tuple[CrawlerSignal, ...]
    referrers: tuple[ReferrerSignal, ...]


def _read_raw() -> str:
    bundled = files("rastrolog") / "signals.json"
    if bundled.is_file():
        return bundled.read_text(encoding="utf-8")
    repo_copy = Path(__file__).resolve().parents[3] / "signals.json"
    return repo_copy.read_text(encoding="utf-8")


def parse_signals(data: dict[str, Any]) -> Signals:
    if data.get("schema_version") != SCHEMA_VERSION:
        msg = f"unsupported signals.json schema_version {data.get('schema_version')!r}"
        raise ValueError(msg)
    return Signals(
        schema_version=data["schema_version"],
        updated=data["updated"],
        crawlers=tuple(
            CrawlerSignal(
                id=c["id"],
                vendor=c["vendor"],
                vendor_name=c["vendor_name"],
                token=c["token"],
                match=c["match"],
                purpose=c["purpose"],
                ai_specific=c["ai_specific"],
                docs_url=c["docs_url"],
                vendor_documented=c.get("vendor_documented", True),
            )
            for c in data["crawlers"]
        ),
        referrers=tuple(
            ReferrerSignal(
                id=r["id"],
                vendor=r["vendor"],
                vendor_name=r["vendor_name"],
                product=r["product"],
                hosts=tuple(r["hosts"]),
                source_url=r["source_url"],
            )
            for r in data["referrers"]
        ),
    )


@cache
def load_signals() -> Signals:
    return parse_signals(json.loads(_read_raw()))
