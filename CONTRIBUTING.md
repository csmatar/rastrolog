# Contributing to rastrolog

Thanks for your interest. rastrolog is a classifier and a checker, kept small on purpose;
these notes keep it that way.

## The most valuable contribution: keeping the list current

`signals.json` is the product. To add or fix an AI crawler or referrer:

1. Edit `signals.json`. Crawlers need a `docs_url` pointing to the **vendor's own
   documentation**. If the vendor publishes nothing, a reputable third-party source is
   accepted, but the entry must carry `"vendor_documented": false`.
2. Add at least one fixture to `conformance/` (a real user-agent string in
   `user_agents.json`, or a referrer URL in `referrers.json`).
3. Add a line under **Unreleased → Signals** in `CHANGELOG.md`.

CI fails if step 2 is missing. Not sure how to do it? Open a
[new bot / referrer issue](https://github.com/csmatar/rastrolog/issues/new?template=new_signal.yml)
with the vendor link and a sample, and we'll add it.

## Setup

Requires [uv](https://docs.astral.sh/uv/). Python code lives in `python/`:

```sh
cd python
uv sync                    # creates .venv from uv.lock
uv run pre-commit install  # ruff, mypy, JSON/YAML and signals.json schema checks on commit
```

## The gate

Everything below must pass before a PR merges (CI runs the same on Python 3.10–3.14):

```sh
cd python
uv run ruff check . && uv run ruff format --check .
uv run mypy                                      # strict
uv run pytest --cov=rastrolog --cov-fail-under=90
```

Changing a workflow? Also run `uvx zizmor --persona=pedantic .github/`: CI runs it as a
required check.

## Ground rules

- **Test first.** Write the failing test, watch it fail, then make it pass.
- **Host nothing, store nothing.** No network calls, no telemetry, no visitor identity. The
  project classifies where a visit came from, never who made it.
- **Core stays standard-library only.** `rich` and `typer` are allowed only in `cli.py`,
  `render.py` and `theme.py`.
- **One contract, two languages.** The Python and (upcoming) TypeScript classifiers must
  pass the same `conformance/` fixtures. Never special-case one language; if behaviour
  changes, update the fixtures and regenerate the golden reports
  (`uv run python scripts/write_golden.py`) and review the diff.
- **Kept small on purpose.** Hosted dashboards, visitor identification, alerts that
  require storing data, and server-side proxies are out of scope. Use the `on_match`
  callback and the JSON output to build what you need on top.

## Pull requests

`main` is protected: open a PR from a branch or fork. It merges when the required checks
are green, conversations are resolved, and a code owner approves. Merges are
**squash-only**, so write the PR title as a Conventional Commit (`feat:`, `fix:`,
`docs:`, `ci:`, …); it becomes the commit on `main`.

## Security

Please don't report vulnerabilities in public issues; see [SECURITY.md](SECURITY.md).

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
