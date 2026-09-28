# rastrolog: overview and shared contract

Date: 2026-09-28 · Status: approved in brainstorming, pending written-spec review

## What it is

`rastrolog` is a small open-source tool that answers two questions for a site owner:

1. Which AI crawlers are fetching my pages? (detected from the `User-Agent` header)
2. Which AI chat products are sending me human visitors? (detected from the `Referer` header or `document.referrer`)

It ships as three pieces that share one data file:

| Epic | Deliverable | Spec |
| --- | --- | --- |
| 1 | Python package + CLI + FastAPI/Django middleware (PyPI `rastrolog`) | `2026-09-28-epic-1-python-package-design.md` |
| 2 | JS snippet + ESM classifier (npm `rastrolog`) | `2026-09-28-epic-2-js-snippet-design.md` |
| 3 | Static landing page with domain checker, log analyzer, Kit signup | `2026-09-28-epic-3-landing-page-design.md` |

Build order: 1 → 2 → 3. Epic 1 creates `signals.json` and `conformance/`; Epic 2 creates `js/core`; Epic 3 reuses both.

## Principles (non-negotiable)

- **Classify the source of a visit, never the visitor.** No fingerprinting, identity, company lookup, cookies or `localStorage`.
- **Host nothing, store nothing.** No backend, no proxy, no telemetry. The landing page is static files; the snippet makes no network calls.
- **`signals.json` is the product.** Everything else is a reader of it. It is versioned, schema-validated, changelogged and open to PRs.
- **Two implementations, one behaviour.** Python and TypeScript classifiers must agree on every case in `conformance/`; CI fails otherwise.
- Kept small on purpose. The README sentence for feature requests: "This is a classifier and a checker, kept small on purpose. Use the callback and the JSON output to build what you need on top."

## Naming

One name everywhere: PyPI `rastrolog`, npm `rastrolog`, GitHub `csmatar/rastrolog`, import `rastrolog`, CLI command `rastrolog`. MIT license.

## Repository layout

```
rastrolog/
├─ signals.json                 canonical lists (crawlers + referrers)
├─ signals.schema.json          JSON Schema (draft 2020-12) for signals.json
├─ CHANGELOG.md                 Keep a Changelog; every signals.json change gets an entry
├─ conformance/
│  ├─ user_agents.json          real vendor UA strings → expected match
│  ├─ referrers.json            referrer URLs → expected match or null
│  └─ logs/                     one fixture per format (+ .gz variant) and expected report JSON
├─ python/                      uv project, published as PyPI "rastrolog"
├─ js/                          pnpm workspace
│  ├─ core/                     private TS package: classifiers, codegen, log parser, robots parser
│  └─ snippet/                  published as npm "rastrolog"
├─ site/                        Astro static landing page
├─ docs/superpowers/{specs,plans}/
├─ .claude/settings.json        project Claude Code settings (attribution disabled)
├─ CLAUDE.md
└─ .github/workflows/{ci.yml,release.yml}
```

## `signals.json` format

```json
{
  "schema_version": 1,
  "updated": "2026-09-28",
  "crawlers": [
    {
      "id": "openai-gptbot",
      "vendor": "openai",
      "vendor_name": "OpenAI",
      "token": "GPTBot",
      "match": "user_agent",
      "purpose": "training",
      "ai_specific": true,
      "docs_url": "https://platform.openai.com/docs/bots",
      "added": "2026-09-28"
    },
    {
      "id": "google-extended",
      "vendor": "google",
      "vendor_name": "Google",
      "token": "Google-Extended",
      "match": "robots_only",
      "purpose": "training",
      "ai_specific": true,
      "docs_url": "https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers",
      "added": "2026-09-28"
    }
  ],
  "referrers": [
    {
      "id": "chatgpt",
      "vendor": "openai",
      "vendor_name": "OpenAI",
      "product": "ChatGPT",
      "hosts": ["chatgpt.com", "chat.openai.com"],
      "source_url": "https://github.com/matomo-org/searchengine-and-social-list/blob/master/AIAssistants.yml",
      "added": "2026-09-28"
    }
  ]
}
```

Field rules:

