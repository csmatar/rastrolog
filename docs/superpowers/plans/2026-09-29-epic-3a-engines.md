# Epic 3a: In-browser engines (log parser, robots.txt checker) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `js/core` everything the landing page's two tools compute, independent of the visual design:
- **Log parser:** a TypeScript port of the Python log parser and report. It produces byte-identical JSON on every `conformance/logs` golden file, from pasted text or from a streamed (optionally gzipped) file.
- **robots.txt checker:** RFC 9309, returning an allowed / blocked / partial verdict for each of the 28 crawler tokens.
- **Small helpers:** an `llms.txt` summariser and a domain-input normaliser.

**Architecture:** New modules under `js/core/src/logs/` and `js/core/src/robots/`, plus `llms.ts` and `domain.ts`, all exported from `js/core/src/index.ts`.
- **Log parser:** mirrors `python/src/rastrolog/{formats,parse,report}.py` rule for rule, including Python's text semantics (whitespace set, `str.split`, `int`, `urllib.parse.unquote`, universal newlines). A new shared fixture, `conformance/log_lines.json`, pins line-level behaviour in *both* languages.
- **Streaming:** Web Streams (`DecompressionStream`, `TextDecoderStream`), so the same code runs in a browser Web Worker (site plan) and in Node for tests.
- **Codegen:** adds a table of all 28 tokens, including the `robots_only` ones.
- **Snippet:** unchanged. The snippet imports only the classifiers, and `sideEffects: false` lets esbuild drop everything added here.

**Tech Stack:** TypeScript 7 (strict), vitest 5 on Node 24 (Web Streams and `DecompressionStream` built in), Python 3.10+ for the shared fixture generator.

**Spec:** `docs/superpowers/specs/2026-09-28-epic-3-landing-page-design.md` (Domain checker, Log analyzer, Testing) and `conformance/README.md` (the behavioural contract). GitHub epic: #3. Sequencing decided 2026-09-29: this plan runs in parallel with the Phase A design review; the site plan follows the design decision.

## Global Constraints

- Python and TS must pass the same `conformance/` fixtures. Never special-case one language. Every rule below comes from the Python source or from Python's actual output, captured on 2026-09-29.
- The golden reports (`conformance/logs/*.expected.json`) must be reproduced **exactly** by `reportToDict(...)`: same keys, same ordering, and `last_seen` as whole-second UTC with `+00:00`.
- Linear time on hostile input, for log lines and robots.txt alike. Use no regex with nested or overlapping quantifiers on untrusted text. Strip trailing characters with loops, not `/x+$/`.
- `js/core` stays dependency-free at runtime and `sideEffects: false`. The snippet (`dist/snippet.min.js`) must stay ≤ 2 KB gzipped and must not bundle any crawler table. `pnpm --filter rastrolog run test:bundle` enforces the table rule.
- Host nothing: none of these engines makes a network call. Fetching `robots.txt` and `llms.txt` belongs to the site plan; the engines take text.
- Browser code targets ES2020. Scripts run by Node (`scripts/*.ts`) use erasable TypeScript only.
- Work on branch `epic-3a-engines`. `main` is protected. No Claude attribution in commits or PRs.

## Review Focus

These are the failure modes most likely to bite, each pinned by a test in the owning task:

1. **A chunk boundary inside `\r\n`, or a lone `\r` at the end of a chunk.** It must count as one line break, so `lines` matches Python (which uses universal newlines). (Task 4, 1-byte chunks)
2. **A concatenated multi-member `.gz`** (from `cat a.gz b.gz`). Every member must be read, as Python's `GzipFile` does. (Task 4, in Node; browsers get re-checked in the site plan's e2e)
3. **A hostile log line** (a user agent with 50,000 escaped quotes and no closing quote) must be rejected as malformed in linear time. (Task 2)
4. **A hostile robots.txt** (a pattern of 5,000 `*`s against a long path, or a file over 500 KiB) must not freeze the page. (Task 5)
5. **Real-world robots.txt quirks** must parse per RFC 9309:
   - a BOM, CRLF line endings and `#` comments;
   - `USER-AGENT` in upper case and spaces around the colon;
   - `GPTBot/1.0`-style agents (the product token is `GPTBot`);
   - rules before any `User-agent` (ignored);
   - an empty `Disallow:` (allows everything).

   (Task 5)

## Rulings made while planning

