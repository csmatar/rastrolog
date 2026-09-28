# Epic 1: rastrolog Python package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `rastrolog` PyPI package. It has a stdlib-only classifier and log parser, a Charm-styled CLI (`rastrolog parse` / `rastrolog check`), and ASGI + Django middleware. It also creates the shared `signals.json` and `conformance/` foundation.

**Architecture:** `signals.json` at the repo root is the single data source. A hatch build hook bundles it into the wheel, and an editable/dev install falls back to reading the repo-root file. Pure stdlib modules (`signals`, `classify`, `formats`, `parse`, `report`, `nudge`, `middleware/*`) sit under a thin presentation layer (`theme`, `render`, `cli`), which is the only code importing `rich`/`typer`. Language-neutral fixtures in `conformance/` pin behaviour so the TypeScript port in Epic 2 must agree.

**Tech Stack:** Python ≥ 3.10, uv, hatchling (custom build hook), rich, typer, pytest + pytest-cov, mypy `--strict`, ruff, jsonschema (tests only), starlette + django (tests only), pre-commit, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-28-rastrolog-overview-design.md` and `docs/superpowers/specs/2026-09-28-epic-1-python-package-design.md`. Read both before starting. GitHub epic: #1.

**Branch:** do all work on `epic-1-python` (created in Task 1), open a PR to `main` at the end.

## Global Constraints

- Python floor: `requires-python = ">=3.10"`; CI matrix 3.10, 3.11, 3.12, 3.13, 3.14.
- Runtime dependencies: exactly `rich` and `typer`. Only `rastrolog/theme.py`, `rastrolog/render.py` and `rastrolog/cli.py` may import them.
- Every other module in `src/rastrolog/` imports only the standard library (the middleware modules may import Django/asgiref because they are only imported by Django users).
- `signals.json` lives only at the repo root. Never commit a copy inside `python/src/rastrolog/` (it is gitignored).
- Every `signals.json` entry needs: schema-valid shape, a vendor-doc source, a positive fixture in `conformance/`, and a `CHANGELOG.md` line.
- No network calls anywhere in the package. No cookies, identity, or visitor data.
- Names: PyPI/npm/import/CLI are all `rastrolog`. Crawler ids are `<vendor>-<token lowercased>`; referrer ids are the product slug (`chatgpt`, `claude`, …).
- Page paths in reports drop the query string and fragment (`/pricing?utm_source=x` counts as `/pricing`).
- Referral counting: a request counts as a referral only if its UA did **not** classify as a crawler.
- `mypy --strict` clean on `src/`; `ruff check` and `ruff format --check` clean; coverage ≥ 90% on `rastrolog`.
- Commit messages: Conventional Commits (`feat:`, `test:`, `chore:`, `docs:`, `ci:`). No co-author trailers (the repo's `.claude/settings.json` already disables them).
- Run all Python commands from `python/` (`cd python && uv run …`).

## Review Focus

The five inputs most likely to hurt real users that the spec doesn't spell out. Each one has a pinned test in the task that owns the code:

1. **Timezone offsets and locale in combined logs.** `[28/Sep/2026:07:00:00 -0500]` must become 12:00 UTC no matter what the machine's locale is, so month names are parsed by our own table and never via `strptime("%b")`. Covered in Task 4.
2. **Escaped quotes inside quoted fields.** Apache writes `\"` and nginx writes `\x22` inside the UA or referrer. These lines must parse normally and must not be counted as malformed. Covered in Task 4.
3. **CRLF line endings, blank lines and invalid UTF-8 bytes.** Logs copied from Windows or containing garbage bytes must still parse. Bad bytes are replaced rather than crashing the parse. Covered in Task 5.
4. **Query strings and fragments on paths.** ChatGPT appends `?utm_source=chatgpt.com` to the links it cites, and `/pricing?utm_source=chatgpt.com` must merge with `/pricing` in top pages. ALB logs carry absolute URLs (`https://host:443/docs?x`), which must reduce to `/docs`. Covered in Tasks 4 and 6.
5. **Referrer host spelling variants.** `https://ChatGPT.com:443/c/1`, a trailing-dot host `https://claude.ai./`, `https://www.perplexity.ai/search` and subdomains must all classify. Schemeless or garbage referrers and bracket-broken IPv6 URLs must return `None` rather than raising. Covered in Task 3.

## File Map

```
LICENSE                                  MIT (root)
CHANGELOG.md                             Keep a Changelog; signals entries
signals.json / signals.schema.json       the lists + JSON Schema
conformance/user_agents.json             real vendor UA → expected id
conformance/referrers.json               referrer URL → expected id / null
conformance/logs/{nginx,apache,cloudfront,alb}.log          same 14 logical events per format
conformance/logs/{nginx,apache,cloudfront,alb}.expected.json  golden Report.to_dict()
.pre-commit-config.yaml
.github/workflows/ci.yml, release.yml
python/
  pyproject.toml, hatch_build.py, LICENSE (copy of root), README.md
  scripts/write_golden.py                regenerates conformance/logs/*.expected.json
  src/rastrolog/
    __init__.py      public API re-exports + __version__
    py.typed
    signals.py       load signals.json → frozen dataclasses (cached)
    classify.py      Match, classify_user_agent, classify_referrer, classify_request
    formats.py       LogRecord, detect(), per-format line parsers, path normalisation
    parse.py         iter_records(): streaming, gzip by magic bytes, ParseStats
    report.py        Aggregator → Report (crawlers, referrals, pages), parse_since()
    nudge.py         one-time change-notification line (stdlib, config dir marker)
    theme.py         Charm-style rich Theme + purpose badges
    render.py        rich tables for a Report
    cli.py           typer app: parse, check, --version, bare help
    middleware/__init__.py
    middleware/asgi.py
    middleware/django.py
  tests/
    helpers.py       REPO_ROOT, CONFORMANCE, load_json, fixture case lists, sample UAs
    test_version.py, test_signals.py, test_conformance.py, test_classify.py,
    test_formats.py, test_parse.py, test_report.py, test_render.py, test_nudge.py,
    test_cli.py, test_middleware_asgi.py, test_middleware_django.py, test_perf.py
```

---

### Task 1: Python project skeleton, tooling and CI

**Files:**
- Create: `LICENSE`, `python/LICENSE`, `python/pyproject.toml`, `python/hatch_build.py`, `python/README.md`, `python/src/rastrolog/__init__.py`, `python/src/rastrolog/py.typed`, `python/tests/test_version.py`, `.pre-commit-config.yaml`, `.github/workflows/ci.yml`
- Modify: `.gitignore`, `CLAUDE.md`

**Interfaces:**
- Consumes: nothing.
- Produces: installable package `rastrolog` with `rastrolog.__version__: str`; `uv` project in `python/`; CI running ruff, mypy, pytest on 3.10–3.14.

- [ ] **Step 1: Create the branch**

```bash
git switch -c epic-1-python
```

- [ ] **Step 2: Add licenses**

`LICENSE` (repo root) and `python/LICENSE` (identical copy; hatchling requires license files inside the project dir):

```text
MIT License

Copyright (c) 2026 Carlos Saldaña Matar

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 3: Write `python/pyproject.toml`**

```toml
[project]
name = "rastrolog"
version = "0.1.0"
description = "See which AI crawlers read your site and which AI chat products send you visitors."
readme = "README.md"
license = "MIT"
license-files = ["LICENSE"]
authors = [{ name = "Carlos Saldaña Matar" }]
requires-python = ">=3.10"
keywords = ["ai", "crawler", "gptbot", "claudebot", "perplexitybot", "robots.txt", "referrer", "access-log", "analytics"]
classifiers = [
    "Development Status :: 4 - Beta",
    "Environment :: Console",
    "Framework :: Django",
    "Framework :: FastAPI",
    "Intended Audience :: Developers",
    "Intended Audience :: System Administrators",
    "Operating System :: OS Independent",
    "Programming Language :: Python :: 3",
    "Programming Language :: Python :: 3 :: Only",
    "Programming Language :: Python :: 3.10",
    "Programming Language :: Python :: 3.11",
    "Programming Language :: Python :: 3.12",
    "Programming Language :: Python :: 3.13",
    "Programming Language :: Python :: 3.14",
    "Topic :: Internet :: Log Analysis",
    "Topic :: Internet :: WWW/HTTP",
    "Typing :: Typed",
]
dependencies = ["rich>=13.9", "typer>=0.15"]

[project.optional-dependencies]
fastapi = ["fastapi>=0.115"]
django = ["django>=4.2"]

[project.urls]
Homepage = "https://github.com/csmatar/rastrolog"
Issues = "https://github.com/csmatar/rastrolog/issues"
Changelog = "https://github.com/csmatar/rastrolog/blob/main/CHANGELOG.md"

[dependency-groups]
dev = [
    "pytest>=9.0",
    "pytest-cov>=7.0",
    "mypy>=2.0",
    "ruff>=0.16",
    "jsonschema>=4.26",
    "types-jsonschema",
    "starlette>=0.46",
    "django>=5.2,<6; python_version < '3.12'",
    "django>=6.0; python_version >= '3.12'",
    "pre-commit>=4.0",
]

[build-system]
requires = ["hatchling>=1.27"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.sdist.force-include]
"../signals.json" = "src/rastrolog/signals.json"

[tool.hatch.build.targets.wheel]
packages = ["src/rastrolog"]

[tool.hatch.build.targets.wheel.hooks.custom]
path = "hatch_build.py"

[tool.ruff]
line-length = 100
target-version = "py310"

[tool.ruff.lint]
select = ["E", "F", "W", "I", "UP", "B", "SIM", "RUF", "PT", "C4", "PTH"]
ignore = ["E501"]  # ruff format owns line length; long literals in fixtures are fine
allowed-confusables = ["–", "·", "✗"]  # deliberate typography in CLI output

[tool.mypy]
strict = true
python_version = "3.10"
files = ["src"]

[[tool.mypy.overrides]]
module = ["django.*", "asgiref.*"]
ignore_missing_imports = true

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = ["-ra", "--strict-markers", "-m", "not perf"]
markers = ["perf: slow performance smoke test, run with -m perf"]

[tool.coverage.run]
source = ["rastrolog"]
branch = true

[tool.coverage.report]
exclude_also = ["if TYPE_CHECKING:", "raise NotImplementedError"]
```

- [ ] **Step 4: Write the build hook `python/hatch_build.py`**

This was prototyped. A symlink does not work, because hatchling rejects symlinks that point outside the project. An sdist `force-include` plus this hook works both for `uv build` (sdist → wheel) and for a direct `uv build --wheel`.

```python
"""Bundle the repo-root signals.json into the wheel.

Building from a git checkout, the canonical file is ../signals.json.
Building from an sdist, the sdist force-include already placed it at
src/rastrolog/signals.json, so there is nothing to add.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from hatchling.builders.hooks.plugin.interface import BuildHookInterface


class SignalsBuildHook(BuildHookInterface):
    def initialize(self, version: str, build_data: dict[str, Any]) -> None:
        if version == "editable":
            return  # dev installs read the repo-root file directly (see rastrolog/signals.py)
        root_signals = Path(self.root).parent / "signals.json"
        if root_signals.is_file():
            build_data["force_include"][str(root_signals)] = "rastrolog/signals.json"
            return
        if not (Path(self.root) / "src" / "rastrolog" / "signals.json").is_file():
            msg = "signals.json not found at the repo root or in src/rastrolog/"
            raise FileNotFoundError(msg)
```

- [ ] **Step 5: Write a minimal `python/README.md`** (expanded in Task 12)

```markdown
# rastrolog

See which AI crawlers read your site and which AI chat products send you visitors.

Full documentation: https://github.com/csmatar/rastrolog
```

- [ ] **Step 6: Write the failing test `python/tests/test_version.py`**

```python
from importlib.metadata import version

import rastrolog


def test_version_matches_installed_distribution() -> None:
    assert rastrolog.__version__ == version("rastrolog")
```

- [ ] **Step 7: Run it to confirm it fails**

Run: `cd python && uv sync && uv run pytest tests/test_version.py -v`
Expected: `ModuleNotFoundError: No module named 'rastrolog'` (package directory doesn't exist yet). Note: `uv sync` may fail to build the editable package without `src/rastrolog/`. If it does, that failure is the expected "red"; continue to Step 8.

- [ ] **Step 8: Create the package**

`python/src/rastrolog/py.typed`: empty file.

`python/src/rastrolog/__init__.py`:

```python
"""Classify AI crawler and AI referral traffic."""

from importlib.metadata import version as _version

__version__ = _version("rastrolog")

__all__ = ["__version__"]
```

- [ ] **Step 9: Run the test to confirm it passes**

Run: `cd python && uv sync && uv run pytest tests/test_version.py -v`
Expected: `1 passed`. `uv sync` creates `python/uv.lock` and should be committed.

- [ ] **Step 10: Gitignore the build-time copy of signals.json**

Append to `.gitignore`:

```gitignore

# Build-time copy (canonical file is the repo-root signals.json)
python/src/rastrolog/signals.json
```

- [ ] **Step 11: Add `.pre-commit-config.yaml`** (repo root)

```yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v6.0.0
    hooks:
      - id: check-json
      - id: check-yaml
      - id: check-toml
      - id: end-of-file-fixer
      - id: trailing-whitespace
        args: [--markdown-linebreak-ext=md]
      - id: check-merge-conflict
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.16.9
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format
  - repo: https://github.com/python-jsonschema/check-jsonschema
    rev: 0.38.2
    hooks:
      - id: check-jsonschema
        name: validate signals.json
        files: ^signals\.json$
        args: [--schemafile, signals.schema.json]
  - repo: local
    hooks:
      - id: mypy
        name: mypy (python/)
        entry: uv run --directory python mypy
        language: system
        pass_filenames: false
        files: ^python/src/
```

Install the hook: `cd python && uv run pre-commit install` (pre-commit changes to the git root on its own).

- [ ] **Step 12: Add CI `.github/workflows/ci.yml`**

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  python:
    name: python ${{ matrix.python }}
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        python: ["3.10", "3.11", "3.12", "3.13", "3.14"]
    defaults:
      run:
        working-directory: python
    steps:
      - uses: actions/checkout@v7
      - uses: astral-sh/setup-uv@v10
        with:
          python-version: ${{ matrix.python }}
          enable-cache: true
      - run: uv sync --locked
      - run: uv run ruff check .
      - run: uv run ruff format --check .
      - run: uv run mypy
      - run: uv run pytest --cov=rastrolog --cov-report=term-missing --cov-fail-under=90
```

- [ ] **Step 13: Fill the Commands section of `CLAUDE.md`**

Replace the line `Filled in as each epic is scaffolded.` with:

````markdown
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
````

- [ ] **Step 14: Run the full local gate**

Run: `cd python && uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest`
Expected: all clean, `1 passed`. If `ruff format --check` fails, run `uv run ruff format .` and re-run.

- [ ] **Step 15: Commit**

```bash
git add LICENSE python/ .pre-commit-config.yaml .github/workflows/ci.yml .gitignore CLAUDE.md
git commit -m "chore: scaffold rastrolog Python package with uv, hatch hook, tooling and CI"
```

---

### Task 2: `signals.json`, schema, conformance fixtures and loader

**Files:**
- Create: `signals.schema.json`, `signals.json`, `CHANGELOG.md`, `conformance/user_agents.json`, `conformance/referrers.json`, `python/src/rastrolog/signals.py`, `python/tests/helpers.py`, `python/tests/test_signals.py`, `python/tests/test_conformance.py`

**Interfaces:**
- Consumes: package skeleton (Task 1).
- Produces:
  - `rastrolog.signals.load_signals() -> Signals` (cached) and `parse_signals(data: dict[str, Any]) -> Signals`
  - `Signals(schema_version: int, updated: str, crawlers: tuple[CrawlerSignal, ...], referrers: tuple[ReferrerSignal, ...])`
  - `CrawlerSignal(id, vendor, vendor_name, token, match: Literal["user_agent","robots_only"], purpose: Literal["training","user_fetch","search_index"], ai_specific: bool, docs_url, vendor_documented: bool = True)`
  - `ReferrerSignal(id, vendor, vendor_name, product, hosts: tuple[str, ...], source_url)`
  - `helpers.REPO_ROOT`, `helpers.CONFORMANCE`, `helpers.LOGS`, `helpers.load_json(path)`, `helpers.UA_CASES`, `helpers.REFERRER_CASES`, `helpers.SAMPLE_UA` (keys: `gptbot`, `chatgpt_user`, `claudebot`, `perplexitybot`, `googlebot`, `browser`)

**Research notes (verified 2026-09-28; keep them in mind when reviewing PRs to the list):**
- **Referrers are matched by host only.** bing.com (Copilot), x.com (Grok) and duckduckgo.com (Duck.ai) all send an origin-only `Referer`, so markers like `/chat` or `/i/grok` never reach the server. This is why the approved spec's `path_prefixes`/`query_markers` fields were removed. Those hosts are documented gaps.
- **Anthropic publishes the token names but no full UA strings.** The ClaudeBot/Claude-User fixtures are marked `"kind": "observed"`, and Claude-SearchBot is `"kind": "token"`.
- **Bytespider is included on a third-party source** (human decision, 2026-09-28). ByteDance publishes nothing, so the entry carries `"vendor_documented": false`. Its `docs_url` points to Dark Visitors, and the ai.robots.txt project independently lists it as LLM training that ignores robots.txt. `vendor_documented: false` is the only allowed exception to "vendor docs only", and it must stay visible in the data.
- **Left out:** `cohere-ai` (Cohere says it runs no crawlers) and any Copilot-specific token (Microsoft publishes none; Copilot uses bingbot's index).
- **Added beyond the planning list because vendors document them:** OAI-SearchBot variants, Google-Agent, Google-GeminiNotebook, Amzn-SearchBot, Amzn-User, meta-externalfetcher, meta-webindexer, MistralAI-User, MistralAI-Index, MistralAI-Training. Referrers added: NotebookLM, Duck.ai, DeepSeek.
- **Applebot is `ai_specific: false`** because it powers Siri, Spotlight and Safari search. Its training opt-out is the robots-only `Applebot-Extended`.
- **Vendors write tokens in mixed case** (`bingbot` and `meta-externalagent` are lowercase), which is why matching is case-insensitive.

- [ ] **Step 1: Write the failing tests `python/tests/helpers.py`, `python/tests/test_signals.py`, `python/tests/test_conformance.py`**

`python/tests/helpers.py`:

```python
"""Shared test data: repo paths, conformance fixtures, sample user agents."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
CONFORMANCE = REPO_ROOT / "conformance"
LOGS = CONFORMANCE / "logs"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


UA_CASES: list[dict[str, Any]] = load_json(CONFORMANCE / "user_agents.json")
REFERRER_CASES: list[dict[str, Any]] = load_json(CONFORMANCE / "referrers.json")


def _ua_for(key: str) -> str:
    """First fixture UA whose label or expected id equals ``key``."""
    for case in UA_CASES:
        if case.get("label") == key or (case["expect"] and case["expect"]["id"] == key):
            return str(case["ua"])
    raise KeyError(key)


SAMPLE_UA = {
    "gptbot": _ua_for("openai-gptbot"),
    "chatgpt_user": _ua_for("openai-chatgpt-user"),
    "claudebot": _ua_for("anthropic-claudebot"),
    "perplexitybot": _ua_for("perplexity-perplexitybot"),
    "googlebot": _ua_for("google-googlebot"),
    "browser": _ua_for("browser-chrome"),
}
```

`python/tests/test_signals.py`:

```python
from pathlib import Path

import jsonschema
import pytest
from helpers import REPO_ROOT, load_json

from rastrolog import signals as signals_module
from rastrolog.signals import load_signals, parse_signals

RAW = load_json(REPO_ROOT / "signals.json")


def normalize_host(host: str) -> str:
    # Same rule as rastrolog.classify.normalize_host; duplicated so this data test
    # doesn't depend on the classifier.
    host = host.strip().lower().rstrip(".")
    return host[4:] if host.startswith("www.") else host


def test_signals_json_matches_schema() -> None:
    schema = load_json(REPO_ROOT / "signals.schema.json")
    jsonschema.Draft202012Validator.check_schema(schema)
    jsonschema.Draft202012Validator(schema, format_checker=jsonschema.FormatChecker()).validate(RAW)


def test_ids_are_unique() -> None:
    ids = [e["id"] for e in RAW["crawlers"]] + [e["id"] for e in RAW["referrers"]]
    assert len(ids) == len(set(ids))


def test_crawler_tokens_are_unique_ignoring_case() -> None:
    tokens = [e["token"].lower() for e in RAW["crawlers"]]
    assert len(tokens) == len(set(tokens))


def test_crawler_ids_follow_the_naming_rule() -> None:
    for entry in RAW["crawlers"]:
        assert entry["id"] == f"{entry['vendor']}-{entry['token'].lower()}"


def test_referrer_hosts_are_claimed_once() -> None:
    hosts = [normalize_host(h) for e in RAW["referrers"] for h in e["hosts"]]
    assert len(hosts) == len(set(hosts))


def test_loader_returns_typed_view() -> None:
    signals = load_signals()
    assert signals.schema_version == 1
    assert [c.id for c in signals.crawlers] == [e["id"] for e in RAW["crawlers"]]
    assert signals.referrers[0].hosts == tuple(RAW["referrers"][0]["hosts"])


def test_loader_is_cached() -> None:
    assert load_signals() is load_signals()


