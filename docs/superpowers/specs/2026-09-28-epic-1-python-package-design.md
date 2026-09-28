# Epic 1: Python package, CLI and middleware

Date: 2026-09-28 · Status: approved in brainstorming, pending written-spec review
Depends on: overview spec (`2026-09-28-rastrolog-overview-design.md`)

## Goal

`pip install rastrolog` then `rastrolog parse access.log` on an nginx, Apache, CloudFront or ALB log prints two polished tables: AI crawlers by user agent and AI referrals by product, with top pages. The same package exposes `classify_user_agent()` / `classify_referrer()` and ASGI + Django middleware.

This epic also creates the shared foundation: `signals.json`, `signals.schema.json`, `conformance/`, `CHANGELOG.md`, CI skeleton, `CLAUDE.md`.

## Done when

- `rastrolog parse` runs on all four format fixtures (plain and `.gz`) and output matches the golden reports.
- Every `user_agent` crawler token has a real vendor UA fixture; the invariant tests pass.
- Middleware: one test each (Starlette/FastAPI and Django), `on_match` fires.
- `uv build` produces a wheel that contains `signals.json`; the wheel installs and runs on Python 3.10–3.14 in CI.
- ruff, ruff-format, mypy `--strict` clean.

## Dependencies

- Runtime: `rich`, `typer`. Only `cli.py`, `render.py` and `theme.py` import them.
- Everything else (`signals`, `classify`, `formats`, `parse`, `report`, `nudge`, `middleware/*`) imports **only the standard library**, so `from rastrolog import classify_referrer` in an app never needs rich or typer at import time.
- Optional extras `rastrolog[fastapi]` and `rastrolog[django]` exist for typing/tests; the middleware modules import Starlette/Django types only under `TYPE_CHECKING`.
- No interactive prompt library (decision: flags only, no `questionary`).

## Package layout

```
python/
├─ pyproject.toml            hatchling; force-include ../signals.json → rastrolog/signals.json
├─ src/rastrolog/
│  ├─ __init__.py            re-exports classify_user_agent, classify_referrer, Match, __version__
│  ├─ py.typed
│  ├─ signals.py             load bundled JSON once (importlib.resources), build lookup tables
│  ├─ classify.py            Match dataclass + the two pure classify functions
│  ├─ formats.py             per-format regex/field maps + detect(first_line)
│  ├─ parse.py               iter_records(path, fmt=None): streaming, gzip-transparent
│  ├─ report.py              Aggregator: streaming counts → CrawlerRow / ReferralRow; since filter
│  ├─ theme.py               Charm-style palette and rich Theme (only rich import besides cli)
│  ├─ cli.py                 typer app
│  └─ middleware/
│     ├─ asgi.py             AITrafficMiddleware (pure ASGI)
│     └─ django.py           AITrafficMiddleware (sync + async capable)
└─ tests/
```

## Units

### `classify.py`

```python
@dataclass(frozen=True, slots=True)
class Match:
    kind: Literal["crawler", "referral"]
    id: str
    vendor: str
    vendor_name: str
    product: str | None = None      # referrals
    token: str | None = None        # crawlers
    purpose: str | None = None      # crawlers
    ai_specific: bool = True
    def to_dict(self) -> dict[str, object]: ...

def classify_user_agent(ua: str | None) -> Match | None: ...
def classify_referrer(url: str | None, *, own_host: str | None = None) -> Match | None: ...
```

- UA: case-insensitive substring search over `match == "user_agent"` tokens, **longest token first** (so `ChatGPT-User` wins over any shorter overlapping token). Returns `None` for empty/None.
- Referrer: `urllib.parse.urlsplit`; lowercase host; strip leading `www.`; exact host or dot-suffix match (host only; see the overview spec for why). Returns `None` for malformed URLs, empty strings, and when host equals `own_host`.
- `slots=True` requires Python 3.10+, which matches the floor.

### `formats.py` and `parse.py`

- Formats: `combined` (nginx default and Apache combined share it), `cloudfront` (W3C, tab-separated, reads `#Fields:` header), `alb` (space-separated with quoted fields).
- `detect(first_non_comment_line)` tries each format's regex; unknown → `UnknownFormatError(line)`.
- `iter_records` yields `LogRecord(ts: datetime, path: str, status: int, ua: str, referrer: str)`; opens `.gz` via `gzip.open` by magic bytes, not extension; reads line by line (constant memory); counts and skips malformed lines (`ParseStats.skipped`).
- Timestamps normalised to aware UTC datetimes.

### `report.py`