- **A new shared fixture, `conformance/log_lines.json`, written by `python/scripts/write_log_line_cases.py`.** The golden reports only cover whole files. Line-level rules also need a contract both languages test, the way `referrers.json` pins `urlsplit`: CLF offsets, invalid dates, escapes, CloudFront headers, absolute targets, `%`-decoding. The expectations are Python's output.
- **Keep the BOM.** `TextDecoderStream` uses `ignoreBOM: true`, so a BOM stays in the text like Python's `encoding="utf-8"`. Python tolerates a BOM on combined and ALB lines only because `\S+` matches U+FEFF; a BOM before `#Version:` is an unknown format in Python, and TS matches that.
- **Timestamps:**
  - The `ts` field is epoch milliseconds (a JS `Date` can't hold microseconds). The report only exposes whole seconds, so nothing observable changes.
  - ALB and CloudFront times accept exactly the ISO form those services write: `YYYY-MM-DDTHH:MM:SS[.1–6 digits]` plus `Z`/`±HH:MM`. Python's `fromisoformat` accepts more on 3.11+ and less on 3.10.
  - Integer fields accept ASCII digits only. Python's `int` also accepts non-ASCII digits, which no log writes.
  - These gaps are documented in `conformance/README.md`.
- **robots.txt agents** use Google's widely deployed product-token rule. The token is the leading run of `[A-Za-z_-]`, compared case-insensitively; groups for the same token are merged; `*` is the fallback. "Partial" means `/` is allowed but at least one `Disallow` path is actually disallowed. Each rule is tested by evaluating a representative path built from its pattern, so a longer `Allow` that overrides it doesn't count.

---

## File structure

```
conformance/log_lines.json                     NEW shared fixture (generated by Python, reviewed)
conformance/README.md                          + "Log line parsing" section
python/scripts/write_log_line_cases.py         NEW generator (inputs live here)
python/tests/test_conformance.py               + test over log_lines.json
js/core/scripts/tables.ts                      + ALL_CRAWLERS table (TokenRow)
js/core/scripts/codegen.ts                     + writes src/tokens.gen.ts
js/core/src/types.ts                           + TokenRow
js/core/src/host.ts                            + urlsplitPath()
js/core/src/logs/errors.ts                     MalformedLineError, UnknownFormatError
js/core/src/logs/pytext.ts                     isPySpace, PY_WS_CLASS, pyStrip, pySplitWs, pySplit, pyInt, pyUnquote
js/core/src/logs/time.ts                       utcMillis, parseClfTime, parseIsoUtc, formatIsoSeconds
js/core/src/logs/formats.ts                    Format, LogRecord, detect, makeParser, normalizePath, 3 parsers
js/core/src/logs/report.ts                     Aggregator, Report, reportToDict, compareCodePoints
js/core/src/logs/session.ts                    LineSplitter, LogSession, parseLogText, ParseOptions, ParseResult
js/core/src/logs/stream.ts                     parseLogStream
js/core/src/robots/parse.ts                    parseRobots, RobotsGroup, RobotsRule, RobotsLine
js/core/src/robots/match.ts                    patternMatches, decide
js/core/src/robots/check.ts                    checkRobots, summarizeByVendor, Verdict, CrawlerVerdict
js/core/src/llms.ts                            summarizeLlmsTxt
js/core/src/domain.ts                          normalizeDomainInput
js/core/src/index.ts                           + exports
js/core/test/{log-lines,pytext,logs-golden,logs-stream,robots,robots-check,llms-domain}.test.ts
```

---

### Task 1: Shared line-level fixture (Python side) and the parsing contract

**Files:**
- Create: `python/scripts/write_log_line_cases.py`, `conformance/log_lines.json` (generated)
- Modify: `python/tests/test_conformance.py`, `conformance/README.md`, `CHANGELOG.md`

**Interfaces:**
- Produces: `conformance/log_lines.json`, a list of `{ "name": str, "format": "combined"|"cloudfront"|"alb", "lines": [str, ...], "expect": [ "ignored" | "malformed" | {"ts": str, "path": str, "status": int, "ua": str, "referrer": str}, ... ] }`. Each case runs its lines through **one** parser instance in order (CloudFront headers are stateful). `ts` is `record.ts.replace(microsecond=0).isoformat()`.

- [ ] **Step 1: Write the failing Python test**

In `python/tests/test_conformance.py`:
- change the `helpers` import to `from helpers import CONFORMANCE, REFERRER_CASES, UA_CASES, load_json`;
- add `from rastrolog.formats import MalformedLineError, make_parser` to the imports at the top, not mid-file (ruff E402);
- then append:

```python
LINE_CASES: list[dict[str, Any]] = load_json(CONFORMANCE / "log_lines.json")


def _run_line_case(case: dict[str, Any]) -> list[Any]:
    parser = make_parser(case["format"])
    got: list[Any] = []
    for line in case["lines"]:
        try:
            record = parser.parse(line)
        except MalformedLineError:
            got.append("malformed")
            continue
        if record is None:
            got.append("ignored")
        else:
            got.append(
                {
                    "ts": record.ts.replace(microsecond=0).isoformat(),
                    "path": record.path,
                    "status": record.status,
                    "ua": record.ua,
                    "referrer": record.referrer,
                }
            )
    return got


@pytest.mark.parametrize("case", LINE_CASES, ids=lambda c: c["name"])
def test_log_line_fixture_parses_as_expected(case: dict[str, Any]) -> None:
    assert _run_line_case(case) == case["expect"]
```

`helpers` already exports `CONFORMANCE` and `load_json`.

Run: `cd python && uv run pytest tests/test_conformance.py -q`
Expected: collection ERROR, with `FileNotFoundError: ... conformance/log_lines.json`.

- [ ] **Step 2: Write the generator**

`python/scripts/write_log_line_cases.py`:

```python
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
```

- [ ] **Step 3: Generate, review, and run the tests**

Run: `cd python && uv run python scripts/write_log_line_cases.py`
Expected: `wrote conformance/log_lines.json (20 cases)`.

Review the file. The `expect` arrays must be exactly these, as captured from Python on 2026-09-29 (in case order):
- `combined-basic`: `/pricing`, status 200, UA `Mozilla/5.0`, referrer `https://chatgpt.com/`, ts `2026-09-28T12:00:00+00:00`.
- `combined-offset-fragment-dashes`: ts `2026-09-28T06:30:00+00:00`, path `/a`, status 0, and empty UA and referrer.
- `combined-offset-crosses-year`: ts `2026-12-31T23:30:00+00:00`.
- `combined-apache-escaped-quote`: UA `Mozilla "quoted" x`.
- `combined-nginx-hex-escape`: UA `Mozilla "hex" x`.
- `combined-absolute-target`: path `/a`.
- `combined-no-target` and `combined-unparseable-absolute-target`: path `-`.
- The next four combined cases: `["malformed"]` each.
- `cloudfront-header-then-encoded-stem`: `["ignored", "ignored", {path "/a?b", ua "Mozilla/5.0 (x)", referrer "https://claude.ai/", status 200, ts "2026-09-20T08:00:00+00:00"}]`.
- `cloudfront-default-fields-invalid-utf8`: path `/café�`.
- `cloudfront-short-line` and `cloudfront-invalid-date`: `["malformed"]`.
- `cloudfront-header-missing-fields`: `["malformed", "malformed"]`.
- `alb-microseconds`: path `/docs`, status 200, ts `2026-09-20T08:00:00+00:00`.
- `alb-no-fraction-no-path-dash-status`: path `/`, status 0, UA empty.
- `alb-invalid-time`: `["malformed"]`.

If anything differs, stop and report; don't hand-edit the JSON.

Run: `cd python && uv run pytest tests/test_conformance.py -q && uv run ruff check . && uv run ruff format --check . && uv run mypy`
Expected: all pass.

- [ ] **Step 4: Document the line-level contract**

In `conformance/README.md`:

1. Add under `## Files`, after the `logs/*.expected.json` bullet:

```markdown
- `log_lines.json`: line-level cases. Each case runs its `lines` through one
  parser of its `format`, in order (CloudFront `#Fields:` headers change the
  parser's state). Each line becomes a record, `"ignored"` (a `#` header), or
  `"malformed"` (counted as skipped). Record `ts` is whole-second UTC like
  `last_seen`. Regenerate with `cd python && uv run python
  scripts/write_log_line_cases.py`; the inputs live in that script.
```

2. Add this section before `### Golden generation parameters`:

```markdown
### Log line parsing

These rules are what `python/src/rastrolog/{formats,parse}.py` does; the TypeScript
port in `js/core/src/logs/` mirrors them.

- **Reading.** gzip is detected by magic bytes (`1f 8b`), not by extension, and
  multi-member gzip files are read to the end. Text is UTF-8 with invalid bytes
  replaced by U+FFFD. A leading BOM is **kept**, as part of the first line.
  Lines end at `\r\n`, `\r` or `\n`. Blank lines (only whitespace) count toward
  `lines` but are otherwise ignored. A truncated or corrupt gzip keeps every
  complete line read so far, drops the partial one, and marks the result
  truncated.
- **Detection.** The first non-blank line, stripped, picks the format:
  - `#Version:`, `#Fields:` or `YYYY-MM-DD<TAB>HH:MM:SS<TAB>` means CloudFront;
  - otherwise the ALB pattern means ALB;
  - otherwise the combined pattern means combined;
  - otherwise it's an unknown format, reported with that line.
- **Whitespace.** "Whitespace" is Python's `str.isspace()` set: `\t`–`\r`,
  `\x1c`–`\x20`, `\x85`, `\xa0`, ` `, ` `–` `, ` `,
  ` `, ` `, ` ` and `　`. It includes `\x1c`–`\x1f` and
  `\x85` and excludes the BOM (U+FEFF), which differs from JavaScript's `\s` and
  `trim()`.
- **Combined.**
  - Quoted fields undo `\"` and `\xHH` escapes. The request target is its second
    space-separated word.
  - The CLF time `DD/Mon/YYYY:HH:MM:SS ±HHMM` must be a real date (31 February is
    malformed), with an offset under 24 hours, converted to UTC.
  - A status of `-` becomes 0, and a `-` referrer or user agent becomes empty.
- **ALB.** The time must be ISO 8601 as ALB writes it
  (`YYYY-MM-DDTHH:MM:SS[.ffffff]Z`). There's no referrer field.
- **CloudFront.** `#Fields:` sets the column positions; if it lacks any of date,
  time, `cs-uri-stem`, `sc-status`, `cs(Referer)` or `cs(User-Agent)`, that
  header line is malformed and the previous positions stay. Before a header,
  the standard 33-column order applies. User agent and referrer are
  percent-decoded (see Path normalisation for the stem).
- **Known gaps between the ports** (never hit by real logs): Python's `int()`
  accepts non-ASCII digits, and Python 3.11+'s `fromisoformat` accepts more ISO
  forms than ALB or CloudFront ever write. The TypeScript port accepts ASCII
  digits and the ALB/CloudFront forms only.
```

Add under `## [Unreleased]` in `CHANGELOG.md` (create an `### Added` heading if there isn't one):

```markdown
- Conformance: `conformance/log_lines.json` pins line-level log parsing (CLF offsets and invalid dates, escapes, CloudFront headers, absolute request targets, percent-decoding) so the TypeScript log parser is held to the same behaviour as Python.
```

- [ ] **Step 5: Commit**

```bash
git add python/scripts/write_log_line_cases.py python/tests/test_conformance.py conformance/log_lines.json conformance/README.md CHANGELOG.md
git commit -m "test(conformance): shared line-level log parsing fixture"
```

---

### Task 2: TS log line parsers (Python text semantics, times, formats)

**Files:**
- Create: `js/core/src/logs/errors.ts`, `js/core/src/logs/pytext.ts`, `js/core/src/logs/time.ts`, `js/core/src/logs/formats.ts`
- Modify: `js/core/src/host.ts` (add `urlsplitPath`)
- Test: `js/core/test/pytext.test.ts`, `js/core/test/log-lines.test.ts`

**Interfaces:**
- Consumes: `conformance/log_lines.json` (Task 1).
- Produces:
  - `isPySpace(code: number): boolean`, `PY_WS_CLASS: string`, `pyStrip(s): string`, `pySplitWs(s): string[]`, `pySplit(s, sep, maxsplit): string[]`, `pyInt(s): number | null`, `pyUnquote(s): string`;
  - `utcMillis(y, mo, d, h, mi, s, micro?): number | null`, `parseClfTime(v): number`, `parseIsoUtc(v): number`, `formatIsoSeconds(ms): string`;
  - `class MalformedLineError`, `class UnknownFormatError { line: string }`;
  - `type Format = "combined" | "cloudfront" | "alb"`, `FORMATS`, `interface LogRecord { ts: number; path: string; status: number; ua: string; referrer: string }`;
  - `interface LineParser { parse(line: string): LogRecord | null }`;
  - `detect(line): Format`, `makeParser(f: Format): LineParser`, `normalizePath(target): string`, `urlsplitPath(url): string | null`.

- [ ] **Step 1: Write the failing tests**

`js/core/test/pytext.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pyInt, pySplit, pySplitWs, pyStrip, pyUnquote } from "../src/logs/pytext.js";
import { formatIsoSeconds, parseClfTime, parseIsoUtc } from "../src/logs/time.js";

// Expected values are Python's own output (3.14), captured 2026-09-29.
describe("pyUnquote mirrors urllib.parse.unquote", () => {
  it.each([
    ["/caf%C3%A9", "/café"],
    ["/a%3Fb", "/a?b"],
    ["%E2%82", "�"],
    ["%F0%9F%98", "�"],
    ["%C3%28", "�("],
    ["%ED%A0%80", "���"],
    ["%zz", "%zz"],
    ["%4", "%4"],
    ["100%", "100%"],
    ["%%41", "%A"],
    ["/é%C3%A9", "/éé"],
    ["a+b", "a+b"],
    ["%EF%BB%BFx", "﻿x"],
    ["%41%42%43", "ABC"],
  ])("%j -> %j", (input, expected) => {
    expect(pyUnquote(input)).toBe(expected);
  });
});

describe("Python whitespace, split and int", () => {
  it.each([
    ["\x1c x \x1f", "x"],
    ["\x85x\xa0", "x"],
    ["﻿x﻿", "﻿x﻿"],
    [" \t\r\n\x0b\x0cx ", "x"],
    [" x　", "x"],
  ])("pyStrip(%j) = %j", (input, expected) => {
    expect(pyStrip(input)).toBe(expected);
  });

  it("pySplitWs is str.split()", () => {
    expect(pySplitWs("  date\ttime  cs-uri-stem \x1c x ")).toEqual(["date", "time", "cs-uri-stem", "x"]);
    expect(pySplitWs("   ")).toEqual([]);
  });

  it("pySplit keeps the remainder like str.split(sep, maxsplit)", () => {
    expect(pySplit("28/Sep/2026:12:00:00 +0000", "/", 2)).toEqual(["28", "Sep", "2026:12:00:00 +0000"]);
    expect(pySplit("a", "/", 2)).toEqual(["a"]);
  });

  it.each([
    ["08", 8],
    [" 8 ", 8],
    ["+5", 5],
    ["-0", 0],
    ["1_0", 10],
    ["1__0", null],
    ["", null],
    ["0x10", null],
  ])("pyInt(%j) = %j", (input, expected) => {
    expect(pyInt(input)).toBe(expected);
  });
});

describe("times", () => {
  it("CLF with an offset converts to UTC", () => {
    expect(formatIsoSeconds(parseClfTime("28/Sep/2026:12:00:00 +0530"))).toBe("2026-09-28T06:30:00+00:00");
  });

  it.each(["31/Feb/2026:12:00:00 +0000", "28/Foo/2026:12:00:00 +0000", "28/Sep/2026:12:00:00 +2400", "28/Sep/2026:12:00:00", "28/Sep/2026:24:00:00 +0000"])(
    "CLF %j is malformed",
    (value) => {
      expect(() => parseClfTime(value)).toThrow("malformed");
    },
  );

  it("ISO with microseconds truncates to whole seconds", () => {
    expect(formatIsoSeconds(parseIsoUtc("2026-09-20T08:15:30.999999+00:00"))).toBe("2026-09-20T08:15:30+00:00");
  });

  it("years below 1000 keep four digits, like isoformat()", () => {
    expect(formatIsoSeconds(parseIsoUtc("0999-01-02T03:04:05+00:00"))).toBe("0999-01-02T03:04:05+00:00");
  });
});
```

`js/core/test/log-lines.test.ts`:

```ts
// The shared line-level contract: conformance/log_lines.json (generated from Python).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MalformedLineError } from "../src/logs/errors.js";
import { detect, type Format, makeParser } from "../src/logs/formats.js";
import { formatIsoSeconds } from "../src/logs/time.js";

interface LineCase {
  name: string;
  format: Format;
  lines: string[];
  expect: unknown[];
}

const CASES = JSON.parse(
  readFileSync(new URL("../../../conformance/log_lines.json", import.meta.url), "utf8"),
) as LineCase[];

function run(c: LineCase): unknown[] {
  const parser = makeParser(c.format);
  return c.lines.map((line) => {
    try {
      const r = parser.parse(line);
      return r === null
        ? "ignored"
        : { ts: formatIsoSeconds(r.ts), path: r.path, status: r.status, ua: r.ua, referrer: r.referrer };
    } catch (err) {
      if (err instanceof MalformedLineError) return "malformed";
      throw err;
    }
  });
}

describe("log_lines.json", () => {
  it.each(CASES)("$name", (c) => {
    expect(run(c)).toEqual(c.expect);
  });
});

describe("detect", () => {
  it.each([
    ["#Version: 1.0", "cloudfront"],
    ["  #Fields: date time", "cloudfront"],
    ["2026-09-20\t08:00:00\tLAX1", "cloudfront"],
    ['https 2026-09-20T08:00:00Z a b c d e f 200 200 1 2 "GET / HTTP/1.1" "x" y', "alb"],
    ['1.2.3.4 - - [28/Sep/2026:12:00:00 +0000] "GET / HTTP/1.1" 200 5 "-" "x"', "combined"],
  ])("%j -> %s", (line, format) => {
    expect(detect(line)).toBe(format);
  });

  it("an unknown first line is reported", () => {
    expect(() => detect("hello world")).toThrow("unrecognised log format; first line was: hello world");
  });
});

describe("hostile input (Review Focus 3)", () => {
  it("an unterminated user agent full of escapes is malformed in linear time", () => {
    const line = `1.2.3.4 - - [28/Sep/2026:12:00:00 +0000] "GET / HTTP/1.1" 200 5 "-" "${'\\"'.repeat(50_000)}`;
    const started = performance.now();
    expect(() => makeParser("combined").parse(line)).toThrow(MalformedLineError);
    expect(performance.now() - started).toBeLessThan(200);
  });
});
```

Run: `cd js && pnpm --filter @rastrolog/core exec vitest run test/pytext.test.ts test/log-lines.test.ts`
Expected: FAIL with `Cannot find module '../src/logs/pytext.js'`.

- [ ] **Step 2: Implement `errors.ts`, `pytext.ts` and `time.ts`**

`js/core/src/logs/errors.ts`:

```ts
/** A line in a known format that could not be parsed (counted as skipped). */
export class MalformedLineError extends Error {
  constructor(line: string) {
    super(`malformed line: ${line.slice(0, 300)}`);
    this.name = "MalformedLineError";
  }
}

