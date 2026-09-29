"""Log line formats: detection and per-line parsing into LogRecord.

Supported formats:
- ``combined``: nginx's default ``combined`` and Apache's ``combined`` LogFormat
- ``cloudfront``: CloudFront standard (legacy) logs, tab-separated with a ``#Fields:`` header
- ``alb``: AWS Application Load Balancer access logs (these carry no Referer field)
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Literal, Protocol
from urllib.parse import unquote, urlsplit

Format = Literal["combined", "cloudfront", "alb"]
FORMATS: tuple[Format, ...] = ("combined", "cloudfront", "alb")

_QUOTED = r'"([^"\\]*(?:\\.[^"\\]*)*)"'
_COMBINED = re.compile(
    r"^\S+ \S+ \S+ \[([^\]]+)\] " + _QUOTED + r" (\d{3}|-) \S+ " + _QUOTED + " " + _QUOTED
)
_ALB = re.compile(
    r"^[a-z0-9]+ (\d{4}-\d{2}-\d{2}T\S+) \S+ \S+ \S+ \S+ \S+ \S+ (\d{3}|-) \S+ \S+ \S+ "
    r'"([^"]*)" "([^"]*)"'
)
_CLOUDFRONT_DATA = re.compile(r"^\d{4}-\d{2}-\d{2}\t\d{2}:\d{2}:\d{2}\t")
_ESCAPE = re.compile(r"\\(x[0-9a-fA-F]{2}|.)")
_MONTHS = {
    name: number
    for number, name in enumerate(
        ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"),
        start=1,
    )
}

DEFAULT_CLOUDFRONT_FIELDS: tuple[str, ...] = (
    "date", "time", "x-edge-location", "sc-bytes", "c-ip", "cs-method", "cs(Host)",
    "cs-uri-stem", "sc-status", "cs(Referer)", "cs(User-Agent)", "cs-uri-query", "cs(Cookie)",
    "x-edge-result-type", "x-edge-request-id", "x-host-header", "cs-protocol", "cs-bytes",
    "time-taken", "x-forwarded-for", "ssl-protocol", "ssl-cipher",
    "x-edge-response-result-type", "cs-protocol-version", "fle-status", "fle-encrypted-fields",
    "c-port", "time-to-first-byte", "x-edge-detailed-result-type", "sc-content-type",
    "sc-content-len", "sc-range-start", "sc-range-end",
)  # fmt: skip


@dataclass(frozen=True, slots=True)
class LogRecord:
    ts: datetime  # timezone-aware, UTC
    path: str  # no query string or fragment
    status: int  # 0 when the log has none
    ua: str  # "" when absent
    referrer: str  # "" when absent


class UnknownFormatError(ValueError):
    """The first line of a file matched no supported format."""

    def __init__(self, line: str) -> None:
        self.line = line
        super().__init__(f"unrecognised log format; first line was: {line[:300]}")


class MalformedLineError(ValueError):
    """A line in a known format that could not be parsed."""


class LineParser(Protocol):
    def parse(self, line: str) -> LogRecord | None:
        """Return a record, None for lines to ignore, or raise MalformedLineError."""
        ...


def detect(line: str) -> Format:
    """Pick the format from the first non-empty line of a file."""
    text = line.strip()
    if text.startswith(("#Version:", "#Fields:")) or _CLOUDFRONT_DATA.match(text):
        return "cloudfront"
    if _ALB.match(text):
        return "alb"
    if _COMBINED.match(text):
        return "combined"
    raise UnknownFormatError(text)


def make_parser(fmt: Format) -> LineParser:
    if fmt == "combined":
        return CombinedParser()
    if fmt == "cloudfront":
        return CloudFrontParser()
    return AlbParser()


def parse_clf_time(value: str) -> datetime:
    """Parse ``28/Sep/2026:12:00:00 +0200`` to UTC without locale-dependent strptime.

    Cached: real logs repeat the same second across many requests.
    """
    return _parse_clf_time(value)


@lru_cache(maxsize=4096)
def _parse_clf_time(value: str) -> datetime:
    try:
        day, month, rest = value.split("/", 2)
        year, hour, minute, tail = rest.split(":", 3)
        second, offset = tail.split(" ")
        sign = -1 if offset[0] == "-" else 1
        delta = timedelta(hours=int(offset[1:3]), minutes=int(offset[3:5]))
        local = datetime(
            int(year),
            _MONTHS[month],
            int(day),
            int(hour),
            int(minute),
            int(second),
            tzinfo=timezone(sign * delta),
        )
    except (KeyError, ValueError, IndexError) as exc:
        raise MalformedLineError(value) from exc
    return local.astimezone(timezone.utc)


def normalize_path(target: str) -> str:
    """Reduce a request target to its path: drop scheme/host, query string and fragment."""
    if target.startswith(("http://", "https://")):
        try:
            path = urlsplit(target).path
        except ValueError:
            return "-"
    else:
        path = target.split("?", 1)[0].split("#", 1)[0]
    return path or "/"


def _request_path(request: str) -> str:
    parts = request.split(" ")
    return normalize_path(parts[1]) if len(parts) >= 2 else "-"


def _unescape(value: str) -> str:
    """Undo Apache (``\\"``) and nginx (``\\x22``) escaping inside quoted fields."""
    if "\\" not in value:
        return value

    def replace(match: re.Match[str]) -> str:
        escaped = match.group(1)
        if escaped[0] == "x" and len(escaped) == 3:
            return chr(int(escaped[1:], 16))
        return escaped

    return _ESCAPE.sub(replace, value)


def _dash(value: str) -> str:
    return "" if value == "-" else value


def _status(value: str) -> int:
    return int(value) if value.isdigit() else 0


class CombinedParser:
    def parse(self, line: str) -> LogRecord | None:
        match = _COMBINED.match(line)
        if match is None:
            raise MalformedLineError(line)
        time_text, request, status, referrer, ua = match.groups()
        return LogRecord(
            ts=parse_clf_time(time_text),
            path=_request_path(_unescape(request)),
            status=_status(status),
            ua=_dash(_unescape(ua)),
            referrer=_dash(_unescape(referrer)),
        )


class AlbParser:
    def parse(self, line: str) -> LogRecord | None:
        match = _ALB.match(line)
        if match is None:
            raise MalformedLineError(line)
        time_text, status, request, ua = match.groups()
        try:
            ts = datetime.fromisoformat(time_text.replace("Z", "+00:00"))
        except ValueError as exc:
            raise MalformedLineError(line) from exc
        return LogRecord(
            ts=ts.astimezone(timezone.utc),
            path=_request_path(request),
            status=_status(status),
            ua=_dash(ua),
            referrer="",
        )


class CloudFrontParser:
    _NEEDED = ("date", "time", "cs-uri-stem", "sc-status", "cs(Referer)", "cs(User-Agent)")

    def __init__(self) -> None:
        self._columns = self._positions(DEFAULT_CLOUDFRONT_FIELDS)

    @classmethod
    def _positions(cls, fields: Sequence[str]) -> tuple[int, ...]:
        index = {name: i for i, name in enumerate(fields)}
        missing = [name for name in cls._NEEDED if name not in index]
        if missing:
            raise MalformedLineError("#Fields header lacks " + ", ".join(missing))
        return tuple(index[name] for name in cls._NEEDED)

    def parse(self, line: str) -> LogRecord | None:
        if line.startswith("#"):
            if line.startswith("#Fields:"):
                self._columns = self._positions(line[len("#Fields:") :].split())
            return None
        cols = line.split("\t")
        try:
            date, time_text, stem, status, referrer, ua = (cols[i] for i in self._columns)
            ts = datetime.fromisoformat(f"{date}T{time_text}+00:00")
        except (IndexError, ValueError) as exc:
            raise MalformedLineError(line) from exc
        return LogRecord(
            ts=ts,
            # Cut first, then decode: an encoded %3F/%23 in the stem is part of the path.
            path=unquote(normalize_path(stem)),
            status=_status(status),
            ua=_dash(unquote(ua)),
            referrer=_dash(unquote(referrer)),
        )
