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
  malformed lines mixed in, plus tiny edge-case logs that pin one rule each:
  - `alb-microseconds.log` — ALB timestamps with fractional seconds, including
    `.999999`, to pin that `last_seen` is truncated, not rounded;
  - `cloudfront-encoded-stem.log` — `cs-uri-stem` values with encoded `%3F`,
    `%23` and UTF-8, to pin CloudFront's cut-then-decode rule (see
    [Path normalisation](#path-normalisation)).
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
- `"synthetic"` — a hand-made variant of a documented UA that exercises a
  matching rule (for example, a lowercased UA that must still match, because
  token matching is case-insensitive). Not a string anyone has seen in a log.
- `"token"` — a synthetic, minimal string built only from the documented
  token, used when neither `vendor` nor `observed` is available.
- `"negative"` — expected to match nothing (a browser, a non-AI bot, a
  `robots_only` token that must never match as a user agent, `""`, …).
  Negative cases carry a `label` (used as a stable name by the tests) and
  `"source": null`.

Every crawler with `match: "user_agent"` in `signals.json` needs at least one
`vendor`/`observed`/`synthetic`/`token` case here (enforced by
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

### Referrer matching rules

1. Surrounding whitespace is stripped. An empty value, a value without a
   scheme (`chatgpt.com`), or one whose host can't be parsed matches nothing.
   Any scheme is accepted.
2. Only the URL's hostname is used (port, userinfo, path, query and fragment
   are ignored). It's normalised by lowercasing, dropping trailing `.`s,
   then dropping one leading `www.` (`normalize_host` in
   `python/src/rastrolog/classify.py`).
3. `own_host` is normalised the same way and compared to the referrer host by
   **exact** equality, not as a subdomain: `own_host: "chatgpt.com"` ignores
   `https://www.chatgpt.com/` but not `https://foo.chatgpt.com/`, which still
   classifies as `chatgpt`. The fixture
   `{ "referrer": "https://chatgpt.com/", "own_host": "www.chatgpt.com", "expect": null }`
   passes only because of the `www.` stripping on both sides.
4. Otherwise the host matches a listed referrer host exactly or as any
   subdomain of it (`a.b.chatgpt.com` matches `chatgpt.com`).
5. Classification must stay linear in the input length. Only a host suffix with
   at most as many labels as the longest listed host (3, for
   `notebooklm.google.com`) can match, so implementations check just those
   suffixes, longest first. Checking every suffix of a host with thousands of
   labels is quadratic ([GHSA-j9gx-mm38-pr3j](https://github.com/csmatar/rastrolog/security/advisories/GHSA-j9gx-mm38-pr3j)).

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
- `pages[].crawlers` and `pages[].referrals`: sorted by `count` descending,
  then by name (`token` / `product`) ascending. They are **not** limited by
  `top`: every crawler and referrer that touched the page is listed.
- "Ascending" compares strings by Unicode code point (Python's default `str`
  ordering). A JavaScript port must not use `localeCompare`. Plain `<`
  compares UTF-16 code units, which agrees with code-point order except for
  characters outside the Basic Multilingual Plane (emoji, for example).

### What counts where

- A request whose user agent classifies as a crawler is **only** a crawler,
  even if it also carries an AI referrer; referrer classification runs only
  for requests that aren't crawlers.
- `crawlers` lists every matched crawler, including search engines
  (`ai_specific: false`).
- The `pages` pivot counts only `ai_specific` crawlers: Googlebot, bingbot
  and Applebot requests never appear in `pages[].crawlers` or
  `pages[].crawler_requests`, and a path that only they touched isn't in
  `pages` at all. Every AI referral counts.

### Timestamps

`last_seen` is always UTC, truncated to whole seconds
(`datetime.replace(microsecond=0).isoformat()`), with a `+00:00` offset —
never a bare `Z` and never sub-second precision, even though some source
formats (ALB) carry fractional seconds. This keeps the JSON portable across
implementations that don't preserve microsecond precision. Fractions are
dropped, never rounded: `08:15:30.999999Z` serialises as `08:15:30+00:00`
(pinned by `logs/alb-microseconds.log`).

### Path normalisation

Combined (nginx/Apache) and ALB logs record the request target from the
request line (`GET <target> HTTP/1.1`):

- The query string and fragment are dropped: `/pricing?utm_source=x`
  and `/pricing#section` both count as `/pricing`.
- An absolute-form target (starting with `http://` or `https://`, which is what
  ALB always logs) has its scheme, host and port stripped:
  `https://www.example.com:443/docs?a=b` counts as `/docs`.
- An empty path becomes `/` (`https://www.example.com:443` counts as `/`).
- An absolute-form target whose URL can't be parsed (for example an
  unterminated IPv6 host, `http://[::1/x`) becomes `-`, as does a request line
  with no target at all.
- The remaining path is **not** percent-decoded.
  This is a documented gap, not an oversight: those formats don't reliably
  distinguish an already-decoded path from a literal `%2F` in a filename, so
  rastrolog leaves them as the log wrote them.

CloudFront logs the path and the query in separate fields (`cs-uri-stem`,
`cs-uri-query`), so the stem never holds a real query or fragment:

- `cs-uri-stem` is cut at the first `?` or `#` (a no-op for real CloudFront
  logs) and an empty stem becomes `/`, **then** it is percent-decoded as
  UTF-8. Cutting first means an encoded `%3F` or `%23` stays in the path:
  `/a%3Fb` counts as `/a?b`, `/docs%23intro` as `/docs#intro`, and
  `/caf%C3%A9` as `/café` (pinned by `logs/cloudfront-encoded-stem.log`).
- Invalid UTF-8 after decoding becomes U+FFFD (`�`) rather than an error;
  a malformed escape such as `%zz` is kept literally. (JavaScript's
  `decodeURIComponent` throws on both, so a port needs its own decoder.)
- `cs(User-Agent)` and `cs(Referer)` are percent-decoded too.

### Golden generation parameters

`logs/*.expected.json` is generated with `top=10` and no `--since` filter
(the whole file is aggregated). If you need a fixture for a different `top`
or a `since` cutoff, write it as a one-off unit test fixture instead of a
golden file — the golden files exist to pin the shared, default-options
output for the TypeScript port.
