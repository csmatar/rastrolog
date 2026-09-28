# Changelog

All notable changes to rastrolog are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Changes to `signals.json` are listed
under **Signals** so they're easy to scan when updating robots.txt.

## [Unreleased]

### Signals

- Initial list: 28 crawler tokens (26 matched in user agents, 2 robots.txt-only)
  across OpenAI, Anthropic, Perplexity, Google, Microsoft, Common Crawl, ByteDance,
  Amazon, Apple, Meta, DuckDuckGo, You.com and Mistral AI; 12 AI referrer products.
  Bytespider is sourced from third-party documentation (`vendor_documented: false`).

### Added

- `rastrolog` Python package: classifier, log parser, CLI, ASGI and Django middleware.
