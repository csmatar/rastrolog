"""Write conformance/logs/{nginx,apache,cloudfront,alb}.log from one event table.

The four files describe the same 14 requests plus one malformed line, so every
format must produce the same report (ALB has no Referer field, so no referrals).
Run after changing EVENTS, then regenerate the golden files with write_golden.py.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

from rastrolog.formats import DEFAULT_CLOUDFRONT_FIELDS

ROOT = Path(__file__).resolve().parents[2]
LOGS = ROOT / "conformance" / "logs"
UA_CASES = json.loads((ROOT / "conformance" / "user_agents.json").read_text(encoding="utf-8"))
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
MALFORMED = "this line is not a valid access log entry"
MALFORMED_AFTER = 7  # insert after the 7th event
QUOTED_UA = 'Mozilla/5.0 (X11; Linux x86_64) "Quoted" Browser/1.0'


def ua(key: str) -> str:
    for case in UA_CASES:
        if case.get("label") == key or (case["expect"] and case["expect"]["id"] == key):
            return str(case["ua"])
    raise KeyError(key)


GPTBOT, CLAUDEBOT = ua("openai-gptbot"), ua("anthropic-claudebot")
CHATGPT_USER, PERPLEXITYBOT = ua("openai-chatgpt-user"), ua("perplexity-perplexitybot")
GOOGLEBOT, BROWSER = ua("google-googlebot"), ua("browser-chrome")

EVENTS: list[tuple[str, str, str, str]] = [
    ("2026-09-20T08:00:00", "/docs", GPTBOT, ""),
    ("2026-09-21T08:00:00", "/pricing", GPTBOT, ""),
    ("2026-09-22T08:00:00", "/docs", GPTBOT, ""),
    ("2026-09-22T09:00:00", "/blog/ai-traffic", CLAUDEBOT, ""),
    ("2026-09-23T09:00:00", "/docs", CLAUDEBOT, ""),
    ("2026-09-23T10:00:00", "/pricing", CHATGPT_USER, ""),
    ("2026-09-24T10:00:00", "/robots.txt", PERPLEXITYBOT, ""),
    ("2026-09-24T11:00:00", "/docs", GOOGLEBOT, ""),
    ("2026-09-25T12:00:00", "/pricing?utm_source=chatgpt.com", BROWSER, "https://chatgpt.com/"),
    ("2026-09-25T13:00:00", "/pricing", BROWSER, "https://chatgpt.com/"),
    ("2026-09-26T12:00:00", "/docs", BROWSER, "https://www.perplexity.ai/search?q=ai+traffic+logs"),
    ("2026-09-26T13:00:00", "/blog/ai-traffic", BROWSER, "https://claude.ai/"),
    ("2026-09-27T12:00:00", "/", BROWSER, "https://www.google.com/"),
    ("2026-09-27T13:00:00", "/", QUOTED_UA, ""),
]


def _ts(text: str) -> datetime:
    return datetime.fromisoformat(text).replace(tzinfo=timezone.utc)


def _clf(ts: datetime, offset_hours: int) -> str:
    local = ts.astimezone(timezone(timedelta(hours=offset_hours)))
    sign = "+" if offset_hours >= 0 else "-"
    return (
        f"{local.day:02d}/{MONTHS[local.month - 1]}/{local.year}:"
        f"{local:%H:%M:%S} {sign}{abs(offset_hours):02d}00"
    )


def _combined(offset_hours: int, quote_escape: str) -> Callable[[datetime, str, str, str], str]:
    def line(ts: datetime, target: str, agent: str, referrer: str) -> str:
        return (
            f'203.0.113.7 - - [{_clf(ts, offset_hours)}] "GET {target} HTTP/1.1" 200 5120 '
            f'"{referrer or "-"}" "{agent.replace(chr(34), quote_escape)}"'
        )

    return line


def _cloudfront(ts: datetime, target: str, agent: str, referrer: str) -> str:
    path, _, query = target.partition("?")
    values = {
        "date": ts.strftime("%Y-%m-%d"),
        "time": ts.strftime("%H:%M:%S"),
        "x-edge-location": "LAX50-C1",
        "sc-bytes": "5120",
        "c-ip": "203.0.113.7",
        "cs-method": "GET",
        "cs(Host)": "d111111abcdef8.cloudfront.net",
        "cs-uri-stem": path,
        "sc-status": "200",
        "cs(Referer)": quote(referrer, safe=":/?=&+") if referrer else "-",
        "cs(User-Agent)": quote(agent, safe="/;:()+,.=@-_"),
        "cs-uri-query": query or "-",
    }
    return "\t".join(values.get(name, "-") for name in DEFAULT_CLOUDFRONT_FIELDS)


def _alb(ts: datetime, target: str, agent: str, referrer: str) -> str:
    iso = ts.strftime("%Y-%m-%dT%H:%M:%S.000000Z")
    return (
        f"https {iso} app/my-lb/50dc6c495c0c9188 203.0.113.7:4321 10.0.0.1:80 "
        f'0.000 0.001 0.000 200 200 120 5120 "GET https://www.example.com:443{target} HTTP/1.1" '
        f'"{agent.replace(chr(34), chr(39))}" ECDHE-RSA-AES128-GCM-SHA256 TLSv1.2 '
        "arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/web/73e2d6bc24d8a067 "
        '"Root=1-67891233-abcdef012345678912345678" "www.example.com" '
        '"arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012" '
        f'0 {iso} "forward" "-" "-" "10.0.0.1:80" "200" "-" "-"'
    )


WRITERS: dict[str, tuple[list[str], Callable[[datetime, str, str, str], str]]] = {
    "nginx": ([], _combined(0, "\\x22")),
    "apache": ([], _combined(-5, '\\"')),
    "cloudfront": (
        ["#Version: 1.0", "#Fields: " + " ".join(DEFAULT_CLOUDFRONT_FIELDS)],
        _cloudfront,
    ),
    "alb": ([], _alb),
}


def main() -> None:
    LOGS.mkdir(parents=True, exist_ok=True)
    for name, (header, write) in WRITERS.items():
        lines = list(header)
        for index, (when, target, agent, referrer) in enumerate(EVENTS, start=1):
            lines.append(write(_ts(when), target, agent, referrer))
            if index == MALFORMED_AFTER:
                lines.append(MALFORMED)
        (LOGS / f"{name}.log").write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"wrote conformance/logs/{name}.log ({len(lines)} lines)")


if __name__ == "__main__":
    main()
