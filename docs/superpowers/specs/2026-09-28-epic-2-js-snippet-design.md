# Epic 2: JS snippet and TypeScript classifier

Date: 2026-09-28 · Status: approved in brainstorming; revised 2026-09-29 before planning (see [Revision notes](#revision-notes))
Depends on: Epic 1 (`signals.json`, `conformance/`)

## Goal

One script tag, under 2 KB gzipped, that classifies `document.referrer` on page load and hands the result to whatever analytics the site already runs. It hosts nothing, stores nothing outside `sessionStorage`, and never makes a network request.

```html
<script src="https://cdn.jsdelivr.net/npm/rastrolog@0/dist/snippet.min.js" defer></script>
```

Docs show two install forms:

- **Floating `@0`** (above): receives new signals automatically.
- **Pinned exact version with Subresource Integrity** (`src=".../rastrolog@0.2.0/dist/snippet.min.js" integrity="sha384-…" crossorigin="anonymous"`) for sites that require SRI or a strict CSP.

## Done when

- `js/core` passes the shared conformance suite for referrers and user agents.
- Snippet ≤ 2 KB gzipped (size-limit gate in CI).
- Every dispatcher is covered by unit tests. GA4, Plausible and PostHog are also verified by Playwright against stubbed globals **and** manually in each tool's live view (checklist item).
- npm package `rastrolog` 0.2.0 is published with provenance from the same `v0.2.0` tag as PyPI.

## Versioning

npm and PyPI share one version and one tag; `release.yml` publishes both, so versions never drift. Epic 2 ships as **0.2.0**. The docs use the floating `@0` range until 1.0 (planned with the landing page, Epic 3).

Within 0.x, the **script-tag contract** does not break: the `data-*` attributes, `window.aiTraffic`, the `rastrolog:match` event, the `sessionStorage` key and the event names sent to each analytics tool. Signal additions are minor or patch releases. The ESM API (`classifyReferrer`, `classifyUserAgent`, `Match`) follows normal 0.x semver.

## Workspace

```
js/
├─ package.json / pnpm-workspace.yaml / tsconfig.base.json / biome.json
├─ core/                          private ("@rastrolog/core", not published)
│  ├─ scripts/codegen.ts          signals.json → src/referrers.gen.ts, src/crawlers.gen.ts
│  ├─ src/host.ts                 normalizeHost
│  ├─ src/referrer.ts             classifyReferrer(url, opts?)
│  ├─ src/userAgent.ts            classifyUserAgent(ua)
│  ├─ src/types.ts                Match type
│  └─ test/conformance.test.ts
└─ snippet/                       published as npm "rastrolog"
   ├─ src/snippet.ts              IIFE entry
   ├─ src/runtime.ts              options, session carry-over, window.aiTraffic, scheduling
   ├─ src/dispatch.ts             one function per analytics tool
   ├─ src/index.ts                ESM entry: re-exports classifyReferrer, classifyUserAgent, types
   ├─ test/                       vitest + happy-dom
   └─ e2e/                        Playwright pages with stub analytics
```

The log parser and robots.txt parser are added to `js/core` in Epic 3.

## `js/core`

- **Codegen** runs before build and test. It emits compact typed tables (arrays of tuples, not the full JSON), so the snippet bundles only referrer data. Generated files are gitignored and rebuilt in CI. Codegen validates the fields it reads and fails loudly on a shape it doesn't expect. Full JSON Schema validation stays in the existing pre-commit hook and Python test suite rather than being duplicated.
- `classifyReferrer(url: string, opts?: { ownHost?: string }): Match | null` implements the rules in `conformance/README.md` → *Referrer matching rules*. Those are the same rules as Python: strip whitespace, require a scheme, normalise the host (lowercase, trailing dots, one leading `www.`), compare `ownHost` by exact equality, and match by exact host or dot-suffix. It uses `URL` inside a try/catch.
- `classifyUserAgent(ua: string): Match | null` matches case-insensitively, trying the longest token first.
- `Match` uses camelCase (`vendorName`, `aiSpecific`). The conformance test compares on `id`, so the naming difference doesn't matter.
- Conformance tests enforce invariants 2–4 of the overview spec in TS: every `user_agent` crawler and every referrer has a positive fixture, and every fixture classifies to its `expect` value, including `own_host` cases.

## Snippet runtime

1. On execution, read the options from `document.currentScript`:
   - `data-all`: dispatch to every detected tool, not just the first;
   - `data-callback="fnName"`.
2. Call `classifyReferrer(document.referrer, { ownHost: location.hostname })`.
3. On a **match**, store `{source, vendor}` in `sessionStorage["rastrolog"]` and set `window.aiTraffic = { source, vendor, landing: true }`.
   With **no match**, read `sessionStorage["rastrolog"]`. If it's present, set `window.aiTraffic = { ...stored, landing: false }`; otherwise set it to `null`.
   `source` is the referrer id (for example `chatgpt`) and `vendor` is the vendor slug (for example `openai`).
4. **Only when `landing: true`**, dispatch after the `window` `load` event, or immediately if `document.readyState === "complete"`. By then, `defer` and `async` analytics scripts have run and defined their globals.
5. Dispatch order (first found wins unless `data-all`). APIs were verified against vendor docs on 2026-09-28:

| # | Tool | Detected by | Call | Site-owner setup (documented in README) |
| --- | --- | --- | --- | --- |
| 1 | GA4 (gtag.js) | `typeof gtag === "function"` | `gtag("event","ai_referral",{ai_source})` then `gtag("set","user_properties",{ai_last_source})` | Register `ai_source` (event-scoped) and `ai_last_source` (user-scoped) as custom definitions to report on them; both show in DebugView without that |
| 2 | Plausible | `typeof plausible === "function"` | `plausible("AI Referral",{props:{source}})` | Add a custom-event goal named exactly `AI Referral`; allow the `source` custom property |
| 3 | PostHog | `typeof posthog?.capture === "function"` | `posthog.capture("ai_referral",{source})` then `posthog.setPersonProperties?.({ai_last_source})` | None |
| 4 | Fathom | `typeof fathom?.trackEvent === "function"` | `fathom.trackEvent("AI Referral - <source>")` (Fathom events carry no properties, so the source goes in the name) | None |
| 5 | Umami | `typeof umami?.track === "function"` | `umami.track("ai_referral",{source})` | None |
| 6 | Matomo | `Array.isArray(_paq)` | `_paq.push(["trackEvent","AI Referral",source])` | None |
| 7 | Google Tag Manager only | `Array.isArray(dataLayer)` and no `gtag` | `dataLayer.push({event:"ai_referral",ai_source})` | Add a Custom Event trigger for `ai_referral` and a tag that forwards it |

   GA4 uses `ai_source` rather than `source`, because `source` already means the traffic source in GA reports. GTM is last because gtag.js also creates `dataLayer`; a gtag site is handled by row 1.

6. When landing, the snippet also:
   - calls `window[data-callback](aiTraffic)` if that is a function;
   - dispatches `window.dispatchEvent(new CustomEvent("rastrolog:match",{detail: aiTraffic}))`.

## Guarantees

- Every storage access, every dispatcher and the callback is wrapped in `try/catch`, so the snippet never throws into the host page. One tool throwing doesn't stop the next under `data-all`.
- No `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource`, `Image`/pixel, `document.cookie` or `localStorage`. A test scans the built bundle for those identifiers.
- No runtime dependencies. Built for ES2020 browsers.

## npm package

- `exports`: `"."` → ESM `dist/index.js` with `.d.ts`; `"./snippet"` → `dist/snippet.min.js`. `files` is limited to `dist`, README and LICENSE.
- `sideEffects: false` for the ESM entry.
- The README covers:
  - the script tag, floating and pinned with SRI;
  - the `data-*` options;
  - for each tool, what shows up where and the setup from the table above;
  - `window.aiTraffic` and the `rastrolog:match` event;
  - the CSP note (allow `cdn.jsdelivr.net`, or self-host `dist/snippet.min.js`);
  - the sessionStorage/consent note ("no cookies or localStorage; check your own jurisdiction");
  - the Google AI Overviews gap.

## Release and supply chain

Rulings that follow the repo hardening from #17:

- **Build.** The esbuild output is deterministic for a given lockfile. The release PR (version bump) runs the build and writes the pinned `<script … integrity="sha384-…">` tag into the READMEs. CI never commits. `release.yml` rebuilds from the tag and **fails if the computed SRI hash differs from the README's**, so the published pinned tag is always correct.
- **`release.yml`.** The existing unprivileged build job also builds and tests the JS workspace and checks that `js/snippet/package.json` has the tag's version. A new `publish to npm` job needs only `id-token: write`, runs in a new `npm` GitHub environment (required reviewer `@csmatar`, `v*` tags only) and runs no project code: it publishes the tarball built by the build job, with provenance.
- **First publish** (npm trusted publishing needs an existing package). For `v0.2.0` only, the maintainer creates a granular npm token that expires in 1 day and stores it as a secret of the `npm` environment. The publish job uses it together with provenance. Afterwards the maintainer:
  1. adds the trusted publisher (repo `csmatar/rastrolog`, workflow `release.yml`, environment `npm`);
  2. deletes the token and the secret;
  3. sets the package to disallow token publishing.

  The follow-up PR removes the token path from `release.yml`. Nothing is published from a laptop.
- **Dependencies.**
  - pnpm uses `--frozen-lockfile`, with dependency lifecycle scripts off (`onlyBuiltDependencies` allowlist only as needed) and `minimumReleaseAge` of 7 days, matching Dependabot's cooldown.
  - Dependabot gets an `npm` ecosystem for `/js`, with the same weekly schedule and 7-day cooldown.
  - CodeQL adds `javascript-typescript`.
  - All new actions are SHA-pinned; zizmor stays clean.
- **CI.** A `js` job runs install, codegen, biome, typecheck, vitest (including TS conformance), build, the size-limit gate and the forbidden-identifier scan. An `e2e` job runs Playwright on Chromium. `js`, `e2e` and `Analyze (javascript-typescript)` join the `protect-main` required checks once they are green on `main`.
- **Tooling.** Node 24 LTS, pnpm 11, TypeScript strict, Biome for lint and format (one dependency, and it also covers the Astro site later), vitest with happy-dom, esbuild, size-limit, Playwright.

## Testing

- vitest:
  - conformance;
  - dispatcher unit tests with stubbed globals: order, `data-all`, missing tools, a throwing tool, the GTM-vs-gtag precedence, and the PostHog stub without `setPersonProperties`;
  - sessionStorage carry-over, same-host ignore, storage unavailable or throwing;
  - `load` already fired versus not yet fired.
- Bundle test: the forbidden-identifier scan and size-limit ≤ 2 KB gz.
- Playwright: static test pages that load each analytics stub with `defer` after the snippet, with an AI referrer set. The tests assert that the stub recorded the call, and that a non-AI referrer records nothing.
- Manual: GA4 DebugView, PostHog live events, Plausible realtime.

## Revision notes

These changes were made on 2026-09-29, before the implementation plan:

- **Version.** npm shares PyPI's version, so Epic 2 is 0.2.0 and the URL uses `@0` instead of `@1` (user decision).
- **First npm publish.** It uses a one-time, one-day token in the gated `npm` environment, then switches to trusted publishing (user decision). npm trusted publishing can't be configured for a package that doesn't exist yet.
- **SRI.** The hash is written by the release PR and verified by `release.yml`, instead of being written by the release workflow, which can't push to the protected `main`.
- **Dispatchers.**
  - PostHog uses `setPersonProperties` (`people.set` is legacy).
  - Fathom puts the source in the event name.
  - GA4's parameter is `ai_source`.
  - The Google Tag Manager `dataLayer` fallback was added.
  - Owner setup is documented for each tool.
- Supply-chain and CI rules were added to match #17.
