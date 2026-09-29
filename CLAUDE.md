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

JS (run from `js/`; Node 24, pnpm from `packageManager`):

```bash
pnpm install                                 # respects minimumReleaseAge (7 days)
pnpm run lint && pnpm run typecheck          # biome + tsc (codegen runs first)
pnpm run test                                # vitest, including the TS conformance suite
pnpm run build                               # js/snippet/dist: snippet.min.js, index.js, types
pnpm --filter rastrolog run test:bundle      # forbidden network APIs + published types
pnpm --filter rastrolog run size             # ≤ 2 KB gzipped
pnpm --filter rastrolog run e2e              # Playwright (needs a build and `playwright install chromium`)
```

`js/core/src/*.gen.ts` are generated from `signals.json` by `js/core/scripts/codegen.ts` and gitignored.

Pre-commit: `cd python && uv run pre-commit install` once; hooks run ruff, mypy, JSON/YAML checks, and the signals.json schema check.

## Repository workflow and security

- `main` is protected by the `protect-main` ruleset: changes land only through a PR, squash-merged, with a code-owner approval and green required checks (CI matrix, wheel checks, JS and e2e, CodeQL, zizmor). Work on a branch; never push to `main`.
- Every third-party action is pinned to a full commit SHA with a `# vX.Y.Z` comment; checkouts use `persist-credentials: false`; each job declares minimal, commented `permissions`. Run `uvx zizmor --persona=pedantic .github/` after touching a workflow; CI enforces it.
- Dependabot bumps pinned actions, `python/uv.lock` and `js/pnpm-lock.yaml` weekly with a 7-day cooldown. CodeQL (Python, JS/TS and Actions) and OpenSSF Scorecard report to Security → Code scanning.
- JS supply chain: `pnpm install --frozen-lockfile` in CI, `minimumReleaseAge: 10080` and a build-script allowlist in `js/pnpm-workspace.yaml`. The published package has no runtime dependencies; keep it that way.
- Vulnerabilities are reported privately (SECURITY.md); never discuss an unfixed vulnerability in a public issue or PR.

## Releasing

1. Bump `version` in `python/pyproject.toml` **and** `js/snippet/package.json` to the same value, then run `cd python && uv lock`.
2. In `CHANGELOG.md`, rename **Unreleased** to `[x.y.z] - YYYY-MM-DD` and start a new empty **Unreleased**.
3. Pin the new snippet in the READMEs: `cd js && pnpm install --frozen-lockfile && pnpm --filter rastrolog run build && pnpm --filter rastrolog run sri --write ../../README.md README.md`.
4. Merge the PR to `main`, then tag `vX.Y.Z` on `main` and push the tag (only admins can create `v*` tags). `release.yml` does the rest:
   - checks that the tag matches both versions and the README SRI hash;
   - runs both test suites and builds both packages;
   - waits for a maintainer to approve each of the `pypi` and `npm` deployments;
   - publishes through trusted publishing, with provenance on npm.

   If one registry publishes and the other fails, re-run only the failed publish job for the same tag; never bump the version to recover. For npm before trusted publishing is set up, that means minting a fresh one-day token first.

Configured (0.1.0 shipped with it): PyPI trusted publisher for owner `csmatar`, repo `rastrolog`, workflow `release.yml`, environment `pypi`; GitHub `pypi` environment with a required reviewer (`@csmatar`) and a `v*` tag rule.

npm (first release, 0.2.0): trusted publishing can only be set up for an existing package. Before tagging v0.2.0:
1. Create the GitHub `npm` environment (required reviewer `@csmatar`, `v*` tags only).
2. Store a granular npm token that expires in 1 day as its secret `NPM_FIRST_PUBLISH_TOKEN`.

After v0.2.0 is on npm:
1. Add the trusted publisher on npmjs.com (repo `csmatar/rastrolog`, workflow `release.yml`, environment `npm`).
2. Delete the token and the secret, and set the package to disallow token publishing.
3. Open a PR that removes the `NODE_AUTH_TOKEN` env block from `release.yml`.

Never publish from a laptop. `uv publish`, `npm publish` and `pnpm publish` are denied in `.claude/settings.json`.