def test_bundled_file_wins_over_repo_copy(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    (tmp_path / "signals.json").write_text('{"marker": "bundled"}', encoding="utf-8")
    monkeypatch.setattr(signals_module, "files", lambda _pkg: tmp_path)
    assert signals_module._read_raw() == '{"marker": "bundled"}'


def test_third_party_sourced_entries_are_flagged_and_rare() -> None:
    third_party = [c for c in load_signals().crawlers if not c.vendor_documented]
    assert [c.id for c in third_party] == ["bytedance-bytespider"]
    assert third_party[0].docs_url.startswith("https://darkvisitors.com/")


def test_parse_signals_rejects_unknown_schema_version() -> None:
    with pytest.raises(ValueError, match="schema_version"):
        parse_signals({**RAW, "schema_version": 2})
```

`python/tests/test_conformance.py`:

```python
from typing import Any

import pytest
from helpers import REFERRER_CASES, UA_CASES

from rastrolog.signals import load_signals

POSITIVE_KINDS = {"vendor", "observed", "token"}


def test_every_user_agent_crawler_has_a_positive_fixture() -> None:
    wanted = {c.id for c in load_signals().crawlers if c.match == "user_agent"}
    covered = {case["expect"]["id"] for case in UA_CASES if case["expect"]}
    assert wanted - covered == set(), "add a real UA string to conformance/user_agents.json"


def test_every_referrer_has_a_positive_fixture() -> None:
    wanted = {r.id for r in load_signals().referrers}
    covered = {case["expect"]["id"] for case in REFERRER_CASES if case["expect"]}
    assert wanted - covered == set(), "add a referrer URL to conformance/referrers.json"


def test_fixtures_only_reference_known_ids() -> None:
    known = {c.id for c in load_signals().crawlers} | {r.id for r in load_signals().referrers}
    used = {case["expect"]["id"] for case in UA_CASES + REFERRER_CASES if case["expect"]}
    assert used <= known


@pytest.mark.parametrize("case", [c for c in UA_CASES if c["expect"]], ids=lambda c: c["expect"]["id"])
def test_positive_ua_fixtures_cite_a_source(case: dict[str, Any]) -> None:
    assert case["kind"] in POSITIVE_KINDS
    assert case["source"].startswith("https://")
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `cd python && uv run pytest tests/test_signals.py tests/test_conformance.py -v`
Expected: collection error `FileNotFoundError: .../conformance/user_agents.json` (raised while importing `helpers`).

- [ ] **Step 3: Write `signals.schema.json`** (repo root)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/csmatar/rastrolog/blob/main/signals.schema.json",
  "title": "rastrolog signals",
  "description": "AI crawler user-agent tokens and AI chat referrer hosts.",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema_version", "updated", "crawlers", "referrers"],
  "properties": {
    "$schema": { "type": "string" },
    "schema_version": { "const": 1 },
    "updated": { "$ref": "#/$defs/date" },
    "crawlers": { "type": "array", "items": { "$ref": "#/$defs/crawler" } },
    "referrers": { "type": "array", "items": { "$ref": "#/$defs/referrer" } }
  },
  "$defs": {
    "date": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$", "format": "date" },
    "slug": { "type": "string", "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$" },
    "https": { "type": "string", "pattern": "^https://" },
    "crawler": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "vendor", "vendor_name", "token", "match", "purpose", "ai_specific", "docs_url", "added"],
      "properties": {
        "id": { "$ref": "#/$defs/slug" },
        "vendor": { "$ref": "#/$defs/slug" },
        "vendor_name": { "type": "string", "minLength": 1 },
        "token": { "type": "string", "pattern": "^[A-Za-z0-9._-]+$" },
        "match": { "enum": ["user_agent", "robots_only"] },
        "purpose": { "enum": ["training", "user_fetch", "search_index"] },
        "ai_specific": { "type": "boolean" },
        "docs_url": { "$ref": "#/$defs/https" },
        "vendor_documented": {
          "type": "boolean",
          "description": "false when the vendor publishes nothing and docs_url is a third-party source. Omitted means true."
        },
        "added": { "$ref": "#/$defs/date" }
      }
    },
    "referrer": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "vendor", "vendor_name", "product", "hosts", "source_url", "added"],
      "properties": {
        "id": { "$ref": "#/$defs/slug" },
        "vendor": { "$ref": "#/$defs/slug" },
        "vendor_name": { "type": "string", "minLength": 1 },
        "product": { "type": "string", "minLength": 1 },
        "hosts": {
          "type": "array",
          "minItems": 1,
          "uniqueItems": true,
          "items": { "type": "string", "pattern": "^(?!www\\.)[a-z0-9-]+(\\.[a-z0-9-]+)+$" }
        },
        "source_url": { "$ref": "#/$defs/https" },
        "added": { "$ref": "#/$defs/date" }
      }
    }
  }
}
```

- [ ] **Step 4: Write `signals.json`** (repo root)

```json
{
  "$schema": "./signals.schema.json",
  "schema_version": 1,
  "updated": "2026-09-28",
  "crawlers": [
    { "id": "openai-gptbot", "vendor": "openai", "vendor_name": "OpenAI", "token": "GPTBot", "match": "user_agent", "purpose": "training", "ai_specific": true, "docs_url": "https://developers.openai.com/api/docs/bots", "added": "2026-09-28" },
    { "id": "openai-chatgpt-user", "vendor": "openai", "vendor_name": "OpenAI", "token": "ChatGPT-User", "match": "user_agent", "purpose": "user_fetch", "ai_specific": true, "docs_url": "https://developers.openai.com/api/docs/bots", "added": "2026-09-28" },
    { "id": "openai-oai-searchbot", "vendor": "openai", "vendor_name": "OpenAI", "token": "OAI-SearchBot", "match": "user_agent", "purpose": "search_index", "ai_specific": true, "docs_url": "https://developers.openai.com/api/docs/bots", "added": "2026-09-28" },
    { "id": "anthropic-claudebot", "vendor": "anthropic", "vendor_name": "Anthropic", "token": "ClaudeBot", "match": "user_agent", "purpose": "training", "ai_specific": true, "docs_url": "https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler", "added": "2026-09-28" },
    { "id": "anthropic-claude-user", "vendor": "anthropic", "vendor_name": "Anthropic", "token": "Claude-User", "match": "user_agent", "purpose": "user_fetch", "ai_specific": true, "docs_url": "https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler", "added": "2026-09-28" },
    { "id": "anthropic-claude-searchbot", "vendor": "anthropic", "vendor_name": "Anthropic", "token": "Claude-SearchBot", "match": "user_agent", "purpose": "search_index", "ai_specific": true, "docs_url": "https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler", "added": "2026-09-28" },
    { "id": "perplexity-perplexitybot", "vendor": "perplexity", "vendor_name": "Perplexity", "token": "PerplexityBot", "match": "user_agent", "purpose": "search_index", "ai_specific": true, "docs_url": "https://docs.perplexity.ai/guides/bots", "added": "2026-09-28" },
    { "id": "perplexity-perplexity-user", "vendor": "perplexity", "vendor_name": "Perplexity", "token": "Perplexity-User", "match": "user_agent", "purpose": "user_fetch", "ai_specific": true, "docs_url": "https://docs.perplexity.ai/guides/bots", "added": "2026-09-28" },
    { "id": "google-google-extended", "vendor": "google", "vendor_name": "Google", "token": "Google-Extended", "match": "robots_only", "purpose": "training", "ai_specific": true, "docs_url": "https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers", "added": "2026-09-28" },
    { "id": "google-googlebot", "vendor": "google", "vendor_name": "Google", "token": "Googlebot", "match": "user_agent", "purpose": "search_index", "ai_specific": false, "docs_url": "https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers", "added": "2026-09-28" },
    { "id": "google-google-agent", "vendor": "google", "vendor_name": "Google", "token": "Google-Agent", "match": "user_agent", "purpose": "user_fetch", "ai_specific": true, "docs_url": "https://developers.google.com/search/docs/crawling-indexing/google-user-triggered-fetchers", "added": "2026-09-28" },
    { "id": "google-google-gemininotebook", "vendor": "google", "vendor_name": "Google", "token": "Google-GeminiNotebook", "match": "user_agent", "purpose": "user_fetch", "ai_specific": true, "docs_url": "https://developers.google.com/search/docs/crawling-indexing/google-user-triggered-fetchers", "added": "2026-09-28" },
    { "id": "microsoft-bingbot", "vendor": "microsoft", "vendor_name": "Microsoft", "token": "bingbot", "match": "user_agent", "purpose": "search_index", "ai_specific": false, "docs_url": "https://blogs.bing.com/webmaster/2022/4/Announcing-user-agent-change-for-Bing-crawler-bingbot/", "added": "2026-09-28" },
    { "id": "commoncrawl-ccbot", "vendor": "commoncrawl", "vendor_name": "Common Crawl", "token": "CCBot", "match": "user_agent", "purpose": "training", "ai_specific": true, "docs_url": "https://commoncrawl.org/ccbot", "added": "2026-09-28" },
    { "id": "bytedance-bytespider", "vendor": "bytedance", "vendor_name": "ByteDance", "token": "Bytespider", "match": "user_agent", "purpose": "training", "ai_specific": true, "docs_url": "https://darkvisitors.com/agents/bytespider", "vendor_documented": false, "added": "2026-09-28" },
    { "id": "amazon-amazonbot", "vendor": "amazon", "vendor_name": "Amazon", "token": "Amazonbot", "match": "user_agent", "purpose": "training", "ai_specific": true, "docs_url": "https://developer.amazon.com/amazonbot", "added": "2026-09-28" },
    { "id": "amazon-amzn-searchbot", "vendor": "amazon", "vendor_name": "Amazon", "token": "Amzn-SearchBot", "match": "user_agent", "purpose": "search_index", "ai_specific": true, "docs_url": "https://developer.amazon.com/amazonbot", "added": "2026-09-28" },
    { "id": "amazon-amzn-user", "vendor": "amazon", "vendor_name": "Amazon", "token": "Amzn-User", "match": "user_agent", "purpose": "user_fetch", "ai_specific": true, "docs_url": "https://developer.amazon.com/amazonbot", "added": "2026-09-28" },
    { "id": "apple-applebot", "vendor": "apple", "vendor_name": "Apple", "token": "Applebot", "match": "user_agent", "purpose": "search_index", "ai_specific": false, "docs_url": "https://support.apple.com/en-us/119829", "added": "2026-09-28" },
    { "id": "apple-applebot-extended", "vendor": "apple", "vendor_name": "Apple", "token": "Applebot-Extended", "match": "robots_only", "purpose": "training", "ai_specific": true, "docs_url": "https://support.apple.com/en-us/119829", "added": "2026-09-28" },
    { "id": "meta-meta-externalagent", "vendor": "meta", "vendor_name": "Meta", "token": "meta-externalagent", "match": "user_agent", "purpose": "training", "ai_specific": true, "docs_url": "https://developers.facebook.com/documentation/sharing/webmasters/web-crawlers", "added": "2026-09-28" },
    { "id": "meta-meta-externalfetcher", "vendor": "meta", "vendor_name": "Meta", "token": "meta-externalfetcher", "match": "user_agent", "purpose": "user_fetch", "ai_specific": true, "docs_url": "https://developers.facebook.com/documentation/sharing/webmasters/web-crawlers", "added": "2026-09-28" },
    { "id": "meta-meta-webindexer", "vendor": "meta", "vendor_name": "Meta", "token": "meta-webindexer", "match": "user_agent", "purpose": "search_index", "ai_specific": true, "docs_url": "https://developers.facebook.com/documentation/sharing/webmasters/web-crawlers", "added": "2026-09-28" },
    { "id": "duckduckgo-duckassistbot", "vendor": "duckduckgo", "vendor_name": "DuckDuckGo", "token": "DuckAssistBot", "match": "user_agent", "purpose": "user_fetch", "ai_specific": true, "docs_url": "https://duckduckgo.com/duckduckgo-help-pages/results/duckassistbot", "added": "2026-09-28" },
    { "id": "you-youbot", "vendor": "you", "vendor_name": "You.com", "token": "YouBot", "match": "user_agent", "purpose": "search_index", "ai_specific": true, "docs_url": "https://you.com/docs/youbot", "added": "2026-09-28" },
    { "id": "mistral-mistralai-user", "vendor": "mistral", "vendor_name": "Mistral AI", "token": "MistralAI-User", "match": "user_agent", "purpose": "user_fetch", "ai_specific": true, "docs_url": "https://docs.mistral.ai/robots", "added": "2026-09-28" },
    { "id": "mistral-mistralai-index", "vendor": "mistral", "vendor_name": "Mistral AI", "token": "MistralAI-Index", "match": "user_agent", "purpose": "search_index", "ai_specific": true, "docs_url": "https://docs.mistral.ai/robots", "added": "2026-09-28" },
    { "id": "mistral-mistralai-training", "vendor": "mistral", "vendor_name": "Mistral AI", "token": "MistralAI-Training", "match": "user_agent", "purpose": "training", "ai_specific": true, "docs_url": "https://docs.mistral.ai/robots", "added": "2026-09-28" }
  ],
  "referrers": [
    { "id": "chatgpt", "vendor": "openai", "vendor_name": "OpenAI", "product": "ChatGPT", "hosts": ["chatgpt.com", "chat.openai.com"], "source_url": "https://github.com/matomo-org/searchengine-and-social-list/blob/master/AIAssistants.yml", "added": "2026-09-28" },
    { "id": "claude", "vendor": "anthropic", "vendor_name": "Anthropic", "product": "Claude", "hosts": ["claude.ai"], "source_url": "https://github.com/matomo-org/searchengine-and-social-list/blob/master/AIAssistants.yml", "added": "2026-09-28" },
    { "id": "perplexity", "vendor": "perplexity", "vendor_name": "Perplexity", "product": "Perplexity", "hosts": ["perplexity.ai", "pplx.ai"], "source_url": "https://github.com/plausible/analytics/blob/master/priv/custom_sources.json", "added": "2026-09-28" },
    { "id": "gemini", "vendor": "google", "vendor_name": "Google", "product": "Gemini", "hosts": ["gemini.google.com", "bard.google.com"], "source_url": "https://github.com/matomo-org/searchengine-and-social-list/blob/master/AIAssistants.yml", "added": "2026-09-28" },
    { "id": "notebooklm", "vendor": "google", "vendor_name": "Google", "product": "NotebookLM", "hosts": ["notebooklm.google.com"], "source_url": "https://github.com/matomo-org/searchengine-and-social-list/blob/master/AIAssistants.yml", "added": "2026-09-28" },
    { "id": "copilot", "vendor": "microsoft", "vendor_name": "Microsoft", "product": "Copilot", "hosts": ["copilot.microsoft.com", "copilot.com"], "source_url": "https://github.com/plausible/analytics/blob/master/priv/custom_sources.json", "added": "2026-09-28" },
    { "id": "you", "vendor": "you", "vendor_name": "You.com", "product": "You.com", "hosts": ["you.com"], "source_url": "https://github.com/matomo-org/searchengine-and-social-list/blob/master/AIAssistants.yml", "added": "2026-09-28" },
    { "id": "le-chat", "vendor": "mistral", "vendor_name": "Mistral AI", "product": "Le Chat", "hosts": ["chat.mistral.ai"], "source_url": "https://github.com/matomo-org/searchengine-and-social-list/blob/master/AIAssistants.yml", "added": "2026-09-28" },
    { "id": "duck-ai", "vendor": "duckduckgo", "vendor_name": "DuckDuckGo", "product": "Duck.ai", "hosts": ["duck.ai"], "source_url": "https://github.com/matomo-org/searchengine-and-social-list/blob/master/AIAssistants.yml", "added": "2026-09-28" },
    { "id": "meta-ai", "vendor": "meta", "vendor_name": "Meta", "product": "Meta AI", "hosts": ["meta.ai"], "source_url": "https://github.com/matomo-org/searchengine-and-social-list/blob/master/AIAssistants.yml", "added": "2026-09-28" },
    { "id": "grok", "vendor": "xai", "vendor_name": "xAI", "product": "Grok", "hosts": ["grok.com", "x.ai"], "source_url": "https://github.com/plausible/analytics/blob/master/priv/custom_sources.json", "added": "2026-09-28" },
    { "id": "deepseek", "vendor": "deepseek", "vendor_name": "DeepSeek", "product": "DeepSeek", "hosts": ["chat.deepseek.com"], "source_url": "https://github.com/matomo-org/searchengine-and-social-list/blob/master/AIAssistants.yml", "added": "2026-09-28" }
  ]
}
```

- [ ] **Step 5: Write `conformance/user_agents.json`**

`kind` values: `vendor` means the string is published verbatim by the vendor (templates such as `Chrome/W.X.Y.Z` are kept exactly as published). `observed` means the vendor documents the token but not the full string, so the string is a commonly observed one. `token` means the vendor publishes only the token, so the fixture is the bare token. `negative` means the string must not match.

```json
[
  { "ua": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.4; +https://openai.com/gptbot", "expect": { "id": "openai-gptbot" }, "kind": "vendor", "source": "https://developers.openai.com/api/docs/bots" },
  { "ua": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot", "expect": { "id": "openai-chatgpt-user" }, "kind": "vendor", "source": "https://developers.openai.com/api/docs/bots" },
  { "ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36; compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot", "expect": { "id": "openai-oai-searchbot" }, "kind": "vendor", "source": "https://developers.openai.com/api/docs/bots" },
  { "ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36; compatible; OAI-SearchBot/1.4; robots.txt; +https://openai.com/searchbot", "expect": { "id": "openai-oai-searchbot" }, "kind": "vendor", "source": "https://developers.openai.com/api/docs/bots" },
  { "ua": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", "expect": { "id": "anthropic-claudebot" }, "kind": "observed", "source": "https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler" },
  { "ua": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)", "expect": { "id": "anthropic-claude-user" }, "kind": "observed", "source": "https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler" },
  { "ua": "Claude-SearchBot", "expect": { "id": "anthropic-claude-searchbot" }, "kind": "token", "source": "https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler" },
  { "ua": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)", "expect": { "id": "perplexity-perplexitybot" }, "kind": "vendor", "source": "https://docs.perplexity.ai/guides/bots" },
  { "ua": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)", "expect": { "id": "perplexity-perplexity-user" }, "kind": "vendor", "source": "https://docs.perplexity.ai/guides/bots" },
  { "ua": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/W.X.Y.Z Safari/537.36", "expect": { "id": "google-googlebot" }, "kind": "vendor", "source": "https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers" },
  { "ua": "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/W.X.Y.Z Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "expect": { "id": "google-googlebot" }, "kind": "vendor", "source": "https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers" },
  { "ua": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko; compatible; Google-Agent; +https://developers.google.com/crawling/docs/crawlers-fetchers/google-agent) Chrome/W.X.Y.Z Safari/537.36", "expect": { "id": "google-google-agent" }, "kind": "vendor", "source": "https://developers.google.com/search/docs/crawling-indexing/google-user-triggered-fetchers" },
  { "ua": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36 (compatible; Google-GeminiNotebook; +https://developers.google.com/crawling/docs/crawlers-fetchers/google-gemininotebook)", "expect": { "id": "google-google-gemininotebook" }, "kind": "vendor", "source": "https://developers.google.com/search/docs/crawling-indexing/google-user-triggered-fetchers" },
  { "ua": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/W.X.Y.Z Safari/537.36", "expect": { "id": "microsoft-bingbot" }, "kind": "vendor", "source": "https://blogs.bing.com/webmaster/2022/4/Announcing-user-agent-change-for-Bing-crawler-bingbot/" },
  { "ua": "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/W.X.Y.Z Mobile Safari/537.36 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)", "expect": { "id": "microsoft-bingbot" }, "kind": "vendor", "source": "https://blogs.bing.com/webmaster/2022/4/Announcing-user-agent-change-for-Bing-crawler-bingbot/" },
  { "ua": "CCBot/2.0 (https://commoncrawl.org/faq/)", "expect": { "id": "commoncrawl-ccbot" }, "kind": "vendor", "source": "https://commoncrawl.org/ccbot" },
  { "ua": "Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)", "expect": { "id": "bytedance-bytespider" }, "kind": "observed", "source": "https://darkvisitors.com/agents/bytespider" },
  { "ua": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Amazonbot/0.1) Chrome/W.X.Y.Z Safari/537.36", "expect": { "id": "amazon-amazonbot" }, "kind": "vendor", "source": "https://developer.amazon.com/amazonbot" },
  { "ua": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Amzn-SearchBot/0.1) Chrome/W.X.Y.Z Safari/537.36", "expect": { "id": "amazon-amzn-searchbot" }, "kind": "vendor", "source": "https://developer.amazon.com/amazonbot" },
  { "ua": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Amzn-User/0.1) Chrome/W.X.Y.Z Safari/537.36", "expect": { "id": "amazon-amzn-user" }, "kind": "vendor", "source": "https://developer.amazon.com/amazonbot" },
  { "ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)", "expect": { "id": "apple-applebot" }, "kind": "vendor", "source": "https://support.apple.com/en-us/119829" },
  { "ua": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1 (Applebot/0.1; +http://www.apple.com/go/applebot)", "expect": { "id": "apple-applebot" }, "kind": "vendor", "source": "https://support.apple.com/en-us/119829" },
  { "ua": "meta-externalagent/1.1", "expect": { "id": "meta-meta-externalagent" }, "kind": "vendor", "source": "https://developers.facebook.com/documentation/sharing/webmasters/web-crawlers" },
  { "ua": "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)", "expect": { "id": "meta-meta-externalagent" }, "kind": "observed", "source": "https://developers.facebook.com/documentation/sharing/webmasters/web-crawlers" },
  { "ua": "meta-externalfetcher/1.1", "expect": { "id": "meta-meta-externalfetcher" }, "kind": "vendor", "source": "https://developers.facebook.com/documentation/sharing/webmasters/web-crawlers" },
  { "ua": "meta-webindexer/1.1", "expect": { "id": "meta-meta-webindexer" }, "kind": "vendor", "source": "https://developers.facebook.com/documentation/sharing/webmasters/web-crawlers" },
  { "ua": "DuckAssistBot/1.2; (+http://duckduckgo.com/duckassistbot.html)", "expect": { "id": "duckduckgo-duckassistbot" }, "kind": "vendor", "source": "https://duckduckgo.com/duckduckgo-help-pages/results/duckassistbot" },
  { "ua": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; YouBot/1.0; +https://docs.you.com/youbot; env:prod) Chrome/X.X.X.X Safari/537.36", "expect": { "id": "you-youbot" }, "kind": "vendor", "source": "https://you.com/docs/youbot" },
  { "ua": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; MistralAI-User/1.0; +https://docs.mistral.ai/robots)", "expect": { "id": "mistral-mistralai-user" }, "kind": "vendor", "source": "https://docs.mistral.ai/robots" },
  { "ua": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; MistralAI-Index/1.0; +https://docs.mistral.ai/robots)", "expect": { "id": "mistral-mistralai-index" }, "kind": "vendor", "source": "https://docs.mistral.ai/robots" },
  { "ua": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; MistralAI-Training/1.0; +https://docs.mistral.ai/robots)", "expect": { "id": "mistral-mistralai-training" }, "kind": "vendor", "source": "https://docs.mistral.ai/robots" },
  { "ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36", "expect": null, "kind": "negative", "label": "browser-chrome", "source": null },
  { "ua": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1", "expect": null, "kind": "negative", "label": "browser-safari-iphone", "source": null },
  { "ua": "curl/8.7.1", "expect": null, "kind": "negative", "label": "curl", "source": null },
  { "ua": "Google-Extended", "expect": null, "kind": "negative", "label": "robots-only-token", "source": null },
  { "ua": "", "expect": null, "kind": "negative", "label": "empty", "source": null }
]
```

- [ ] **Step 6: Write `conformance/referrers.json`**

```json
[
  { "referrer": "https://chatgpt.com/", "expect": { "id": "chatgpt" } },
  { "referrer": "https://chat.openai.com/", "expect": { "id": "chatgpt" } },
  { "referrer": "https://claude.ai/", "expect": { "id": "claude" } },
  { "referrer": "https://www.perplexity.ai/search?q=ai+traffic+logs", "expect": { "id": "perplexity" } },
  { "referrer": "https://pplx.ai/", "expect": { "id": "perplexity" } },
  { "referrer": "https://gemini.google.com/app", "expect": { "id": "gemini" } },
  { "referrer": "https://bard.google.com/", "expect": { "id": "gemini" } },
  { "referrer": "https://notebooklm.google.com/", "expect": { "id": "notebooklm" } },
  { "referrer": "https://copilot.microsoft.com/", "expect": { "id": "copilot" } },
  { "referrer": "https://copilot.com/", "expect": { "id": "copilot" } },
  { "referrer": "https://you.com/search?q=rastrolog", "expect": { "id": "you" } },
  { "referrer": "https://chat.mistral.ai/", "expect": { "id": "le-chat" } },
  { "referrer": "https://duck.ai/", "expect": { "id": "duck-ai" } },
  { "referrer": "https://www.meta.ai/", "expect": { "id": "meta-ai" } },
  { "referrer": "https://grok.com/", "expect": { "id": "grok" } },
  { "referrer": "https://x.ai/", "expect": { "id": "grok" } },
  { "referrer": "https://chat.deepseek.com/", "expect": { "id": "deepseek" } },
  { "referrer": "https://www.google.com/", "expect": null, "note": "Google AI Overviews / AI Mode are indistinguishable from search" },
  { "referrer": "https://www.bing.com/", "expect": null, "note": "Copilot in Bing sends origin-only referrers" },
  { "referrer": "https://x.com/", "expect": null, "note": "Grok on X sends origin-only referrers" },
  { "referrer": "https://duckduckgo.com/", "expect": null, "note": "origin-only; Duck.ai now lives on duck.ai" },
  { "referrer": "https://example.com/blog/post", "expect": null },
  { "referrer": "https://chatgpt.com.evil.example/", "expect": null },
  { "referrer": "chatgpt.com", "expect": null, "note": "no scheme" },
  { "referrer": "", "expect": null }
]
```

- [ ] **Step 7: Write `CHANGELOG.md`** (repo root)

```markdown
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
```

- [ ] **Step 8: Write `python/src/rastrolog/signals.py`**

```python
"""Load the bundled signals.json once and expose a typed, read-only view of it.

In a built wheel the file sits next to this module. In an editable/dev install it
does not (the canonical copy lives at the repo root), so fall back to that.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import cache
from importlib.resources import files
from pathlib import Path
from typing import Any, Literal

SCHEMA_VERSION = 1
Purpose = Literal["training", "user_fetch", "search_index"]


@dataclass(frozen=True, slots=True)
class CrawlerSignal:
    id: str
    vendor: str
    vendor_name: str
    token: str
    match: Literal["user_agent", "robots_only"]
    purpose: Purpose
    ai_specific: bool
    docs_url: str
    vendor_documented: bool = True


@dataclass(frozen=True, slots=True)
class ReferrerSignal:
    id: str
    vendor: str
    vendor_name: str
    product: str
    hosts: tuple[str, ...]
    source_url: str


@dataclass(frozen=True, slots=True)
class Signals:
    schema_version: int
    updated: str
    crawlers: tuple[CrawlerSignal, ...]
    referrers: tuple[ReferrerSignal, ...]


def _read_raw() -> str:
    bundled = files("rastrolog") / "signals.json"
    if bundled.is_file():
        return bundled.read_text(encoding="utf-8")
    repo_copy = Path(__file__).resolve().parents[3] / "signals.json"
    return repo_copy.read_text(encoding="utf-8")


def parse_signals(data: dict[str, Any]) -> Signals:
    if data.get("schema_version") != SCHEMA_VERSION:
        msg = f"unsupported signals.json schema_version {data.get('schema_version')!r}"
        raise ValueError(msg)
    return Signals(
        schema_version=data["schema_version"],
        updated=data["updated"],
        crawlers=tuple(
            CrawlerSignal(
                id=c["id"],
                vendor=c["vendor"],
                vendor_name=c["vendor_name"],
                token=c["token"],
                match=c["match"],
                purpose=c["purpose"],
                ai_specific=c["ai_specific"],
                docs_url=c["docs_url"],
                vendor_documented=c.get("vendor_documented", True),
            )
            for c in data["crawlers"]
        ),
        referrers=tuple(
            ReferrerSignal(
                id=r["id"],
                vendor=r["vendor"],
                vendor_name=r["vendor_name"],
                product=r["product"],
                hosts=tuple(r["hosts"]),
                source_url=r["source_url"],
            )
            for r in data["referrers"]
        ),
    )


@cache
def load_signals() -> Signals:
    return parse_signals(json.loads(_read_raw()))
```

- [ ] **Step 9: Run the tests to confirm they pass**

Run: `cd python && uv run pytest tests/test_signals.py tests/test_conformance.py -v`
Expected: all pass.

- [ ] **Step 10: Check that every cited URL still resolves**

Run from the repo root:

```bash
python3 -c "import json; d=json.load(open('signals.json')); print('\n'.join(sorted({c['docs_url'] for c in d['crawlers']} | {r['source_url'] for r in d['referrers']})))" \
  | while read -r url; do printf '%s %s\n' "$(curl -sL -o /dev/null -w '%{http_code}' "$url")" "$url"; done
```

Expected: `200` for each URL. Some vendor sites return `403` to curl because of bot protection. That's acceptable, but only if the page opens in a browser. Any `404` means the entry needs a fresh source before it's committed.

- [ ] **Step 11: Validate with the pre-commit schema hook and commit**

```bash
cd python && uv run pre-commit run check-jsonschema --all-files
git add signals.json signals.schema.json CHANGELOG.md conformance/ python/src/rastrolog/signals.py python/tests/
git commit -m "feat: signals.json with verified AI crawler and referrer lists, conformance fixtures"
```

---

### Task 3: Classifier (`classify.py`)

**Files:**
- Create: `python/src/rastrolog/classify.py`, `python/tests/test_classify.py`
- Modify: `python/src/rastrolog/__init__.py`, `python/tests/test_conformance.py`

**Interfaces:**
- Consumes: `rastrolog.signals.load_signals() -> Signals`, `CrawlerSignal`, `ReferrerSignal` (Task 2); `helpers.SAMPLE_UA`, `helpers.UA_CASES`, `helpers.REFERRER_CASES` (Task 2).
- Produces:
  - `Match` — frozen, slotted dataclass `(kind: Literal["crawler","referral"], id: str, vendor: str, vendor_name: str, product: str | None = None, token: str | None = None, purpose: str | None = None, ai_specific: bool = True)` with `to_dict() -> dict[str, object]`
  - `classify_user_agent(ua: str | None) -> Match | None`
  - `classify_referrer(url: str | None, *, own_host: str | None = None) -> Match | None`
  - `classify_request(user_agent: str | None, referrer: str | None, *, own_host: str | None = None) -> Match | None` — crawler match wins, then referral
  - `normalize_host(host: str) -> str` — lowercase, strip trailing dot and leading `www.`
  - all four public names re-exported from `rastrolog`

- [ ] **Step 1: Write the failing unit tests `python/tests/test_classify.py`**

```python
from dataclasses import FrozenInstanceError

import pytest
from helpers import SAMPLE_UA

from rastrolog import Match, classify_referrer, classify_request, classify_user_agent
from rastrolog.classify import _ua_index, normalize_host
from rastrolog.signals import load_signals


def test_gptbot_is_an_openai_training_crawler() -> None:
    assert classify_user_agent(SAMPLE_UA["gptbot"]) == Match(
        kind="crawler",
        id="openai-gptbot",
        vendor="openai",
        vendor_name="OpenAI",
        token="GPTBot",
        purpose="training",
        ai_specific=True,
    )


def test_user_agent_match_is_case_insensitive() -> None:
    match = classify_user_agent("mozilla/5.0 (compatible; gptbot/1.3)")
    assert match is not None
    assert match.id == "openai-gptbot"


@pytest.mark.parametrize("ua", [None, "", "   ", SAMPLE_UA["browser"]])
def test_unrecognised_user_agents_return_none(ua: str | None) -> None:
    assert classify_user_agent(ua) is None


def test_search_engine_crawler_is_flagged_but_not_ai() -> None:
    match = classify_user_agent(SAMPLE_UA["googlebot"])
    assert match is not None
    assert match.purpose == "search_index"
    assert match.ai_specific is False


def test_robots_only_tokens_never_match_as_themselves() -> None:
    robots_only = [c.token for c in load_signals().crawlers if c.match == "robots_only"]
    assert robots_only, "signals.json should list at least one robots_only token"
    for token in robots_only:
        match = classify_user_agent(f"Mozilla/5.0 (compatible; {token}/1.0)")
        assert match is None or match.token != token


def test_tokens_are_tried_longest_first() -> None:
    lengths = [len(token) for token, _ in _ua_index()]
    assert lengths == sorted(lengths, reverse=True)


@pytest.mark.parametrize(
    ("url", "expected_id"),
    [
        ("https://chatgpt.com/", "chatgpt"),
        ("https://ChatGPT.com:443/c/abc", "chatgpt"),
        ("https://sub.chatgpt.com/", "chatgpt"),
        ("https://claude.ai./", "claude"),
        ("https://www.perplexity.ai/search?q=rastrolog", "perplexity"),
        ("https://gemini.google.com/app", "gemini"),
        ("https://duck.ai/chat", "duck-ai"),
    ],
)
def test_ai_referrers_classify(url: str, expected_id: str) -> None:
    match = classify_referrer(url)
    assert match is not None
    assert match.kind == "referral"
    assert match.id == expected_id


@pytest.mark.parametrize(
    "url",
    [
        None,
        "",
        "https://www.google.com/",
        "chatgpt.com",
        "not a url",
        "http://[::1",
        "https://notchatgpt.com/",
        "https://chatgpt.com.evil.example/",
    ],
)
def test_non_ai_or_malformed_referrers_return_none(url: str | None) -> None:
    assert classify_referrer(url) is None


@pytest.mark.parametrize(
    "url",
    ["https://www.bing.com/", "https://x.com/", "https://duckduckgo.com/"],
)
def test_shared_hosts_are_not_claimed(url: str) -> None:
    # bing.com (Copilot), x.com (Grok) and duckduckgo.com send only their origin as
    # Referer, so AI traffic from them can't be told apart. Documented gap: never guess.
    assert classify_referrer(url) is None


def test_own_host_is_never_a_referral() -> None:
    assert classify_referrer("https://chatgpt.com/", own_host="www.ChatGPT.com") is None


def test_normalize_host() -> None:
    assert normalize_host("WWW.Example.COM.") == "example.com"


def test_match_is_frozen_and_serialisable() -> None:
    match = classify_referrer("https://claude.ai/")
    assert match is not None
    assert match.to_dict() == {
        "kind": "referral",
        "id": "claude",
        "vendor": "anthropic",
        "vendor_name": "Anthropic",
        "product": "Claude",
        "token": None,
        "purpose": None,
        "ai_specific": True,
    }
    with pytest.raises(FrozenInstanceError):
        match.id = "other"  # type: ignore[misc]


def test_classify_request_prefers_the_crawler() -> None:
    match = classify_request(SAMPLE_UA["gptbot"], "https://chatgpt.com/")
    assert match is not None
    assert match.kind == "crawler"


def test_classify_request_falls_back_to_the_referral() -> None:
    match = classify_request(SAMPLE_UA["browser"], "https://chatgpt.com/")
    assert match is not None
    assert match.kind == "referral"


def test_classify_request_with_nothing_is_none() -> None:
    assert classify_request(None, None) is None
```

- [ ] **Step 2: Append the fixture-driven conformance tests to `python/tests/test_conformance.py`**

```python
from rastrolog import classify_referrer, classify_user_agent


def _expected_id(case: dict[str, Any]) -> str | None:
    return case["expect"]["id"] if case["expect"] else None


@pytest.mark.parametrize("case", UA_CASES, ids=lambda c: c["ua"][:70])
def test_user_agent_fixture_classifies_as_expected(case: dict[str, Any]) -> None:
    match = classify_user_agent(case["ua"])
    assert (match.id if match else None) == _expected_id(case)


@pytest.mark.parametrize("case", REFERRER_CASES, ids=lambda c: c["referrer"] or "<empty>")
def test_referrer_fixture_classifies_as_expected(case: dict[str, Any]) -> None:
    match = classify_referrer(case["referrer"])
    assert (match.id if match else None) == _expected_id(case)
```

(Move the `from rastrolog import …` line up to the file's import block so ruff's isort rule is satisfied.)

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `cd python && uv run pytest tests/test_classify.py tests/test_conformance.py -v`
Expected: collection error `ImportError: cannot import name 'Match' from 'rastrolog'`.

- [ ] **Step 4: Write `python/src/rastrolog/classify.py`**

```python
"""Pure classifiers for user agents and referrers.

Every function accepts None or empty input, never raises on malformed input,
and returns None for anything unrecognised. Results are cached, because real
logs repeat the same few hundred user agents and referrers millions of times.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from functools import lru_cache
from typing import Literal
from urllib.parse import urlsplit

from rastrolog.signals import CrawlerSignal, ReferrerSignal, load_signals

__all__ = [
    "Match",
    "classify_referrer",
    "classify_request",
    "classify_user_agent",
    "normalize_host",
]


@dataclass(frozen=True, slots=True)
class Match:
    """What a request was classified as. Serialise with ``to_dict()``."""

    kind: Literal["crawler", "referral"]
    id: str
    vendor: str
    vendor_name: str
    product: str | None = None
    token: str | None = None
    purpose: str | None = None
    ai_specific: bool = True

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def normalize_host(host: str) -> str:
    """Lowercase, drop a trailing dot and a leading ``www.``."""
    host = host.strip().lower().rstrip(".")
    return host[4:] if host.startswith("www.") else host


def _crawler_match(signal: CrawlerSignal) -> Match:
    return Match(
        kind="crawler",
        id=signal.id,
        vendor=signal.vendor,
        vendor_name=signal.vendor_name,
        token=signal.token,
        purpose=signal.purpose,
        ai_specific=signal.ai_specific,
    )


def _referral_match(signal: ReferrerSignal) -> Match:
    return Match(
        kind="referral",
        id=signal.id,
        vendor=signal.vendor,
        vendor_name=signal.vendor_name,
        product=signal.product,
    )


@lru_cache(maxsize=1)
def _ua_index() -> tuple[tuple[str, Match], ...]:
    """(lowercased token, match) pairs, longest token first."""
    crawlers = [c for c in load_signals().crawlers if c.match == "user_agent"]
    crawlers.sort(key=lambda c: len(c.token), reverse=True)
    return tuple((c.token.lower(), _crawler_match(c)) for c in crawlers)


@lru_cache(maxsize=1)
def _referrer_index() -> dict[str, Match]:
    """Normalised host -> match. Hosts are unique across entries (enforced by tests)."""
    return {
        normalize_host(host): _referral_match(signal)
        for signal in load_signals().referrers
        for host in signal.hosts
    }


def classify_user_agent(ua: str | None) -> Match | None:
    """Classify a User-Agent header. Case-insensitive; longest token wins."""
    if not ua or not ua.strip():
        return None
    return _classify_user_agent(ua)


@lru_cache(maxsize=8192)
def _classify_user_agent(ua: str) -> Match | None:
    lowered = ua.lower()
    for token, match in _ua_index():
        if token in lowered:
            return match
    return None


def classify_referrer(url: str | None, *, own_host: str | None = None) -> Match | None:
    """Classify a Referer header / document.referrer value.

    Matches the exact host or any subdomain of a listed host. Only the origin is
    used: browsers usually send nothing more cross-site. ``own_host`` never matches.
    """
    if not url or not url.strip():
        return None
    return _classify_referrer(url.strip(), normalize_host(own_host) if own_host else None)


@lru_cache(maxsize=8192)
def _classify_referrer(url: str, own_host: str | None) -> Match | None:
    try:
        parts = urlsplit(url)
        hostname = parts.hostname
    except ValueError:
        return None
    if not parts.scheme or not hostname:
        return None
    host = normalize_host(hostname)
    if own_host is not None and host == own_host:
        return None
    labels = host.split(".")
    index = _referrer_index()
    for start in range(len(labels) - 1):
        match = index.get(".".join(labels[start:]))
        if match is not None:
            return match
    return None


def classify_request(
    user_agent: str | None, referrer: str | None, *, own_host: str | None = None
) -> Match | None:
    """Crawler match wins; otherwise the referral match; otherwise None."""
    return classify_user_agent(user_agent) or classify_referrer(referrer, own_host=own_host)
```

- [ ] **Step 5: Re-export from `python/src/rastrolog/__init__.py`**

```python
"""Classify AI crawler and AI referral traffic."""

from importlib.metadata import version as _version

from rastrolog.classify import Match, classify_referrer, classify_request, classify_user_agent

__version__ = _version("rastrolog")

__all__ = [
    "Match",
    "__version__",
    "classify_referrer",
    "classify_request",
    "classify_user_agent",
]
```

- [ ] **Step 6: Run the tests to confirm they pass**

Run: `cd python && uv run pytest -v`
Expected: all pass. If a conformance case fails, the fix is almost always in `signals.json` (wrong token spelling or a missing host), not a special case in code.

- [ ] **Step 7: Lint, type-check, commit**

```bash
cd python && uv run ruff check . && uv run ruff format --check . && uv run mypy
git add python/src/rastrolog/classify.py python/src/rastrolog/__init__.py python/tests/test_classify.py python/tests/test_conformance.py
git commit -m "feat: classify user agents and referrers against signals.json"
```

---

### Task 4: Log formats (`formats.py`)

**Files:**
- Create: `python/src/rastrolog/formats.py`, `python/tests/test_formats.py`

**Interfaces:**
- Consumes: `helpers.SAMPLE_UA` (Task 2).
- Produces:
  - `Format = Literal["combined", "cloudfront", "alb"]`, `FORMATS: tuple[Format, ...]`
  - `LogRecord` frozen dataclass `(ts: datetime (aware UTC), path: str, status: int, ua: str, referrer: str)`
  - `UnknownFormatError(ValueError)` with `.line: str`; `MalformedLineError(ValueError)`
  - `LineParser` Protocol: `parse(line: str) -> LogRecord | None` (None = ignorable line such as a CloudFront `#` header; raises `MalformedLineError` for broken lines)
  - `detect(line: str) -> Format`, `make_parser(fmt: Format) -> LineParser`
  - `CombinedParser`, `CloudFrontParser`, `AlbParser`, `parse_clf_time(value: str) -> datetime`, `normalize_path(target: str) -> str`

- [ ] **Step 1: Write the failing tests `python/tests/test_formats.py`**

```python
from datetime import datetime, timezone

import pytest
from helpers import SAMPLE_UA

from rastrolog.formats import (
    AlbParser,
    CloudFrontParser,
    CombinedParser,
    LogRecord,
    MalformedLineError,
    UnknownFormatError,
    detect,
    normalize_path,
    parse_clf_time,
)

UTC = timezone.utc
BROWSER = SAMPLE_UA["browser"]
GPTBOT = SAMPLE_UA["gptbot"]

COMBINED_LINE = (
    '203.0.113.9 - - [28/Sep/2026:12:00:00 +0000] "GET /pricing?utm_source=chatgpt.com HTTP/1.1" '
    f'200 512 "https://chatgpt.com/" "{BROWSER}"'
)
ALB_LINE = (
    "https 2026-09-28T12:00:00.186641Z app/my-lb/50dc6c495c0c9188 198.51.100.7:2817 "
    '10.0.0.1:80 0.000 0.001 0.000 200 200 34 366 "GET https://www.example.com:443/docs?a=b HTTP/1.1" '
    f'"{GPTBOT}" ECDHE-RSA-AES128-GCM-SHA256 TLSv1.2 arn:aws:elasticloadbalancing:x "Root=1-58" '
    '"www.example.com" "arn:aws:acm:x" 0 2026-09-28T12:00:00.000000Z "forward" "-" "-" '
    '"10.0.0.1:80" "200" "-" "-"'
)
CF_FIELDS = (
    "#Fields: date time x-edge-location sc-bytes c-ip cs-method cs(Host) cs-uri-stem "
    "sc-status cs(Referer) cs(User-Agent) cs-uri-query"
)
CF_LINE = "\t".join(
    [
        "2026-09-28", "12:00:00", "LAX1", "392", "198.51.100.7", "GET",
        "d111111abcdef8.cloudfront.net", "/docs", "200", "https://claude.ai/",
        BROWSER.replace(" ", "%20"), "-",
    ]
)


def test_detects_each_format() -> None:
    assert detect(COMBINED_LINE) == "combined"
    assert detect(ALB_LINE) == "alb"
    assert detect("#Version: 1.0") == "cloudfront"
    assert detect(CF_FIELDS) == "cloudfront"
    assert detect(CF_LINE) == "cloudfront"


def test_unknown_format_keeps_the_line() -> None:
    with pytest.raises(UnknownFormatError) as info:
        detect("hello, world")
    assert info.value.line == "hello, world"


def test_combined_parses_all_fields() -> None:
    assert CombinedParser().parse(COMBINED_LINE) == LogRecord(
        ts=datetime(2026, 9, 28, 12, 0, 0, tzinfo=UTC),
        path="/pricing",
        status=200,
        ua=BROWSER,
        referrer="https://chatgpt.com/",
    )


def test_combined_converts_offsets_to_utc() -> None:
    line = COMBINED_LINE.replace("28/Sep/2026:12:00:00 +0000", "28/Sep/2026:07:00:00 -0500")
    record = CombinedParser().parse(line)
    assert record is not None
    assert record.ts == datetime(2026, 9, 28, 12, 0, 0, tzinfo=UTC)


@pytest.mark.parametrize(
    ("month", "number"),
    [("Jan", 1), ("Feb", 2), ("Mar", 3), ("Apr", 4), ("May", 5), ("Jun", 6),
     ("Jul", 7), ("Aug", 8), ("Sep", 9), ("Oct", 10), ("Nov", 11), ("Dec", 12)],
)
def test_month_names_do_not_depend_on_locale(month: str, number: int) -> None:
    assert parse_clf_time(f"01/{month}/2026:00:00:00 +0000").month == number


def test_bad_month_is_malformed() -> None:
    with pytest.raises(MalformedLineError):
        parse_clf_time("01/Sept/2026:00:00:00 +0000")


def test_apache_backslash_escaped_quote_in_user_agent() -> None:
    line = COMBINED_LINE.replace(BROWSER, 'Weird \\"quoted\\" agent')
    record = CombinedParser().parse(line)
    assert record is not None
    assert record.ua == 'Weird "quoted" agent'


def test_nginx_hex_escaped_quote_in_user_agent() -> None:
    line = COMBINED_LINE.replace(BROWSER, "Weird \\x22quoted\\x22 agent")
    record = CombinedParser().parse(line)
    assert record is not None
    assert record.ua == 'Weird "quoted" agent'


def test_combined_dash_referrer_is_empty() -> None:
    record = CombinedParser().parse(COMBINED_LINE.replace('"https://chatgpt.com/"', '"-"'))
    assert record is not None
    assert record.referrer == ""


def test_combined_request_without_a_target() -> None:
    line = COMBINED_LINE.replace('"GET /pricing?utm_source=chatgpt.com HTTP/1.1"', '"-"')
    record = CombinedParser().parse(line)
    assert record is not None
    assert record.path == "-"


def test_combined_garbage_is_malformed() -> None:
    with pytest.raises(MalformedLineError):
        CombinedParser().parse("this is not a log line")


def test_alb_reduces_absolute_url_and_has_no_referrer() -> None:
    assert AlbParser().parse(ALB_LINE) == LogRecord(
        ts=datetime(2026, 9, 28, 12, 0, 0, 186641, tzinfo=UTC),
        path="/docs",
        status=200,
        ua=GPTBOT,
        referrer="",
    )


def test_cloudfront_follows_fields_header_and_decodes() -> None:
    parser = CloudFrontParser()
    assert parser.parse("#Version: 1.0") is None
    assert parser.parse(CF_FIELDS) is None
    assert parser.parse(CF_LINE) == LogRecord(
        ts=datetime(2026, 9, 28, 12, 0, 0, tzinfo=UTC),
        path="/docs",
        status=200,
        ua=BROWSER,
        referrer="https://claude.ai/",
    )


def test_cloudfront_reordered_fields() -> None:
    parser = CloudFrontParser()
    parser.parse("#Fields: cs(User-Agent) cs(Referer) sc-status cs-uri-stem time date")
    record = parser.parse("\t".join(["Agent%201", "-", "404", "/x", "01:02:03", "2026-01-02"]))
    assert record == LogRecord(
        ts=datetime(2026, 1, 2, 1, 2, 3, tzinfo=UTC), path="/x", status=404, ua="Agent 1", referrer=""
    )


def test_cloudfront_without_header_uses_default_field_order() -> None:
    record = CloudFrontParser().parse(CF_LINE)
    assert record is not None
    assert record.path == "/docs"


def test_cloudfront_short_line_is_malformed() -> None:
    with pytest.raises(MalformedLineError):
        CloudFrontParser().parse("2026-09-28\t12:00:00\tLAX1")


@pytest.mark.parametrize(
    ("target", "expected"),
    [
        ("/a?b=1#c", "/a"),
        ("https://h.example:443/docs?x=1", "/docs"),
        ("https://h.example", "/"),
        ("", "/"),
        ("/", "/"),
    ],
)
def test_normalize_path(target: str, expected: str) -> None:
    assert normalize_path(target) == expected
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `cd python && uv run pytest tests/test_formats.py -v`
Expected: `ModuleNotFoundError: No module named 'rastrolog.formats'`.

- [ ] **Step 3: Write `python/src/rastrolog/formats.py`**

```python
"""Log line formats: detection and per-line parsing into LogRecord.

Supported formats:
- ``combined``: nginx's default ``combined`` and Apache's ``combined`` LogFormat
- ``cloudfront``: CloudFront standard (legacy) logs, tab-separated with a ``#Fields:`` header
- ``alb``: AWS Application Load Balancer access logs (these carry no Referer field)
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal, Protocol
from urllib.parse import unquote, urlsplit

Format = Literal["combined", "cloudfront", "alb"]
FORMATS: tuple[Format, ...] = ("combined", "cloudfront", "alb")

_QUOTED = r'"((?:[^"\\]|\\.)*)"'
_COMBINED = re.compile(
    r"^\S+ \S+ \S+ \[([^\]]+)\] " + _QUOTED + r" (\d{3}|-) \S+ " + _QUOTED + " " + _QUOTED
)
_ALB = re.compile(
    r"^[a-z0-9]+ (\d{4}-\d{2}-\d{2}T\S+) \S+ \S+ \S+ \S+ \S+ \S+ (\d{3}|-) \S+ \S+ \S+ "
    r'"([^"]*)" "([^"]*)"'
)
_CLOUDFRONT_DATA = re.compile(r"^\d{4}-\d{2}-\d{2}\t\d{2}:\d{2}:\d{2}\t")
_ESCAPE = re.compile(r"\\(x[0-9a-fA-F]{2}|.)")
_MONTHS = {
    name: number
    for number, name in enumerate(
        ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"),
        start=1,
    )
}

DEFAULT_CLOUDFRONT_FIELDS: tuple[str, ...] = (
    "date", "time", "x-edge-location", "sc-bytes", "c-ip", "cs-method", "cs(Host)",
    "cs-uri-stem", "sc-status", "cs(Referer)", "cs(User-Agent)", "cs-uri-query", "cs(Cookie)",
    "x-edge-result-type", "x-edge-request-id", "x-host-header", "cs-protocol", "cs-bytes",
    "time-taken", "x-forwarded-for", "ssl-protocol", "ssl-cipher",
    "x-edge-response-result-type", "cs-protocol-version", "fle-status", "fle-encrypted-fields",
    "c-port", "time-to-first-byte", "x-edge-detailed-result-type", "sc-content-type",
    "sc-content-len", "sc-range-start", "sc-range-end",
)  # fmt: skip


@dataclass(frozen=True, slots=True)
class LogRecord:
    ts: datetime  # timezone-aware, UTC
    path: str  # no query string or fragment
    status: int  # 0 when the log has none
    ua: str  # "" when absent
    referrer: str  # "" when absent


class UnknownFormatError(ValueError):
    """The first line of a file matched no supported format."""

    def __init__(self, line: str) -> None:
        self.line = line
        super().__init__(f"unrecognised log format; first line was: {line[:300]}")


class MalformedLineError(ValueError):
    """A line in a known format that could not be parsed."""


class LineParser(Protocol):
    def parse(self, line: str) -> LogRecord | None:
        """Return a record, None for lines to ignore, or raise MalformedLineError."""
        ...


def detect(line: str) -> Format:
    """Pick the format from the first non-empty line of a file."""
    text = line.strip()
    if text.startswith(("#Version:", "#Fields:")) or _CLOUDFRONT_DATA.match(text):
        return "cloudfront"
    if _ALB.match(text):
        return "alb"
    if _COMBINED.match(text):
        return "combined"
    raise UnknownFormatError(text)


def make_parser(fmt: Format) -> LineParser:
    if fmt == "combined":
        return CombinedParser()
    if fmt == "cloudfront":
        return CloudFrontParser()
    return AlbParser()


def parse_clf_time(value: str) -> datetime:
    """Parse ``28/Sep/2026:12:00:00 +0200`` to UTC without locale-dependent strptime."""
    try:
        day, month, rest = value.split("/", 2)
        year, hour, minute, tail = rest.split(":", 3)
        second, offset = tail.split(" ")
        sign = -1 if offset[0] == "-" else 1
        delta = timedelta(hours=int(offset[1:3]), minutes=int(offset[3:5]))
        local = datetime(
            int(year), _MONTHS[month], int(day), int(hour), int(minute), int(second),
            tzinfo=timezone(sign * delta),
        )
    except (KeyError, ValueError, IndexError) as exc:
        raise MalformedLineError(value) from exc
    return local.astimezone(timezone.utc)


def normalize_path(target: str) -> str:
    """Reduce a request target to its path: drop scheme/host, query string and fragment."""
    if target.startswith(("http://", "https://")):
        try:
            path = urlsplit(target).path
        except ValueError:
            return "-"
    else:
        path = target.split("?", 1)[0].split("#", 1)[0]
    return path or "/"


def _request_path(request: str) -> str:
    parts = request.split(" ")
    return normalize_path(parts[1]) if len(parts) >= 2 else "-"


def _unescape(value: str) -> str:
    """Undo Apache (``\\"``) and nginx (``\\x22``) escaping inside quoted fields."""

    def replace(match: re.Match[str]) -> str:
        escaped = match.group(1)
        if escaped[0] == "x" and len(escaped) == 3:
            return chr(int(escaped[1:], 16))
        return escaped

    return _ESCAPE.sub(replace, value)


def _dash(value: str) -> str:
    return "" if value == "-" else value


def _status(value: str) -> int:
    return int(value) if value.isdigit() else 0


class CombinedParser:
    def parse(self, line: str) -> LogRecord | None:
        match = _COMBINED.match(line)
        if match is None:
            raise MalformedLineError(line)
        time_text, request, status, referrer, ua = match.groups()
        return LogRecord(
            ts=parse_clf_time(time_text),
            path=_request_path(_unescape(request)),
            status=_status(status),
            ua=_dash(_unescape(ua)),
            referrer=_dash(_unescape(referrer)),
        )


class AlbParser:
    def parse(self, line: str) -> LogRecord | None:
        match = _ALB.match(line)
        if match is None:
            raise MalformedLineError(line)
        time_text, status, request, ua = match.groups()
        try:
            ts = datetime.fromisoformat(time_text.replace("Z", "+00:00"))
        except ValueError as exc:
            raise MalformedLineError(line) from exc
        return LogRecord(
            ts=ts.astimezone(timezone.utc),
            path=_request_path(request),
            status=_status(status),
            ua=_dash(ua),
            referrer="",
        )


class CloudFrontParser:
    _NEEDED = ("date", "time", "cs-uri-stem", "sc-status", "cs(Referer)", "cs(User-Agent)")

    def __init__(self) -> None:
        self._columns = self._positions(DEFAULT_CLOUDFRONT_FIELDS)

    @classmethod
    def _positions(cls, fields: Sequence[str]) -> tuple[int, ...]:
        index = {name: i for i, name in enumerate(fields)}
        missing = [name for name in cls._NEEDED if name not in index]
        if missing:
            raise MalformedLineError("#Fields header lacks " + ", ".join(missing))
        return tuple(index[name] for name in cls._NEEDED)

    def parse(self, line: str) -> LogRecord | None:
        if line.startswith("#"):
            if line.startswith("#Fields:"):
                self._columns = self._positions(line[len("#Fields:") :].split())
            return None
        cols = line.split("\t")
        try:
            date, time_text, stem, status, referrer, ua = (cols[i] for i in self._columns)
            ts = datetime.fromisoformat(f"{date}T{time_text}+00:00")
        except (IndexError, ValueError) as exc:
            raise MalformedLineError(line) from exc
        return LogRecord(
            ts=ts,
            path=normalize_path(unquote(stem)),
            status=_status(status),
            ua=_dash(unquote(ua)),
            referrer=_dash(unquote(referrer)),
        )
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd python && uv run pytest tests/test_formats.py -v`
Expected: all pass.

- [ ] **Step 5: Lint, type-check, commit**

```bash
cd python && uv run ruff check . && uv run ruff format --check . && uv run mypy
git add python/src/rastrolog/formats.py python/tests/test_formats.py
git commit -m "feat: detect and parse combined, CloudFront and ALB log lines"
```

---

### Task 5: Streaming parser (`parse.py`) and fixture logs

**Files:**
- Create: `python/src/rastrolog/parse.py`, `python/scripts/make_fixture_logs.py`, `python/tests/test_parse.py`, `conformance/logs/{nginx,apache,cloudfront,alb}.log` (generated, committed)

**Interfaces:**
- Consumes: `detect`, `make_parser`, `LineParser`, `LogRecord`, `MalformedLineError`, `UnknownFormatError`, `Format`, `DEFAULT_CLOUDFRONT_FIELDS` (Task 4); `conformance/user_agents.json` (Task 2).
- Produces:
  - `ParseStats` mutable dataclass `(format: Format | None = None, lines: int = 0, records: int = 0, skipped: int = 0, truncated: bool = False)`
  - `iter_records(path: Path, fmt: Format | None = None, *, stats: ParseStats | None = None, progress: Callable[[int], None] | None = None) -> Iterator[LogRecord]`. It opens gzip by magic bytes, decodes UTF-8 with `errors="replace"`, normalises newlines, calls `progress(on_disk_bytes_read)`, raises `UnknownFormatError` when detection fails, and sets `stats.truncated` on a cut-off gzip.
  - Four fixture logs describing **the same 14 requests plus one malformed line** (table below). All later report tests rely on these counts.

| # | UTC time | Target | User agent | Referrer |
|---|---|---|---|---|
| 1 | 2026-09-20 08:00 | /docs | GPTBot | – |
| 2 | 2026-09-21 08:00 | /pricing | GPTBot | – |
| 3 | 2026-09-22 08:00 | /docs | GPTBot | – |
| 4 | 2026-09-22 09:00 | /blog/ai-traffic | ClaudeBot | – |
| 5 | 2026-09-23 09:00 | /docs | ClaudeBot | – |
| 6 | 2026-09-23 10:00 | /pricing | ChatGPT-User | – |
| 7 | 2026-09-24 10:00 | /robots.txt | PerplexityBot | – |
| – | – | *malformed line* | – | – |
| 8 | 2026-09-24 11:00 | /docs | Googlebot | – |
| 9 | 2026-09-25 12:00 | /pricing?utm_source=chatgpt.com | browser | https://chatgpt.com/ |
| 10 | 2026-09-25 13:00 | /pricing | browser | https://chatgpt.com/ |
| 11 | 2026-09-26 12:00 | /docs | browser | https://www.perplexity.ai/search?q=ai+traffic+logs |
| 12 | 2026-09-26 13:00 | /blog/ai-traffic | browser | https://claude.ai/ |
| 13 | 2026-09-27 12:00 | / | browser | https://www.google.com/ |
| 14 | 2026-09-27 13:00 | / | browser with a `"` in its UA | – |

nginx writes times in `+0000` and escapes quotes as `\x22`. Apache writes times in `-0500` and escapes quotes as `\"`. CloudFront URL-encodes the UA and referrer and splits the query into `cs-uri-query`. ALB has no referrer field and uses absolute URLs.

- [ ] **Step 1: Write the fixture generator `python/scripts/make_fixture_logs.py`**

```python
"""Write conformance/logs/{nginx,apache,cloudfront,alb}.log from one event table.

The four files describe the same 14 requests plus one malformed line, so every
format must produce the same report (ALB has no Referer field, so no referrals).
Run after changing EVENTS, then regenerate the golden files with write_golden.py.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

from rastrolog.formats import DEFAULT_CLOUDFRONT_FIELDS

ROOT = Path(__file__).resolve().parents[2]
LOGS = ROOT / "conformance" / "logs"
UA_CASES = json.loads((ROOT / "conformance" / "user_agents.json").read_text(encoding="utf-8"))
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
MALFORMED = "this line is not a valid access log entry"
MALFORMED_AFTER = 7  # insert after the 7th event
QUOTED_UA = 'Mozilla/5.0 (X11; Linux x86_64) "Quoted" Browser/1.0'


def ua(key: str) -> str:
    for case in UA_CASES:
        if case.get("label") == key or (case["expect"] and case["expect"]["id"] == key):
            return str(case["ua"])
    raise KeyError(key)


GPTBOT, CLAUDEBOT = ua("openai-gptbot"), ua("anthropic-claudebot")
CHATGPT_USER, PERPLEXITYBOT = ua("openai-chatgpt-user"), ua("perplexity-perplexitybot")
GOOGLEBOT, BROWSER = ua("google-googlebot"), ua("browser-chrome")

EVENTS: list[tuple[str, str, str, str]] = [
    ("2026-09-20T08:00:00", "/docs", GPTBOT, ""),
    ("2026-09-21T08:00:00", "/pricing", GPTBOT, ""),
    ("2026-09-22T08:00:00", "/docs", GPTBOT, ""),
    ("2026-09-22T09:00:00", "/blog/ai-traffic", CLAUDEBOT, ""),
    ("2026-09-23T09:00:00", "/docs", CLAUDEBOT, ""),
    ("2026-09-23T10:00:00", "/pricing", CHATGPT_USER, ""),
    ("2026-09-24T10:00:00", "/robots.txt", PERPLEXITYBOT, ""),
    ("2026-09-24T11:00:00", "/docs", GOOGLEBOT, ""),
    ("2026-09-25T12:00:00", "/pricing?utm_source=chatgpt.com", BROWSER, "https://chatgpt.com/"),
    ("2026-09-25T13:00:00", "/pricing", BROWSER, "https://chatgpt.com/"),
    ("2026-09-26T12:00:00", "/docs", BROWSER, "https://www.perplexity.ai/search?q=ai+traffic+logs"),
    ("2026-09-26T13:00:00", "/blog/ai-traffic", BROWSER, "https://claude.ai/"),
    ("2026-09-27T12:00:00", "/", BROWSER, "https://www.google.com/"),
    ("2026-09-27T13:00:00", "/", QUOTED_UA, ""),
]


def _ts(text: str) -> datetime:
    return datetime.fromisoformat(text).replace(tzinfo=timezone.utc)


def _clf(ts: datetime, offset_hours: int) -> str:
    local = ts.astimezone(timezone(timedelta(hours=offset_hours)))
    sign = "+" if offset_hours >= 0 else "-"
    return (
        f"{local.day:02d}/{MONTHS[local.month - 1]}/{local.year}:"
        f"{local:%H:%M:%S} {sign}{abs(offset_hours):02d}00"
    )


def _combined(offset_hours: int, quote_escape: str) -> Callable[[datetime, str, str, str], str]:
    def line(ts: datetime, target: str, agent: str, referrer: str) -> str:
        return (
            f'203.0.113.7 - - [{_clf(ts, offset_hours)}] "GET {target} HTTP/1.1" 200 5120 '
            f'"{referrer or "-"}" "{agent.replace(chr(34), quote_escape)}"'
        )

    return line


def _cloudfront(ts: datetime, target: str, agent: str, referrer: str) -> str:
    path, _, query = target.partition("?")
    values = {
        "date": ts.strftime("%Y-%m-%d"),
        "time": ts.strftime("%H:%M:%S"),
        "x-edge-location": "LAX50-C1",
        "sc-bytes": "5120",
        "c-ip": "203.0.113.7",
        "cs-method": "GET",
        "cs(Host)": "d111111abcdef8.cloudfront.net",
        "cs-uri-stem": path,
        "sc-status": "200",
        "cs(Referer)": quote(referrer, safe=":/?=&+") if referrer else "-",
        "cs(User-Agent)": quote(agent, safe="/;:()+,.=@-_"),
        "cs-uri-query": query or "-",
    }
    return "\t".join(values.get(name, "-") for name in DEFAULT_CLOUDFRONT_FIELDS)


def _alb(ts: datetime, target: str, agent: str, referrer: str) -> str:
    iso = ts.strftime("%Y-%m-%dT%H:%M:%S.000000Z")
    return (
        f"https {iso} app/my-lb/50dc6c495c0c9188 203.0.113.7:4321 10.0.0.1:80 "
        f'0.000 0.001 0.000 200 200 120 5120 "GET https://www.example.com:443{target} HTTP/1.1" '
        f'"{agent.replace(chr(34), chr(39))}" ECDHE-RSA-AES128-GCM-SHA256 TLSv1.2 '
        "arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/web/73e2d6bc24d8a067 "
        '"Root=1-67891233-abcdef012345678912345678" "www.example.com" '
        '"arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012" '
        f'0 {iso} "forward" "-" "-" "10.0.0.1:80" "200" "-" "-"'
    )


WRITERS: dict[str, tuple[list[str], Callable[[datetime, str, str, str], str]]] = {
    "nginx": ([], _combined(0, "\\x22")),
    "apache": ([], _combined(-5, '\\"')),
    "cloudfront": (["#Version: 1.0", "#Fields: " + " ".join(DEFAULT_CLOUDFRONT_FIELDS)], _cloudfront),
    "alb": ([], _alb),
}


def main() -> None:
    LOGS.mkdir(parents=True, exist_ok=True)
    for name, (header, write) in WRITERS.items():
        lines = list(header)
        for index, (when, target, agent, referrer) in enumerate(EVENTS, start=1):
            lines.append(write(_ts(when), target, agent, referrer))
            if index == MALFORMED_AFTER:
                lines.append(MALFORMED)
        (LOGS / f"{name}.log").write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"wrote conformance/logs/{name}.log ({len(lines)} lines)")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Generate the fixture logs and eyeball them**

Run: `cd python && uv run python scripts/make_fixture_logs.py`
Expected: `wrote conformance/logs/nginx.log (15 lines)` for nginx, apache and alb, and `(17 lines)` for cloudfront. Open `apache.log` and check that line 1 reads `[20/Sep/2026:03:00:00 -0500]` and the last line contains `\"Quoted\"`. Open `nginx.log` and check that the last line contains `\x22Quoted\x22`.

- [ ] **Step 3: Write the failing tests `python/tests/test_parse.py`**

```python
import gzip
from pathlib import Path

import pytest
from helpers import LOGS, SAMPLE_UA

from rastrolog.formats import UnknownFormatError
from rastrolog.parse import ParseStats, iter_records

LINE = (
    '203.0.113.7 - - [28/Sep/2026:12:00:00 +0000] "GET /docs HTTP/1.1" 200 10 "-" "{ua}"'
)


@pytest.mark.parametrize(
    ("name", "fmt"),
    [("nginx", "combined"), ("apache", "combined"), ("cloudfront", "cloudfront"), ("alb", "alb")],
)
def test_fixture_logs_parse(name: str, fmt: str) -> None:
    stats = ParseStats()
    records = list(iter_records(LOGS / f"{name}.log", stats=stats))
    assert stats.format == fmt
    assert (stats.records, stats.skipped, len(records)) == (14, 1, 14)
    assert records[-1].ua.count('"') in (0, 2)  # ALB fixture swaps quotes for apostrophes


def test_gzip_is_detected_by_magic_bytes_not_extension(tmp_path: Path) -> None:
    packed = tmp_path / "access.log"  # no .gz suffix on purpose
    packed.write_bytes(gzip.compress((LOGS / "nginx.log").read_bytes()))
    plain = list(iter_records(LOGS / "nginx.log"))
    assert list(iter_records(packed)) == plain


def test_truncated_gzip_is_flagged(tmp_path: Path) -> None:
    data = gzip.compress((LOGS / "nginx.log").read_bytes() * 50)
    cut = tmp_path / "cut.log.gz"
    cut.write_bytes(data[: len(data) // 2])
    stats = ParseStats()
    records = list(iter_records(cut, stats=stats))
    assert stats.truncated
    assert 0 < len(records) < 14 * 50


def test_unknown_format_raises(tmp_path: Path) -> None:
    log = tmp_path / "x.log"
    log.write_text("hello world\nmore text\n")
    with pytest.raises(UnknownFormatError):
        list(iter_records(log))


def test_explicit_format_skips_detection(tmp_path: Path) -> None:
    log = tmp_path / "x.log"
    log.write_text("garbage\n" + LINE.format(ua=SAMPLE_UA["gptbot"]) + "\n")
    stats = ParseStats()
    records = list(iter_records(log, "combined", stats=stats))
    assert (len(records), stats.skipped) == (1, 1)


def test_empty_file(tmp_path: Path) -> None:
    log = tmp_path / "empty.log"
    log.write_text("\n\n")
    stats = ParseStats()
    assert list(iter_records(log, stats=stats)) == []
    assert stats.format is None


def test_crlf_and_blank_lines(tmp_path: Path) -> None:
    log = tmp_path / "win.log"
    line = LINE.format(ua=SAMPLE_UA["gptbot"])
    log.write_bytes(f"{line}\r\n\r\n{line}\r\n".encode())
    stats = ParseStats()
    records = list(iter_records(log, stats=stats))
    assert len(records) == 2
    assert stats.skipped == 0
    assert records[0].ua == SAMPLE_UA["gptbot"]


def test_invalid_utf8_bytes_are_replaced(tmp_path: Path) -> None:
    log = tmp_path / "bytes.log"
    log.write_bytes(LINE.format(ua="Agent \udcff").encode("utf-8", "surrogateescape") + b"\n")
    records = list(iter_records(log))
    assert len(records) == 1
    assert "�" in records[0].ua


def test_progress_ends_at_file_size(tmp_path: Path) -> None:
    log = tmp_path / "big.log"
    log.write_text((LINE.format(ua=SAMPLE_UA["gptbot"]) + "\n") * 5000)
    seen: list[int] = []
    list(iter_records(log, progress=seen.append))
    assert len(seen) >= 2
    assert seen == sorted(seen)
    assert seen[-1] == log.stat().st_size
```

- [ ] **Step 4: Run the tests to confirm they fail**

Run: `cd python && uv run pytest tests/test_parse.py -v`
Expected: `ModuleNotFoundError: No module named 'rastrolog.parse'`.

- [ ] **Step 5: Write `python/src/rastrolog/parse.py`**

```python
"""Stream LogRecords from a file, plain or gzip, in constant memory."""

from __future__ import annotations

import gzip
import io
import zlib
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import IO

from rastrolog.formats import (
    Format,
    LineParser,
    LogRecord,
    MalformedLineError,
    detect,
    make_parser,
)

GZIP_MAGIC = b"\x1f\x8b"
PROGRESS_EVERY = 2000  # lines between progress callbacks


@dataclass(slots=True)
class ParseStats:
    format: Format | None = None
    lines: int = 0
    records: int = 0
    skipped: int = 0
    truncated: bool = False


def iter_records(
    path: Path,
    fmt: Format | None = None,
    *,
    stats: ParseStats | None = None,
    progress: Callable[[int], None] | None = None,
) -> Iterator[LogRecord]:
    """Yield records from ``path``; fill ``stats`` as it goes.

    gzip is detected by magic bytes, not by extension. Invalid UTF-8 bytes are
    replaced, CRLF is normalised, blank lines are ignored. ``progress`` receives
    on-disk bytes read so far (compressed bytes for gzip) so a bar can use the
    file size as its total. Raises UnknownFormatError when ``fmt`` is None and the
    first non-empty line matches no format. A cut-off gzip ends iteration early
    and sets ``stats.truncated``.
    """
    st = stats if stats is not None else ParseStats()
    with path.open("rb") as raw:
        magic = raw.read(2)
        raw.seek(0)
        stream: IO[bytes] = gzip.GzipFile(fileobj=raw, mode="rb") if magic == GZIP_MAGIC else raw
        text = io.TextIOWrapper(stream, encoding="utf-8", errors="replace", newline=None)
        parser: LineParser | None = None
        try:
            for line in text:
                st.lines += 1
                if progress is not None and st.lines % PROGRESS_EVERY == 0:
                    progress(raw.tell())
                line = line.rstrip("\n")
                if not line.strip():
                    continue
                if parser is None:
                    st.format = fmt or detect(line)
                    parser = make_parser(st.format)
                try:
                    record = parser.parse(line)
                except MalformedLineError:
                    st.skipped += 1
                    continue
                if record is not None:
                    st.records += 1
                    yield record
        except (EOFError, gzip.BadGzipFile, zlib.error):
            st.truncated = True
        if progress is not None:
            progress(raw.tell())
```

- [ ] **Step 6: Run the tests to confirm they pass**

Run: `cd python && uv run pytest tests/test_parse.py -v`
Expected: all pass.

If `test_progress_ends_at_file_size` fails because the last value is short of the file size, `TextIOWrapper` has buffered the tail. Call `progress(path.stat().st_size)` at the end instead of `raw.tell()`: once the loop finishes, the whole file has been consumed, so this is accurate.

- [ ] **Step 7: Lint, type-check, commit**

```bash
cd python && uv run ruff check . && uv run ruff format --check . && uv run mypy
git add python/src/rastrolog/parse.py python/scripts/make_fixture_logs.py python/tests/test_parse.py conformance/logs/*.log
git commit -m "feat: stream records from plain or gzipped logs, with shared fixture logs"
```

---

### Task 6: Report aggregation (`report.py`) and golden files

**Files:**
- Create: `python/src/rastrolog/report.py`, `python/scripts/write_golden.py`, `python/tests/test_report.py`, `conformance/logs/{nginx,apache,cloudfront,alb}.expected.json` (generated)
- Modify: `python/tests/helpers.py` (add `report_for`)

**Interfaces:**
- Consumes: `classify_user_agent`, `classify_referrer`, `Match` (Task 3); `LogRecord` (Task 4); `iter_records`, `ParseStats` (Task 5); fixture logs (Task 5).
- Produces:
  - `CrawlerRow(id, vendor, vendor_name, token, purpose, ai_specific, requests, unique_pages, last_seen: datetime, top_pages: tuple[tuple[str, int], ...])`
  - `ReferralRow(id, vendor, vendor_name, product, visits, unique_pages, last_seen, top_pages)`
  - `PageRow(path, crawler_requests, referral_visits, crawlers: tuple[tuple[str,int],...] (token,count), referrals: tuple[tuple[str,int],...] (product,count))` with `.total`
  - `Report(records, skipped, crawlers, referrals, pages)` with `.ai_crawler_requests`, `.ai_referral_visits`, `.to_dict() -> dict[str, Any]`
  - `Aggregator(*, since: datetime | None = None, own_host: str | None = None)` with `.add(record)`, `.add_all(records)`, `.result(*, top: int = 10, skipped: int = 0) -> Report`
  - `parse_since(value: str, *, now: datetime | None = None) -> datetime` (raises `ValueError` with a user-facing message)
  - `helpers.report_for(name: str, **kwargs) -> Report`

Behaviour rules (from Global Constraints): crawler rows include `ai_specific=False` rows (search engines) but those are excluded from `ai_crawler_requests` and from the page pivot; a request whose UA is a crawler is never also a referral; rows sort by count desc then id; top pages sort by count desc then path; `pages` is limited to `top`.

- [ ] **Step 1: Add `report_for` to `python/tests/helpers.py`**

```python
def report_for(name: str, **kwargs: Any) -> Report:
    """Parse conformance/logs/<name>.log and aggregate it."""
    from rastrolog.parse import ParseStats, iter_records
    from rastrolog.report import Aggregator

    stats = ParseStats()
    aggregator = Aggregator(**kwargs)
    aggregator.add_all(iter_records(LOGS / f"{name}.log", stats=stats))
    return aggregator.result(skipped=stats.skipped)
```

Add `from typing import TYPE_CHECKING` and, under `if TYPE_CHECKING:`, `from rastrolog.report import Report` to the top of `helpers.py`.

- [ ] **Step 2: Write the failing tests `python/tests/test_report.py`**

```python
import json
from datetime import datetime, timezone

import pytest
from helpers import LOGS, SAMPLE_UA, load_json, report_for

from rastrolog.formats import LogRecord
from rastrolog.report import Aggregator, parse_since

UTC = timezone.utc
ALL_LOGS = ["nginx", "apache", "cloudfront", "alb"]
WITH_REFERRERS = ["nginx", "apache", "cloudfront"]


@pytest.mark.parametrize("name", ALL_LOGS)
def test_crawler_rows(name: str) -> None:
    report = report_for(name)
    rows = {row.id: row for row in report.crawlers}
    gptbot = rows["openai-gptbot"]
    assert (gptbot.requests, gptbot.unique_pages) == (3, 2)
    assert gptbot.top_pages == (("/docs", 2), ("/pricing", 1))
    assert gptbot.last_seen == datetime(2026, 9, 22, 8, 0, tzinfo=UTC)
    claudebot = rows["anthropic-claudebot"]
    assert claudebot.top_pages == (("/blog/ai-traffic", 1), ("/docs", 1))
    assert rows["openai-chatgpt-user"].requests == 1
    assert rows["perplexity-perplexitybot"].top_pages == (("/robots.txt", 1),)
    assert rows["google-googlebot"].ai_specific is False
    assert report.ai_crawler_requests == 7
    assert (report.records, report.skipped) == (14, 1)


def test_rows_sort_by_count_then_id() -> None:
    ids = [row.id for row in report_for("nginx").crawlers]
    assert ids == [
        "openai-gptbot",
        "anthropic-claudebot",
        "google-googlebot",
        "openai-chatgpt-user",
        "perplexity-perplexitybot",
    ]


@pytest.mark.parametrize("name", WITH_REFERRERS)
def test_referral_rows_merge_query_strings(name: str) -> None:
    report = report_for(name)
    rows = {row.id: row for row in report.referrals}
    assert set(rows) == {"chatgpt", "perplexity", "claude"}
    chatgpt = rows["chatgpt"]
    assert (chatgpt.visits, chatgpt.unique_pages, chatgpt.top_pages) == (2, 1, (("/pricing", 2),))
    assert chatgpt.product == "ChatGPT"
    assert rows["perplexity"].top_pages == (("/docs", 1),)
    assert rows["claude"].top_pages == (("/blog/ai-traffic", 1),)
    assert report.ai_referral_visits == 4


def test_alb_logs_have_no_referrals() -> None:
    assert report_for("alb").referrals == ()


def test_page_pivot() -> None:
    pages = report_for("nginx").pages
    assert [(p.path, p.total) for p in pages] == [
        ("/docs", 4),
        ("/pricing", 4),
        ("/blog/ai-traffic", 2),
        ("/robots.txt", 1),
    ]
    docs = pages[0]
    assert docs.crawlers == (("GPTBot", 2), ("ClaudeBot", 1))
    assert docs.referrals == (("Perplexity", 1),)


def test_top_limits_pages_and_top_pages() -> None:
    aggregator = Aggregator()
    for i in range(5):
        aggregator.add(LogRecord(datetime(2026, 9, 1, tzinfo=UTC), f"/p{i}", 200, SAMPLE_UA["gptbot"], ""))
    report = aggregator.result(top=2)
    assert len(report.pages) == 2
    assert len(report.crawlers[0].top_pages) == 2
    assert report.crawlers[0].unique_pages == 5


def test_since_filters_by_timestamp() -> None:
    report = report_for("nginx", since=datetime(2026, 9, 24, tzinfo=UTC))
    assert {row.id for row in report.crawlers} == {"perplexity-perplexitybot", "google-googlebot"}
    assert {row.id: row.visits for row in report.referrals} == {"chatgpt": 2, "perplexity": 1, "claude": 1}
    assert report.records == 14


def test_crawler_with_an_ai_referrer_is_only_a_crawler() -> None:
    aggregator = Aggregator()
    aggregator.add(LogRecord(datetime(2026, 9, 1, tzinfo=UTC), "/", 200, SAMPLE_UA["gptbot"], "https://chatgpt.com/"))
    report = aggregator.result()
    assert [row.id for row in report.crawlers] == ["openai-gptbot"]
    assert report.referrals == ()


def test_own_host_is_not_a_referral() -> None:
    aggregator = Aggregator(own_host="chatgpt.com")
    aggregator.add(LogRecord(datetime(2026, 9, 1, tzinfo=UTC), "/", 200, SAMPLE_UA["browser"], "https://chatgpt.com/"))
    assert aggregator.result().referrals == ()


def test_to_dict_shape() -> None:
    data = report_for("nginx").to_dict()
    assert set(data) == {"summary", "crawlers", "referrals", "pages"}
    assert data["summary"] == {
        "records": 14,
        "skipped": 1,
        "ai_crawler_requests": 7,
        "ai_referral_visits": 4,
    }
    first = data["crawlers"][0]
    assert first["last_seen"] == "2026-09-22T08:00:00+00:00"
    assert first["top_pages"][0] == {"path": "/docs", "count": 2}
    json.dumps(data)  # serialisable


@pytest.mark.parametrize("name", ALL_LOGS)
def test_to_dict_matches_golden_file(name: str) -> None:
    assert report_for(name).to_dict() == load_json(LOGS / f"{name}.expected.json")


NOW = datetime(2026, 9, 28, 12, 0, tzinfo=UTC)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("30m", datetime(2026, 9, 28, 11, 30, tzinfo=UTC)),
        ("24h", datetime(2026, 9, 27, 12, 0, tzinfo=UTC)),
        ("7d", datetime(2026, 9, 21, 12, 0, tzinfo=UTC)),
        ("2w", datetime(2026, 9, 14, 12, 0, tzinfo=UTC)),
        ("7D", datetime(2026, 9, 21, 12, 0, tzinfo=UTC)),
        ("2026-09-01", datetime(2026, 9, 1, tzinfo=UTC)),
        ("2026-09-01T10:00:00+02:00", datetime(2026, 9, 1, 8, 0, tzinfo=UTC)),
    ],
)
def test_parse_since(value: str, expected: datetime) -> None:
    assert parse_since(value, now=NOW) == expected


@pytest.mark.parametrize("value", ["yesterday", "7", "d7", ""])
def test_parse_since_rejects_garbage(value: str) -> None:
    with pytest.raises(ValueError, match="--since"):
        parse_since(value, now=NOW)
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `cd python && uv run pytest tests/test_report.py -v`
Expected: `ModuleNotFoundError: No module named 'rastrolog.report'`.

- [ ] **Step 4: Write `python/src/rastrolog/report.py`**

```python
"""Aggregate LogRecords into the crawler table, the referral table and a per-page pivot."""

from __future__ import annotations

import re
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from rastrolog.classify import Match, classify_referrer, classify_user_agent
from rastrolog.formats import LogRecord

PageCount = tuple[str, int]


@dataclass(frozen=True, slots=True)
class CrawlerRow:
    id: str
    vendor: str
    vendor_name: str
    token: str
    purpose: str
    ai_specific: bool
    requests: int
    unique_pages: int
    last_seen: datetime
    top_pages: tuple[PageCount, ...]


@dataclass(frozen=True, slots=True)
class ReferralRow:
    id: str
    vendor: str
    vendor_name: str
    product: str
    visits: int
    unique_pages: int
    last_seen: datetime
    top_pages: tuple[PageCount, ...]


@dataclass(frozen=True, slots=True)
class PageRow:
    path: str
    crawler_requests: int
    referral_visits: int
    crawlers: tuple[tuple[str, int], ...]  # (token, count)
    referrals: tuple[tuple[str, int], ...]  # (product, count)

    @property
    def total(self) -> int:
        return self.crawler_requests + self.referral_visits


@dataclass(frozen=True, slots=True)
class Report:
    records: int
    skipped: int
    crawlers: tuple[CrawlerRow, ...]
    referrals: tuple[ReferralRow, ...]
    pages: tuple[PageRow, ...]

    @property
    def ai_crawler_requests(self) -> int:
        return sum(row.requests for row in self.crawlers if row.ai_specific)

    @property
    def ai_referral_visits(self) -> int:
        return sum(row.visits for row in self.referrals)

    def to_dict(self) -> dict[str, Any]:
        return {
            "summary": {
                "records": self.records,
                "skipped": self.skipped,
                "ai_crawler_requests": self.ai_crawler_requests,
                "ai_referral_visits": self.ai_referral_visits,
            },
            "crawlers": [
                {
                    "id": r.id,
                    "vendor": r.vendor,
                    "vendor_name": r.vendor_name,
                    "token": r.token,
                    "purpose": r.purpose,
                    "ai_specific": r.ai_specific,
                    "requests": r.requests,
                    "unique_pages": r.unique_pages,
                    "last_seen": r.last_seen.isoformat(),
                    "top_pages": _page_list(r.top_pages),
                }
                for r in self.crawlers
            ],
            "referrals": [
                {
                    "id": r.id,
                    "vendor": r.vendor,
                    "vendor_name": r.vendor_name,
                    "product": r.product,
                    "visits": r.visits,
                    "unique_pages": r.unique_pages,
                    "last_seen": r.last_seen.isoformat(),
                    "top_pages": _page_list(r.top_pages),
                }
                for r in self.referrals
            ],
            "pages": [
                {
                    "path": p.path,
                    "crawler_requests": p.crawler_requests,
                    "referral_visits": p.referral_visits,
                    "crawlers": [{"token": t, "count": c} for t, c in p.crawlers],
                    "referrals": [{"product": n, "count": c} for n, c in p.referrals],
                }
                for p in self.pages
            ],
        }


def _page_list(pages: tuple[PageCount, ...]) -> list[dict[str, Any]]:
    return [{"path": path, "count": count} for path, count in pages]


def _top(counter: Counter[str], limit: int) -> tuple[PageCount, ...]:
    return tuple(sorted(counter.items(), key=lambda item: (-item[1], item[0]))[:limit])


@dataclass(slots=True)
class _Tally:
    match: Match
    count: int = 0
    pages: Counter[str] = field(default_factory=Counter)
    last_seen: datetime | None = None

    def add(self, record: LogRecord) -> None:
        self.count += 1
        self.pages[record.path] += 1
        if self.last_seen is None or record.ts > self.last_seen:
            self.last_seen = record.ts


class Aggregator:
    """Streaming aggregation: feed records with ``add`` and read a Report with ``result``."""

    def __init__(self, *, since: datetime | None = None, own_host: str | None = None) -> None:
        self._since = since
        self._own_host = own_host
        self.records = 0
        self._crawlers: dict[str, _Tally] = {}
        self._referrals: dict[str, _Tally] = {}
        self._page_crawlers: dict[str, Counter[str]] = {}
        self._page_referrals: dict[str, Counter[str]] = {}

    def add(self, record: LogRecord) -> None:
        self.records += 1
        if self._since is not None and record.ts < self._since:
            return
        crawler = classify_user_agent(record.ua)
        if crawler is not None:
            self._tally(self._crawlers, crawler, record)
            if crawler.ai_specific:
                label = crawler.token or crawler.id
                self._page_crawlers.setdefault(record.path, Counter())[label] += 1
            return
        referral = classify_referrer(record.referrer, own_host=self._own_host)
        if referral is not None:
            self._tally(self._referrals, referral, record)
            label = referral.product or referral.id
            self._page_referrals.setdefault(record.path, Counter())[label] += 1

    def add_all(self, records: Iterable[LogRecord]) -> None:
        for record in records:
            self.add(record)

    @staticmethod
    def _tally(bucket: dict[str, _Tally], match: Match, record: LogRecord) -> None:
        tally = bucket.get(match.id)
        if tally is None:
            tally = bucket[match.id] = _Tally(match)
        tally.add(record)

    def result(self, *, top: int = 10, skipped: int = 0) -> Report:
        crawlers = sorted(
            (self._crawler_row(t, top) for t in self._crawlers.values()),
            key=lambda r: (-r.requests, r.id),
        )
        referrals = sorted(
            (self._referral_row(t, top) for t in self._referrals.values()),
            key=lambda r: (-r.visits, r.id),
        )
        paths = set(self._page_crawlers) | set(self._page_referrals)
        pages = sorted((self._page_row(p) for p in paths), key=lambda r: (-r.total, r.path))
        return Report(
            records=self.records,
            skipped=skipped,
            crawlers=tuple(crawlers),
            referrals=tuple(referrals),
            pages=tuple(pages[:top]),
        )

    @staticmethod
    def _crawler_row(tally: _Tally, top: int) -> CrawlerRow:
        m = tally.match
        assert tally.last_seen is not None
        return CrawlerRow(
            id=m.id,
            vendor=m.vendor,
            vendor_name=m.vendor_name,
            token=m.token or m.id,
            purpose=m.purpose or "",
            ai_specific=m.ai_specific,
            requests=tally.count,
            unique_pages=len(tally.pages),
            last_seen=tally.last_seen,
            top_pages=_top(tally.pages, top),
        )

    @staticmethod
    def _referral_row(tally: _Tally, top: int) -> ReferralRow:
        m = tally.match
        assert tally.last_seen is not None
        return ReferralRow(
            id=m.id,
            vendor=m.vendor,
            vendor_name=m.vendor_name,
            product=m.product or m.id,
            visits=tally.count,
            unique_pages=len(tally.pages),
            last_seen=tally.last_seen,
            top_pages=_top(tally.pages, top),
        )

    def _page_row(self, path: str) -> PageRow:
        crawlers = self._page_crawlers.get(path, Counter())
        referrals = self._page_referrals.get(path, Counter())
        return PageRow(
            path=path,
            crawler_requests=sum(crawlers.values()),
            referral_visits=sum(referrals.values()),
            crawlers=_top(crawlers, len(crawlers)),
            referrals=_top(referrals, len(referrals)),
        )


_RELATIVE = re.compile(r"^\s*(\d+)\s*([mhdw])\s*$", re.IGNORECASE)
_UNITS = {"m": "minutes", "h": "hours", "d": "days", "w": "weeks"}


def parse_since(value: str, *, now: datetime | None = None) -> datetime:
    """``30m`` / ``24h`` / ``7d`` / ``2w`` before now, or an ISO date/datetime (naive = UTC)."""
    now = now or datetime.now(timezone.utc)
    relative = _RELATIVE.match(value)
    if relative:
        amount, unit = int(relative.group(1)), relative.group(2).lower()
        return now - timedelta(**{_UNITS[unit]: amount})
    try:
        parsed = datetime.fromisoformat(value.strip())
    except ValueError as exc:
        msg = f"invalid --since value {value!r}: use 30m, 24h, 7d, 2w or a date like 2026-09-01"
        raise ValueError(msg) from exc
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
```

- [ ] **Step 5: Write the golden-file generator `python/scripts/write_golden.py`**

```python
"""Regenerate conformance/logs/*.expected.json from the Python implementation.

Run it after an intentional behaviour change and review the diff before
committing. The golden files are also the contract for the TypeScript parser
in js/core (Epic 2/3), so an unreviewed change here breaks parity.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from rastrolog.parse import ParseStats, iter_records
from rastrolog.report import Aggregator

LOGS = Path(__file__).resolve().parents[2] / "conformance" / "logs"


def main() -> int:
    for log in sorted(LOGS.glob("*.log")):
        stats = ParseStats()
        aggregator = Aggregator()
        aggregator.add_all(iter_records(log, stats=stats))
        report = aggregator.result(top=10, skipped=stats.skipped)
        target = log.with_suffix(".expected.json")
        target.write_text(json.dumps(report.to_dict(), indent=2) + "\n", encoding="utf-8")
        print(f"wrote {target.relative_to(LOGS.parents[1])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 6: Run the non-golden tests to confirm they pass**

Run: `cd python && uv run pytest tests/test_report.py -v -k "not golden"`
Expected: all pass. These hand-computed assertions are the real check. The golden files only freeze the result for Epic 2.

- [ ] **Step 7: Generate and review the golden files**

Run: `cd python && uv run python scripts/write_golden.py`
Expected: `wrote conformance/logs/alb.expected.json` and the same for apache, cloudfront and nginx. Open `nginx.expected.json` and check it against the hand-computed facts in Step 2: GPTBot 3 requests, ChatGPT 2 visits on `/pricing`, 4 pages. `nginx`, `apache` and `cloudfront` should be identical. `alb` should differ only in `referrals: []`, `ai_referral_visits: 0`, and page totals that have no referral counts.

- [ ] **Step 8: Run all tests**

Run: `cd python && uv run pytest -v`
Expected: all pass, including `test_to_dict_matches_golden_file`.

- [ ] **Step 9: Lint, type-check, commit**

```bash
cd python && uv run ruff check . && uv run ruff format --check . && uv run mypy
git add python/src/rastrolog/report.py python/scripts/write_golden.py python/tests/test_report.py python/tests/helpers.py conformance/logs/*.expected.json
git commit -m "feat: aggregate records into crawler, referral and page reports with golden fixtures"
```

---

### Task 7: Charm-style theme and table rendering (`theme.py`, `render.py`)

**Files:**
- Create: `python/src/rastrolog/theme.py`, `python/src/rastrolog/render.py`, `python/tests/test_render.py`
- Modify: `CLAUDE.md` (rich/typer rule now names three modules)

**Interfaces:**
- Consumes: `Report`, rows (Task 6); `helpers.report_for` (Task 6).
- Produces:
  - `theme.THEME: rich.theme.Theme`, colour constants `PINK, PURPLE, GREEN, YELLOW, GREY, RED`, `PURPOSE_LABELS: dict[str, str]`, `purpose_badge(purpose: str) -> rich.text.Text`
  - `render.render_report(console: Console, report: Report, *, by: str = "vendor", sources: Sequence[str] = ()) -> None`
  - `render.crawler_table / search_engine_table / referral_table / page_table (report) -> Table | None`, `render.summary_line(report) -> Text`

- [ ] **Step 1: Write the failing tests `python/tests/test_render.py`**

```python
from helpers import report_for
from rich.console import Console

from rastrolog.render import render_report, summary_line
from rastrolog.report import Report
from rastrolog.theme import THEME, purpose_badge


def _render(report: Report, **kwargs: object) -> str:
    console = Console(record=True, width=200, theme=THEME, color_system=None)
    render_report(console, report, **kwargs)  # type: ignore[arg-type]
    return console.export_text()


def test_vendor_view_shows_both_tables_and_search_engines() -> None:
    text = _render(report_for("nginx"), sources=["nginx.log"])
    assert "AI crawlers" in text
    assert "GPTBot" in text
    assert "training" in text
    assert "/docs (2)" in text
    assert "AI referrals" in text
    assert "ChatGPT" in text
    assert "/pricing (2)" in text
    assert "Search engines (for comparison)" in text
    assert "Googlebot" in text
    assert "nginx.log" in text


def test_page_view() -> None:
    text = _render(report_for("nginx"), by="page")
    assert "Pages AI tools touch" in text
    assert "/docs" in text
    assert "GPTBot 2" in text
    assert "Perplexity 1" in text


def test_empty_report_shows_friendly_messages() -> None:
    empty = Report(records=3, skipped=0, crawlers=(), referrals=(), pages=())
    text = _render(empty)
    assert "No AI crawlers found." in text
    assert "No AI referrals found." in text


def test_summary_mentions_skipped_lines_with_correct_plural() -> None:
    report = report_for("nginx")
    assert "skipped 1 malformed line" in summary_line(report).plain
    assert "malformed lines" not in summary_line(report).plain


def test_purpose_badge_labels() -> None:
    assert purpose_badge("user_fetch").plain.strip() == "user fetch"
    assert purpose_badge("something_new").plain.strip() == "something_new"
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `cd python && uv run pytest tests/test_render.py -v`
Expected: `ModuleNotFoundError: No module named 'rastrolog.render'`.

- [ ] **Step 3: Write `python/src/rastrolog/theme.py`**

```python
"""Charm-inspired look for the CLI (the lipgloss palette), built on rich."""

from __future__ import annotations

from rich.text import Text
from rich.theme import Theme

PINK = "#F25D94"
PURPLE = "#7D56F4"
GREEN = "#04B575"
YELLOW = "#ECC94B"
GREY = "#767676"
RED = "#FF5F87"

PURPOSE_LABELS = {
    "training": "training",
    "user_fetch": "user fetch",
    "search_index": "search index",
}

THEME = Theme(
    {
        "brand": f"bold {PINK}",
        "accent": PURPLE,
        "ok": GREEN,
        "warn": YELLOW,
        "err": f"bold {RED}",
        "muted": GREY,
        "count": "bold",
        "badge.training": f"bold reverse {PINK}",
        "badge.user_fetch": f"bold reverse {GREEN}",
        "badge.search_index": f"bold reverse {PURPLE}",
        "badge.other": f"reverse {GREY}",
    }
)


def purpose_badge(purpose: str) -> Text:
    """A small coloured pill: `` training ``, `` user fetch ``, `` search index ``."""
    if purpose in PURPOSE_LABELS:
        return Text(f" {PURPOSE_LABELS[purpose]} ", style=f"badge.{purpose}")
    return Text(f" {purpose} ", style="badge.other")
```

- [ ] **Step 4: Write `python/src/rastrolog/render.py`**

```python
"""Rich tables for a Report. Presentation only: no parsing or classification here."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime

from rich import box
from rich.console import Console
from rich.table import Table
from rich.text import Text

from rastrolog.report import Report
from rastrolog.theme import purpose_badge

TOP_PAGES_IN_CELL = 3


def _when(ts: datetime) -> str:
    return ts.strftime("%Y-%m-%d %H:%M")


def _pages(pages: Sequence[tuple[str, int]]) -> str:
    return "\n".join(f"{path} ({count})" for path, count in pages[:TOP_PAGES_IN_CELL]) or "–"


def _pairs(pairs: Sequence[tuple[str, int]]) -> str:
    return ", ".join(f"{name} {count}" for name, count in pairs) or "–"


def _table(title: str, *, muted: bool = False) -> Table:
    return Table(
        title=title,
        title_style="muted" if muted else "brand",
        title_justify="left",
        box=box.ROUNDED,
        border_style="muted" if muted else "accent",
        header_style="bold",
        style="muted" if muted else "",
    )


def crawler_table(report: Report) -> Table | None:
    rows = [r for r in report.crawlers if r.ai_specific]
    if not rows:
        return None
    table = _table("AI crawlers")
    table.add_column("Vendor")
    table.add_column("Token", style="bold")
    table.add_column("Purpose")
    table.add_column("Requests", justify="right", style="count")
    table.add_column("Pages", justify="right")
    table.add_column("Last seen", style="muted")
    table.add_column("Top pages")
    for r in rows:
        table.add_row(
            r.vendor_name,
            r.token,
            purpose_badge(r.purpose),
            f"{r.requests:,}",
            f"{r.unique_pages:,}",
            _when(r.last_seen),
            _pages(r.top_pages),
        )
    return table


def search_engine_table(report: Report) -> Table | None:
    rows = [r for r in report.crawlers if not r.ai_specific]
    if not rows:
        return None
    table = _table("Search engines (for comparison)", muted=True)
    table.add_column("Vendor")
    table.add_column("Token")
    table.add_column("Requests", justify="right")
    table.add_column("Pages", justify="right")
    table.add_column("Last seen")
    for r in rows:
        table.add_row(r.vendor_name, r.token, f"{r.requests:,}", f"{r.unique_pages:,}", _when(r.last_seen))
    return table


def referral_table(report: Report) -> Table | None:
    if not report.referrals:
        return None
    table = _table("AI referrals")
    table.add_column("Product", style="bold")
    table.add_column("Vendor")
    table.add_column("Visits", justify="right", style="count")
    table.add_column("Pages", justify="right")
    table.add_column("Last seen", style="muted")
    table.add_column("Top landing pages")
    for r in report.referrals:
        table.add_row(
            r.product,
            r.vendor_name,
            f"{r.visits:,}",
            f"{r.unique_pages:,}",
            _when(r.last_seen),
            _pages(r.top_pages),
        )
    return table


def page_table(report: Report) -> Table | None:
    if not report.pages:
        return None
    table = _table("Pages AI tools touch")
    table.add_column("Page", style="bold")
    table.add_column("Crawler requests", justify="right", style="count")
    table.add_column("Referral visits", justify="right", style="count")
    table.add_column("Crawlers")
    table.add_column("Referrals")
    for p in report.pages:
        table.add_row(
            p.path,
            f"{p.crawler_requests:,}",
            f"{p.referral_visits:,}",
            _pairs(p.crawlers),
            _pairs(p.referrals),
        )
    return table


def summary_line(report: Report) -> Text:
    parts: list[tuple[str, str]] = [
        (f"{report.records:,}", "count"),
        (" requests · ", "muted"),
        (f"{report.ai_crawler_requests:,}", "count"),
        (" from AI crawlers · ", "muted"),
        (f"{report.ai_referral_visits:,}", "count"),
        (" AI referral visits", "muted"),
    ]
    if report.skipped:
        plural = "" if report.skipped == 1 else "s"
        parts += [(" · ", "muted"), (f"skipped {report.skipped:,} malformed line{plural}", "warn")]
    return Text.assemble(*parts)


def _print_or_empty(console: Console, table: Table | None, empty_message: str) -> None:
    if table is None:
        console.print(Text(empty_message, style="muted"))
    else:
        console.print(table)


def render_report(
    console: Console, report: Report, *, by: str = "vendor", sources: Sequence[str] = ()
) -> None:
    console.print(Text.assemble(("rastrolog", "brand"), "  ", (", ".join(sources), "muted")))
    console.print()
    if by == "page":
        _print_or_empty(console, page_table(report), "No AI crawler or AI referral traffic found.")
    else:
        _print_or_empty(console, crawler_table(report), "No AI crawlers found.")
        console.print()
        _print_or_empty(console, referral_table(report), "No AI referrals found.")
        engines = search_engine_table(report)
        if engines is not None:
            console.print()
            console.print(engines)
    console.print()
    console.print(summary_line(report))
```

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `cd python && uv run pytest tests/test_render.py -v`
Expected: all pass.

- [ ] **Step 6: Update the dependency rule in `CLAUDE.md`**

Replace `rich`/`typer` are allowed only in `cli.py` and `theme.py`. with: `rich`/`typer` are allowed only in `cli.py`, `render.py` and `theme.py`.

- [ ] **Step 7: Lint, type-check, commit**

```bash
cd python && uv run ruff check . && uv run ruff format --check . && uv run mypy
git add python/src/rastrolog/theme.py python/src/rastrolog/render.py python/tests/test_render.py CLAUDE.md
git commit -m "feat: Charm-style rich tables for crawler, referral and page reports"
```

---

### Task 8: One-time change-notification nudge (`nudge.py`)

**Files:**
- Create: `python/src/rastrolog/nudge.py`, `python/tests/test_nudge.py`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `NUDGE_URL: str` = `"https://github.com/csmatar/rastrolog#get-notified-when-the-list-changes"`. The README heading added in Task 12 must produce this anchor. It moves to the landing page URL in Epic 3.
  - `NUDGE_TEXT: str`, `OPT_OUT_ENV = "RASTROLOG_NO_NUDGE"`
  - `config_dir(env: Mapping[str, str] | None = None, platform: str | None = None, home: Path | None = None) -> Path`
  - `should_nudge(*, interactive: bool, env: Mapping[str, str] | None = None, directory: Path | None = None) -> bool`
  - `mark_nudged(directory: Path | None = None) -> None` (never raises)

- [ ] **Step 1: Write the failing tests `python/tests/test_nudge.py`**

```python
from pathlib import Path

import pytest

from rastrolog.nudge import NUDGE_TEXT, NUDGE_URL, config_dir, mark_nudged, should_nudge


def test_config_dir_per_platform(tmp_path: Path) -> None:
    home = tmp_path / "home"
    assert config_dir({}, "linux", home) == home / ".config" / "rastrolog"
    assert config_dir({"XDG_CONFIG_HOME": "/xdg"}, "linux", home) == Path("/xdg/rastrolog")
    assert config_dir({}, "darwin", home) == home / "Library" / "Application Support" / "rastrolog"
    assert config_dir({"APPDATA": "C:/Users/a/AppData/Roaming"}, "win32", home) == Path(
        "C:/Users/a/AppData/Roaming/rastrolog"
    )
    assert config_dir({}, "win32", home) == home / "AppData" / "Roaming" / "rastrolog"


def test_nudge_shows_once(tmp_path: Path) -> None:
    assert should_nudge(interactive=True, env={}, directory=tmp_path)
    mark_nudged(tmp_path)
    assert not should_nudge(interactive=True, env={}, directory=tmp_path)


def test_no_nudge_when_not_interactive(tmp_path: Path) -> None:
    assert not should_nudge(interactive=False, env={}, directory=tmp_path)


def test_opt_out_env(tmp_path: Path) -> None:
    assert not should_nudge(interactive=True, env={"RASTROLOG_NO_NUDGE": "1"}, directory=tmp_path)


def test_mark_nudged_survives_unwritable_directory(tmp_path: Path) -> None:
    blocker = tmp_path / "file"
    blocker.write_text("not a directory")
    mark_nudged(blocker / "rastrolog")  # parent is a file: mkdir fails, must not raise


def test_text_points_at_the_notification_anchor() -> None:
    assert NUDGE_URL.endswith("#get-notified-when-the-list-changes")
    assert NUDGE_URL in NUDGE_TEXT


@pytest.mark.parametrize("value", ["1", "true", "yes"])
def test_any_non_empty_opt_out_value(tmp_path: Path, value: str) -> None:
    assert not should_nudge(interactive=True, env={"RASTROLOG_NO_NUDGE": value}, directory=tmp_path)
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `cd python && uv run pytest tests/test_nudge.py -v`
Expected: `ModuleNotFoundError: No module named 'rastrolog.nudge'`.

- [ ] **Step 3: Write `python/src/rastrolog/nudge.py`**

```python
"""One-time pointer to change notifications, shown after the first table report.

Never shown with --json, when stdout is not a terminal, or when
RASTROLOG_NO_NUDGE is set to any non-empty value. A marker file in the user
config directory makes sure it is shown at most once per machine.
"""

from __future__ import annotations

import contextlib
import os
import sys
from collections.abc import Mapping
from pathlib import Path

NUDGE_URL = "https://github.com/csmatar/rastrolog#get-notified-when-the-list-changes"
NUDGE_TEXT = f"New AI bots show up every few months. Get one email when the list changes: {NUDGE_URL}"
OPT_OUT_ENV = "RASTROLOG_NO_NUDGE"
_MARKER = "nudged"


def config_dir(
    env: Mapping[str, str] | None = None,
    platform: str | None = None,
    home: Path | None = None,
) -> Path:
    env = os.environ if env is None else env
    platform = sys.platform if platform is None else platform
    home = Path.home() if home is None else home
    if platform == "win32":
        base = Path(env["APPDATA"]) if env.get("APPDATA") else home / "AppData" / "Roaming"
    elif platform == "darwin":
        base = home / "Library" / "Application Support"
    else:
        base = Path(env["XDG_CONFIG_HOME"]) if env.get("XDG_CONFIG_HOME") else home / ".config"
    return base / "rastrolog"


def should_nudge(
    *,
    interactive: bool,
    env: Mapping[str, str] | None = None,
    directory: Path | None = None,
) -> bool:
    env = os.environ if env is None else env
    if not interactive or env.get(OPT_OUT_ENV):
        return False
    return not ((directory or config_dir(env)) / _MARKER).exists()


def mark_nudged(directory: Path | None = None) -> None:
    target = directory or config_dir()
    # A read-only home or a sandbox just means the line may show again: harmless.
    with contextlib.suppress(OSError):
        target.mkdir(parents=True, exist_ok=True)
        (target / _MARKER).touch()
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd python && uv run pytest tests/test_nudge.py -v`
Expected: all pass.

- [ ] **Step 5: Lint, type-check, commit**

```bash
cd python && uv run ruff check . && uv run ruff format --check . && uv run mypy
git add python/src/rastrolog/nudge.py python/tests/test_nudge.py
git commit -m "feat: one-time change-notification nudge with opt-out"
```

---

### Task 9: CLI (`cli.py`)

**Files:**
- Create: `python/src/rastrolog/cli.py`, `python/tests/test_cli.py`
- Modify: `python/pyproject.toml` (add `[project.scripts]`)

**Interfaces:**
- Consumes: `classify_user_agent`, `classify_referrer`, `Match` (Task 3); `UnknownFormatError`, `Format` (Task 4); `iter_records`, `ParseStats` (Task 5); `Aggregator`, `parse_since` (Task 6); `render_report`, `THEME`, `purpose_badge` (Task 7); `should_nudge`, `mark_nudged`, `NUDGE_TEXT` (Task 8).
- Produces: `rastrolog.cli.app` (typer app) and the console script `rastrolog`. Exit codes: `0` ok, `1` partial (truncated gzip) or `check` found no match, `2` usage error (missing file, unknown format, bad `--since`).

- [ ] **Step 1: Write the failing tests `python/tests/test_cli.py`**

```python
import gzip
import json
from pathlib import Path

import pytest
from helpers import LOGS, SAMPLE_UA, load_json
from typer.testing import CliRunner

from rastrolog import __version__
from rastrolog.cli import app

runner = CliRunner()


@pytest.fixture(autouse=True)
def wide_terminal(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("COLUMNS", "200")
    monkeypatch.setenv("NO_COLOR", "1")


def test_bare_command_prints_welcome() -> None:
    result = runner.invoke(app, [])
    assert result.exit_code == 0
    assert "rastrolog parse access.log" in result.stdout


def test_version() -> None:
    result = runner.invoke(app, ["--version"])
    assert result.exit_code == 0
    assert result.stdout.strip() == f"rastrolog {__version__}"


def test_parse_prints_tables() -> None:
    result = runner.invoke(app, ["parse", str(LOGS / "nginx.log")])
    assert result.exit_code == 0, result.stderr
    for text in ("AI crawlers", "GPTBot", "AI referrals", "ChatGPT", "/pricing (2)", "skipped 1 malformed line"):
        assert text in result.stdout


def test_parse_json_equals_golden_file() -> None:
    result = runner.invoke(app, ["parse", str(LOGS / "nginx.log"), "--json"])
    assert result.exit_code == 0
    assert json.loads(result.stdout) == load_json(LOGS / "nginx.expected.json")


def test_parse_by_page() -> None:
    result = runner.invoke(app, ["parse", str(LOGS / "nginx.log"), "--by", "page"])
    assert result.exit_code == 0
    assert "Pages AI tools touch" in result.stdout


def test_parse_mixes_formats_across_files() -> None:
    result = runner.invoke(app, ["parse", str(LOGS / "nginx.log"), str(LOGS / "alb.log"), "--json"])
    assert result.exit_code == 0
    summary = json.loads(result.stdout)["summary"]
    assert summary["records"] == 28
    assert summary["skipped"] == 2


def test_since_filters() -> None:
    result = runner.invoke(app, ["parse", str(LOGS / "nginx.log"), "--since", "2026-09-24", "--json"])
    ids = {row["id"] for row in json.loads(result.stdout)["crawlers"]}
    assert ids == {"perplexity-perplexitybot", "google-googlebot"}


def test_invalid_since_is_a_usage_error() -> None:
    result = runner.invoke(app, ["parse", str(LOGS / "nginx.log"), "--since", "yesterday"])
    assert result.exit_code == 2


def test_missing_file_exits_2() -> None:
    result = runner.invoke(app, ["parse", "does-not-exist.log"])
    assert result.exit_code == 2
    assert "file not found" in result.stderr


def test_unknown_format_shows_line_and_hint(tmp_path: Path) -> None:
    log = tmp_path / "weird.log"
    log.write_text("hello world\n")
    result = runner.invoke(app, ["parse", str(log)])
    assert result.exit_code == 2
    assert "Unrecognised log format" in result.stderr
    assert "hello world" in result.stderr
    assert "--format" in result.stderr


def test_explicit_format(tmp_path: Path) -> None:
    log = tmp_path / "mixed.log"
    log.write_text("garbage first line\n" + (LOGS / "nginx.log").read_text())
    result = runner.invoke(app, ["parse", str(log), "--format", "combined", "--json"])
    assert result.exit_code == 0
    assert json.loads(result.stdout)["summary"]["skipped"] == 2


def test_truncated_gzip_exits_1_with_partial_report(tmp_path: Path) -> None:
    data = gzip.compress((LOGS / "nginx.log").read_bytes() * 50)
    log = tmp_path / "cut.log.gz"
    log.write_bytes(data[: len(data) // 2])
    result = runner.invoke(app, ["parse", str(log), "--json"])
    assert result.exit_code == 1
    assert "truncated" in result.stderr
    assert json.loads(result.stdout)["summary"]["records"] > 0


def test_verbose_logs_per_file_details_to_stderr() -> None:
    result = runner.invoke(app, ["parse", str(LOGS / "nginx.log"), "--verbose"])
    assert result.exit_code == 0
    assert "format=combined records=14 skipped=1" in result.stderr


def test_no_nudge_when_output_is_not_a_terminal() -> None:
    result = runner.invoke(app, ["parse", str(LOGS / "nginx.log")])
    assert "Get one email" not in result.stdout


def test_check_referrer() -> None:
    result = runner.invoke(app, ["check", "https://chatgpt.com/"])
    assert result.exit_code == 0
    assert "ChatGPT" in result.stdout


def test_check_user_agent_json() -> None:
    result = runner.invoke(app, ["check", SAMPLE_UA["claudebot"], "--json"])
    assert result.exit_code == 0
    assert json.loads(result.stdout)["id"] == "anthropic-claudebot"


def test_check_no_match_exits_1() -> None:
    result = runner.invoke(app, ["check", "https://www.google.com/"])
    assert result.exit_code == 1
    assert "no match" in result.stdout
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `cd python && uv run pytest tests/test_cli.py -v`
Expected: `ModuleNotFoundError: No module named 'rastrolog.cli'`.

- [ ] **Step 3: Write `python/src/rastrolog/cli.py`**

Leave out `from __future__ import annotations` in this file. Typer reads the annotations at runtime, and `X | None` already works on 3.10.

```python
"""rastrolog command line: ``rastrolog parse`` and ``rastrolog check``."""

import enum
import json
import logging
from pathlib import Path
from typing import Annotated, cast

import typer
from rich.console import Console
from rich.logging import RichHandler
from rich.panel import Panel
from rich.progress import (
    BarColumn,
    DownloadColumn,
    Progress,
    SpinnerColumn,
    TextColumn,
    TimeRemainingColumn,
)
from rich.table import Table
from rich.text import Text

from rastrolog import __version__
from rastrolog.classify import Match, classify_referrer, classify_user_agent
from rastrolog.formats import Format, UnknownFormatError
from rastrolog.nudge import NUDGE_TEXT, mark_nudged, should_nudge
from rastrolog.parse import ParseStats, iter_records
from rastrolog.render import render_report
from rastrolog.report import Aggregator, parse_since
from rastrolog.theme import THEME, purpose_badge

EXIT_PARTIAL = 1
EXIT_NO_MATCH = 1
EXIT_USAGE = 2

log = logging.getLogger("rastrolog")


class LogFormat(str, enum.Enum):
    combined = "combined"
    cloudfront = "cloudfront"
    alb = "alb"


class Pivot(str, enum.Enum):
    vendor = "vendor"
    page = "page"


app = typer.Typer(
    name="rastrolog",
    add_completion=False,
    rich_markup_mode="rich",
    help="See which AI crawlers read your site and which AI chat products send you visitors.",
)


def _out() -> Console:
    return Console(theme=THEME, highlight=False)


def _err() -> Console:
    return Console(theme=THEME, stderr=True, highlight=False)


@app.callback(invoke_without_command=True)
def main(
    ctx: typer.Context,
    version: Annotated[
        bool, typer.Option("--version", is_eager=True, help="Show the version and exit.")
    ] = False,
) -> None:
    if version:
        typer.echo(f"rastrolog {__version__}")
        raise typer.Exit
    if ctx.invoked_subcommand is None:
        _print_welcome(_out())
        raise typer.Exit


def _print_welcome(console: Console) -> None:
    body = Text.assemble(
        "Which AI crawlers read your site, and which AI chat products send you visitors.\n\n",
        ("  rastrolog parse access.log", "accent"),
        ("                         AI crawlers + AI referrals\n", "muted"),
        ("  rastrolog parse access.log.gz --since 7d --json\n", "accent"),
        ('  rastrolog check "https://chatgpt.com/"', "accent"),
        ("             classify one UA or referrer\n\n", "muted"),
        ("Run ", "muted"),
        ("rastrolog --help", "accent"),
        (" for every option.", "muted"),
    )
    console.print(Panel(body, title="[brand]rastrolog[/]", border_style="accent", expand=False))


def _configure_logging(err: Console, verbose: bool) -> None:
    if not verbose:
        return
    handler = RichHandler(
        console=err, show_path=False, markup=False, log_time_format="%H:%M:%S"
    )
    log.handlers[:] = [handler]
    log.setLevel(logging.DEBUG)
    log.propagate = False


def _consume(
    path: Path, fmt: Format | None, stats: ParseStats, aggregator: Aggregator, err: Console
) -> None:
    size = path.stat().st_size
    with Progress(
        SpinnerColumn(style="brand"),
        TextColumn("[muted]{task.description}"),
        BarColumn(complete_style="brand", finished_style="ok"),
        DownloadColumn(),
        TimeRemainingColumn(),
        console=err,
        transient=True,
        disable=not err.is_terminal,
    ) as progress:
        task = progress.add_task(path.name, total=size or None)

        def on_progress(done: int) -> None:
            progress.update(task, completed=done)

        aggregator.add_all(iter_records(path, fmt, stats=stats, progress=on_progress))


@app.command()
def parse(
    files: Annotated[
        list[Path], typer.Argument(help="Access logs, plain or gzipped.", show_default=False)
    ],
    log_format: Annotated[
        LogFormat | None, typer.Option("--format", help="Skip auto-detection.")
    ] = None,
    since: Annotated[
        str | None,
        typer.Option(help="Only count requests newer than this: 30m, 24h, 7d, 2w or a date."),
    ] = None,
    top: Annotated[int, typer.Option(min=1, help="How many pages to list.")] = 10,
    by: Annotated[
        Pivot, typer.Option(help="vendor: a row per bot/product. page: a row per page.")
    ] = Pivot.vendor,
    host: Annotated[
        str | None, typer.Option(help="Your site's host, so self-referrals are ignored.")
    ] = None,
    json_output: Annotated[bool, typer.Option("--json", help="Print JSON, not tables.")] = False,
    verbose: Annotated[
        bool, typer.Option("--verbose", "-v", help="Log per-file details to stderr.")
    ] = False,
) -> None:
    """Summarise AI crawler requests and AI referral visits in access logs."""
    out, err = _out(), _err()
    _configure_logging(err, verbose)
    try:
        cutoff = parse_since(since) if since else None
    except ValueError as exc:
        raise typer.BadParameter(str(exc), param_hint="--since") from exc
    for path in files:
        if not path.is_file():
            err.print(f"[err]✗[/] cannot read [bold]{path}[/]: file not found")
            raise typer.Exit(EXIT_USAGE)

    fmt = cast("Format", log_format.value) if log_format else None
    aggregator = Aggregator(since=cutoff, own_host=host)
    skipped = 0
    truncated = False
    for path in files:
        stats = ParseStats()
        try:
            _consume(path, fmt, stats, aggregator, err)
        except UnknownFormatError as exc:
            err.print(
                Panel(
                    Text(exc.line),
                    title=f"[err]Unrecognised log format[/] in {path}",
                    border_style="err",
                    expand=False,
                )
            )
            err.print("Pass [accent]--format combined|cloudfront|alb[/] if it is one of those.")
            raise typer.Exit(EXIT_USAGE) from None
        except OSError as exc:
            err.print(f"[err]✗[/] cannot read [bold]{path}[/]: {exc.strerror or exc}")
            raise typer.Exit(EXIT_USAGE) from None
        log.debug(
            "parsed %s format=%s records=%d skipped=%d",
            path, stats.format, stats.records, stats.skipped,
        )
        skipped += stats.skipped
        if stats.truncated:
            truncated = True
            err.print(f"[warn]![/] {path} is truncated (gzip ended early); showing what was read.")

    report = aggregator.result(top=top, skipped=skipped)
    if json_output:
        typer.echo(json.dumps(report.to_dict(), indent=2))
    else:
        render_report(out, report, by=by.value, sources=[str(p) for p in files])
        if should_nudge(interactive=out.is_terminal):
            out.print()
            out.print(Text(NUDGE_TEXT, style="muted"))
            mark_nudged()
    if truncated:
        raise typer.Exit(EXIT_PARTIAL)


@app.command()
def check(
    value: Annotated[str, typer.Argument(help="A User-Agent string or a referrer URL.")],
    json_output: Annotated[bool, typer.Option("--json", help="Print JSON.")] = False,
) -> None:
    """Classify one user agent or referrer URL. Exits 1 when nothing matches."""
    match = classify_referrer(value) if "://" in value else classify_user_agent(value)
    if json_output:
        typer.echo(json.dumps(match.to_dict() if match else None))
    else:
        _print_match(_out(), value, match)
    if match is None:
        raise typer.Exit(EXIT_NO_MATCH)


def _print_match(console: Console, value: str, match: Match | None) -> None:
    if match is None:
        console.print(Text.assemble(("no match  ", "warn"), (value, "muted")))
        return
    grid = Table.grid(padding=(0, 2))
    grid.add_column(style="muted")
    grid.add_column()
    if match.kind == "crawler":
        grid.add_row("kind", "AI crawler" if match.ai_specific else "search engine crawler")
        grid.add_row("vendor", match.vendor_name)
        grid.add_row("token", match.token or "")
        grid.add_row("purpose", purpose_badge(match.purpose or ""))
    else:
        grid.add_row("kind", "AI referral")
        grid.add_row("product", match.product or "")
        grid.add_row("vendor", match.vendor_name)
    grid.add_row("id", match.id)
    console.print(Panel(grid, title="[brand]match[/]", border_style="accent", expand=False))
```

- [ ] **Step 4: Register the console script in `python/pyproject.toml`**

Add after `[project.urls]`:

```toml
[project.scripts]
rastrolog = "rastrolog.cli:app"
```

Run: `cd python && uv sync`

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `cd python && uv run pytest tests/test_cli.py -v`
Expected: all pass. If `test_truncated_gzip_exits_1_with_partial_report` reads zero records, raise the `* 50` multiplier so the first half of the gzip holds whole lines.

- [ ] **Step 6: Try it by hand**

Run: `cd python && uv run rastrolog parse ../conformance/logs/nginx.log && uv run rastrolog check "https://claude.ai/"`
Expected: rounded pink/purple tables in your terminal, the one-time nudge line after the first report (not on the second run), and a `match` panel for Claude.

- [ ] **Step 7: Lint, type-check, commit**

```bash
cd python && uv run ruff check . && uv run ruff format --check . && uv run mypy
git add python/src/rastrolog/cli.py python/tests/test_cli.py python/pyproject.toml python/uv.lock
git commit -m "feat: rastrolog CLI with parse and check commands"
```

---

### Task 10: ASGI middleware (FastAPI / Starlette)

**Files:**
- Create: `python/src/rastrolog/middleware/__init__.py`, `python/src/rastrolog/middleware/asgi.py`, `python/tests/test_middleware_asgi.py`

**Interfaces:**
- Consumes: `classify_request`, `Match` (Task 3).
- Produces: `rastrolog.middleware.asgi.AITrafficMiddleware(app, *, on_match=None, log=False, own_host=None)`. It sets `scope["state"]["ai_traffic"]` (read as `request.state.ai_traffic` in Starlette/FastAPI) and calls `on_match(match, scope)`, which may be sync or async. Callback errors are logged on the `rastrolog` logger and never propagate.

Tests use raw ASGI calls instead of Starlette's `TestClient`, which is deprecated with `httpx` in Starlette 1.x. That also keeps `httpx` out of the dev dependencies.

- [ ] **Step 1: Write the failing tests `python/tests/test_middleware_asgi.py`**

```python
import asyncio
import json
import logging
from collections.abc import MutableMapping
from typing import Any

import pytest
from helpers import SAMPLE_UA
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from rastrolog import Match
from rastrolog.middleware.asgi import AITrafficMiddleware

Scope = MutableMapping[str, Any]


def _scope(headers: dict[str, str], path: str = "/") -> Scope:
    return {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "root_path": "",
        "headers": [(k.lower().encode("latin-1"), v.encode("latin-1")) for k, v in headers.items()],
        "client": ("127.0.0.1", 50000),
        "server": ("testserver", 80),
    }


def _call(app: Any, scope: Scope) -> list[dict[str, Any]]:
    sent: list[dict[str, Any]] = []

    async def receive() -> dict[str, Any]:
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: dict[str, Any]) -> None:
        sent.append(message)

    asyncio.run(app(scope, receive, send))
    return sent


def _capture() -> tuple[Any, dict[str, Any]]:
    seen: dict[str, Any] = {}

    async def inner(scope: Scope, receive: Any, send: Any) -> None:
        seen["match"] = scope["state"]["ai_traffic"]

    return inner, seen


def test_tags_crawler() -> None:
    inner, seen = _capture()
    _call(AITrafficMiddleware(inner), _scope({"User-Agent": SAMPLE_UA["gptbot"]}))
    assert seen["match"].id == "openai-gptbot"


def test_tags_referral() -> None:
    inner, seen = _capture()
    headers = {"User-Agent": SAMPLE_UA["browser"], "Referer": "https://claude.ai/"}
    _call(AITrafficMiddleware(inner), _scope(headers))
    assert seen["match"].id == "claude"


def test_plain_visit_is_none() -> None:
    inner, seen = _capture()
    _call(AITrafficMiddleware(inner), _scope({"User-Agent": SAMPLE_UA["browser"]}))
    assert seen["match"] is None


def test_non_http_scopes_pass_through_untouched() -> None:
    seen: dict[str, Any] = {}

    async def inner(scope: Scope, receive: Any, send: Any) -> None:
        seen["scope"] = scope

    asyncio.run(AITrafficMiddleware(inner)({"type": "lifespan"}, None, None))  # type: ignore[arg-type]
    assert "state" not in seen["scope"]


def test_on_match_sync_and_async() -> None:
    calls: list[str] = []

    async def async_hook(match: Match, scope: Scope) -> None:
        calls.append("async:" + match.id)

    inner, _ = _capture()
    scope = {"User-Agent": SAMPLE_UA["claudebot"]}
    _call(AITrafficMiddleware(inner, on_match=lambda m, s: calls.append("sync:" + m.id)), _scope(scope))
    _call(AITrafficMiddleware(inner, on_match=async_hook), _scope(scope))
    assert calls == ["sync:anthropic-claudebot", "async:anthropic-claudebot"]


def test_failing_callback_does_not_break_the_request(caplog: pytest.LogCaptureFixture) -> None:
    def boom(match: Match, scope: Scope) -> None:
        raise RuntimeError("metrics backend down")

    inner, seen = _capture()
    with caplog.at_level(logging.WARNING, logger="rastrolog"):
        _call(AITrafficMiddleware(inner, on_match=boom), _scope({"User-Agent": SAMPLE_UA["gptbot"]}))
    assert seen["match"].id == "openai-gptbot"
    assert "on_match callback failed" in caplog.text


def test_log_line(caplog: pytest.LogCaptureFixture) -> None:
    inner, _ = _capture()
    with caplog.at_level(logging.INFO, logger="rastrolog"):
        _call(AITrafficMiddleware(inner, log=True), _scope({"User-Agent": SAMPLE_UA["gptbot"]}, "/docs"))
    assert "kind=crawler id=openai-gptbot path=/docs" in caplog.text


def test_own_host() -> None:
    inner, seen = _capture()
    headers = {"User-Agent": SAMPLE_UA["browser"], "Referer": "https://chatgpt.com/"}
    _call(AITrafficMiddleware(inner, own_host="chatgpt.com"), _scope(headers))
    assert seen["match"] is None


def test_starlette_request_state_integration() -> None:
    async def home(request: Request) -> JSONResponse:
        match = request.state.ai_traffic
        return JSONResponse({"id": match.id if match else None})

    app = Starlette(routes=[Route("/", home)])
    app.add_middleware(AITrafficMiddleware)
    sent = _call(app, _scope({"User-Agent": SAMPLE_UA["perplexitybot"]}))
    body = b"".join(m.get("body", b"") for m in sent if m["type"] == "http.response.body")
    assert json.loads(body) == {"id": "perplexity-perplexitybot"}
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `cd python && uv run pytest tests/test_middleware_asgi.py -v`
Expected: `ModuleNotFoundError: No module named 'rastrolog.middleware'`.

- [ ] **Step 3: Write the middleware**

`python/src/rastrolog/middleware/__init__.py`:

```python
"""Framework middleware. Import the submodule for your framework:

- ``rastrolog.middleware.asgi`` for FastAPI, Starlette and any ASGI app
- ``rastrolog.middleware.django`` for Django
"""
```

`python/src/rastrolog/middleware/asgi.py`:

```python
"""ASGI middleware for FastAPI, Starlette and any ASGI app. Standard library only.

    from rastrolog.middleware.asgi import AITrafficMiddleware
    app.add_middleware(AITrafficMiddleware, on_match=my_counter, log=True)

In a handler, ``request.state.ai_traffic`` is a ``rastrolog.Match`` or ``None``.
No storage, no counters, no network: push into your own metrics via ``on_match``.
"""

from __future__ import annotations

import inspect
import logging
from collections.abc import Awaitable, Callable, MutableMapping
from typing import Any

from rastrolog.classify import Match, classify_request

Scope = MutableMapping[str, Any]
Message = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]
ASGIApp = Callable[[Scope, Receive, Send], Awaitable[None]]
OnMatch = Callable[[Match, Scope], Any]

logger = logging.getLogger("rastrolog")


class AITrafficMiddleware:
    """Tag each HTTP request with ``scope["state"]["ai_traffic"]``.

    Crawler matches (User-Agent) take precedence over referral matches (Referer).
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        on_match: OnMatch | None = None,
        log: bool = False,
        own_host: str | None = None,
    ) -> None:
        self.app = app
        self.on_match = on_match
        self.log = log
        self.own_host = own_host

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            user_agent, referrer = _headers(scope)
            match = classify_request(user_agent, referrer, own_host=self.own_host)
            scope.setdefault("state", {})["ai_traffic"] = match
            if match is not None:
                await self._matched(match, scope)
        await self.app(scope, receive, send)

    async def _matched(self, match: Match, scope: Scope) -> None:
        if self.log:
            logger.info(
                "ai_traffic kind=%s id=%s path=%s",
                match.kind,
                match.id,
                scope.get("path", ""),
                extra={"ai_traffic": match.to_dict()},
            )
        if self.on_match is None:
            return
        try:
            result = self.on_match(match, scope)
            if inspect.isawaitable(result):
                await result
        except Exception:
            logger.warning("rastrolog on_match callback failed", exc_info=True)


def _headers(scope: Scope) -> tuple[str | None, str | None]:
    user_agent: str | None = None
    referrer: str | None = None
    for name, value in scope.get("headers", ()):
        if name == b"user-agent":
            user_agent = value.decode("latin-1")
        elif name == b"referer":
            referrer = value.decode("latin-1")
    return user_agent, referrer
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd python && uv run pytest tests/test_middleware_asgi.py -v`
Expected: all pass.

- [ ] **Step 5: Lint, type-check, commit**

```bash
cd python && uv run ruff check . && uv run ruff format --check . && uv run mypy
git add python/src/rastrolog/middleware/ python/tests/test_middleware_asgi.py
git commit -m "feat: ASGI middleware tagging request.state.ai_traffic"
```

---

### Task 11: Django middleware

**Files:**
- Create: `python/src/rastrolog/middleware/django.py`, `python/tests/test_middleware_django.py`

**Interfaces:**
- Consumes: `classify_request`, `Match` (Task 3).
- Produces: `rastrolog.middleware.django.AITrafficMiddleware` (sync + async capable). It sets `request.ai_traffic` and reads the optional `settings.RASTROLOG = {"on_match": callable | "dotted.path", "log": bool, "own_host": str}`. `on_match(match, request)`; exceptions are logged, never raised; in async mode an awaitable result is awaited.

- [ ] **Step 1: Write the failing tests `python/tests/test_middleware_django.py`**

```python
import asyncio
import logging
from typing import Any

import pytest

django = pytest.importorskip("django")

from django.conf import settings  # noqa: E402

if not settings.configured:
    settings.configure(SECRET_KEY="rastrolog-tests", ALLOWED_HOSTS=["testserver"], USE_TZ=True)
    django.setup()

from django.http import HttpResponse  # noqa: E402
from django.test import RequestFactory, override_settings  # noqa: E402
from helpers import SAMPLE_UA  # noqa: E402

from rastrolog import Match  # noqa: E402
from rastrolog.middleware.django import AITrafficMiddleware  # noqa: E402

factory = RequestFactory()
CALLS: list[tuple[str, str]] = []


def record_call(match: Match, request: Any) -> None:
    CALLS.append((match.id, request.path))


def ok(request: Any) -> HttpResponse:
    return HttpResponse("ok")


async def async_ok(request: Any) -> HttpResponse:
    return HttpResponse("ok")


def test_declares_sync_and_async_support() -> None:
    assert AITrafficMiddleware.sync_capable is True
    assert AITrafficMiddleware.async_capable is True


def test_sync_request_is_tagged() -> None:
    request = factory.get("/", HTTP_USER_AGENT=SAMPLE_UA["claudebot"])
    response = AITrafficMiddleware(ok)(request)
    assert response.status_code == 200
    assert request.ai_traffic.id == "anthropic-claudebot"


def test_async_request_is_tagged() -> None:
    request = factory.get("/", HTTP_USER_AGENT=SAMPLE_UA["browser"], HTTP_REFERER="https://chatgpt.com/")
    asyncio.run(AITrafficMiddleware(async_ok)(request))
    assert request.ai_traffic.id == "chatgpt"


def test_plain_visit_is_none() -> None:
    request = factory.get("/", HTTP_USER_AGENT=SAMPLE_UA["browser"])
    AITrafficMiddleware(ok)(request)
    assert request.ai_traffic is None


def test_on_match_from_dotted_path() -> None:
    CALLS.clear()
    with override_settings(RASTROLOG={"on_match": "test_middleware_django.record_call"}):
        middleware = AITrafficMiddleware(ok)
    middleware(factory.get("/docs", HTTP_USER_AGENT=SAMPLE_UA["gptbot"]))
    assert CALLS == [("openai-gptbot", "/docs")]


def test_async_on_match_is_awaited() -> None:
    calls: list[str] = []

    async def hook(match: Match, request: Any) -> None:
        calls.append(match.id)

    with override_settings(RASTROLOG={"on_match": hook}):
        middleware = AITrafficMiddleware(async_ok)
    asyncio.run(middleware(factory.get("/", HTTP_USER_AGENT=SAMPLE_UA["gptbot"])))
    assert calls == ["openai-gptbot"]


def test_failing_callback_is_logged_not_raised(caplog: pytest.LogCaptureFixture) -> None:
    def boom(match: Match, request: Any) -> None:
        raise RuntimeError("down")

    with override_settings(RASTROLOG={"on_match": boom}):
        middleware = AITrafficMiddleware(ok)
    with caplog.at_level(logging.WARNING, logger="rastrolog"):
        response = middleware(factory.get("/", HTTP_USER_AGENT=SAMPLE_UA["gptbot"]))
    assert response.status_code == 200
    assert "on_match callback failed" in caplog.text


def test_log_and_own_host(caplog: pytest.LogCaptureFixture) -> None:
    with override_settings(RASTROLOG={"log": True, "own_host": "chatgpt.com"}):
        middleware = AITrafficMiddleware(ok)
    own = factory.get("/", HTTP_USER_AGENT=SAMPLE_UA["browser"], HTTP_REFERER="https://chatgpt.com/")
    with caplog.at_level(logging.INFO, logger="rastrolog"):
        middleware(own)
        middleware(factory.get("/p", HTTP_USER_AGENT=SAMPLE_UA["gptbot"]))
    assert own.ai_traffic is None
    assert "kind=crawler id=openai-gptbot path=/p" in caplog.text
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `cd python && uv run pytest tests/test_middleware_django.py -v`
Expected: `ModuleNotFoundError: No module named 'rastrolog.middleware.django'`.

- [ ] **Step 3: Write `python/src/rastrolog/middleware/django.py`**

```python
"""Django middleware: sets ``request.ai_traffic`` to a ``rastrolog.Match`` or ``None``.

    MIDDLEWARE = [..., "rastrolog.middleware.django.AITrafficMiddleware"]

Optional settings::

    RASTROLOG = {
        "on_match": "myproject.metrics.count_ai_traffic",  # callable or dotted path: (match, request)
        "log": True,                                        # INFO line on the "rastrolog" logger
        "own_host": "example.com",                          # ignore self-referrals
    }
"""

from __future__ import annotations

import inspect
import logging
from collections.abc import Callable
from typing import Any

from asgiref.sync import iscoroutinefunction, markcoroutinefunction
from django.conf import settings
from django.http import HttpRequest
from django.utils.module_loading import import_string

from rastrolog.classify import Match, classify_request

logger = logging.getLogger("rastrolog")


class AITrafficMiddleware:
    sync_capable = True
    async_capable = True

    def __init__(self, get_response: Callable[[HttpRequest], Any]) -> None:
        self.get_response = get_response
        config: dict[str, Any] = dict(getattr(settings, "RASTROLOG", {}))
        on_match = config.get("on_match")
        self.on_match: Callable[[Match, HttpRequest], Any] | None = (
            import_string(on_match) if isinstance(on_match, str) else on_match
        )
        self.log = bool(config.get("log", False))
        self.own_host: str | None = config.get("own_host")
        self._async = iscoroutinefunction(get_response)
        if self._async:
            markcoroutinefunction(self)

    def __call__(self, request: HttpRequest) -> Any:
        if self._async:
            return self.__acall__(request)
        match = self._tag(request)
        if match is not None:
            self._run_callback(match, request)
        return self.get_response(request)

    async def __acall__(self, request: HttpRequest) -> Any:
        match = self._tag(request)
        if match is not None:
            result = self._run_callback(match, request)
            if inspect.isawaitable(result):
                try:
                    await result
                except Exception:
                    logger.warning("rastrolog on_match callback failed", exc_info=True)
        return await self.get_response(request)

    def _tag(self, request: HttpRequest) -> Match | None:
        match = classify_request(
            request.headers.get("User-Agent"),
            request.headers.get("Referer"),
            own_host=self.own_host,
        )
        request.ai_traffic = match
        if match is not None and self.log:
            logger.info(
                "ai_traffic kind=%s id=%s path=%s",
                match.kind,
                match.id,
                request.path,
                extra={"ai_traffic": match.to_dict()},
            )
        return match

    def _run_callback(self, match: Match, request: HttpRequest) -> Any:
        if self.on_match is None:
            return None
        try:
            return self.on_match(match, request)
        except Exception:
            logger.warning("rastrolog on_match callback failed", exc_info=True)
            return None
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd python && uv run pytest tests/test_middleware_django.py -v`
Expected: all pass (on 3.10/3.11 CI installs Django 5.2, on 3.12+ Django 6.x).

- [ ] **Step 5: Lint, type-check, commit**

```bash
cd python && uv run ruff check . && uv run ruff format --check . && uv run mypy
git add python/src/rastrolog/middleware/django.py python/tests/test_middleware_django.py
git commit -m "feat: Django middleware setting request.ai_traffic"
```

---

### Task 12: Docs, packaging check, release workflow, perf smoke

**Files:**
- Create: `README.md` (repo root), `.github/workflows/release.yml`, `python/tests/test_perf.py`
- Modify: `python/README.md`, `.github/workflows/ci.yml` (add `package` job), `CLAUDE.md` (release section)

**Interfaces:**
- Consumes: everything above.
- Produces: the README anchor `#get-notified-when-the-list-changes` (used by `NUDGE_URL`), a CI job proving the wheel bundles `signals.json` and runs from a clean venv, and a tag-triggered PyPI release.

- [ ] **Step 1: Write the perf smoke test `python/tests/test_perf.py`**

```python
import time
from pathlib import Path

import pytest
from helpers import LOGS

from rastrolog.formats import CombinedParser, MalformedLineError
from rastrolog.parse import ParseStats, iter_records
from rastrolog.report import Aggregator


def _valid_lines() -> list[str]:
    parser = CombinedParser()
    lines = []
    for line in (LOGS / "nginx.log").read_text().splitlines():
        try:
            parser.parse(line)
        except MalformedLineError:
            continue
        lines.append(line)
    return lines


@pytest.mark.perf
def test_one_million_lines_parse_in_under_ten_seconds(tmp_path: Path) -> None:
    lines = _valid_lines()
    path = tmp_path / "big.log"
    with path.open("w", encoding="utf-8") as fh:
        for i in range(1_000_000):
            fh.write(lines[i % len(lines)] + "\n")
    stats = ParseStats()
    aggregator = Aggregator()
    start = time.perf_counter()
    aggregator.add_all(iter_records(path, stats=stats))
    aggregator.result()
    elapsed = time.perf_counter() - start
    assert stats.records == 1_000_000
    assert elapsed < 10, f"1M lines took {elapsed:.1f}s"
```

Run: `cd python && uv run pytest -m perf -v`
Expected: `1 passed`. If it's slower than 10 s, profile with `uv run python -m cProfile -s cumtime -m pytest -m perf` before changing code. The classifier caches should be carrying most of the load.

- [ ] **Step 2: Write the root `README.md`**

````markdown
# rastrolog

**See which AI crawlers read your site and which AI chat products send you visitors.**

`rastrolog` reads your access logs and prints two tables:

1. **AI crawlers** by user agent (GPTBot, ClaudeBot, PerplexityBot, …): what they fetched, and whether each one is there to train, to fetch a page for a user, or to build a search index.
2. **AI referrals**: people who clicked a link inside ChatGPT, Claude, Perplexity, Gemini or Copilot, and the pages they landed on.

It classifies where a visit came from, never who the visitor is. There is no hosting, no storage and no telemetry.

## Install

```bash
pip install rastrolog        # or: uv tool install rastrolog
```

## Use

```bash
rastrolog parse access.log                     # nginx, Apache combined, CloudFront, ALB; .gz is fine
rastrolog parse access.log.gz --since 7d --json
rastrolog parse access.log --by page --top 20  # which pages AI tools touch
rastrolog check "https://chatgpt.com/"         # classify one referrer or user agent
```

`--json` writes the same report as JSON on stdout, for piping into anything else.

## In your app

FastAPI / Starlette:

```python
from rastrolog.middleware.asgi import AITrafficMiddleware

app.add_middleware(AITrafficMiddleware, on_match=lambda match, scope: counter.labels(match.id).inc())
# in a handler: request.state.ai_traffic -> rastrolog.Match | None
```

Django:

```python
MIDDLEWARE = [..., "rastrolog.middleware.django.AITrafficMiddleware"]
RASTROLOG = {"on_match": "myproject.metrics.count_ai_traffic", "log": True}
# in a view: request.ai_traffic -> rastrolog.Match | None
```

Library:

```python
from rastrolog import classify_user_agent, classify_referrer

classify_user_agent("Mozilla/5.0 ... GPTBot/1.3 ...")
# Match(kind='crawler', id='openai-gptbot', vendor='openai', token='GPTBot', purpose='training', ...)
classify_referrer("https://www.google.com/")  # None
```

## What it detects

The lists live in [`signals.json`](signals.json). Every entry is checked against the vendor's own documentation and has a real user-agent sample in [`conformance/`](conformance/).

Known gaps, stated plainly:

- **Google AI Overviews and AI Mode** send visitors with a plain `google.com` referrer, which can't be told apart from ordinary search. rastrolog doesn't guess.
- **AWS ALB logs** have no Referer field, so ALB logs show crawlers only.
- Some AI apps strip the referrer entirely. Those visits look like direct traffic.

## Get notified when the list changes

New AI crawlers appear every few months, and your robots.txt goes out of date the day they do. Until the email signup page launches, watch this repo's releases (**Watch → Custom → Releases**). Every release that changes `signals.json` says what was added.

## Contributing a new bot or referrer

1. Add the entry to `signals.json`, with a `docs_url` pointing to the vendor's own page. If the vendor publishes nothing, a reputable third-party source is accepted, but the entry must also carry `"vendor_documented": false`.
2. Add at least one real user-agent string (or referrer URL) to `conformance/`.
3. Add a line under **Unreleased → Signals** in `CHANGELOG.md`.

CI fails if step 2 is missing. That rule is what keeps the list trustworthy.

## Scope

This is a classifier and a checker, kept small on purpose. Use the callback and the JSON output to build what you need on top.

MIT © Carlos Saldaña Matar
````

- [ ] **Step 3: Replace `python/README.md` with the PyPI page**

Use the same content as the root README from `# rastrolog` through the **Get notified when the list changes** section. Replace the relative links `signals.json` and `conformance/` with absolute `https://github.com/csmatar/rastrolog/blob/main/...` URLs, because PyPI does not resolve relative links.

- [ ] **Step 4: Add the `package` job to `.github/workflows/ci.yml`**

Append under `jobs:`:

```yaml
  package:
    name: wheel bundles signals.json
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: astral-sh/setup-uv@v10
        with:
          python-version: "3.12"
      - name: Build sdist and wheel (wheel is built from the sdist)
        working-directory: python
        run: uv build
      - name: Wheel contains signals.json
        working-directory: python
        run: python -m zipfile -l dist/*.whl | grep -q "rastrolog/signals.json"
      - name: Clean install runs the CLI and matches the golden report
        run: |
          uv venv /tmp/clean
          uv pip install --python /tmp/clean/bin/python python/dist/*.whl
          /tmp/clean/bin/rastrolog parse conformance/logs/nginx.log --json > /tmp/report.json
          python - <<'EOF'
          import json, sys
          got = json.load(open("/tmp/report.json"))
          want = json.load(open("conformance/logs/nginx.expected.json"))
          sys.exit(0 if got == want else "installed wheel disagrees with golden report")
          EOF
```

- [ ] **Step 5: Verify packaging locally the same way**

Run:

```bash
cd python && rm -rf dist && uv build
python -m zipfile -l dist/*.whl | grep "rastrolog/signals.json"
uv venv /tmp/rastrolog-clean && uv pip install --python /tmp/rastrolog-clean/bin/python dist/*.whl
/tmp/rastrolog-clean/bin/rastrolog parse ../conformance/logs/nginx.log --json | python -c "import json,sys; assert json.load(sys.stdin) == json.load(open('../conformance/logs/nginx.expected.json')); print('ok')"
```

Expected: the zip listing shows `rastrolog/signals.json`, followed by `ok`.

- [ ] **Step 6: Add `.github/workflows/release.yml`**

```yaml
name: release

on:
  push:
    tags: ["v*"]

permissions:
  contents: read

jobs:
  pypi:
    name: publish to PyPI
    runs-on: ubuntu-latest
    environment:
      name: pypi
      url: https://pypi.org/project/rastrolog/
    permissions:
      id-token: write
    steps:
      - uses: actions/checkout@v7
      - uses: astral-sh/setup-uv@v10
      - name: Tag matches package version
        working-directory: python
        run: |
          version="$(uv version --short)"
          if [ "v${version}" != "${GITHUB_REF_NAME}" ]; then
            echo "tag ${GITHUB_REF_NAME} does not match package version v${version}"
            exit 1
          fi
      - name: Build
        working-directory: python
        run: uv build
      - uses: pypa/gh-action-pypi-publish@release/v1
        with:
          packages-dir: python/dist
```

**Human step (not for the implementing agent):** on pypi.org, add a *pending trusted publisher* for project `rastrolog` with owner `csmatar`, repository `rastrolog`, workflow `release.yml` and environment `pypi`. In GitHub → Settings → Environments, create the `pypi` environment. The npm job is added in Epic 2.

- [ ] **Step 7: Add a Releasing section to `CLAUDE.md`**

```markdown
## Releasing

1. Bump `version` in `python/pyproject.toml` and run `cd python && uv lock`.
2. In `CHANGELOG.md`, rename **Unreleased** to `[x.y.z] - YYYY-MM-DD` and start a new empty **Unreleased**.
3. Merge to `main`, then tag `vX.Y.Z` and push the tag. `release.yml` checks that the tag matches the version, builds, and publishes to PyPI through trusted publishing.

Never publish from a laptop. `uv publish`, `npm publish` and `pnpm publish` are denied in `.claude/settings.json`.
```

- [ ] **Step 8: Run the full gate**

Run: `cd python && uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest --cov=rastrolog --cov-report=term-missing --cov-fail-under=90`
Expected: all clean, coverage ≥ 90%. If coverage is short, the report lists the missing lines. Add tests for them; don't lower the gate.

- [ ] **Step 9: Commit**

```bash
git add README.md python/README.md python/tests/test_perf.py .github/workflows/ci.yml .github/workflows/release.yml CLAUDE.md
git commit -m "docs: README, packaging check in CI, PyPI trusted-publishing release workflow"
```

- [ ] **Step 10: Finish the branch**

Use superpowers:finishing-a-development-branch to push `epic-1-python` and open a PR against `main` whose body links `Closes #1`. Do not tag a release. Publishing waits until the human has configured the PyPI trusted publisher.
