# Changelog

All notable changes to rastrolog are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Changes to `signals.json` are listed
under **Signals** so they're easy to scan when updating robots.txt.

## [Unreleased]

## [0.1.2] - 2026-09-29

### Security

- `classify_referrer` (and so the ASGI/Django middleware and `rastrolog parse`) did quadratic work on a referrer whose host has many dot-separated labels, so a crafted `Referer` header could cost tens to hundreds of milliseconds of CPU per request. It now checks only the host suffixes that can match a listed referrer, which is linear and gives identical results ([GHSA-j9gx-mm38-pr3j](https://github.com/csmatar/rastrolog/security/advisories/GHSA-j9gx-mm38-pr3j)).

### Fixed

- CloudFront: an encoded `%3F` or `%23` in `cs-uri-stem` is now kept as part of the path (`/a%3Fb` counts as `/a?b`) instead of truncating it; the stem is cut before it's percent-decoded, not after (#6).

### Documentation

- `conformance/README.md` now spells out every rule a port needs: referrer and `own_host` host normalisation, ordering inside `pages[]`, which crawlers the page pivot counts, absolute-form request targets, and CloudFront decoding. New edge-case fixtures pin sub-second `last_seen` truncation and CloudFront stem decoding (#6, #8).

## [0.1.1] - 2026-09-29

### Changed

- CLI: `--by page` lists one crawler/referral per line so a name is never split from its count, and the crawler, referral and page tables draw a line between rows so multi-line cells read as one row (#21).

### Fixed

- CLI: report "is a directory" when a directory path is passed to `rastrolog parse` instead of "file not found" (#18, thanks @HeaTTap).
- CLI: add referrer URL hint when a bare host without scheme is passed to `rastrolog check` (#18, thanks @HeaTTap).

## [0.1.0] - 2026-09-29

### Signals

- Initial list: 28 crawler tokens (26 matched in user agents, 2 robots.txt-only)
  across OpenAI, Anthropic, Perplexity, Google, Microsoft, Common Crawl, ByteDance,
  Amazon, Apple, Meta, DuckDuckGo, You.com and Mistral AI; 12 AI referrer products.
  Bytespider is sourced from third-party documentation (`vendor_documented: false`).

### Added

- `rastrolog` Python package: classifier, log parser, CLI, ASGI and Django middleware.