/** The first non-blank line matched no supported format. */
export class UnknownFormatError extends Error {
  readonly line: string;
  constructor(line: string) {
    super(`unrecognised log format; first line was: ${line.slice(0, 300)}`);
    this.name = "UnknownFormatError";
    this.line = line;
  }
}
```

`js/core/src/logs/pytext.ts`:

```ts
// Python's text semantics, which python/src/rastrolog/formats.py relies on and
// the TypeScript port must reproduce exactly (conformance/README.md).

/** Python's str.isspace(): the set str.strip(), str.split() and re's \s use. */
export function isPySpace(code: number): boolean {
  return (
    (code >= 0x09 && code <= 0x0d) ||
    (code >= 0x1c && code <= 0x20) ||
    code === 0x85 ||
    code === 0xa0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000
  );
}

/** The same set as a regex character-class body. */
export const PY_WS_CLASS =
  "\\t-\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";

/** str.strip(): loops, not /\s+$/, which is quadratic on long whitespace runs. */
export function pyStrip(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && isPySpace(s.charCodeAt(start))) start++;
  while (end > start && isPySpace(s.charCodeAt(end - 1))) end--;
  return s.slice(start, end);
}

/** str.split() with no arguments. */
export function pySplitWs(s: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && isPySpace(s.charCodeAt(i))) i++;
    const start = i;
    while (i < s.length && !isPySpace(s.charCodeAt(i))) i++;
    if (i > start) out.push(s.slice(start, i));
  }
  return out;
}

/** str.split(sep, maxsplit): the remainder stays in the last part. */
export function pySplit(s: string, sep: string, maxsplit: number): string[] {
  const out: string[] = [];
  let rest = s;
  while (out.length < maxsplit) {
    const at = rest.indexOf(sep);
    if (at < 0) break;
    out.push(rest.slice(0, at));
    rest = rest.slice(at + sep.length);
  }
  out.push(rest);
  return out;
}

const INT = /^[+-]?[0-9]+(?:_[0-9]+)*$/;

/** int(s) for ASCII digits; null where Python raises ValueError. */
export function pyInt(s: string): number | null {
  const t = pyStrip(s);
  return INT.test(t) ? Number(t.replace(/_/g, "")) : null;
}

// Not fatal: invalid bytes become U+FFFD, like errors="replace". ignoreBOM keeps
// an encoded BOM, like Python's utf-8 codec.
const UTF8 = new TextDecoder("utf-8", { ignoreBOM: true });

function isHex(c: number): boolean {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
}

