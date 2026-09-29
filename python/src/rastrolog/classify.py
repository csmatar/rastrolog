"""Pure classifiers for user agents and referrers.

Every function accepts None or empty input, never raises on malformed input,
and returns None for anything unrecognised. Results are cached, because real
logs repeat the same few hundred user agents and referrers millions of times.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from functools import lru_cache
from typing import Literal
from urllib.parse import urlsplit

from rastrolog.signals import CrawlerSignal, ReferrerSignal, load_signals

__all__ = [
    "Match",
    "classify_referrer",
    "classify_request",
    "classify_user_agent",
    "normalize_host",
]


@dataclass(frozen=True, slots=True)
class Match:
    """What a request was classified as. Serialise with ``to_dict()``."""

    kind: Literal["crawler", "referral"]
    id: str
    vendor: str
    vendor_name: str
    product: str | None = None
    token: str | None = None
    purpose: str | None = None
    ai_specific: bool = True

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def normalize_host(host: str) -> str:
    """Lowercase, drop a trailing dot and a leading ``www.``."""
    host = host.strip().lower().rstrip(".")
    return host[4:] if host.startswith("www.") else host


def _crawler_match(signal: CrawlerSignal) -> Match:
    return Match(
        kind="crawler",
        id=signal.id,
        vendor=signal.vendor,
        vendor_name=signal.vendor_name,
        token=signal.token,
        purpose=signal.purpose,
        ai_specific=signal.ai_specific,
    )


def _referral_match(signal: ReferrerSignal) -> Match:
    return Match(
        kind="referral",
        id=signal.id,
        vendor=signal.vendor,
        vendor_name=signal.vendor_name,
        product=signal.product,
    )


@lru_cache(maxsize=1)
def _ua_index() -> tuple[tuple[str, Match], ...]:
    """(lowercased token, match) pairs, longest token first."""
    crawlers = [c for c in load_signals().crawlers if c.match == "user_agent"]
    crawlers.sort(key=lambda c: len(c.token), reverse=True)
    return tuple((c.token.lower(), _crawler_match(c)) for c in crawlers)


@lru_cache(maxsize=1)
def _referrer_index() -> dict[str, Match]:
    """Normalised host -> match. Hosts are unique across entries (enforced by tests)."""
    return {
        normalize_host(host): _referral_match(signal)
        for signal in load_signals().referrers
        for host in signal.hosts
    }


@lru_cache(maxsize=1)
def _max_referrer_labels() -> int:
    """Label count of the longest listed referrer host (e.g. 3 for notebooklm.google.com)."""
    return max(host.count(".") + 1 for host in _referrer_index())


#: Requests can carry arbitrarily long User-Agent/Referer values (or a hostile
#: client can send one on purpose). Caching those would let the lru caches grow
#: without bound in a long-running ASGI/Django process, so anything longer than
#: this bypasses the cache and is classified directly, uncached.
_MAX_CACHED_LEN = 512


def classify_user_agent(ua: str | None) -> Match | None:
    """Classify a User-Agent header. Case-insensitive; longest token wins."""
    if not ua or not ua.strip():
        return None
    if len(ua) > _MAX_CACHED_LEN:
        return _classify_user_agent_impl(ua)
    return _classify_user_agent(ua)


def _classify_user_agent_impl(ua: str) -> Match | None:
    lowered = ua.lower()
    for token, match in _ua_index():
        if token in lowered:
            return match
    return None


@lru_cache(maxsize=8192)
def _classify_user_agent(ua: str) -> Match | None:
    return _classify_user_agent_impl(ua)


def classify_referrer(url: str | None, *, own_host: str | None = None) -> Match | None:
    """Classify a Referer header / document.referrer value.

    Matches the exact host or any subdomain of a listed host. Only the origin is
    used: browsers usually send nothing more cross-site. ``own_host`` never matches.
    """
    if not url or not url.strip():
        return None
    stripped = url.strip()
    normalized_own_host = normalize_host(own_host) if own_host else None
    if len(stripped) > _MAX_CACHED_LEN:
        return _classify_referrer_impl(stripped, normalized_own_host)
    return _classify_referrer(stripped, normalized_own_host)


def _classify_referrer_impl(url: str, own_host: str | None) -> Match | None:
    try:
        parts = urlsplit(url)
        hostname = parts.hostname
    except ValueError:
        return None
    if not parts.scheme or not hostname:
        return None
    host = normalize_host(hostname)
    if own_host is not None and host == own_host:
        return None
    labels = host.split(".")
    index = _referrer_index()
    # Only suffixes with at most as many labels as the longest listed host can
    # match; starting there keeps a hostile many-label host linear, not quadratic.
    first = max(0, len(labels) - _max_referrer_labels())
    for start in range(first, len(labels) - 1):
        match = index.get(".".join(labels[start:]))
        if match is not None:
            return match
    return None


@lru_cache(maxsize=8192)
def _classify_referrer(url: str, own_host: str | None) -> Match | None:
    return _classify_referrer_impl(url, own_host)


def classify_request(
    user_agent: str | None, referrer: str | None, *, own_host: str | None = None
) -> Match | None:
    """Crawler match wins; otherwise the referral match; otherwise None."""
    return classify_user_agent(user_agent) or classify_referrer(referrer, own_host=own_host)
