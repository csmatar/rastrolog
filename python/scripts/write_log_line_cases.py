"""Regenerate conformance/log_lines.json from the Python line parsers.

The inputs live here; the expectations are whatever the Python parsers do.
Review the diff before committing: the file is the line-level contract the
TypeScript parser in js/core must match (see conformance/README.md).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from rastrolog.formats import MalformedLineError, make_parser

OUT = Path(__file__).resolve().parents[2] / "conformance" / "log_lines.json"
UA = "Mozilla/5.0 (compatible; GPTBot/1.4; +https://openai.com/gptbot)"
REQ = '"GET / HTTP/1.1" 200 5 "-" "x"'

CASES: list[tuple[str, str, list[str]]] = [
    ("combined-basic", "combined", ['203.0.113.9 - - [28/Sep/2026:12:00:00 +0000] "GET /pricing?utm_source=chatgpt.com HTTP/1.1" 200 512 "https://chatgpt.com/" "Mozilla/5.0"']),
    ("combined-offset-fragment-dashes", "combined", ['203.0.113.9 - - [28/Sep/2026:12:00:00 +0530] "GET /a#frag HTTP/1.1" - 0 "-" "-"']),
    ("combined-offset-crosses-year", "combined", ['1.2.3.4 - - [01/Jan/2027:00:30:00 +0100] ' + REQ]),
    ("combined-apache-escaped-quote", "combined", ['1.2.3.4 - - [28/Sep/2026:12:00:00 +0000] "GET / HTTP/1.1" 200 5 "-" "Mozilla \\"quoted\\" x"']),
    ("combined-nginx-hex-escape", "combined", ['1.2.3.4 - - [28/Sep/2026:12:00:00 +0000] "GET / HTTP/1.1" 200 5 "-" "Mozilla \\x22hex\\x22 x"']),
    ("combined-absolute-target", "combined", ['1.2.3.4 - - [28/Sep/2026:12:00:00 +0000] "GET https://example.com/a?b HTTP/1.1" 200 5 "-" "x"']),
    ("combined-no-target", "combined", ['1.2.3.4 - - [28/Sep/2026:12:00:00 +0000] "-" 400 0 "-" "-"']),
    ("combined-unparseable-absolute-target", "combined", ['1.2.3.4 - - [28/Sep/2026:12:00:00 +0000] "GET http://[::1/x HTTP/1.1" 200 5 "-" "x"']),
    ("combined-invalid-date", "combined", ['1.2.3.4 - - [31/Feb/2026:12:00:00 +0000] ' + REQ]),
    ("combined-unknown-month", "combined", ['1.2.3.4 - - [28/Foo/2026:12:00:00 +0000] ' + REQ]),
    ("combined-offset-24h", "combined", ['1.2.3.4 - - [28/Sep/2026:12:00:00 +2400] ' + REQ]),
    ("combined-leading-space", "combined", [' 1.2.3.4 - - [28/Sep/2026:12:00:00 +0000] ' + REQ]),
    ("cloudfront-header-then-encoded-stem", "cloudfront", ["#Version: 1.0", "#Fields: date time cs-uri-stem sc-status cs(Referer) cs(User-Agent)", "2026-09-20\t08:00:00\t/a%3Fb\t200\thttps://claude.ai/\tMozilla/5.0%20(x)"]),
    ("cloudfront-default-fields-invalid-utf8", "cloudfront", ["2026-09-20\t08:00:00\tLAX1\t5\t1.2.3.4\tGET\th\t/caf%C3%A9%FF\t200\t-\tMozilla/5.0\t-"]),
    ("cloudfront-short-line", "cloudfront", ["2026-09-20\t08:00:00\tLAX1"]),
    ("cloudfront-invalid-date", "cloudfront", ["2026-13-01\t08:00:00\tLAX1\t5\t1.2.3.4\tGET\th\t/\t200\t-\tx\t-"]),
    ("cloudfront-header-missing-fields", "cloudfront", ["#Fields: date time sc-status", "2026-09-20\t08:00:00\t200"]),
    ("alb-microseconds", "alb", ['https 2026-09-20T08:00:00.186641Z app/lb/1 1.2.3.4:1 10.0.0.1:80 0.0 0.0 0.0 200 200 1 2 "GET https://www.example.com:443/docs?a=b HTTP/1.1" "' + UA + '" x']),
    ("alb-no-fraction-no-path-dash-status", "alb", ['https 2026-09-20T08:00:00Z app/lb/1 1.2.3.4:1 10.0.0.1:80 0.0 0.0 0.0 - - 1 2 "GET https://www.example.com:443 HTTP/1.1" "-" x']),
    ("alb-invalid-time", "alb", ['https 2026-09-20Tgarbage app/lb/1 1.2.3.4:1 10.0.0.1:80 0.0 0.0 0.0 200 200 1 2 "GET / HTTP/1.1" "x" x']),
]  # fmt: skip


def run(fmt: str, lines: list[str]) -> list[Any]:
    parser = make_parser(fmt)  # type: ignore[arg-type]
    out: list[Any] = []
    for line in lines:
        try:
            record = parser.parse(line)
        except MalformedLineError:
            out.append("malformed")
            continue
        if record is None:
            out.append("ignored")
        else:
            out.append(
                {
                    "ts": record.ts.replace(microsecond=0).isoformat(),
                    "path": record.path,
                    "status": record.status,
                    "ua": record.ua,
                    "referrer": record.referrer,
                }
            )
    return out


def main() -> int:
    cases = [
        {"name": name, "format": fmt, "lines": lines, "expect": run(fmt, lines)}
        for name, fmt, lines in CASES
    ]
    OUT.write_text(json.dumps(cases, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(OUT.parents[1])} ({len(cases)} cases)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
