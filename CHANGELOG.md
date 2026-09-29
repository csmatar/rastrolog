# Changelog

All notable changes to rastrolog are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Changes to `signals.json` are listed
under **Signals** so they're easy to scan when updating robots.txt.

## [Unreleased]

### Changed

- CLI: `--by page` lists one crawler/referral per line so a name is never split from its count, and the crawler, referral and page tables draw a line between rows so multi-line cells read as one row.

### Fixed

- CLI: report "is a directory" when a directory path is passed to `rastrolog parse` instead of "file not found".
- CLI: add referrer URL hint when a bare host without scheme is passed to `rastrolog check`.

## [0.1.0] - 2026-09-29

### Signals

- Initial list: 28 crawler tokens (26 matched in user agents, 2 robots.txt-only)
  across OpenAI, Anthropic, Perplexity, Google, Microsoft, Common Crawl, ByteDance,
  Amazon, Apple, Meta, DuckDuckGo, You.com and Mistral AI; 12 AI referrer products.
  Bytespider is sourced from third-party documentation (`vendor_documented: false`).

### Added

- `rastrolog` Python package: classifier, log parser, CLI, ASGI and Django middleware.