- `purpose` ∈ `training`, `user_fetch`, `search_index`.
- `match` ∈ `user_agent` (appears in the UA header; matched in logs and middleware) or `robots_only` (a robots.txt control token that never appears in a UA, such as `Google-Extended` and `Applebot-Extended`; used only by the domain checker).
- `ai_specific: false` marks general search crawlers (`Googlebot`, `Bingbot`) that are reported as a flag but never counted as AI traffic.
- Referrer `hosts` match the exact host or any subdomain (dot-suffix), and each host belongs to exactly one entry. Matching is **by host only**. Research on 2026-09-28 found that the shared hosts bing.com (Copilot), x.com (Grok) and duckduckgo.com send origin-only referrers, so path markers like `/chat` or `/i/grok` never reach the server. Those hosts are documented gaps and are not listed. (Revised from the brainstormed `path_prefixes`/`query_markers` design.)
- `source_url` cites where a referrer host was verified (vendor docs or an analytics vendor's published AI-source list such as Matomo's or Plausible's).
- `id` is unique and stable; it is the key used in conformance fixtures and changelog entries.

**Each entry is verified against the vendor's current published docs before it is committed**; an entry that can't be verified is left out, not guessed. The verified starting list (2026-09-28) has 28 crawler tokens: OpenAI ×3, Anthropic ×3, Perplexity ×2, Google ×4 (including robots-only `Google-Extended`), Microsoft `bingbot`, Common Crawl `CCBot`, ByteDance `Bytespider`, Amazon ×3, Apple ×2 (including robots-only `Applebot-Extended`), Meta ×3, DuckDuckGo, You.com and Mistral AI ×3. It also has 12 referrer products: ChatGPT, Claude, Perplexity, Gemini, NotebookLM, Copilot, You.com, Le Chat, Duck.ai, Meta AI, Grok and DeepSeek. There is one exception to "vendor docs only". ByteDance publishes nothing about Bytespider, so that entry cites a third-party source and carries `"vendor_documented": false`. Any future exception must carry the same flag. Two candidates were left out: `cohere-ai` (Cohere says it runs no crawlers) and a Copilot-specific token (none exists).

Known, documented gap: Google AI Overviews and AI Mode send a plain `google.com` referrer. `rastrolog` does not guess; docs say so.

## Conformance suite

`conformance/` is language-neutral JSON consumed by both test suites:

- `user_agents.json`: `[{ "ua": "<UA string>", "expect": { "id": "openai-gptbot" } | null, "kind": "vendor" | "observed" | "token" | "negative", "source": "<vendor doc URL>" | null, "label"?: "browser-chrome" }]`. `vendor` means the vendor publishes the string verbatim. `observed` means the vendor documents the token but not the full string (Anthropic, for example). `token` means the vendor publishes only the token.
- `referrers.json`: `[{ "referrer": "https://chatgpt.com/", "expect": { "id": "chatgpt" } | null }]`, including negatives (`https://www.google.com/`, same-host, malformed URLs, empty string).
- `logs/<format>.log` + `logs/<format>.expected.json`: parser + report golden files.

Invariants enforced by tests in **both** languages:

1. `signals.json` validates against `signals.schema.json`.
2. Every crawler with `match: "user_agent"` has at least one positive fixture in `user_agents.json` that cites the vendor's doc page (`kind` vendor, observed or token).
3. Every referrer entry has at least one positive fixture in `referrers.json`.
4. Every fixture classifies to its `expect` value.

## Tooling

| Area | Choice |
| --- | --- |
| Python env/build | uv; hatchling build backend (can `force-include` root `signals.json` into the wheel) |
| Python quality | ruff (lint + format), mypy `--strict`, pytest + pytest-cov; CI matrix 3.10–3.14 |
| JS | Node 24 LTS, pnpm workspaces, TypeScript strict, vitest, esbuild (snippet), size-limit |
| Site | Astro (static output), Tailwind CSS v4, Playwright, Lighthouse CI, axe |
| Hooks | pre-commit: ruff, ruff-format, `tsc --noEmit`, signals schema check |
| CI | `ci.yml`: Python matrix, JS test/typecheck/size, site build + e2e + Lighthouse, conformance in both |
| Release | `release.yml` on `v*` tag: PyPI via trusted publishing (OIDC), npm via trusted publishing with provenance, site deploy to Cloudflare Pages. One tag publishes everything so versions never drift |

## Claude Code setup

- `.claude/settings.json`: `attribution` with empty `commit` and `pr` and `sessionUrl: false` (no Claude co-author trailer or PR footer); allowlist for uv/pnpm/git/gh read-and-commit commands; deny for publish commands and force-push.
- `CLAUDE.md`: repo commands, the conformance rule, the "host nothing, store nothing" principle, and the rule that `signals.json` changes need a fixture and a CHANGELOG entry.

## Epics as GitHub issues

Repo `csmatar/rastrolog` (public). One issue per epic labelled `epic` plus an area label (`python`, `snippet`, `site`), body = summary, link to its spec, and a task checklist mirroring its implementation plan. Task issues are created from the plan when that epic starts.

## Out of scope (all epics)

Ads, hosted dashboards, Chrome extension, visitor identification, alerts/reports that require storing user data, server-side proxy, WordPress/Shopify/Cloudflare Worker integrations, any paid tier.
