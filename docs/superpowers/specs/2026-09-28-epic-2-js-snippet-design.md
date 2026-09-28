# Epic 2: JS snippet and TypeScript classifier

Date: 2026-09-28 · Status: approved in brainstorming, pending written-spec review
Depends on: Epic 1 (`signals.json`, `conformance/`)

## Goal

One script tag, under 2 KB gzipped, that classifies `document.referrer` on page load and hands the result to whatever analytics the site already runs. It hosts nothing, stores nothing outside `sessionStorage`, and never makes a network request.

```html
<script src="https://cdn.jsdelivr.net/npm/rastrolog@1/dist/snippet.min.js" defer></script>
```

Docs show two install forms: the floating `@1` tag above (auto-receives new signals) and a **pinned exact-version tag with Subresource Integrity** (`integrity="sha384-…" crossorigin="anonymous"`) for sites that require SRI. The release workflow computes the SRI hash and writes it into the README and the site's install section, so the pinned snippet is always copy-pasteable.

## Done when

- `js/core` passes the shared conformance suite for referrers and user agents.
- Snippet ≤ 2 KB gzipped (size-limit gate in CI).
- GA4, Plausible and PostHog dispatch verified by Playwright against stubbed globals **and** manually in each tool's live debug view (checklist item).
- npm package publishes with provenance from the same tag as PyPI.

## Workspace

```
js/
├─ package.json / pnpm-workspace.yaml / tsconfig.base.json
├─ core/                          private ("@rastrolog/core", not published)
│  ├─ scripts/codegen.ts          signals.json → src/referrers.gen.ts, src/crawlers.gen.ts
│  ├─ src/referrer.ts             classifyReferrer(url, opts?)
│  ├─ src/userAgent.ts            classifyUserAgent(ua)
│  ├─ src/types.ts                Match type
│  └─ test/conformance.test.ts
└─ snippet/                       published as npm "rastrolog"
   ├─ src/snippet.ts              IIFE entry
   ├─ src/dispatch.ts             one function per analytics tool
   ├─ src/index.ts                ESM entry: re-exports classifyReferrer, classifyUserAgent, types
   ├─ test/                       vitest + happy-dom
   └─ e2e/                        Playwright pages with stub analytics
```

The log parser and robots.txt parser are added to `js/core` in Epic 3.

## `js/core`

- **Codegen** runs before build/test. It emits compact typed tables (arrays of tuples, not the full JSON) so the snippet bundles only referrer data. Generated files are gitignored and rebuilt in CI.
- `classifyReferrer(url: string, opts?: { ownHost?: string }): Match | null`, the same rules as Python (lowercase host, strip `www.` and a trailing dot, exact or dot-suffix host match). Uses `URL` in a try/catch.
- `classifyUserAgent(ua: string): Match | null`: longest-token-first, case-insensitive.
- `Match` uses camelCase (`vendorName`, `aiSpecific`); the conformance test compares on `id`, so naming differences don't matter.

## Snippet runtime

1. On execution, read `document.currentScript` options: `data-all` (dispatch to every detected tool, not just the first), `data-callback="fnName"`.
2. `classifyReferrer(document.referrer, { ownHost: location.hostname })`.
3. **Match:** store `{source, vendor}` in `sessionStorage["rastrolog"]`, set `window.aiTraffic = { source, vendor, landing: true }`.
   **No match:** read `sessionStorage["rastrolog"]`; if present, `window.aiTraffic = { ...stored, landing: false }`, else `null`.
4. **Only when `landing: true`**, dispatch after `window` `load` (or immediately if `document.readyState === "complete"`), so deferred analytics scripts have defined their globals.
5. Dispatch order, first found wins unless `data-all`:

| Tool | Detected by | Call |
| --- | --- | --- |
| GA4 | `typeof gtag === "function"` | `gtag("event","ai_referral",{ai_source})` + `gtag("set","user_properties",{ai_last_source})` |
| Plausible | `typeof plausible === "function"` | `plausible("AI Referral",{props:{source}})` |
| PostHog | `window.posthog?.capture` | `posthog.capture("ai_referral",{source})` + `posthog.people?.set({ai_last_source})` |
| Fathom | `window.fathom?.trackEvent` | `fathom.trackEvent("AI Referral: <source>")` |
| Umami | `window.umami?.track` | `umami.track("ai_referral",{source})` |
| Matomo | `Array.isArray(window._paq)` | `_paq.push(["trackEvent","AI Referral",source])` |

6. Always (when landing): call `window[data-callback](aiTraffic)` if it is a function, and dispatch `window.dispatchEvent(new CustomEvent("rastrolog:match",{detail: aiTraffic}))`.

Exact event/API names for each tool are re-verified against current vendor docs during implementation.

## Guarantees

- Every storage access and every dispatcher is wrapped in `try/catch`; the snippet never throws into the host page.
- No `fetch`, `XMLHttpRequest`, `sendBeacon`, image pixels, cookies or `localStorage`, enforced by a test that greps the built bundle for those identifiers.
- No dependencies at runtime.

## npm package

- `exports`: `"."` → ESM `dist/index.js` + `.d.ts`; `"./snippet"` → `dist/snippet.min.js`. `files` limited to `dist`, README, LICENSE.
- `sideEffects: false` for the ESM entry.
- README: script tag, `data-*` options, per-tool what shows up where, `window.aiTraffic` and the `rastrolog:match` event, the sessionStorage/consent note ("no cookies or localStorage; check your own jurisdiction"), the Google AI Overviews gap.

## Testing

- vitest: conformance, dispatcher unit tests with stubbed globals (order, `data-all`, missing tools, throwing tool), sessionStorage carry-over, same-host ignore, storage unavailable.
- Bundle test: forbidden-identifier scan; size-limit ≤ 2 KB gz.
- Playwright: static test pages with each analytics stub loaded `defer` after the snippet; assert calls recorded on the stub.
- Manual: GA4 DebugView, PostHog live events, Plausible realtime.
