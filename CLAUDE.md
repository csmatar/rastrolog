# rastrolog

Open-source classifier for AI crawler and AI referral traffic. Three deliverables share one data file:

- `python/`: PyPI package `rastrolog` (library, CLI, FastAPI/Django middleware), managed with **uv**
- `js/`: pnpm workspace; `js/core` (private shared TS) and `js/snippet` (npm `rastrolog`)
- `site/`: Astro static landing page

Specs live in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`. Read the overview spec first.

## Rules

- `signals.json` at the repo root is the source of truth. Any change to it needs: a schema-valid entry verified against vendor docs, at least one positive fixture in `conformance/`, and a `CHANGELOG.md` entry. The only exception to vendor docs is an entry with `"vendor_documented": false` and a reputable third-party `docs_url` (currently Bytespider only), and it requires a human decision.
- Python and TS classifiers must pass the same `conformance/` fixtures. Never special-case one language.
- Core Python modules import only the standard library; `rich`/`typer` are allowed only in `cli.py`, `render.py` and `theme.py`.
- Host nothing, store nothing: no network calls from the snippet, no backend or proxy for the site, no cookies/localStorage.
- Snippet budget: ≤ 2 KB gzipped.
- The private planning note at the repo root is gitignored; never commit or quote it.

## Commands

Python (run from `python/`):

```bash
uv sync                       # create/update .venv from uv.lock
uv run pytest                 # tests (perf smoke excluded; add `-m perf` to run it)
uv run pytest --cov=rastrolog --cov-fail-under=90
uv run ruff check . && uv run ruff format --check .
uv run mypy                   # strict, src/ only
uv run rastrolog parse ../conformance/logs/nginx.log
uv build                      # sdist + wheel (bundles ../signals.json)
```

Pre-commit: `cd python && uv run pre-commit install` once; hooks run ruff, mypy, JSON/YAML checks, and the signals.json schema check.

## Releasing

1. Bump `version` in `python/pyproject.toml` and run `cd python && uv lock`.
2. In `CHANGELOG.md`, rename **Unreleased** to `[x.y.z] - YYYY-MM-DD` and start a new empty **Unreleased**.
3. Merge to `main`, then tag `vX.Y.Z` and push the tag. `release.yml` checks that the tag matches the version, builds, and publishes to PyPI through trusted publishing.

One-time setup (already done, documented for reference): a PyPI pending trusted publisher configured for owner `csmatar`, repo `rastrolog`, workflow `release.yml`, environment `pypi`; and a GitHub `pypi` environment on this repo.

Never publish from a laptop. `uv publish`, `npm publish` and `pnpm publish` are denied in `.claude/settings.json`.