function unquoteAsciiRun(run: string): string {
  if (!run.includes("%")) return run;
  const bytes: number[] = [];
  for (let i = 0; i < run.length; i++) {
    const c = run.charCodeAt(i);
    if (c === 37 && i + 2 < run.length && isHex(run.charCodeAt(i + 1)) && isHex(run.charCodeAt(i + 2))) {
      bytes.push(Number.parseInt(run.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(c);
    }
  }
  return UTF8.decode(new Uint8Array(bytes));
}

/** urllib.parse.unquote: each ASCII run's %XX escapes decode as UTF-8; invalid escapes stay. */
export function pyUnquote(s: string): string {
  return s.includes("%") ? s.replace(/[\x00-\x7f]+/g, unquoteAsciiRun) : s;
}
```

`js/core/src/logs/time.ts`:

```ts
import { MalformedLineError } from "./errors.js";
import { pyInt, pySplit } from "./pytext.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Python's datetime(...) range checks; epoch ms of those UTC fields, or null. */
export function utcMillis(y: number, mo: number, d: number, h: number, mi: number, s: number, micro = 0): number | null {
  if (y < 1 || y > 9999 || mo < 1 || mo > 12) return null;
  const dim = mo === 2 && isLeap(y) ? 29 : (DAYS[mo - 1] ?? 0);
  if (d < 1 || d > dim || h < 0 || h > 23 || mi < 0 || mi > 59 || s < 0 || s > 59) return null;
  const date = new Date(0);
  date.setUTCFullYear(y, mo - 1, d);
  date.setUTCHours(h, mi, s, Math.floor(micro / 1000));
  return date.getTime();
}

function fail(value: string): never {
  throw new MalformedLineError(value);
}

/** parse_clf_time: "28/Sep/2026:12:00:00 +0200" -> epoch ms (UTC). */
export function parseClfTime(value: string): number {
  const dmy = pySplit(value, "/", 2);
  if (dmy.length !== 3) fail(value);
  const [day = "", month = "", rest = ""] = dmy;
  const hms = pySplit(rest, ":", 3);
  if (hms.length !== 4) fail(value);
  const [year = "", hour = "", minute = "", tail = ""] = hms;
  const tailParts = tail.split(" ");
  if (tailParts.length !== 2) fail(value);
  const [second = "", offset = ""] = tailParts;
  if (offset === "") fail(value);
  const sign = offset[0] === "-" ? -1 : 1;
  const oh = pyInt(offset.slice(1, 3));
  const om = pyInt(offset.slice(3, 5));
  const mo = MONTHS.indexOf(month) + 1;
  const fields = [pyInt(year), pyInt(day), pyInt(hour), pyInt(minute), pyInt(second)];
  if (oh === null || om === null || mo === 0 || fields.some((f) => f === null)) fail(value);
  const offsetMinutes = oh * 60 + om;
  if (Math.abs(offsetMinutes) >= 1440) fail(value); // timezone() must be strictly within ±24h
  const [y, d, h, mi, s] = fields as number[];
  const local = utcMillis(y ?? 0, mo, d ?? 0, h ?? 0, mi ?? 0, s ?? 0);
  if (local === null) fail(value);
  const utc = local - sign * offsetMinutes * 60_000;
  const year4 = new Date(utc).getUTCFullYear();
  if (year4 < 1 || year4 > 9999) fail(value);
  return utc;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?([+-])(\d{2}):(\d{2})$/;

/** The ISO 8601 forms ALB and CloudFront write (after "Z" -> "+00:00") -> epoch ms. */
export function parseIsoUtc(value: string): number {
  const m = ISO.exec(value);
  if (m === null) fail(value);
  const n = (i: number) => Number(m[i] ?? "0");
  const micro = Number((m[7] ?? "").padEnd(6, "0") || "0");
  const local = utcMillis(n(1), n(2), n(3), n(4), n(5), n(6), micro);
  const offsetMinutes = n(9) * 60 + n(10);
  if (local === null || offsetMinutes >= 1440) fail(value);
  return local - (m[8] === "-" ? -1 : 1) * offsetMinutes * 60_000;
}

/** Whole-second UTC as Python's datetime.replace(microsecond=0).isoformat(). */
export function formatIsoSeconds(ms: number): string {
  return `${new Date(Math.floor(ms / 1000) * 1000).toISOString().slice(0, 19)}+00:00`;
}
```

- [ ] **Step 3: Implement `urlsplitPath` and `formats.ts`**

Append to `js/core/src/host.ts`:

```ts
/**
 * The path of an absolute URL as urllib.parse.urlsplit(url).path reads it, or
 * null where urlsplit raises (unbalanced IPv6 brackets).
 */
export function urlsplitPath(url: string): string | null {
  const s = url.replace(/[\t\r\n]/g, "");
  const scheme = SCHEME.exec(s);
  let rest = scheme ? s.slice(scheme[0].length) : s;
  if (rest.startsWith("//")) {
    const authorityEnd = rest.slice(2).search(/[/?#]/);
    const netloc = authorityEnd < 0 ? rest.slice(2) : rest.slice(2, 2 + authorityEnd);
    if (netloc.includes("[") !== netloc.includes("]")) return null;
    rest = authorityEnd < 0 ? "" : rest.slice(2 + authorityEnd);
  }
  return rest.split(/[?#]/, 1)[0] ?? "";
}
```

`js/core/src/logs/formats.ts`:

```ts
// Port of python/src/rastrolog/formats.py. Rules: conformance/README.md -> Log line parsing.
import { urlsplitPath } from "../host.js";
import { MalformedLineError, UnknownFormatError } from "./errors.js";
import { PY_WS_CLASS, pySplitWs, pyStrip, pyUnquote } from "./pytext.js";
import { parseClfTime, parseIsoUtc } from "./time.js";

export type Format = "combined" | "cloudfront" | "alb";
export const FORMATS: readonly Format[] = ["combined", "cloudfront", "alb"];

export interface LogRecord {
  /** Epoch milliseconds, UTC. */
  ts: number;
  /** No query string or fragment. */
  path: string;
  /** 0 when the log has none. */
  status: number;
  /** "" when absent. */
  ua: string;
  /** "" when absent. */
  referrer: string;
}

export interface LineParser {
  /** A record, null for a line to ignore, or throws MalformedLineError. */
  parse(line: string): LogRecord | null;
}

const NS = `[^${PY_WS_CLASS}]`; // Python's \S
// Python: "([^"\\]*(?:\\.[^"\\]*)*)" with "." = any character but "\n".
const QUOTED = '"([^"\\\\]*(?:\\\\[^\\n][^"\\\\]*)*)"';
const COMBINED = new RegExp(
  `^${NS}+ ${NS}+ ${NS}+ \\[([^\\]]+)\\] ${QUOTED} (\\d{3}|-) ${NS}+ ${QUOTED} ${QUOTED}`,
);
const ALB = new RegExp(
  `^[a-z0-9]+ (\\d{4}-\\d{2}-\\d{2}T${NS}+)${` ${NS}+`.repeat(6)} (\\d{3}|-)${` ${NS}+`.repeat(3)} "([^"]*)" "([^"]*)"`,
);
const CLOUDFRONT_DATA = /^\d{4}-\d{2}-\d{2}\t\d{2}:\d{2}:\d{2}\t/;
const ESCAPE = /\\(x[0-9a-fA-F]{2}|[^\n])/g;

export const DEFAULT_CLOUDFRONT_FIELDS: readonly string[] = [
  "date", "time", "x-edge-location", "sc-bytes", "c-ip", "cs-method", "cs(Host)",
  "cs-uri-stem", "sc-status", "cs(Referer)", "cs(User-Agent)", "cs-uri-query", "cs(Cookie)",
  "x-edge-result-type", "x-edge-request-id", "x-host-header", "cs-protocol", "cs-bytes",
  "time-taken", "x-forwarded-for", "ssl-protocol", "ssl-cipher",
  "x-edge-response-result-type", "cs-protocol-version", "fle-status", "fle-encrypted-fields",
  "c-port", "time-to-first-byte", "x-edge-detailed-result-type", "sc-content-type",
  "sc-content-len", "sc-range-start", "sc-range-end",
];

/** Pick the format from the first non-blank line of a file. */
export function detect(line: string): Format {
  const text = pyStrip(line);
  if (text.startsWith("#Version:") || text.startsWith("#Fields:") || CLOUDFRONT_DATA.test(text)) {
    return "cloudfront";
  }
  if (ALB.test(text)) return "alb";
  if (COMBINED.test(text)) return "combined";
  throw new UnknownFormatError(text);
}

/** Drop scheme/host, query string and fragment. */
export function normalizePath(target: string): string {
  let path: string;
  if (target.startsWith("http://") || target.startsWith("https://")) {
    const p = urlsplitPath(target);
    if (p === null) return "-";
    path = p;
  } else {
    path = (target.split("?", 1)[0] ?? "").split("#", 1)[0] ?? "";
  }
  return path || "/";
}

function requestPath(request: string): string {
  const parts = request.split(" ");
  return parts.length >= 2 ? normalizePath(parts[1] ?? "") : "-";
}

/** Undo Apache (\") and nginx (\xHH) escaping inside quoted fields. */
function unescape(value: string): string {
  if (!value.includes("\\")) return value;
  return value.replace(ESCAPE, (_m, esc: string) =>
    esc.length === 3 && esc[0] === "x" ? String.fromCharCode(Number.parseInt(esc.slice(1), 16)) : esc,
  );
}

const dash = (v: string) => (v === "-" ? "" : v);
const status = (v: string) => (/^[0-9]+$/.test(v) ? Number(v) : 0);

class CombinedParser implements LineParser {
  parse(line: string): LogRecord | null {
    const m = COMBINED.exec(line);
    if (m === null) throw new MalformedLineError(line);
    const [, time = "", request = "", code = "", referrer = "", ua = ""] = m;
    return {
      ts: parseClfTime(time),
      path: requestPath(unescape(request)),
      status: status(code),
      ua: dash(unescape(ua)),
      referrer: dash(unescape(referrer)),
    };
  }
}

class AlbParser implements LineParser {
  parse(line: string): LogRecord | null {
    const m = ALB.exec(line);
    if (m === null) throw new MalformedLineError(line);
    const [, time = "", code = "", request = "", ua = ""] = m;
    return {
      ts: parseIsoUtc(time.replace(/Z/g, "+00:00")),
      path: requestPath(request),
      status: status(code),
      ua: dash(ua),
      referrer: "",
    };
  }
}

const NEEDED = ["date", "time", "cs-uri-stem", "sc-status", "cs(Referer)", "cs(User-Agent)"] as const;

function positions(fields: readonly string[]): number[] {
  const index = new Map<string, number>();
  fields.forEach((name, i) => {
    index.set(name, i);
  });
  const missing = NEEDED.filter((name) => !index.has(name));
  if (missing.length > 0) throw new MalformedLineError(`#Fields header lacks ${missing.join(", ")}`);
  return NEEDED.map((name) => index.get(name) ?? -1);
}

class CloudFrontParser implements LineParser {
  private columns = positions(DEFAULT_CLOUDFRONT_FIELDS);

  parse(line: string): LogRecord | null {
    if (line.startsWith("#")) {
      if (line.startsWith("#Fields:")) this.columns = positions(pySplitWs(line.slice("#Fields:".length)));
      return null;
    }
    const cols = line.split("\t");
    const values = this.columns.map((i) => cols[i]);
    if (values.some((v) => v === undefined)) throw new MalformedLineError(line);
    const [date = "", time = "", stem = "", code = "", referrer = "", ua = ""] = values as string[];
    return {
      ts: parseIsoUtc(`${date}T${time}+00:00`),
      // Cut first, then decode: an encoded %3F/%23 in the stem is part of the path.
      path: pyUnquote(normalizePath(stem)),
      status: status(code),
      ua: dash(pyUnquote(ua)),
      referrer: dash(pyUnquote(referrer)),
    };
  }
}

export function makeParser(format: Format): LineParser {
  if (format === "combined") return new CombinedParser();
  if (format === "cloudfront") return new CloudFrontParser();
  return new AlbParser();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd js && pnpm --filter @rastrolog/core run test && pnpm run typecheck && pnpm run format && pnpm run lint`
Expected: every case of `log_lines.json` passes, and `pytext` and `detect` pass. The hostile line is rejected in under 200 ms, and lint is clean. If a `log_lines.json` case fails, fix the TS until it matches Python; never edit the JSON.

- [ ] **Step 5: Commit**

```bash
git add js/core/src/host.ts js/core/src/logs js/core/test/pytext.test.ts js/core/test/log-lines.test.ts
git commit -m "feat(js): log line parsers matching Python's formats line for line"
```

---

### Task 3: Report aggregation and text parsing, matching the golden reports

**Files:**
- Create: `js/core/src/logs/report.ts`, `js/core/src/logs/session.ts`
- Test: `js/core/test/logs-golden.test.ts`

**Interfaces:**
- Consumes: `LogRecord`, `makeParser`, `detect`, `MalformedLineError` (Task 2); `classifyUserAgent`, `classifyReferrer` and `Match` (existing core).
- Produces:
  - `compareCodePoints(a, b): number`;
  - `class Aggregator { constructor(opts?: { ownHost?: string | null }); add(r: LogRecord): void; result(opts?: { top?: number; skipped?: number }): Report }`;
  - `interface Report { records; skipped; crawlers: CrawlerRow[]; referrals: ReferralRow[]; pages: PageRow[] }`;
  - `reportToDict(r: Report): ReportDict` (exact golden JSON shape);
  - `class LineSplitter { push(chunk, emit): void; end(emit): void }`;
  - `class LogSession { consume(line): void; truncated: boolean; result(): ParseResult }`;
  - `interface ParseOptions { format?: Format | undefined; ownHost?: string | null | undefined; top?: number | undefined }`;
  - `interface ParseResult { report: Report; format: Format | null; lines: number; records: number; skipped: number; truncated: boolean }`;
  - `parseLogText(text: string, options?: ParseOptions): ParseResult`.

- [ ] **Step 1: Write the failing golden test**

`js/core/test/logs-golden.test.ts`:

```ts
// The whole-file contract: every conformance/logs/*.log must aggregate to its
// .expected.json exactly (top=10, no own host), like Python's write_golden.py.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Aggregator, compareCodePoints, reportToDict } from "../src/logs/report.js";
import { parseLogText } from "../src/logs/session.js";

const LOGS = new URL("../../../conformance/logs/", import.meta.url);
const NAMES = readdirSync(LOGS)
  .filter((f) => f.endsWith(".log"))
  .map((f) => f.slice(0, -4))
  .sort();

describe("golden reports", () => {
  it("finds every fixture", () => {
    expect(NAMES).toEqual(["alb", "alb-microseconds", "apache", "cloudfront", "cloudfront-encoded-stem", "nginx"]);
  });

  it.each(NAMES)("%s", (name) => {
    const text = readFileSync(new URL(`${name}.log`, LOGS), "utf8");
    const expected = JSON.parse(readFileSync(new URL(`${name}.expected.json`, LOGS), "utf8"));
    expect(reportToDict(parseLogText(text).report)).toEqual(expected);
  });

  it("reports what it read", () => {
    const text = readFileSync(new URL("nginx.log", LOGS), "utf8");
    const { format, records, skipped, truncated } = parseLogText(text);
    expect({ format, records, skipped, truncated }).toEqual({ format: "combined", records: 14, skipped: 1, truncated: false });
  });
});

describe("own host", () => {
  it("a referral from the site's own host is not a referral", () => {
    const aggregator = new Aggregator({ ownHost: "chatgpt.com" });
    aggregator.add({ ts: 0, path: "/", status: 200, ua: "Mozilla/5.0", referrer: "https://www.chatgpt.com/" });
    expect(aggregator.result().referrals).toEqual([]);
  });
});

describe("compareCodePoints", () => {
  it("orders by Unicode code point, not UTF-16 unit", () => {
    // U+FF5E (BMP) sorts before U+1F600 by code point; UTF-16 "<" says the opposite.
    expect(["/\u{1F600}", "/～"].sort(compareCodePoints)).toEqual(["/～", "/\u{1F600}"]);
    expect(compareCodePoints("/a", "/a")).toBe(0);
    expect(compareCodePoints("/a", "/ab")).toBeLessThan(0);
  });
});
```

Run: `cd js && pnpm --filter @rastrolog/core exec vitest run test/logs-golden.test.ts`
Expected: FAIL with `Cannot find module '../src/logs/report.js'`.

- [ ] **Step 2: Implement `report.ts`**

`js/core/src/logs/report.ts`:

```ts
// Port of python/src/rastrolog/report.py; output shape: conformance/README.md.
import { classifyReferrer } from "../referrer.js";
import type { Match } from "../types.js";
import { classifyUserAgent } from "../userAgent.js";
import type { LogRecord } from "./formats.js";
import { formatIsoSeconds } from "./time.js";

export type PageCount = readonly [path: string, count: number];

export interface CrawlerRow {
  id: string;
  vendor: string;
  vendorName: string;
  token: string;
  purpose: string;
  aiSpecific: boolean;
  requests: number;
  uniquePages: number;
  lastSeen: number;
  topPages: PageCount[];
}

export interface ReferralRow {
  id: string;
  vendor: string;
  vendorName: string;
  product: string;
  visits: number;
  uniquePages: number;
  lastSeen: number;
  topPages: PageCount[];
}

export interface PageRow {
  path: string;
  crawlerRequests: number;
  referralVisits: number;
  crawlers: PageCount[];
  referrals: PageCount[];
}

export interface Report {
  records: number;
  skipped: number;
  crawlers: CrawlerRow[];
  referrals: ReferralRow[];
  pages: PageRow[];
}

/** Code-point string order (Python's str <), unlike UTF-16 "<" outside the BMP. */
export function compareCodePoints(a: string, b: string): number {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const ca = a.codePointAt(i) ?? 0;
    const cb = b.codePointAt(j) ?? 0;
    if (ca !== cb) return ca < cb ? -1 : 1;
    i += ca > 0xffff ? 2 : 1;
    j += cb > 0xffff ? 2 : 1;
  }
  return i < a.length ? 1 : j < b.length ? -1 : 0;
}

function top(counter: Map<string, number>, limit: number): PageCount[] {
  return [...counter.entries()]
    .sort((x, y) => y[1] - x[1] || compareCodePoints(x[0], y[0]))
    .slice(0, limit);
}

interface Tally {
  match: Match;
  count: number;
  pages: Map<string, number>;
  lastSeen: number;
}

function bump(counter: Map<string, number>, key: string): void {
  counter.set(key, (counter.get(key) ?? 0) + 1);
}

export class Aggregator {
  records = 0;
  private readonly ownHost: string | null;
  private readonly crawlers = new Map<string, Tally>();
  private readonly referrals = new Map<string, Tally>();
  private readonly pageCrawlers = new Map<string, Map<string, number>>();
  private readonly pageReferrals = new Map<string, Map<string, number>>();

  constructor(options: { ownHost?: string | null | undefined } = {}) {
    this.ownHost = options.ownHost ?? null;
  }

  add(record: LogRecord): void {
    this.records++;
    const crawler = classifyUserAgent(record.ua);
    if (crawler !== null) {
      this.tally(this.crawlers, crawler, record);
      if (crawler.aiSpecific) {
        const counts = this.pageCrawlers.get(record.path) ?? new Map<string, number>();
        this.pageCrawlers.set(record.path, counts);
        bump(counts, crawler.token ?? crawler.id);
      }
      return;
    }
    const referral = classifyReferrer(record.referrer, { ownHost: this.ownHost });
    if (referral !== null) {
      this.tally(this.referrals, referral, record);
      const counts = this.pageReferrals.get(record.path) ?? new Map<string, number>();
      this.pageReferrals.set(record.path, counts);
      bump(counts, referral.product ?? referral.id);
    }
  }

  private tally(bucket: Map<string, Tally>, match: Match, record: LogRecord): void {
    const t = bucket.get(match.id) ?? { match, count: 0, pages: new Map<string, number>(), lastSeen: record.ts };
    bucket.set(match.id, t);
    t.count++;
    bump(t.pages, record.path);
    if (record.ts > t.lastSeen) t.lastSeen = record.ts;
  }

  result(options: { top?: number | undefined; skipped?: number | undefined } = {}): Report {
    const limit = options.top ?? 10;
    const byId = (a: { id: string }, b: { id: string }) => compareCodePoints(a.id, b.id);
    const crawlers = [...this.crawlers.values()]
      .map((t): CrawlerRow => ({
        id: t.match.id,
        vendor: t.match.vendor,
        vendorName: t.match.vendorName,
        token: t.match.token ?? t.match.id,
        purpose: t.match.purpose ?? "",
        aiSpecific: t.match.aiSpecific,
        requests: t.count,
        uniquePages: t.pages.size,
        lastSeen: t.lastSeen,
        topPages: top(t.pages, limit),
      }))
      .sort((a, b) => b.requests - a.requests || byId(a, b));
    const referrals = [...this.referrals.values()]
      .map((t): ReferralRow => ({
        id: t.match.id,
        vendor: t.match.vendor,
        vendorName: t.match.vendorName,
        product: t.match.product ?? t.match.id,
        visits: t.count,
        uniquePages: t.pages.size,
        lastSeen: t.lastSeen,
        topPages: top(t.pages, limit),
      }))
      .sort((a, b) => b.visits - a.visits || byId(a, b));
    const paths = new Set([...this.pageCrawlers.keys(), ...this.pageReferrals.keys()]);
    const pages = [...paths]
      .map((path): PageRow => {
        const c = this.pageCrawlers.get(path) ?? new Map<string, number>();
        const r = this.pageReferrals.get(path) ?? new Map<string, number>();
        const sum = (m: Map<string, number>) => [...m.values()].reduce((x, y) => x + y, 0);
        return { path, crawlerRequests: sum(c), referralVisits: sum(r), crawlers: top(c, c.size), referrals: top(r, r.size) };
      })
      .sort(
        (a, b) =>
          b.crawlerRequests + b.referralVisits - (a.crawlerRequests + a.referralVisits) ||
          compareCodePoints(a.path, b.path),
      )
      .slice(0, limit);
    return { records: this.records, skipped: options.skipped ?? 0, crawlers, referrals, pages };
  }
}

const pageList = (pages: PageCount[]) => pages.map(([path, count]) => ({ path, count }));

/** Exactly Report.to_dict() in Python: the golden-file JSON. */
export function reportToDict(r: Report) {
  return {
    summary: {
      records: r.records,
      skipped: r.skipped,
      ai_crawler_requests: r.crawlers.filter((c) => c.aiSpecific).reduce((n, c) => n + c.requests, 0),
      ai_referral_visits: r.referrals.reduce((n, c) => n + c.visits, 0),
    },
    crawlers: r.crawlers.map((c) => ({
      id: c.id,
      vendor: c.vendor,
      vendor_name: c.vendorName,
      token: c.token,
      purpose: c.purpose,
      ai_specific: c.aiSpecific,
      requests: c.requests,
      unique_pages: c.uniquePages,
      last_seen: formatIsoSeconds(c.lastSeen),
      top_pages: pageList(c.topPages),
    })),
    referrals: r.referrals.map((c) => ({
      id: c.id,
      vendor: c.vendor,
      vendor_name: c.vendorName,
      product: c.product,
      visits: c.visits,
      unique_pages: c.uniquePages,
      last_seen: formatIsoSeconds(c.lastSeen),
      top_pages: pageList(c.topPages),
    })),
    pages: r.pages.map((p) => ({
      path: p.path,
      crawler_requests: p.crawlerRequests,
      referral_visits: p.referralVisits,
      crawlers: p.crawlers.map(([token, count]) => ({ token, count })),
      referrals: p.referrals.map(([product, count]) => ({ product, count })),
    })),
  };
}

export type ReportDict = ReturnType<typeof reportToDict>;
```

- [ ] **Step 3: Implement `session.ts`**

`js/core/src/logs/session.ts`:

```ts
// Port of python/src/rastrolog/parse.py's loop: universal newlines, blank lines,
// detection on the first non-blank line, malformed lines counted as skipped.
import { MalformedLineError } from "./errors.js";
import { detect, type Format, type LineParser, makeParser } from "./formats.js";
import { pyStrip } from "./pytext.js";
import { Aggregator, type Report } from "./report.js";

export interface ParseOptions {
  /** Skip detection (the user picked a format after an unknown-format error). */
  format?: Format | undefined;
  ownHost?: string | null | undefined;
  top?: number | undefined;
}

export interface ParseResult {
  report: Report;
  format: Format | null;
  lines: number;
  records: number;
  skipped: number;
  truncated: boolean;
}

/** Splits text into lines at \r\n, \r or \n, across chunk boundaries. */
export class LineSplitter {
  private buffer = "";
  private skipLf = false;

  push(chunk: string, emit: (line: string) => void): void {
    let text = chunk;
    if (this.skipLf) {
      this.skipLf = false;
      if (text.startsWith("\n")) text = text.slice(1);
    }
    const data = this.buffer + text;
    let start = 0;
    for (let i = 0; i < data.length; i++) {
      const c = data.charCodeAt(i);
      if (c !== 10 && c !== 13) continue;
      emit(data.slice(start, i));
      if (c === 13) {
        if (i + 1 < data.length) {
          if (data.charCodeAt(i + 1) === 10) i++;
        } else {
          this.skipLf = true; // a "\n" at the start of the next chunk belongs to this "\r"
        }
      }
      start = i + 1;
    }
    this.buffer = data.slice(start);
  }

  end(emit: (line: string) => void): void {
    if (this.buffer !== "") emit(this.buffer);
    this.buffer = "";
  }
}

export class LogSession {
  lines = 0;
  records = 0;
  skipped = 0;
  truncated = false;
  format: Format | null = null;
  private parser: LineParser | null = null;
  private readonly aggregator: Aggregator;
  private readonly options: ParseOptions;

  constructor(options: ParseOptions = {}) {
    this.options = options;
    this.aggregator = new Aggregator({ ownHost: options.ownHost });
  }

  /** One line without its terminator. Throws UnknownFormatError on an unknown first line. */
  consume(line: string): void {
    this.lines++;
    if (pyStrip(line) === "") return;
    if (this.parser === null) {
      this.format = this.options.format ?? detect(line);
      this.parser = makeParser(this.format);
    }
    let record: ReturnType<LineParser["parse"]>;
    try {
      record = this.parser.parse(line);
    } catch (err) {
      if (err instanceof MalformedLineError) {
        this.skipped++;
        return;
      }
      throw err;
    }
    if (record !== null) {
      this.records++;
      this.aggregator.add(record);
    }
  }

  result(): ParseResult {
    return {
      report: this.aggregator.result({ top: this.options.top, skipped: this.skipped }),
      format: this.format,
      lines: this.lines,
      records: this.records,
      skipped: this.skipped,
      truncated: this.truncated,
    };
  }
}

/** Parse pasted text. */
export function parseLogText(text: string, options: ParseOptions = {}): ParseResult {
  const session = new LogSession(options);
  const splitter = new LineSplitter();
  const emit = (line: string) => session.consume(line);
  splitter.push(text, emit);
  splitter.end(emit);
  return session.result();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd js && pnpm --filter @rastrolog/core run test && pnpm run typecheck && pnpm run format && pnpm run lint`
Expected: all 6 golden reports match exactly, and the own-host and ordering tests pass. If a golden differs, print both dicts and fix the TS (usually tie ordering or `top_pages` limits); never edit a golden file.

- [ ] **Step 5: Commit**

```bash
git add js/core/src/logs js/core/test/logs-golden.test.ts
git commit -m "feat(js): log report aggregation matching every golden report"
```

---

### Task 4: Streaming parse (bytes, gzip, progress, cancel)

**Files:**
- Create: `js/core/src/logs/stream.ts`
- Test: `js/core/test/logs-stream.test.ts`

**Interfaces:**
- Consumes: `LogSession`, `LineSplitter`, `ParseOptions` and `ParseResult` (Task 3).
- Produces: `parseLogStream(source: ReadableStream<Uint8Array>, options?: StreamOptions): Promise<ParseResult>`, with `interface StreamOptions extends ParseOptions { onProgress?: ((bytesRead: number) => void) | undefined; signal?: AbortSignal | undefined; progressEvery?: number | undefined }`. `bytesRead` counts **input** bytes (compressed for gzip), so a progress bar can use `file.size` as its total.

- [ ] **Step 1: Write the failing tests**

`js/core/test/logs-stream.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { UnknownFormatError } from "../src/logs/errors.js";
import { reportToDict } from "../src/logs/report.js";
import { parseLogStream } from "../src/logs/stream.js";

const LOGS = new URL("../../../conformance/logs/", import.meta.url);
const enc = new TextEncoder();

function streamOf(bytes: Uint8Array, chunkSize: number): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
}

const LINE = '1.2.3.4 - - [28/Sep/2026:12:00:00 +0000] "GET /a HTTP/1.1" 200 5 "-" "GPTBot/1.4"';
const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...enc.encode(p)] : p)));
const paths = async (data: Uint8Array, chunk = 3) => {
  const r = await parseLogStream(streamOf(data, chunk));
  return {
    lines: r.lines,
    records: r.records,
    skipped: r.skipped,
    truncated: r.truncated,
    paths: r.report.crawlers.flatMap((c) => c.topPages.map(([p]) => p)).sort(),
  };
};

describe("golden reports through the stream", () => {
  it.each(["nginx", "apache", "cloudfront", "alb", "alb-microseconds", "cloudfront-encoded-stem"])("%s", async (name) => {
    const raw = new Uint8Array(readFileSync(new URL(`${name}.log`, LOGS)));
    const expected = JSON.parse(readFileSync(new URL(`${name}.expected.json`, LOGS), "utf8"));
    for (const chunk of [1, 7, 65_536]) {
      expect(reportToDict((await parseLogStream(streamOf(raw, chunk))).report)).toEqual(expected);
    }
    expect(reportToDict((await parseLogStream(streamOf(new Uint8Array(gzipSync(raw)), 3))).report)).toEqual(expected);
  });
});

// Expected values are Python's iter_records() output, captured 2026-09-29.
describe("file-level behaviour matches Python", () => {
  it("keeps a BOM (combined still parses)", async () => {
    expect(await paths(bytes([0xef, 0xbb, 0xbf], LINE, "\n"))).toMatchObject({ lines: 1, records: 1 });
  });

  it("a BOM before #Version: is an unknown format, as in Python", async () => {
    await expect(parseLogStream(streamOf(bytes([0xef, 0xbb, 0xbf], "#Version: 1.0\n"), 4))).rejects.toThrow(UnknownFormatError);
  });

  it("lone \\r is a line break (Review Focus 1)", async () => {
    const data = bytes(LINE, "\r", LINE.replace("/a", "/b"), "\r");
    for (const chunk of [1, 2, 5]) {
      expect(await paths(data, chunk)).toMatchObject({ lines: 2, records: 2, paths: ["/a", "/b"] });
    }
  });

  it("\\r\\n split across chunks is one break; blank lines count (Review Focus 1)", async () => {
    const data = bytes(LINE, "\r\n\r\n   \r\n", LINE, "\r\n");
    for (const chunk of [1, LINE.length + 1]) {
      expect(await paths(data, chunk)).toMatchObject({ lines: 4, records: 2 });
    }
  });

  it("reads a last line without a newline", async () => {
    expect(await paths(bytes(LINE))).toMatchObject({ lines: 1, records: 1 });
  });

  it("replaces invalid UTF-8", async () => {
    expect(await paths(bytes(LINE.replace("GPTBot/1.4", "GPTBot/1.4 "), [0xff, 0xfe], "\n"))).toMatchObject({ records: 1 });
  });

  it("a truncated gzip keeps complete lines and says so", async () => {
    const gz = new Uint8Array(gzipSync(enc.encode(`${LINE}\n${LINE}\n`)));
    expect(await paths(gz.slice(0, gz.length - 12))).toMatchObject({ records: 1, truncated: true });
  });

  it("reads every member of a concatenated gzip (Review Focus 2)", async () => {
    const a = gzipSync(enc.encode(`${LINE}\n`));
    const b = gzipSync(enc.encode(`${LINE.replace("/a", "/c")}\n`));
    expect(await paths(new Uint8Array([...a, ...b]))).toMatchObject({ lines: 2, records: 2, paths: ["/a", "/c"], truncated: false });
  });

  it("reports an unknown format with its first line", async () => {
    await expect(parseLogStream(streamOf(bytes("hello world\n", LINE, "\n"), 4))).rejects.toMatchObject({
      name: "UnknownFormatError",
      line: "hello world",
    });
  });

  it("an explicit format skips detection", async () => {
    const r = await parseLogStream(streamOf(bytes("hello world\n", LINE, "\n"), 4), { format: "combined" });
    expect({ records: r.records, skipped: r.skipped }).toEqual({ records: 1, skipped: 1 });
  });
});

describe("progress and cancel", () => {
  it("reports input bytes, ending at the file size", async () => {
    const raw = new Uint8Array(gzipSync(readFileSync(new URL("nginx.log", LOGS))));
    const seen: number[] = [];
    await parseLogStream(streamOf(raw, 16), { onProgress: (n) => seen.push(n), progressEvery: 64 });
    expect(seen.length).toBeGreaterThan(1);
    expect(seen).toEqual([...seen].sort((x, y) => x - y));
    expect(seen.at(-1)).toBe(raw.length);
  });

  it("stops when aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(parseLogStream(streamOf(bytes(LINE, "\n"), 4), { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});

describe("large input", () => {
  it("parses 100,000 lines (about 20 MB) in a few seconds", async () => {
    const line = `${LINE}\n`;
    const data = enc.encode(line.repeat(100_000));
    const started = performance.now();
    const r = await parseLogStream(streamOf(data, 1_048_576));
    expect(r.records).toBe(100_000);
    expect(performance.now() - started).toBeLessThan(5_000);
  });
});
```

Run: `cd js && pnpm --filter @rastrolog/core exec vitest run test/logs-stream.test.ts`
Expected: FAIL with `Cannot find module '../src/logs/stream.js'`.

- [ ] **Step 2: Implement `stream.ts`**

`js/core/src/logs/stream.ts`:

```ts
// Streamed parse for files: works in a browser Web Worker and in Node.
// file.stream() -> [DecompressionStream("gzip") when the magic bytes say so]
//   -> TextDecoderStream (BOM kept) -> LineSplitter -> LogSession.
import { LineSplitter, LogSession, type ParseOptions, type ParseResult } from "./session.js";

export interface StreamOptions extends ParseOptions {
  /** Input bytes read so far (compressed bytes for gzip). Called every progressEvery bytes and at the end. */
  onProgress?: ((bytesRead: number) => void) | undefined;
  signal?: AbortSignal | undefined;
  progressEvery?: number | undefined;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export async function parseLogStream(source: ReadableStream<Uint8Array>, options: StreamOptions = {}): Promise<ParseResult> {
  options.signal?.throwIfAborted();
  const session = new LogSession(options);
  const splitter = new LineSplitter();
  const emit = (line: string) => session.consume(line);
  const every = options.progressEvery ?? 1_048_576;
  const reader = source.getReader();

  // Peek at the first two bytes for the gzip magic.
  const head: Uint8Array[] = [];
  let headLength = 0;
  let sourceDone = false;
  while (headLength < 2 && !sourceDone) {
    const r = await reader.read();
    if (r.done) sourceDone = true;
    else {
      head.push(r.value);
      headLength += r.value.length;
    }
  }
  const first = concat(head);
  const gzip = first.length >= 2 && first[0] === 0x1f && first[1] === 0x8b;

  let bytesRead = first.length;
  let lastReport = 0;
  const counted = new ReadableStream<Uint8Array>({
    start(controller) {
      if (first.length > 0) controller.enqueue(first);
      if (sourceDone) controller.close();
    },
    async pull(controller) {
      const r = await reader.read();
      if (r.done) {
        controller.close();
        return;
      }
      bytesRead += r.value.length;
      if (bytesRead - lastReport >= every) {
        lastReport = bytesRead;
        options.onProgress?.(bytesRead);
      }
      controller.enqueue(r.value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });

  const bytes = gzip ? counted.pipeThrough(new DecompressionStream("gzip")) : counted;
  const text = bytes.pipeThrough(new TextDecoderStream("utf-8", { ignoreBOM: true })).getReader();
  try {
    for (;;) {
      options.signal?.throwIfAborted();
      let chunk: ReadableStreamReadResult<string>;
      try {
        chunk = await text.read();
      } catch (err) {
        if (!gzip) throw err;
        session.truncated = true; // like Python: keep complete lines, drop the partial one
        break;
      }
      if (chunk.done) {
        splitter.end(emit);
        break;
      }
      splitter.push(chunk.value, emit);
    }
  } catch (err) {
    await text.cancel().catch(() => undefined);
    throw err;
  }
  options.onProgress?.(bytesRead);
  return session.result();
}
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `cd js && pnpm --filter @rastrolog/core run test && pnpm run typecheck && pnpm run format && pnpm run lint`
Expected: all stream tests pass. The golden reports match for 1-, 7- and 64 KiB chunks and for gzip, and 100,000 lines parse in under 5 s.

If the multi-member gzip test fails in Node, stop and report it: it means `DecompressionStream` stops after the first member, and the fix (feeding members one by one) is a design change.

- [ ] **Step 4: Commit**

```bash
git add js/core/src/logs/stream.ts js/core/test/logs-stream.test.ts
git commit -m "feat(js): streamed log parsing with gzip, progress and cancel"
```

---

### Task 5: Every crawler token, and the RFC 9309 robots.txt parser

**Files:**
- Modify: `js/core/src/types.ts`, `js/core/scripts/tables.ts`, `js/core/scripts/codegen.ts`, `js/core/test/tables.test.ts`
- Create: `js/core/src/robots/parse.ts`, `js/core/src/robots/match.ts`
- Test: `js/core/test/robots.test.ts`

**Interfaces:**
- Produces:
  - `type TokenRow = readonly [id, vendor, vendorName, token, purpose: Purpose, aiSpecific: boolean, robotsOnly: boolean]`, and the generated `ALL_CRAWLERS: readonly TokenRow[]` in `src/tokens.gen.ts` (every crawler, `signals.json` order); `buildTables()` also returns `all: TokenRow[]`;
  - `interface RobotsLine { line: number; text: string }`, `interface RobotsRule extends RobotsLine { allow: boolean; pattern: string }`, `interface RobotsAgent extends RobotsLine { product: string }` (lowercased, or `"*"`), `interface RobotsGroup { agents: RobotsAgent[]; rules: RobotsRule[] }`;
  - `ROBOTS_MAX_CHARS = 512_000`, `parseRobots(text: string): RobotsGroup[]`;
  - `patternMatches(pattern: string, path: string): boolean`, and `decide(rules: readonly RobotsRule[], path: string): { allowed: boolean; rule: RobotsRule | null }`.

- [ ] **Step 1: Write the failing tests**

Append to the `buildTables` describe block in `js/core/test/tables.test.ts`:

```ts
  it("all keeps every crawler in file order, flagging robots_only", () => {
    const { all } = buildTables(
      signals({ crawlers: [crawler("a", "Bot"), crawler("c", "Ext-Token", { match: "robots_only" })] }),
    );
    expect(all).toEqual([
      ["a", "v", "V", "Bot", "training", true, false],
      ["c", "v", "V", "Ext-Token", "training", true, true],
    ]);
  });
```

Also extend the "covers every entry in the real signals.json" test by adding this line inside it:

```ts
    expect(buildTables(real).all.map((row) => row[0])).toEqual(real.crawlers.map((c) => c.id));
```

`js/core/test/robots.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decide, patternMatches } from "../src/robots/match.js";
import { parseRobots, ROBOTS_MAX_CHARS } from "../src/robots/parse.js";

// Google's documented robots.txt pattern examples.
describe("patternMatches", () => {
  const cases: [string, string[], string[]][] = [
    ["/fish", ["/fish", "/fish.html", "/fish/salmon.html", "/fishheads", "/fish.php?id=anything"], ["/Fish.asp", "/catfish", "/?id=fish"]],
    ["/fish*", ["/fish", "/fish.html", "/fishheads/yummy.html"], ["/Fish.asp", "/catfish"]],
    ["/fish/", ["/fish/", "/fish/?id=anything", "/fish/salmon.htm"], ["/fish", "/fish.html", "/Fish/Salmon.asp"]],
    ["/*.php", ["/index.php", "/folder/filename.php", "/folder/filename.php?parameters", "/folder/any.php.file.html"], ["/", "/windows.PHP"]],
    ["/*.php$", ["/filename.php", "/folder/filename.php"], ["/filename.php?parameters", "/filename.php/", "/filename.php5", "/windows.PHP"]],
    ["/fish*.php", ["/fish.php", "/fishheads/catfish.php?parameters"], ["/Fish.PHP"]],
  ];
  it.each(cases)("%s", (pattern, yes, no) => {
    for (const path of yes) expect(patternMatches(pattern, path), `${pattern} ~ ${path}`).toBe(true);
    for (const path of no) expect(patternMatches(pattern, path), `${pattern} !~ ${path}`).toBe(false);
  });
});

describe("decide: longest match wins, allow wins ties", () => {
  const rules = (...lines: string[]) => parseRobots(`User-agent: *\n${lines.join("\n")}`)[0]?.rules ?? [];
  it.each([
    [["Allow: /p", "Disallow: /"], "/page", true],
    [["Allow: /folder", "Disallow: /folder"], "/folder/page", true],
    [["Allow: /page", "Disallow: /*.htm"], "/page.htm", false],
    [["Allow: /page", "Disallow: /*.ph"], "/page.php", true],
    [["Allow: /$", "Disallow: /"], "/", true],
    [["Allow: /$", "Disallow: /"], "/page.htm", false],
    [["Disallow:"], "/anything", true],
    [[], "/", true],
  ] as const)("%j on %s -> allowed=%s", (lines, path, allowed) => {
    expect(decide(rules(...lines), path).allowed).toBe(allowed);
  });
});

describe("parseRobots (Review Focus 5)", () => {
  it("groups consecutive user-agents and merges nothing yet", () => {
    const groups = parseRobots("User-agent: CCBot\nUser-agent: Bytespider\nDisallow: /\n\nUser-agent: *\nAllow: /\n");
    expect(groups.map((g) => g.agents.map((a) => a.product))).toEqual([["ccbot", "bytespider"], ["*"]]);
    expect(groups[0]?.rules).toEqual([{ line: 3, text: "Disallow: /", allow: false, pattern: "/" }]);
  });

  it("handles BOM, CRLF, comments, case, spaces around the colon, and product versions", () => {
    const groups = parseRobots("﻿# hi\r\nUSER-AGENT : GPTBot/1.0 # openai\r\nDISALLOW :  /private  # no\r\n");
    expect(groups).toEqual([
      {
        agents: [{ line: 2, text: "USER-AGENT : GPTBot/1.0 # openai", product: "gptbot" }],
        rules: [{ line: 3, text: "DISALLOW :  /private  # no", allow: false, pattern: "/private" }],
      },
    ]);
  });

  it("ignores rules before any user-agent and unknown directives", () => {
    const groups = parseRobots("Disallow: /x\nSitemap: https://example.com/s.xml\nUser-agent: *\nCrawl-delay: 5\nDisallow: /y\n");
    expect(groups).toHaveLength(1);
    expect(groups[0]?.rules.map((r) => r.pattern)).toEqual(["/y"]);
  });

  it("a user-agent after rules starts a new group", () => {
    const groups = parseRobots("User-agent: a\nDisallow: /1\nUser-agent: b\nDisallow: /2\n");
    expect(groups).toHaveLength(2);
  });
});

describe("hostile robots.txt (Review Focus 4)", () => {
  it("a pattern of many wildcards stays fast", () => {
    const started = performance.now();
    expect(patternMatches(`/${"*".repeat(5_000)}x$`, `/${"a".repeat(100_000)}`)).toBe(false);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("stops reading after 500 KiB", () => {
    const text = `User-agent: *\n${"#".repeat(ROBOTS_MAX_CHARS)}\nDisallow: /\n`;
    expect(parseRobots(text)[0]?.rules).toEqual([]);
  });
});
```

Run: `cd js && pnpm --filter @rastrolog/core run test`
Expected: FAIL. `tables.test.ts` fails on `all` being undefined, and `robots.test.ts` fails with `Cannot find module '../src/robots/match.js'`.

- [ ] **Step 2: Add the all-crawlers table to codegen**

In `js/core/src/types.ts`, append:

```ts
/** Every crawler in signals.json order, including robots.txt-only tokens (for the robots checker). */
export type TokenRow = readonly [
  id: string,
  vendor: string,
  vendorName: string,
  token: string,
  purpose: Purpose,
  aiSpecific: boolean,
  robotsOnly: boolean,
];
```

In `js/core/scripts/tables.ts`:
- import `TokenRow` next to the other types;
- add `all: TokenRow[];` to `interface Tables`;
- declare `const all: TokenRow[] = [];` beside `const crawlers`;
- inside the crawler `forEach`, after the `token` line, add `all.push([id, text(c, "vendor", where), text(c, "vendor_name", where), token, purpose as Purpose, aiSpecific, match === "robots_only"]);`;
- return `{ referrers, crawlers, all }`;
- extend `renderModule`'s `typeName` union to `"ReferrerRow" | "CrawlerRow" | "TokenRow"`.

In `js/core/scripts/codegen.ts`:
- destructure `all` too;
- add:

```ts
writeFileSync(
  new URL("../src/tokens.gen.ts", import.meta.url),
  renderModule("ALL_CRAWLERS", "TokenRow", all),
);
```

- change the log line to `console.log(\`codegen: ${referrers.length} referrers, ${crawlers.length} user-agent crawlers, ${all.length} tokens\`);`.

- [ ] **Step 3: Implement `robots/parse.ts` and `robots/match.ts`**

`js/core/src/robots/parse.ts`:

```ts
// RFC 9309 robots.txt parsing. Agents use the widely deployed product-token rule:
// the leading run of [A-Za-z_-], compared case-insensitively ("GPTBot/1.0" -> "gptbot").

export interface RobotsLine {
  /** 1-based line number in the file. */
  line: number;
  /** The line as written, trimmed (comment included), for showing evidence. */
  text: string;
}

export interface RobotsAgent extends RobotsLine {
  /** Lowercased product token, or "*". */
  product: string;
}

export interface RobotsRule extends RobotsLine {
  allow: boolean;
  pattern: string;
}

export interface RobotsGroup {
  agents: RobotsAgent[];
  rules: RobotsRule[];
}

/** RFC 9309 §2.5: parsers must handle at least 500 KiB; the rest is ignored. */
export const ROBOTS_MAX_CHARS = 512_000;

const PRODUCT = /^[A-Za-z_-]+/;

export function parseRobots(input: string): RobotsGroup[] {
  const text = (input.charCodeAt(0) === 0xfeff ? input.slice(1) : input).slice(0, ROBOTS_MAX_CHARS);
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let sawRule = false;
  const lines = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const hash = raw.indexOf("#");
    const body = (hash >= 0 ? raw.slice(0, hash) : raw).trim();
    const colon = body.indexOf(":");
    if (colon < 0) continue;
    const key = body.slice(0, colon).trim().toLowerCase();
    const value = body.slice(colon + 1).trim();
    const entry = { line: i + 1, text: raw.trim() };
    if (key === "user-agent") {
      if (current === null || sawRule) {
        current = { agents: [], rules: [] };
        groups.push(current);
        sawRule = false;
      }
      const product = value.startsWith("*") ? "*" : (PRODUCT.exec(value)?.[0] ?? "").toLowerCase();
      current.agents.push({ ...entry, product });
    } else if ((key === "allow" || key === "disallow") && current !== null) {
      current.rules.push({ ...entry, allow: key === "allow", pattern: value });
      sawRule = true;
    }
  }
  return groups;
}
```

`js/core/src/robots/match.ts`:

```ts
import type { RobotsRule } from "./parse.js";

/**
 * RFC 9309 §2.2.3: "*" matches any sequence, a trailing "$" anchors the end,
 * and otherwise the pattern is a prefix. A greedy two-pointer wildcard match:
 * worst case O(pattern x path), never exponential, unlike a translated regex.
 */
export function patternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const p = anchored ? pattern.slice(0, -1) : `${pattern}*`;
  let i = 0;
  let j = 0;
  let star = -1;
  let mark = 0;
  while (i < path.length) {
    if (j < p.length && p[j] !== "*" && p[j] === path[i]) {
      i++;
      j++;
    } else if (j < p.length && p[j] === "*") {
      star = j++;
      mark = i;
    } else if (star !== -1) {
      j = star + 1;
      i = ++mark;
    } else {
      return false;
    }
  }
  while (j < p.length && p[j] === "*") j++;
  return j === p.length;
}

/** RFC 9309 §2.2.2: the longest matching pattern wins; on a tie, allow wins. No match: allowed. */
export function decide(rules: readonly RobotsRule[], path: string): { allowed: boolean; rule: RobotsRule | null } {
  let best: RobotsRule | null = null;
  for (const rule of rules) {
    if (rule.pattern === "" || !patternMatches(rule.pattern, path)) continue;
    const longer = best === null || rule.pattern.length > best.pattern.length;
    const tieToAllow = best !== null && rule.pattern.length === best.pattern.length && rule.allow && !best.allow;
    if (longer || tieToAllow) best = rule;
  }
  return { allowed: best === null || best.allow, rule: best };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd js && pnpm --filter @rastrolog/core run test && pnpm run typecheck && pnpm run format && pnpm run lint`
Expected:
- codegen prints `codegen: 12 referrers, 26 user-agent crawlers, 28 tokens`;
- every pattern, precedence, parser and hostile-input test passes;
- `git status` doesn't list `src/tokens.gen.ts`, because it's gitignored by `js/core/src/*.gen.ts`.

- [ ] **Step 5: Commit**

```bash
git add js/core/src/types.ts js/core/scripts js/core/test/tables.test.ts js/core/src/robots js/core/test/robots.test.ts
git commit -m "feat(js): RFC 9309 robots.txt parser and a table of every crawler token"
```

---

### Task 6: robots.txt verdicts for every crawler, and the per-vendor roll-up

**Files:**
- Create: `js/core/src/robots/check.ts`
- Test: `js/core/test/robots-check.test.ts`

**Interfaces:**
- Consumes: `ALL_CRAWLERS`, `TokenRow`, `parseRobots`, `decide`, `RobotsGroup`, `RobotsLine` and `RobotsRule` (Task 5); `Purpose` (types).
- Produces:
  - `type Verdict = "allowed" | "blocked" | "partial"`, and `type VerdictSource = "token" | "star" | "none"`;
  - `interface CrawlerVerdict { id; vendor; vendorName; token; purpose: Purpose; aiSpecific: boolean; robotsOnly: boolean; verdict: Verdict; source: VerdictSource; lines: RobotsLine[] }`;
  - `checkRobots(text: string | null): CrawlerVerdict[]` (`null` means there's no robots.txt, i.e. a 404);
  - `interface VendorSummary { vendor: string; vendorName: string; purposes: Partial<Record<Purpose, Verdict | "mixed">> }`, and `summarizeByVendor(verdicts: readonly CrawlerVerdict[]): VendorSummary[]` (vendors in first-appearance order).

- [ ] **Step 1: Write the failing tests**

`js/core/test/robots-check.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkRobots, summarizeByVendor } from "../src/robots/check.js";

const SAMPLE = [
  "User-agent: GPTBot",
  "Disallow: /",
  "",
  "User-agent: CCBot",
  "User-agent: Bytespider",
  "Disallow: /",
  "",
  "User-agent: Google-Extended",
  "Disallow: /",
  "",
  "User-agent: PerplexityBot",
  "Disallow: /drafts/",
  "",
  "User-agent: *",
  "Allow: /",
].join("\n");

const SIGNALS = JSON.parse(readFileSync(new URL("../../../signals.json", import.meta.url), "utf8")) as {
  crawlers: { token: string }[];
};

const byToken = (text: string | null) => new Map(checkRobots(text).map((v) => [v.token, v]));

describe("checkRobots", () => {
  it("returns one verdict per crawler token in signals.json, robots-only included", () => {
    const tokens = checkRobots(SAMPLE).map((v) => v.token);
    expect(tokens).toEqual(SIGNALS.crawlers.map((c) => c.token));
    expect(byToken(SAMPLE).get("Google-Extended")?.robotsOnly).toBe(true);
  });

  it("blocked, partial and allowed, with the lines that decided", () => {
    const v = byToken(SAMPLE);
    expect(v.get("GPTBot")).toMatchObject({
      verdict: "blocked",
      source: "token",
      lines: [
        { line: 1, text: "User-agent: GPTBot" },
        { line: 2, text: "Disallow: /" },
      ],
    });
    expect(v.get("Bytespider")).toMatchObject({ verdict: "blocked", source: "token" });
    expect(v.get("Google-Extended")).toMatchObject({ verdict: "blocked", source: "token" });
    expect(v.get("PerplexityBot")).toMatchObject({
      verdict: "partial",
      lines: [
        { line: 11, text: "User-agent: PerplexityBot" },
        { line: 12, text: "Disallow: /drafts/" },
      ],
    });
    expect(v.get("ClaudeBot")).toMatchObject({ verdict: "allowed", source: "star" });
    expect(v.get("ClaudeBot")?.lines.map((l) => l.line)).toEqual([14, 15]);
  });

  it("no robots.txt means everything is allowed", () => {
    for (const v of checkRobots(null)) expect(v).toMatchObject({ verdict: "allowed", source: "none", lines: [] });
  });

  it("merges every group naming the token (RFC 9309)", () => {
    const v = byToken("User-agent: GPTBot\nDisallow: /a\n\nUser-agent: gptbot\nDisallow: /\n");
    expect(v.get("GPTBot")?.verdict).toBe("blocked");
  });

  it("a disallow counts as partial unless an allow of equal or greater length overrides it", () => {
    const v = byToken("User-agent: *\nDisallow: /docs\nAllow: /docs/\n");
    expect(v.get("ClaudeBot")?.verdict).toBe("partial"); // "/docs" itself is still disallowed
    const w = byToken("User-agent: *\nDisallow: /docs\nAllow: /docs\n");
    expect(w.get("ClaudeBot")?.verdict).toBe("allowed"); // tie -> allow wins everywhere
  });

  it("an empty Disallow allows everything", () => {
    expect(byToken("User-agent: *\nDisallow:\n").get("GPTBot")?.verdict).toBe("allowed");
  });

  it("wildcard disallows count as partial", () => {
    expect(byToken("User-agent: *\nDisallow: /*.pdf$\n").get("GPTBot")?.verdict).toBe("partial");
  });
});

describe("summarizeByVendor", () => {
  it("rolls each vendor's crawlers up by purpose", () => {
    const summary = new Map(summarizeByVendor(checkRobots(SAMPLE)).map((s) => [s.vendor, s]));
    expect(summary.get("openai")?.purposes).toEqual({ training: "blocked", user_fetch: "allowed", search_index: "allowed" });
    expect(summary.get("google")?.purposes).toEqual({ training: "blocked", user_fetch: "allowed", search_index: "allowed" });
    expect(summary.get("perplexity")?.purposes).toEqual({ search_index: "partial", user_fetch: "allowed" });
  });

  it("says mixed when one purpose's crawlers disagree", () => {
    const summary = summarizeByVendor(checkRobots("User-agent: Google-Agent\nDisallow: /\n"));
    expect(summary.find((s) => s.vendor === "google")?.purposes.user_fetch).toBe("mixed");
  });
});
```

Run: `cd js && pnpm --filter @rastrolog/core exec vitest run test/robots-check.test.ts`
Expected: FAIL with `Cannot find module '../src/robots/check.js'`.

- [ ] **Step 2: Implement `robots/check.ts`**

`js/core/src/robots/check.ts`:

```ts
import { ALL_CRAWLERS } from "../tokens.gen.js";
import type { Purpose } from "../types.js";
import { decide } from "./match.js";
import { parseRobots, type RobotsGroup, type RobotsLine, type RobotsRule } from "./parse.js";

export type Verdict = "allowed" | "blocked" | "partial";
/** Which group decided: one naming the token, the "*" group, or no group at all. */
export type VerdictSource = "token" | "star" | "none";

export interface CrawlerVerdict {
  id: string;
  vendor: string;
  vendorName: string;
  token: string;
  purpose: Purpose;
  aiSpecific: boolean;
  robotsOnly: boolean;
  /** For the home page "/": blocked there, allowed with some paths disallowed ("partial"), or allowed. */
  verdict: Verdict;
  source: VerdictSource;
  /** The user-agent lines and rules behind the verdict, in file order. */
  lines: RobotsLine[];
}

function groupsFor(groups: readonly RobotsGroup[], token: string): { source: VerdictSource; groups: RobotsGroup[] } {
  const product = token.toLowerCase();
  const named = groups.filter((g) => g.agents.some((a) => a.product === product));
  if (named.length > 0) return { source: "token", groups: named };
  const star = groups.filter((g) => g.agents.some((a) => a.product === "*"));
  return star.length > 0 ? { source: "star", groups: star } : { source: "none", groups: [] };
}

/** A path the rule's pattern certainly matches: wildcards and the "$" anchor removed. */
function representative(pattern: string): string {
  const p = pattern.replace(/\*/g, "").replace(/\$$/, "");
  return p.startsWith("/") ? p : `/${p}`;
}

function evaluate(rules: readonly RobotsRule[], agentLines: RobotsLine[], matchedProduct: string | null) {
  const root = decide(rules, "/");
  let verdict: Verdict;
  let deciding: RobotsRule[];
  if (!root.allowed) {
    verdict = "blocked";
    deciding = root.rule ? [root.rule] : [];
  } else {
    deciding = rules.filter((r) => !r.allow && r.pattern !== "" && !decide(rules, representative(r.pattern)).allowed);
    verdict = deciding.length > 0 ? "partial" : "allowed";
    if (verdict === "allowed" && root.rule) deciding = [root.rule];
  }
  const agents = agentLines.filter((a) => matchedProduct === null || ("product" in a && a.product === matchedProduct));
  const seen = new Set<number>();
  const lines = [...agents, ...deciding]
    .map(({ line, text }) => ({ line, text }))
    .filter((l) => (seen.has(l.line) ? false : (seen.add(l.line), true)))
    .sort((a, b) => a.line - b.line);
  return { verdict, lines };
}

export function checkRobots(text: string | null): CrawlerVerdict[] {
  const groups = text === null ? [] : parseRobots(text);
  return ALL_CRAWLERS.map(([id, vendor, vendorName, token, purpose, aiSpecific, robotsOnly]) => {
    const found = groupsFor(groups, token);
    const rules = found.groups.flatMap((g) => g.rules);
    const agentLines = found.groups.flatMap((g) => g.agents);
    const matched = found.source === "token" ? token.toLowerCase() : found.source === "star" ? "*" : null;
    const { verdict, lines } = evaluate(rules, agentLines, matched);
    return { id, vendor, vendorName, token, purpose, aiSpecific, robotsOnly, verdict, source: found.source, lines };
  });
}

export interface VendorSummary {
  vendor: string;
  vendorName: string;
  /** One verdict per purpose the vendor has crawlers for; "mixed" when they disagree. */
  purposes: Partial<Record<Purpose, Verdict | "mixed">>;
}

export function summarizeByVendor(verdicts: readonly CrawlerVerdict[]): VendorSummary[] {
  const byVendor = new Map<string, VendorSummary>();
  for (const v of verdicts) {
    const summary = byVendor.get(v.vendor) ?? { vendor: v.vendor, vendorName: v.vendorName, purposes: {} };
    byVendor.set(v.vendor, summary);
    const prior = summary.purposes[v.purpose];
    summary.purposes[v.purpose] = prior === undefined || prior === v.verdict ? v.verdict : "mixed";
  }
  return [...byVendor.values()];
}
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `cd js && pnpm --filter @rastrolog/core run test && pnpm run typecheck && pnpm run format && pnpm run lint`
Expected: every check and summary test passes.

The "partial unless an allow overrides it" test deliberately expects `partial` for `Disallow: /docs` with `Allow: /docs/`, because the path `/docs` itself stays disallowed. If you disagree with that expectation, don't change it: rule on it and record the ruling.

- [ ] **Step 4: Commit**

```bash
git add js/core/src/robots/check.ts js/core/test/robots-check.test.ts
git commit -m "feat(js): robots.txt verdicts for every AI crawler, with evidence lines"
```

---

### Task 7: llms.txt summary, domain input, public exports, and the snippet guard

**Files:**
- Create: `js/core/src/llms.ts`, `js/core/src/domain.ts`
- Modify: `js/core/src/index.ts`
- Test: `js/core/test/llms-domain.test.ts`

**Interfaces:**
- Produces:
  - `summarizeLlmsTxt(text: string): { title: string | null; links: number }`;
  - `normalizeDomainInput(input: string): { ok: true; host: string; origin: string } | { ok: false; reason: "empty" | "invalid" | "ip" | "local" }`;
  - `js/core/src/index.ts` exporting every public name from Tasks 2–6 and these two.

- [ ] **Step 1: Write the failing tests**

`js/core/test/llms-domain.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeDomainInput } from "../src/domain.js";
import { summarizeLlmsTxt } from "../src/llms.js";

describe("summarizeLlmsTxt", () => {
  it("reads the first H1 and counts Markdown links", () => {
    const text = "# Example Docs\n\n> Summary\n\n## Docs\n- [Start](https://example.com/start): intro\n- [API](/api.md)\n\n# Second heading\n";
    expect(summarizeLlmsTxt(text)).toEqual({ title: "Example Docs", links: 2 });
  });

  it("no H1 and no links", () => {
    expect(summarizeLlmsTxt("## Only an H2\nplain text")).toEqual({ title: null, links: 0 });
  });

  it("stays fast on hostile input", () => {
    const started = performance.now();
    summarizeLlmsTxt(`[${"[".repeat(200_000)}`);
    expect(performance.now() - started).toBeLessThan(200);
  });
});

describe("normalizeDomainInput", () => {
  it.each([
    ["example.com", "example.com", "https://example.com"],
    ["  EXAMPLE.com  ", "example.com", "https://example.com"],
    ["https://www.example.com/path?x#y", "www.example.com", "https://www.example.com"],
    ["http://example.com", "example.com", "https://example.com"],
    ["example.com.", "example.com", "https://example.com"],
    ["example.com:8443", "example.com", "https://example.com:8443"],
    ["bücher.de", "xn--bcher-kva.de", "https://xn--bcher-kva.de"],
  ])("%j -> %s", (input, host, origin) => {
    expect(normalizeDomainInput(input)).toEqual({ ok: true, host, origin });
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["localhost", "local"],
    ["intranet", "local"],
    ["printer.local", "local"],
    ["app.localhost", "local"],
    ["192.168.0.1", "ip"],
    ["[::1]", "ip"],
    ["ftp://example.com", "invalid"],
    ["exa mple.com", "invalid"],
  ])("%j is rejected as %s", (input, reason) => {
    expect(normalizeDomainInput(input)).toEqual({ ok: false, reason });
  });
});
```

Run: `cd js && pnpm --filter @rastrolog/core exec vitest run test/llms-domain.test.ts`
Expected: FAIL with `Cannot find module '../src/domain.js'`.

- [ ] **Step 2: Implement `llms.ts`, `domain.ts` and the exports**

`js/core/src/llms.ts`:

```ts
// llms.txt (https://llmstxt.org): a Markdown file whose first H1 names the site.
const LINK = /\[[^\]\n]*\]\([^)\s]+\)/g;

export interface LlmsSummary {
  /** Text of the first "# " heading, or null. */
  title: string | null;
  /** Number of Markdown links. */
  links: number;
}

export function summarizeLlmsTxt(input: string): LlmsSummary {
  const text = input.slice(0, 512_000);
  let title: string | null = null;
  for (const line of text.split(/\r\n|\r|\n/)) {
    if (line.startsWith("# ")) {
      title = line.slice(2).trim() || null;
      break;
    }
  }
  return { title, links: text.match(LINK)?.length ?? 0 };
}
```

`js/core/src/domain.ts`:

```ts
// The domain checker's input. Browser-facing only (not a conformance rule), so it
// uses WHATWG URL. robots.txt and llms.txt are always fetched over https.
export type DomainInput =
  | { ok: true; host: string; origin: string }
  | { ok: false; reason: "empty" | "invalid" | "ip" | "local" };

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const LOCAL_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];

export function normalizeDomainInput(input: string): DomainInput {
  const s = input.trim();
  if (s === "") return { ok: false, reason: "empty" };
  let url: URL;
  try {
    url = new URL(SCHEME.test(s) ? s : `https://${s}`);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "invalid" };
  const host = url.hostname.replace(/\.$/, "");
  if (host.startsWith("[") || IPV4.test(host)) return { ok: false, reason: "ip" };
  if (host === "localhost" || !host.includes(".") || LOCAL_SUFFIXES.some((x) => host.endsWith(x))) {
    return { ok: false, reason: "local" };
  }
  return { ok: true, host, origin: `https://${host}${url.port ? `:${url.port}` : ""}` };
}
```

Replace `js/core/src/index.ts` with:

```ts
export { type DomainInput, normalizeDomainInput } from "./domain.js";
export { hostOf, normalizeHost, urlsplitPath } from "./host.js";
export { type LlmsSummary, summarizeLlmsTxt } from "./llms.js";
export { MalformedLineError, UnknownFormatError } from "./logs/errors.js";
export { detect, FORMATS, type Format, type LogRecord, makeParser } from "./logs/formats.js";
export {
  Aggregator,
  type CrawlerRow,
  compareCodePoints,
  type PageRow,
  type ReferralRow,
  type Report,
  type ReportDict,
  reportToDict,
} from "./logs/report.js";
export { type ParseOptions, type ParseResult, parseLogText } from "./logs/session.js";
export { parseLogStream, type StreamOptions } from "./logs/stream.js";
export {
  type CrawlerVerdict,
  checkRobots,
  summarizeByVendor,
  type Verdict,
  type VerdictSource,
  type VendorSummary,
} from "./robots/check.js";
export { parseRobots, type RobotsGroup, type RobotsLine, type RobotsRule } from "./robots/parse.js";
export { classifyReferrer, type ReferrerOptions } from "./referrer.js";
export type { CrawlerRow as CrawlerTableRow, Match, Purpose, ReferrerRow, TokenRow } from "./types.js";
export { classifyUserAgent } from "./userAgent.js";
```

Alias the table-row type `CrawlerRow` from `types.ts` as `CrawlerTableRow`, because the report's `CrawlerRow` owns the plain name. If any file imports `CrawlerRow` from the index meaning the table row, point it at `./types.js` directly. `js/snippet` imports only `classifyReferrer`, `classifyUserAgent`, `Match`, `Purpose` and `ReferrerOptions`.

- [ ] **Step 3: Verify everything, including that the snippet didn't grow**

Run: `cd js && pnpm run test && pnpm run typecheck && pnpm run format && pnpm run lint`
Expected: every core and snippet test passes.

Run: `cd js && pnpm --filter rastrolog run build && pnpm --filter rastrolog run test:bundle && pnpm --filter rastrolog run size`
Expected:
- the bundle tests pass, including "does not bundle the crawler table";
- size-limit shows the same size as before this plan (1.77 kB gzipped), within ±0.01 kB.

A bigger snippet means something in the new modules has a top-level side effect that defeated tree-shaking. Find it and remove it; don't raise the limit.

Run: `cd python && uv run pytest -q && uv run pre-commit run --all-files`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add js/core/src/llms.ts js/core/src/domain.ts js/core/src/index.ts js/core/test/llms-domain.test.ts
git commit -m "feat(js): llms.txt summary, domain input normaliser, and core exports"
```
