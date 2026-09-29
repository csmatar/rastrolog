# Epic 3: Landing page

Date: 2026-09-28 · Status: approved; Phase A closed 2026-09-29 (direction C, results-first email flow)
Depends on: Epic 1 (`signals.json`, conformance log fixtures), Epic 2 (`js/core`, snippet)

## Goal

One static page, in English at `/` and Spanish at `/es/`, with two working tools above the fold (a domain checker and a log analyzer), install instructions, the detection tables, and an email ask that follows each result. Everything runs in the visitor's browser. The page's job is to earn trust with a working tool and turn the visit into a Kit subscriber.

## Done when

- Design review completed and one direction approved (Phase A). Done: direction C, see [Visual design](#visual-design-direction-c).
- Lighthouse: Performance 100 and Accessibility 100 on `/` and `/es/` (mobile profile), enforced by Lighthouse CI.
- Domain checker works on real domains, including the CORS-failure → paste path.
- Log analyzer handles pasted lines, a dropped `.log` and a `.gz`, and a 100 MB file without freezing the UI.
- Kit signup works with and without JavaScript, and routes to the right form.
- No email field appears before a result, and no result is hidden behind one.
- A `/?check=<domain>` link runs the check on load, so the link in the Kit confirmation email reopens the visitor's report.
- `https://rastrolog.com` and `/es/` serve the site with the production headers, `www.rastrolog.com` redirects to it, and Porkbun email forwarding still works after the DNS move.

## Phase A: design review (gate)

No site code is written until a direction is approved.

1. Build **two high-fidelity directions** as real HTML pages (not wireframes). Each includes hero + both tools populated with sample data, results states, install section, Kit box; desktop and mobile; light and dark.
   - **A: Terminal-native.** Dark-first, monospace accents, results styled like CLI output, palette echoing the Python CLI's Charm-style theme. Strong developer signal.
   - **B: Field report.** Light-first, editorial layout; results read like an audit report with per-vendor verdict cards and plain-language sentences. Strong clarity for less technical owners.
2. Publish both as Artifacts for side-by-side comparison and comments.
3. Review each against: Nielsen heuristics, WCAG 2.2 AA (contrast, focus order, target size), time-to-first-result, mobile thumb reach for the primary input, and how clearly the "never leaves your browser" promise reads.
4. Human picks one direction or specifies a merge. The approved direction's tokens (type scale, colour, spacing, radii) become Tailwind theme values for Phase B.

### Outcome (2026-09-29)

Three directions were reviewed on a design canvas, each on desktop and mobile artboards:

- **A: Terminal-native**, as briefed above. Liked, but dark-first.
- **B**, first as the Field report brief above, then redone as **Daylight** (sky-to-mint gradient, wide grotesk headlines). Rejected: the first version read as a generic template, and the redo moved away from the developer feel.
- **C: Light terminal**: A's type and palette on a light page only, with stronger marketing (big result headlines, a stats strip, a sample alert email) and an email ask built into both tools. **Approved.**

C was reviewed with three email flows: results first, a summary with the details unlocked by email, and email before the check. **Results first** was chosen. Gating was rejected because the same report is free from `pip install rastrolog`, because a client-side gate is trivially skipped, and because asking for an email before showing anything contradicts "nothing leaves your browser".

Dark mode is out of scope: the page ships light only.

## Phase B: build

### Stack

- Astro, static output, no SSR adapter. Tailwind CSS v4.
- Each tool is a small vanilla-TypeScript island (no UI framework) to keep JS minimal.
- Imports `@rastrolog/core` (workspace) for classifiers, log parser, robots parser.
- i18n: Astro i18n routing, `en` default at `/`, `es` at `/es/`; strings in `src/i18n/{en,es}.ts`; `<link rel="alternate" hreflang>` for both plus `x-default`.

### Page order

1. Hero: a two-line headline, a lead paragraph naming both tools, then two tool panels side by side on desktop (stacked on mobile). The domain checker is the primary action on the left (7/12). The log analyzer is on the right (5/12), with "Your file never leaves your browser" under its picker. Under the hero sits a stats strip (28 crawlers, 13 companies, 12 AI chats, 0 bytes uploaded; the counts come from `signals.json` at build time) and the crawler vendors' names.
2. Domain checker results (`h2` EN: "AI crawler robots.txt checker"; ES: "Bloquear GPTBot y otros bots de IA en robots.txt"), followed by the checker's email ask (see [Email capture](#email-capture-kit)).
3. Log analyzer results (`h2` EN: "See ChatGPT and Perplexity traffic in your logs"; ES: "Tráfico desde ChatGPT en tus logs"), followed by the log email ask.
4. Install: `pip install rastrolog`, `rastrolog parse access.log`, the script tag; copy buttons with a visible "Copied" state.
5. What it detects: crawler and referrer tables rendered from `signals.json` at build time, vendor doc links.
6. Articles and video: section hidden until URLs are set in `site.config.ts`; YouTube via click-to-load facade (no iframe until click).
7. Signup band (crawler alerts) with a sample alert email beside the form, then the footer with the GitHub link.

Sections 2 and 3 stay hidden until their tool runs (decided 2026-09-29: an empty heading under the hero looked unfinished). Their `h2`s are still in the static HTML, with the `hidden` attribute, so search engines see them, though likely with less weight than visible text. The header's Checker and Log analyzer links point at the tool panels in the hero.

### Visual design (direction C)

Light only. These values become the Tailwind v4 `@theme` tokens.

**Colour**

| Token | Hex | Use |
| --- | --- | --- |
| `bg` | `#F7F6FB` | page background |
| `surface` | `#FFFFFF` | panels, tables, inputs |
| `surface-2` | `#EFEDF6` | panel title bars, table headers |
| `code` | `#F2F0F8` | code and pasted-text backgrounds |
| `line` | `#D9D5E3` | borders |
| `line-soft` | `#E6E3EE` | row dividers |
| `ink` | `#17151E` | text |
| `ink-2` | `#3F3A4F` | body text on tinted cards |
| `muted` | `#56516A` | secondary text (7.5:1 on `surface`) |
| `brand` | `#C0306A` | primary buttons, `$` and `›` prompts, headline second line, signup band |
| `brand-soft` / `brand-line` | `#FBEAF1` / `#E7B3C9` | checker email ask |
| `accent` | `#5B3CC4` | links, secondary buttons, cursor (hover `#43299A`) |
| `accent-soft` / `accent-line` | `#EEEAFB` / `#C8BCF0` | log email ask |
| `ok` / `ok-soft` / `ok-line` | `#067A50` / `#E1F5EC` / `#9ED9BF` | allowed, "never leaves your browser", success states |
| `warn` | `#7A5C00` | partial verdicts, CORS notice |
| `err` | `#B0214F` | blocked verdicts |

Purpose badges keep the CLI's colours: training `#F25D94` on `#1A0710`, user fetch `#04B575` on `#03140D`, search index `#6A45E0` on `#FFFFFF`. White text on `brand` is 5.4:1.

**Type.** JetBrains Mono (400, 500, 700, 800) for headings, result headlines, tokens, code, buttons and panel labels; IBM Plex Sans (400, 500, 600, 700) for body text. Both are self-hosted from the site as woff2 subsets (no Google Fonts request).

| Role | Desktop | Mobile |
| --- | --- | --- |
| `h1` (Mono 800, line-height 1.08, tracking −0.035em) | 62px | 33px |
| Result headline (Mono 800, tracking −0.03em) | 40px | 25px |
| `h2` (Mono 800) | 34px | 24px |
| Email-ask title (Mono 800) | 24px | 19px |
| Lead paragraph (Plex Sans) | 20px | 17px |
| Body / small / labels | 16 / 14 / 12–13px | 16 / 14 / 11–13px |

**Space and shape.** Page gutter 120px desktop, 20px mobile; sections 88px apart on desktop and 48px on mobile. Radii: 8px for buttons, 10px for inputs, 12–14px for panels and tables, 16px for email asks, 22px for the signup band, and 999px for pills. The two hero tool panels carry one shadow, `0 24px 48px -28px rgb(23 21 30 / 0.28)`; everything else is flat with a 1px `line` border. Touch targets are at least 44px.

**Hero background.** Two soft radial washes (`brand` at 13%, `accent` at 12%) over a 32px graph-paper grid drawn in `accent` at 7%, all CSS. The headline ends in a blinking `accent` block cursor that stops under `prefers-reduced-motion`.

**Key EN copy** (ES written from these, not machine-translated):

- `h1`: "The AI bots reading your site." / "The visitors AI sends back."
- Lead: "Paste a domain to see which of 28 AI crawlers its robots.txt lets in. Drop an access log to count the visits ChatGPT, Perplexity and ten other AI chats sent you. Both run in your browser."
- Checker result headline: "{host} lets {allowed} of {total} AI crawlers in."
- Log result headline: "{requests} AI crawler visits. {visits} people sent by AI chats."
- Signup band: "One email when an AI company ships a new crawler" / "When a company adds or renames a crawler, you get its name, what it does with your pages and the exact robots.txt lines to block it. That's the whole newsletter."

### Email capture (Kit)

Results are never gated. The page asks for an email in three places, each tied to what the visitor has just seen. All three post to the same two Kit forms described under [Kit signup](#kit-signup).

1. **Checker ask**, directly under the checker's verdict summary, rendered only after a robots.txt result. Title: "Want this report in your inbox?". The body names how many of the known crawlers the file mentions (e.g. "Your robots.txt names 5 of the 28 AI crawlers rastrolog knows, so the next one a company launches walks straight in") and promises a link to this report now, plus one short alert each time a crawler is added. Button: "Email me the report". The form also sends a hidden `fields[checked_domain]` with the normalised host. Fine print: "Your email and {host} go to Kit, our mailing service. You confirm by email first, and one click unsubscribes."
2. **Log ask**, directly under the log result headline, rendered only after a log result. Title: "Know the next crawler before it shows up here". Button: "Send me alerts". It sends the email and the LATAM checkbox, nothing else: no counts, no paths, no log data. Fine print: "Only your email goes to Kit, our mailing service. The log stays in this tab."
3. **Signup band** near the bottom of the page, for visitors who never ran a tool. Button: "Send me alerts". A sample alert sits beside it, written for a crawler already on the list and labelled as a sample.

**The report link.** The Kit account has a custom field named `checked_domain`. Both forms' confirmation emails include, inside `{% if subscriber.checked_domain %}`, the link `https://<site>/?check={{ subscriber.checked_domain }}` (the `/es/` form links to `/es/?check=`). On load, the page reads `check`, runs it through the domain normaliser, fills the input and runs the check. An invalid value is ignored and the input stays empty. The link reruns the check, so nothing about the report is stored. After a checker-ask submit, the success state also shows the same link on the page. A visitor who is already subscribed gets no new confirmation email, so this on-page copy is the only one they receive.

**States**, the same for all three: form → submitting (button disabled) → "Check your inbox. Confirm {email} …" (the checker adds "the link to this report is on its way"; the others add "to start getting crawler alerts") → or an inline error with retry that keeps the typed email.

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
- One custom field on the account, `checked_domain`, sent only by the checker ask as a hidden input. Both forms' confirmation emails carry the report link described under [Email capture](#email-capture-kit).
- Progressive enhancement: plain `<form method="post" action="<Kit form endpoint>">` works without JS; with JS, submit via `fetch`, show the inline states from [Email capture](#email-capture-kit). Without JS only the signup band exists, because the two tools and their asks need JS to produce a result. Form IDs live in `site.config.ts`. Exact endpoint and field names verified against Kit's current docs during implementation.
- No pop-ups, no exit-intent, no extra visible fields.

### Analytics

`rastrolog` snippet (dogfooding) + Cloudflare Web Analytics. Nothing else. Web Analytics is switched on in the Pages project, which injects its beacon at the edge; the HTML in the repo carries no analytics script.

### Deploy

Decided 2026-09-29, replacing "deployed by `release.yml` on tag".

**How it deploys.** Cloudflare Pages' Git integration builds and deploys the site. GitHub holds no Cloudflare credentials. Cloudflare has no GitHub OIDC trust yet, and every Actions-based deploy needs a long-lived API token. Cloudflare's GitHub app gets read access to `csmatar/rastrolog` only.

- A merge to `main` that touches the site deploys production. The site follows `main` rather than release tags, and the snippet tag it shows only changes when a release PR updates the README.
- Every PR gets a preview deployment. Cloudflare marks previews `X-Robots-Tag: noindex`.
- Watch paths are `js/**`, `signals.json` and `README.md`. Python-only changes don't redeploy.

**Pages project settings**

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | `js` |
| Build command | `pnpm install --frozen-lockfile && pnpm --filter rastrolog run build && pnpm --filter @rastrolog/site run build` |
| Output directory | `site/dist` |
| `NODE_VERSION`, `PNPM_VERSION` | 24, and the version in `js/package.json`'s `packageManager` |
| Production variables | `SITE_URL=https://rastrolog.com`, `KIT_FORM_GENERAL`, `KIT_FORM_LATAM`, `RASTROLOG_SITE_RELEASE=1` |
| Preview variables | none: `site.config.ts` falls back to `CF_PAGES_URL` for the site URL and keeps the placeholder Kit IDs, so a preview never subscribes anyone |

The build installs from the lockfile with `minimumReleaseAge` in force, because it's set in `pnpm-workspace.yaml`. `RASTROLOG_SITE_RELEASE=1` makes a missing `SITE_URL` or Kit form ID fail the production build.

**Headers** (`js/site/public/_headers`, applied by Pages):

- `Content-Security-Policy`:
  - `default-src 'self'`;
  - `script-src 'self' https://static.cloudflareinsights.com` (the Web Analytics beacon);
  - `style-src 'self' 'unsafe-inline'` (Astro inlines the page CSS);
  - `font-src 'self'`; `img-src 'self' data:`;
  - `connect-src 'self' https:` (the checker reads any site's robots.txt and llms.txt, and the forms post to Kit);
  - `form-action https://app.kit.com`; `frame-src https://www.youtube-nocookie.com`;
  - `worker-src 'self'`; `frame-ancestors 'none'`; `base-uri 'none'`; `object-src 'none'`.
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- `/_astro/*` is served with `Cache-Control: public, max-age=31536000, immutable`, since its file names carry content hashes.
- `https://rastrolog.pages.dev/*` gets `X-Robots-Tag: noindex`, so only `rastrolog.com` is indexed.

The Playwright suite runs every test with this exact CSP added to each response and fails on any violation, so a change that breaks under production headers fails CI, not the live site.

**DNS and domain.** An apex custom domain on Pages must be a Cloudflare zone:

1. `rastrolog.com` becomes a free zone in the maintainer's Cloudflare account. The registrar stays Porkbun; only the nameservers change.
2. The zone recreates Porkbun's email records before the switch: MX `fwd1.porkbun.com` (priority 10) and `fwd2.porkbun.com` (priority 20), and TXT `v=spf1 include:_spf.porkbun.com ~all`.
3. It drops the parking-page records: the `ALIAS` for the apex, the `*` CNAME, and the two `_acme-challenge` TXT records.
4. `rastrolog.com` is the Pages custom domain.
5. `www` is a proxied `A` record to `192.0.2.1`, with a Bulk Redirect (301, keeping path and query) to `https://rastrolog.com`.

**After the switch**, checked from outside:

- `/` and `/es/` return 200 with the headers above, and `www` answers 301;
- the MX lookup returns Porkbun's forwarders;
- the Kit form action matches a real form's embed code;
- Lighthouse passes against the live URL.

## Error handling summary

| Situation | Behaviour |
| --- | --- |
| Invalid domain input | inline message, input keeps focus |
| robots/llms 404 | "No robots.txt found: all crawlers allowed by default" / "No llms.txt" |
| CORS/network/timeout | explain in one sentence, show paste box |
| Unknown log format | show first line + format selector |
| Worker error / corrupt gzip | show partial results if any, clear error message |
| Kit request fails | inline error, form keeps the email, retry |
| `?check=` value is not a valid public host | ignored: the input stays empty and nothing runs |
| Visitor is already subscribed to Kit | Kit sends no new confirmation email; the on-page success state still shows the report link |

## Testing

- vitest: robots parser against RFC 9309 examples and a corpus of real robots.txt files; llms.txt summariser; domain normaliser; i18n key parity between `en` and `es`.
- Log parser: shared conformance log fixtures → golden reports (identical to Python).
- Playwright: domain checker with routed responses (found, 404, CORS failure → paste), log analyzer with fixture files (plain, gz), Kit form (success, failure, no-JS POST), keyboard-only navigation.
- Playwright, email capture: neither ask exists before its tool has produced a result; the checker ask's request carries `fields[checked_domain]` equal to the normalised host; the log ask's request carries `email_address` and nothing else; `/?check=example.com` runs the check on load, while `/?check=localhost` runs nothing.
- axe on both locales; Lighthouse CI budgets (Performance 100, Accessibility 100, Best Practices ≥ 95, SEO 100).

## Out of scope for this epic

Writing the two articles and the video (content work; the page only links/embeds them), any server-side component.
