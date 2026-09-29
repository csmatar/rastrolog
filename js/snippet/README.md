# rastrolog

**Spot visitors from ChatGPT, Claude, Perplexity and other AI chat products, and send them to the analytics you already run.**

One script tag, under 2 KB gzipped. It reads `document.referrer`, and when a visitor arrives from an AI chat product it sends one `ai_referral` event to your analytics. It makes no network requests of its own, sets no cookies and uses no `localStorage`.

```html
<script src="https://cdn.jsdelivr.net/npm/rastrolog@0/dist/snippet.min.js" defer></script>
```

`@0` always serves the latest 0.x release, so new AI products are picked up automatically. For Subresource Integrity, pin an exact version instead:

<!-- rastrolog:sri:start -->
```html
<script src="https://cdn.jsdelivr.net/npm/rastrolog@0.2.1/dist/snippet.min.js" integrity="sha384-f1WmE4FFMG3T7OCN/djpfKWMNHW3DxGQ3dICa4ZZlIlqLgLnzr4Yzfs0SFK0Wzdm" crossorigin="anonymous" defer></script>
```
<!-- rastrolog:sri:end -->

## What your analytics receives

The snippet sends to the first tool it finds on the page, in this order. Add `data-all` to the script tag to send to every tool it finds.

| Tool | What is sent | Setup in the tool |
| --- | --- | --- |
| Google Analytics 4 (gtag.js) | event `ai_referral` with `ai_source`; user property `ai_last_source` | Register `ai_source` (event scope) and `ai_last_source` (user scope) as custom definitions to use them in reports. Both show in DebugView right away. |
| Plausible | custom event `AI Referral` with property `source` | Add a goal for the custom event `AI Referral` and allow the `source` custom property. |
| PostHog | event `ai_referral` with `source`; person property `ai_last_source` | None. |
| Fathom | event `AI Referral - <source>` (Fathom events carry no properties) | None. |
| Umami | event `ai_referral` with `source` | None. |
| Matomo | event category `AI Referral`, action `<source>` | None. |
| Google Tag Manager (no gtag.js) | `dataLayer` event `ai_referral` with `ai_source` | Add a Custom Event trigger for `ai_referral` and a tag that forwards it. |

`<source>` is the referrer id from [`signals.json`](https://github.com/csmatar/rastrolog/blob/main/signals.json), for example `chatgpt`, `claude`, `perplexity`, `gemini` or `copilot`.

The event is sent once per arrival, on the page the visitor lands on, after the page's `load` event, so analytics scripts loaded with `defer` or `async` are ready. Reloading that page doesn't send it again.

## Use it in your own code

```js
window.aiTraffic; // { source: "chatgpt", vendor: "openai", landing: true } or null
```

- `landing` is `true` only when the visitor has just arrived from the AI product. It is `false` on later pages in the same tab session, and when the landing page is reloaded or revisited with Back/Forward, so the event is never sent twice for one arrival. The source is kept in `sessionStorage` under the key `rastrolog`.
- `data-callback="myFunction"` calls `window.myFunction(aiTraffic)` on the landing page.
- The `rastrolog:match` event fires on `window` on the landing page, with `aiTraffic` as `event.detail`:

```js
addEventListener("rastrolog:match", (event) => console.log(event.detail.source));
```

## As a library

```js
import { classifyReferrer, classifyUserAgent } from "rastrolog";

classifyReferrer("https://chatgpt.com/", { ownHost: "example.com" })?.id; // "chatgpt"
classifyUserAgent(request.headers.get("user-agent"))?.token;              // "GPTBot"
```

Both return `null` for anything that isn't AI traffic. They follow the same rules as the Python package ([`rastrolog` on PyPI](https://pypi.org/project/rastrolog/)) and pass the same shared test fixtures.

## Good to know

- **Content-Security-Policy:** allow `https://cdn.jsdelivr.net` in `script-src`, or self-host `dist/snippet.min.js` from this package.
- **Privacy:** the snippet classifies where a visit came from, never who the visitor is. It uses no cookies or `localStorage`, only one `sessionStorage` key. Whether you need consent for the analytics event depends on your analytics tool and your jurisdiction; check your own.
- **Known gap:** Google AI Overviews and AI Mode send a plain `google.com` referrer, so they look like search and aren't counted. rastrolog doesn't guess.

MIT licensed. Source, issues and the signal list: https://github.com/csmatar/rastrolog
