# conformance/

Shared, language-agnostic fixtures. The Python classifier and parser must pass
every case here; so must the future TypeScript port (Epic 2/3). Never
special-case one language against these files — if a case looks wrong, fix the
fixture (with a human decision) rather than skip it in one implementation.

## Files

- `user_agents.json` — one case per line: a raw `User-Agent` string and the
  crawler id it must classify as (or `null`).
- `referrers.json` — one case per line: a raw `Referer` header value and the
  AI-referrer id it must classify as (or `null`).
- `logs/*.log` — small, hand-written access logs, one per supported format
  (`nginx` and `apache` combined, `cloudfront`, `alb`), each with a couple of
  malformed lines mixed in.
- `logs/*.expected.json` — the golden `Report.to_dict()` output for the
  matching `.log` file. Regenerate with
  `cd python && uv run python scripts/write_golden.py` after an intentional
  behaviour change, and review the diff before committing: an unreviewed
  change here breaks parity with the TS port.

## `user_agents.json` case shape

```json
{ "ua": "...", "expect": { "id": "openai-gptbot" } | null, "kind": "vendor", "source": "https://...", "note": "optional" }
```

`kind` records how trustworthy the sample is:

- `"vendor"` — copied verbatim from the vendor's own documentation.
- `"observed"` — a real UA seen in the wild, matching the vendor's documented
  token, but the exact string isn't itself published by the vendor.
- `"token"` — a synthetic, minimal string built only from the documented
  token, used when neither of the above is available.
- `"negative"` — expected to match nothing (a browser, a non-AI bot, a
  `robots_only` token that must never match as a user agent, `""`, …).
  Negative cases carry a `label` instead of a `source`.

Every crawler with `match: "user_agent"` in `signals.json` needs at least one
`vendor`/`observed`/`token` case here (enforced by
`test_conformance.py::test_every_user_agent_crawler_has_a_positive_fixture`).
`robots_only` tokens (`Google-Extended`, `Applebot-Extended`) never appear in
a UA string by design — they're exercised by the robots.txt checker (Epic 3),
not by these fixtures.

## `referrers.json` case shape

```json
{ "referrer": "https://...", "own_host": "optional", "expect": { "id": "chatgpt" } | null, "note": "optional" }
```

- `referrer` — a raw `Referer` header value / `document.referrer`.
- `own_host` — optional; when present, classification is run with that value
  as the site's own host, so a referrer that would otherwise match a known AI
  product is asserted to be ignored as a self-referral instead.
- Every referrer in `signals.json` needs at least one positive case here
  (enforced by `test_every_referrer_has_a_positive_fixture`).

## The report JSON schema

This is exactly `Report.to_dict()` (see `python/src/rastrolog/report.py`),
also what `rastrolog parse --json` prints.

```
{
  "summary": {
    "records": int,             # total parsed records, before --since filtering
    "skipped": int,              # malformed lines skipped while parsing
    "ai_crawler_requests": int,  # sum of crawlers[].requests where ai_specific
    "ai_referral_visits": int    # sum of referrals[].visits
  },
  "crawlers": [
    {
      "id": str,                # "<vendor>-<token lowercased>"
      "vendor": str,
      "vendor_name": str,
      "token": str,
      "purpose": "training" | "user_fetch" | "search_index",
      "ai_specific": bool,       # false for search-engine crawlers (Googlebot, bingbot)
      "requests": int,
      "unique_pages": int,
      "last_seen": str,          # ISO 8601, UTC, whole seconds, "+00:00" offset
      "top_pages": [ { "path": str, "count": int }, ... ]
    }, ...
  ],
  "referrals": [
    {
      "id": str,                 # the referrer product slug
      "vendor": str,
      "vendor_name": str,
      "product": str,
      "visits": int,
      "unique_pages": int,
      "last_seen": str,          # same format as above
      "top_pages": [ { "path": str, "count": int }, ... ]
    }, ...
  ],
  "pages": [
    {
      "path": str,
      "crawler_requests": int,
      "referral_visits": int,
      "crawlers": [ { "token": str, "count": int }, ... ],
      "referrals": [ { "product": str, "count": int }, ... ]
    }, ...
  ]
}
```

### Ordering rules

- `crawlers` and `referrals`: sorted by count descending (`requests` /
  `visits`), then by `id` ascending to break ties.
- `top_pages` (inside a crawler or referral row): sorted by count descending,
  then by `path` ascending, limited to the report's `top` (default 10).
- `pages`: sorted by `crawler_requests + referral_visits` descending, then by
  `path` ascending, limited to the report's `top` (default 10) — unlike
  `top_pages`, this also *filters* the list, not just each row's detail.

### Timestamps

`last_seen` is always UTC, truncated to whole seconds
(`datetime.replace(microsecond=0).isoformat()`), with a `+00:00` offset —
never a bare `Z` and never sub-second precision, even though some source
formats (ALB) carry fractional seconds. This keeps the JSON portable across
implementations that don't preserve microsecond precision.

### Path normalisation (current behaviour)

- The query string and fragment are always dropped: `/pricing?utm_source=x`
  and `/pricing#section` both count as `/pricing`.
- CloudFront's `cs-uri-stem` field is percent-decoded before use.
- Combined (nginx/Apache) and ALB request paths are **not** percent-decoded.
  This is a documented gap, not an oversight: those formats don't reliably
  distinguish an already-decoded path from a literal `%2F` in a filename, so
  rastrolog leaves them as the log wrote them.

### Golden generation parameters

`logs/*.expected.json` is generated with `top=10` and no `--since` filter
(the whole file is aggregated). If you need a fixture for a different `top`
or a `since` cutoff, write it as a one-off unit test fixture instead of a
golden file — the golden files exist to pin the shared, default-options
output for the TypeScript port.
