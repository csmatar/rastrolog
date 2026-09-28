# Epic 3: Landing page

Date: 2026-09-28 · Status: approved in brainstorming, pending written-spec review
Depends on: Epic 1 (`signals.json`, conformance log fixtures), Epic 2 (`js/core`, snippet)

## Goal

One static page, in English at `/` and Spanish at `/es/`, with two working tools above the fold (a domain checker and a log analyzer), install instructions, the detection tables, and one email box. Everything runs in the visitor's browser. The page's job is to earn trust with a working tool and turn the visit into a Kit subscriber.

## Done when

- Design review completed and one direction approved (Phase A).
- Lighthouse: Performance 100 and Accessibility 100 on `/` and `/es/` (mobile profile), enforced by Lighthouse CI.
- Domain checker works on real domains, including the CORS-failure → paste path.
- Log analyzer handles pasted lines, a dropped `.log` and a `.gz`, and a 100 MB file without freezing the UI.
- Kit signup works with and without JavaScript, and routes to the right form.

## Phase A: design review (gate)

No site code is written until a direction is approved.

1. Build **two high-fidelity directions** as real HTML pages (not wireframes). Each includes hero + both tools populated with sample data, results states, install section, Kit box; desktop and mobile; light and dark.
   - **A: Terminal-native.** Dark-first, monospace accents, results styled like CLI output, palette echoing the Python CLI's Charm-style theme. Strong developer signal.
   - **B: Field report.** Light-first, editorial layout; results read like an audit report with per-vendor verdict cards and plain-language sentences. Strong clarity for less technical owners.
2. Publish both as Artifacts for side-by-side comparison and comments.
3. Review each against: Nielsen heuristics, WCAG 2.2 AA (contrast, focus order, target size), time-to-first-result, mobile thumb reach for the primary input, and how clearly the "never leaves your browser" promise reads.
4. Human picks one direction or specifies a merge. The approved direction's tokens (type scale, colour, spacing, radii) become Tailwind theme values for Phase B.

## Phase B: build

### Stack

- Astro, static output, no SSR adapter. Tailwind CSS v4.
- Each tool is a small vanilla-TypeScript island (no UI framework) to keep JS minimal.
- Imports `@rastrolog/core` (workspace) for classifiers, log parser, robots parser.
- i18n: Astro i18n routing, `en` default at `/`, `es` at `/es/`; strings in `src/i18n/{en,es}.ts`; `<link rel="alternate" hreflang>` for both plus `x-default`.

### Page order

1. Hero: title naming both tools; domain checker input as the primary action; log analyzer directly below or adjacent (layout decided in Phase A).
2. Domain checker (`h2` EN: "AI crawler robots.txt checker"; ES: "Bloquear GPTBot y otros bots de IA en robots.txt").
3. Log analyzer (`h2` EN: "See ChatGPT and Perplexity traffic in your logs"; ES: "Tráfico desde ChatGPT en tus logs").
4. Install: `pip install rastrolog`, `rastrolog parse access.log`, the script tag; copy buttons with a visible "Copied" state.
5. What it detects: crawler and referrer tables rendered from `signals.json` at build time, vendor doc links.
6. Articles and video: section hidden until URLs are set in `site.config.ts`; YouTube via click-to-load facade (no iframe until click).
7. Kit signup + GitHub link.

### Domain checker

- Input accepts `example.com`, `https://example.com/path`, etc.; normalised to a host (reject IPs/localhost with a clear message).
- `fetch("https://<host>/robots.txt")` and `/llms.txt` in parallel, `AbortSignal.timeout(8000)`, `mode: "cors"`, `credentials: "omit"`.
- Outcomes per file: **found** (2xx), **not found** (404/410), **unreachable or blocked by CORS** (network `TypeError`, timeout) → reveal a paste box for that file's contents and run the same analysis on pasted text.
- `js/core` robots parser (RFC 9309): groups by `User-agent`, case-insensitive product-token match, most specific group wins, `*` fallback, longest-match `Allow`/`Disallow` with `*` and `$` wildcards. Evaluated for path `/` and reported as **allowed / blocked / partially blocked** (blocked at `/` vs only some paths disallowed).
- Results grouped by purpose (training, user fetch, search index), each crawler showing its verdict and the exact matched lines. Includes `robots_only` tokens (`Google-Extended`, `Applebot-Extended`).
- One-line verdict per vendor, generated from the grouped results, e.g. "OpenAI can train on your content. Anthropic cannot. Perplexity can fetch pages for users."
- `llms.txt`: exists?, first `# ` heading, count of Markdown links.
- No proxy, ever.

### Log analyzer

- Inputs: textarea paste, file picker, drag-and-drop on the panel.
- "Your file never leaves your browser" sits next to the picker, not in a footnote.
- Parsing runs in a Web Worker: `file.stream()` → `DecompressionStream("gzip")` when gzip magic bytes are detected → `TextDecoderStream` → line splitter → `@rastrolog/core` parser/aggregator. Progress messages every ~1 MB; cancel button.
- Output: the same two tables as the CLI (crawlers by vendor/token/purpose with top pages; referrals by product with top landing pages), plus skipped-line count and detected format. Unknown format → show first line and a format selector.
- `js/core` parser mirrors Python's formats and passes the shared log fixtures (same golden reports).

### Kit signup

- Two Kit forms: "General developers" and "LATAM builders", each auto-applying its tag, double opt-in enabled on both (configured in Kit).
- One email field + one checkbox: "I build software for businesses in Mexico or LATAM." Checked on `/es/` by default. The checkbox selects which form endpoint is used.
- Progressive enhancement: plain `<form method="post" action="<Kit form endpoint>">` works without JS; with JS, submit via `fetch`, show inline "Check your inbox to confirm" or an error with retry. Form IDs live in `site.config.ts`. Exact endpoint and field names verified against Kit's current docs during implementation.
- No pop-ups, no exit-intent, no extra fields.

### Analytics

`rastrolog` snippet (dogfooding) + Cloudflare Web Analytics. Nothing else.

### Deploy

Cloudflare Pages, `site/` build output, deployed by `release.yml` on tag (preview deploys on PRs). Production domain is a config value.

## Error handling summary

| Situation | Behaviour |
| --- | --- |
| Invalid domain input | inline message, input keeps focus |
| robots/llms 404 | "No robots.txt found: all crawlers allowed by default" / "No llms.txt" |
| CORS/network/timeout | explain in one sentence, show paste box |
| Unknown log format | show first line + format selector |
| Worker error / corrupt gzip | show partial results if any, clear error message |
| Kit request fails | inline error, form keeps the email, retry |

## Testing

- vitest: robots parser against RFC 9309 examples and a corpus of real robots.txt files; llms.txt summariser; domain normaliser; i18n key parity between `en` and `es`.
- Log parser: shared conformance log fixtures → golden reports (identical to Python).
- Playwright: domain checker with routed responses (found, 404, CORS failure → paste), log analyzer with fixture files (plain, gz), Kit form (success, failure, no-JS POST), keyboard-only navigation.
- axe on both locales; Lighthouse CI budgets (Performance 100, Accessibility 100, Best Practices ≥ 95, SEO 100).

## Out of scope for this epic

Writing the two articles and the video (content work; the page only links/embeds them), any server-side component.