- `Aggregator.add(record)` classifies UA and referrer once per record and updates per-id counters: requests, set of unique paths, last seen, `Counter` of paths.
- `--since 7d|24h|30m|ISO date` filters on record timestamp.
- `Aggregator.result(top=N)` returns `Report(crawlers: list[CrawlerRow], referrals: list[ReferralRow], stats)`, sorted by requests desc. Unique-path sets are the only unbounded memory; acceptable for single-site logs (documented).
- `Report.to_dict()` is the `--json` output; the same shape is used for the golden files.

### `cli.py` (typer + rich, Charm-style)

Commands:

```
rastrolog parse FILE... [--format combined|cloudfront|alb] [--since 7d] [--top 10] [--by page|vendor] [--json]
rastrolog check VALUE          # classify one UA string or referrer URL, print the Match
rastrolog --version
```

Look and feel (Charm equivalents in Python):

| Charm | Here |
| --- | --- |
| lipgloss | `theme.py`: rounded-border `rich.Table`/`Panel`, pink/purple accents, dim metadata, purpose rendered as coloured badges (training / user fetch / search index) |
| bubbles | `rich.progress` byte-based progress bar while streaming (bytes read / file size, works for gzip via underlying file position); spinner during format detection |
| log | `--verbose` uses `rich.logging.RichHandler` formatted like charm/log (level badge, time, `key=value`) |

`--by` controls the table pivot: `vendor` (default) gives one row per crawler token / referral product with its top pages; `page` gives one row per path with the AI crawlers and AI referral products that hit it (for "which of my pages do AI tools read").

Behaviour:
- Bare `rastrolog` prints styled help with the two example commands.
- Unknown format: print the offending first line in a panel and suggest `--format`; exit 2.
- Missing/unreadable file: clear message, exit 2. Multiple files may mix formats (detection per file).
- Footer line "skipped N malformed lines" when N > 0.
- `--json` writes only JSON to stdout (no colour, no progress, no nudge). Progress/spinner go to stderr and are disabled when stderr is not a TTY.
- **Change-notification nudge:** after the first successful table report per install, one dim line pointing to the landing page. Marker file in `platformdirs`-style config dir (implemented with stdlib: `$XDG_CONFIG_HOME` / `~/Library/Application Support` / `%APPDATA%`). Suppressed with `--json`, non-TTY stdout, or `RASTROLOG_NO_NUDGE=1`. Never shown twice.

### `middleware/asgi.py`

```python
app.add_middleware(AITrafficMiddleware, on_match=None, log=False, own_host=None)
```

- Pure ASGI class (works with FastAPI, Starlette, any ASGI app); only `http` scopes.
- Classifies `user-agent` and `referer` headers; stores the first non-None result (crawler takes precedence) at `scope["state"]["ai_traffic"]`, so `request.state.ai_traffic` works in Starlette. `None` when no match.
- `on_match(match, scope)` callback; exceptions in the callback are logged and swallowed (never break the request).
- `log=True` emits one structured `logging` record (`logger "rastrolog"`, extra fields) per matched request.

### `middleware/django.py`

- Class usable in `MIDDLEWARE`; sets `request.ai_traffic`. Declares `sync_capable = async_capable = True` and branches on `iscoroutinefunction(get_response)`.
- Same `on_match` / `log` options, read from `settings.RASTROLOG = {...}` if present.

## Error handling summary

| Situation | Behaviour |
| --- | --- |
| Malformed log line | skipped, counted, reported in footer and JSON `stats.skipped` |
| Unknown format | exit 2 with line shown and `--format` hint |
| Missing file / permission | exit 2, message names the file |
| Truncated gzip | report what was read, warn, exit 1 |
| `on_match` raises | logged at WARNING, request continues |
| Malformed referrer / empty UA | classify returns `None` |

## Testing

- **Conformance** (shared JSON) via parametrised pytest, plus the four invariants from the overview.
- **Per format:** fixture log + `.gz` → `Report.to_dict()` equals golden JSON.
- **Unit:** longest-token precedence, `own_host` exclusion, `--since` parsing, detection failures, malformed-line counting.
- **CLI:** `typer.testing.CliRunner`: table output snapshot (no colour), `--json` schema, exit codes, nudge shown once then suppressed.
- **Middleware:** Starlette `TestClient` app and Django test client with `settings.configure()`; `on_match` called with expected `Match`; callback exception doesn't fail the request.
- **Perf smoke** (marked, run on demand): 1,000,000 generated lines parse in < 10 s on a laptop.
- Coverage gate: 90% lines on `src/rastrolog` excluding `cli.py` rendering helpers.

## Release

Version from `pyproject.toml` (`__version__` via `importlib.metadata`). Trusted publishing to PyPI in `release.yml` on `v*` tags. README: install, the two commands, middleware snippets, link to the page.
