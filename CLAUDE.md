# rastrolog

Open-source classifier for AI crawler and AI referral traffic. Three deliverables share one data file:

- `python/`: PyPI package `rastrolog` (library, CLI, FastAPI/Django middleware), managed with **uv**
- `js/`: pnpm workspace; `js/core` (private shared TS) and `js/snippet` (npm `rastrolog`)
- `site/`: Astro static landing page

Specs live in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`. Read the overview spec first.

## Rules

- `signals.json` at the repo root is the source of truth. Any change to it needs: a schema-valid entry verified against vendor docs, at least one positive fixture in `conformance/`, and a `CHANGELOG.md` entry. The only exception to vendor docs is an entry with `"vendor_documented": false` and a reputable third-party `docs_url` (currently Bytespider only), and it requires a human decision.
- Python and TS classifiers must pass the same `conformance/` fixtures. Never special-case one language.
- Core Python modules import only the standard library; `rich`/`typer` are allowed only in `cli.py` and `theme.py`.
- Host nothing, store nothing: no network calls from the snippet, no backend or proxy for the site, no cookies/localStorage.
- Snippet budget: ≤ 2 KB gzipped.
- The private planning note at the repo root is gitignored; never commit or quote it.

## Commands

Filled in as each epic is scaffolded.
