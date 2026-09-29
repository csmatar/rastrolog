# Epic 3c: Deploy to rastrolog.com Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the landing page live at `https://rastrolog.com` through Cloudflare Pages' Git integration, with production security headers that the test suite enforces, and a repeatable check of the live site.

**Architecture:**
- **The repo gains:**
  - `js/site/public/_headers` (Pages applies it at the edge);
  - a small parser for it that the unit tests, the Playwright fixture and the live check all share;
  - a Playwright fixture that serves every page under the production CSP and fails on any violation;
  - a `CF_PAGES_URL` fallback so preview builds link to themselves;
  - `verify-live`, a script that checks the deployed site and DNS.
- **Cloudflare, Porkbun and Kit are configured by the maintainer**, following a checklist in `js/site/README.md` (Task 6). GitHub stores no Cloudflare credentials.

**Tech Stack:** Cloudflare Pages (Git integration, build image v3), Astro 7 static output, Playwright 1.63, vitest 5, Node 24 (`fetch`, `node:dns/promises`).

**Spec:** `docs/superpowers/specs/2026-09-28-epic-3-landing-page-design.md`, section "Deploy" (and "Analytics", "Done when").

## Global Constraints

- No Cloudflare credentials in GitHub: no API token, no secret, and no deploy step in any workflow. Pages' Git integration builds and deploys.
- The Content-Security-Policy, exactly:
  `default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self' https:; form-action https://app.kit.com; frame-src https://www.youtube-nocookie.com; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'`
- The other headers: `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- `/_astro/*`: `Cache-Control: public, max-age=31536000, immutable`. `https://rastrolog.pages.dev/*`: `X-Robots-Tag: noindex`.
- Pages limits: at most 100 header rules, each line at most 2,000 characters. A header set twice for one path is comma-joined, so never repeat a header across overlapping rules.
- The HTML carries no analytics script: Web Analytics is switched on in the Pages project.
- Pages settings are as in the spec: production branch `main`; root `js`; the build command there; output `site/dist`; `NODE_VERSION` 24; `PNPM_VERSION` equal to `packageManager` in `js/package.json` (`pnpm@11.27.1` today). Production variables are `SITE_URL=https://rastrolog.com`, `KIT_FORM_GENERAL`, `KIT_FORM_LATAM` and `RASTROLOG_SITE_RELEASE=1`; previews get none.
- Email records carried to Cloudflare: MX `fwd1.porkbun.com` (10), MX `fwd2.porkbun.com` (20), TXT `v=spf1 include:_spf.porkbun.com ~all`.
- Git: branch `epic-3c-deploy`; no Claude attribution in commits or PRs. The maintainer does every dashboard, DNS and nameserver action.

## Review Focus

These are the five failure modes most likely to bite, each pinned by a test in the task that owns it:

1. **The analytics beacon Cloudflare injects is blocked by the CSP.** Nothing in the repo loads it, so no existing test would notice. (Task 2: a stub beacon is loaded under the CSP.)
2. **The click-to-load YouTube embed is blocked.** The media section stays hidden until a video ID is set, so it never runs in tests. (Task 2: an embed iframe is created under the CSP.)
3. **The CSP isn't actually applied in tests**, so a broken policy passes silently. (Task 2: a negative control expects a cross-origin script to be refused.)
4. **A preview build without `SITE_URL` points its canonical and hreflang links at `localhost`.** (Task 3: `CF_PAGES_URL` is the fallback, while production still requires `SITE_URL`.)
5. **The nameserver move silently drops email forwarding, or the README's Pages settings drift from the repo.** (Task 4: `verify-live` checks MX and SPF. Task 5: a test keeps the README's `PNPM_VERSION` equal to `packageManager`.)

## Rulings made while planning

- **`SKIP_DEPENDENCY_INSTALL=1` in the Pages variables (both environments).** Pages v3 otherwise runs its own `pnpm install` before the build command, and the build command's `pnpm install --frozen-lockfile` should be the only install. The spec is silent on this; it adds no dependency or credential.
- **The `_headers` parser lives in `js/site/scripts/headers-file.ts`.** The unit test, the e2e fixture and `verify-live` all read the file through it, so the policy the tests enforce is the one that ships.
- **`form-action` is exactly the spec's `https://app.kit.com`.** A no-JavaScript submit of the checker form therefore does nothing, and the page already says the tools need JavaScript.
- **`verify-live` is a script the maintainer or agent runs after a deploy or DNS change, not a CI job.** A scheduled job probing production would be the only workflow touching the live site. The spec asks for a check after the switch, not monitoring.

---

## File structure

```
js/site/public/_headers              NEW production headers (Pages)
js/site/scripts/headers-file.ts      NEW parseHeaders, readHeadersFile, headerFor
js/site/scripts/verify-live.ts       NEW live-site and DNS checks (CLI + verifyLive())
js/site/e2e/fixtures.ts              NEW test/expect with the production CSP on every response
js/site/e2e/csp.spec.ts              NEW beacon, YouTube and negative-control checks
js/site/e2e/*.spec.ts                import test/expect from ./fixtures.ts
js/site/site.config.ts               CF_PAGES_URL fallback for SITE_URL
js/site/package.json                 + "verify-live" script
js/site/tsconfig.json                + "scripts" in include
js/site/test/headers.test.ts         NEW
js/site/test/verify-live.test.ts     NEW
js/site/test/config.test.ts          + CF_PAGES_URL cases
js/site/test/deploy-docs.test.ts     NEW README settings stay in sync
js/site/README.md                    + Deploy section and launch checklist
CLAUDE.md, CHANGELOG.md              deploy notes
```

Run commands from `js/` unless a step says otherwise. `site:e2e` means `pnpm --filter rastrolog run build && pnpm --filter @rastrolog/site run build && pnpm --filter @rastrolog/site run e2e`.

---

### Task 1: The production headers file and its parser

**Files:**
- Create: `js/site/scripts/headers-file.ts`, `js/site/public/_headers`
- Modify: `js/site/tsconfig.json`
- Test: `js/site/test/headers.test.ts`

**Interfaces:**
- Produces:
  - `interface HeaderRule { path: string; headers: Record<string, string> }`;
  - `parseHeaders(text: string): HeaderRule[]`;
  - `readHeadersFile(): HeaderRule[]` (reads `js/site/public/_headers`);
  - `headerFor(rules: readonly HeaderRule[], path: string, name: string): string | undefined` (exact rule path, case-insensitive header name).

- [ ] **Step 1: Include `scripts` in the site's typecheck**

`js/site/tsconfig.json`: change `"include"` to `["src/**/*.ts", "scripts", "test", "e2e", "*.config.ts"]`.

- [ ] **Step 2: Write the failing test**

`js/site/test/headers.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { headerFor, parseHeaders, readHeadersFile } from "../scripts/headers-file.ts";

const CSP =
  "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self' https:; form-action https://app.kit.com; frame-src https://www.youtube-nocookie.com; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'";

describe("public/_headers", () => {
  const rules = readHeadersFile();

  it("sets the spec's security headers on every page", () => {
    expect(headerFor(rules, "/*", "Content-Security-Policy")).toBe(CSP);
    expect(headerFor(rules, "/*", "Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains");
    expect(headerFor(rules, "/*", "X-Content-Type-Options")).toBe("nosniff");
    expect(headerFor(rules, "/*", "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headerFor(rules, "/*", "Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=()");
  });

  it("caches hashed assets for a year", () => {
    expect(headerFor(rules, "/_astro/*", "Cache-Control")).toBe("public, max-age=31536000, immutable");
  });

  it("keeps rastrolog.pages.dev out of search results", () => {
    expect(headerFor(rules, "https://rastrolog.pages.dev/*", "X-Robots-Tag")).toBe("noindex");
  });

  it("stays inside Cloudflare's limits", () => {
    const text = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");
    expect(rules.length).toBeLessThanOrEqual(100);
    for (const line of text.split("\n")) expect(line.length).toBeLessThanOrEqual(2000);
  });

  it("never sets one header in two rules, which Pages would comma-join", () => {
    const seen = new Map<string, string>();
    for (const rule of rules) {
      for (const name of Object.keys(rule.headers)) {
        const key = name.toLowerCase();
        expect(seen.get(key), `${name} in ${rule.path} and ${seen.get(key)}`).toBeUndefined();
        seen.set(key, rule.path);
      }
    }
  });
});

describe("parseHeaders", () => {
  it("reads paths, indented headers, comments and blank lines", () => {
    const text = "# note\n/*\n  A: 1\n  B: x: y\n\nhttps://example.pages.dev/*\n  C: 2\n";
    expect(parseHeaders(text)).toEqual([
      { path: "/*", headers: { A: "1", B: "x: y" } },
      { path: "https://example.pages.dev/*", headers: { C: "2" } },
    ]);
  });

  it("rejects a header line before any path", () => {
    expect(() => parseHeaders("  A: 1\n")).toThrow("_headers: header before any path:   A: 1");
  });
});
```

Run: `pnpm --filter @rastrolog/site exec vitest run test/headers.test.ts`
Expected: FAIL, `Cannot find module '../scripts/headers-file.ts'`.

- [ ] **Step 3: Write the parser and the file**

`js/site/scripts/headers-file.ts`:

```ts
// Cloudflare Pages' _headers format: a path line, then indented "Name: value" lines.
// The unit tests, the Playwright fixture and verify-live all read the file through
// this, so the policy the tests enforce is the one that ships.
import { readFileSync } from "node:fs";

export interface HeaderRule {
  path: string;
  headers: Record<string, string>;
}

export function parseHeaders(text: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      rules.push({ path: line.trim(), headers: {} });
      continue;
    }
    const rule = rules[rules.length - 1];
    const colon = line.indexOf(":");
    if (rule === undefined || colon < 0) throw new Error(`_headers: header before any path: ${line}`);
    rule.headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return rules;
}

export function readHeadersFile(): HeaderRule[] {
  return parseHeaders(readFileSync(new URL("../public/_headers", import.meta.url), "utf8"));
}

export function headerFor(rules: readonly HeaderRule[], path: string, name: string): string | undefined {
  const rule = rules.find((r) => r.path === path);
  if (rule === undefined) return undefined;
  const key = Object.keys(rule.headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : rule.headers[key];
}
```

`js/site/public/_headers` (the CSP is one line):

```
# Production headers for Cloudflare Pages (spec: Epic 3, Deploy).
# The e2e suite serves every page under this Content-Security-Policy.
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self' https:; form-action https://app.kit.com; frame-src https://www.youtube-nocookie.com; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/_astro/*
  Cache-Control: public, max-age=31536000, immutable

https://rastrolog.pages.dev/*
  X-Robots-Tag: noindex
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @rastrolog/site exec vitest run test/headers.test.ts`
Expected: PASS, 7 tests.

Run: `pnpm --filter @rastrolog/site run build && test -f site/dist/_headers && echo present`
Expected: `present` (Astro copies `public/` as is).

- [ ] **Step 5: Commit**

```bash
pnpm run format && pnpm run lint && pnpm --filter @rastrolog/site run typecheck
git add js/site/public/_headers js/site/scripts/headers-file.ts js/site/test/headers.test.ts js/site/tsconfig.json
git commit -m "feat(site): production security headers for Cloudflare Pages"
```

---

### Task 2: Every e2e test runs under the production CSP

**Files:**
- Create: `js/site/e2e/fixtures.ts`, `js/site/e2e/csp.spec.ts`
- Modify: every `js/site/e2e/*.spec.ts` import of `test`/`expect`

**Interfaces:**
- Consumes: `readHeadersFile`, `headerFor` (Task 1).
- Produces: `test` and `expect` from `e2e/fixtures.ts`. `test` has an automatic fixture that adds the CSP to every `http://localhost:4321` response and fails the test on any violation, and it exposes `csp: string[]` (the violations so far) for tests that expect one.

- [ ] **Step 1: Write the fixture and the failing CSP checks**

`js/site/e2e/fixtures.ts`:

```ts
// Every page in the e2e suite is served with the production Content-Security-Policy
// from public/_headers (astro preview doesn't apply _headers, Pages does). Any
// violation fails the test, so a change that breaks under production headers fails CI.
import { test as base, expect } from "@playwright/test";
import { headerFor, readHeadersFile } from "../scripts/headers-file.ts";

const ORIGIN = "http://localhost:4321";
const CSP = headerFor(readHeadersFile(), "/*", "Content-Security-Policy");
if (CSP === undefined) throw new Error("public/_headers has no Content-Security-Policy for /*");

export const test = base.extend<{ csp: string[] }>({
  csp: [
    async ({ page }, use) => {
      const violations: string[] = [];
      await page.route(`${ORIGIN}/**`, async (route) => {
        const response = await route.fetch();
        await route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": CSP } });
      });
      page.on("console", (message) => {
        if (message.text().includes("Content Security Policy")) violations.push(message.text());
      });
      await page.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (event) => {
          console.error(`Content Security Policy: ${event.violatedDirective} blocked ${event.blockedURI}`);
        });
      });
      await use(violations);
      expect(violations, "Content Security Policy violations").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
```

`js/site/e2e/csp.spec.ts`:

```ts
import { expect, test } from "./fixtures.ts";

const loadScript = (src: string) =>
  new Promise<string>((resolve) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve("loaded");
    s.onerror = () => resolve("blocked");
    document.head.append(s);
  });

test("Cloudflare's analytics beacon may load (Review Focus 1)", async ({ page }) => {
  await page.route("https://static.cloudflareinsights.com/beacon.min.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: "window.__beacon = 1;" }),
  );
  await page.goto("/");
  expect(await page.evaluate(loadScript, "https://static.cloudflareinsights.com/beacon.min.js")).toBe("loaded");
  expect(await page.evaluate(() => (window as { __beacon?: number }).__beacon)).toBe(1);
});

test("the click-to-load YouTube embed may load (Review Focus 2)", async ({ page }) => {
  await page.route("https://www.youtube-nocookie.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<p>video</p>" }),
  );
  await page.goto("/");
  await page.evaluate(() => {
    const frame = document.createElement("iframe");
    frame.src = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1";
    document.body.append(frame);
  });
  await expect(page.frameLocator("iframe").getByText("video")).toBeVisible();
});

test("the policy really applies: a script from elsewhere is refused (Review Focus 3)", async ({ page, csp }) => {
  await page.route("https://evil.example/x.js", (route) => route.fulfill({ contentType: "text/javascript", body: "" }));
  await page.goto("/");
  expect(await page.evaluate(loadScript, "https://evil.example/x.js")).toBe("blocked");
  await expect.poll(() => csp.some((v) => v.includes("script-src"))).toBe(true);
  csp.splice(0); // expected here; the fixture checks the rest of the test
});
```

In every `js/site/e2e/*.spec.ts`, import `test` and `expect` from `./fixtures.ts` instead of `@playwright/test`. Keep type-only imports (`type Page`) from `@playwright/test`. For example, in `checker.spec.ts`:

```ts
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";
```

Watch the negative control fail without the policy. Temporarily set `ORIGIN` in `fixtures.ts` to `http://localhost:9`, so no response gets the CSP.

Run: `pnpm --filter rastrolog run build && pnpm --filter @rastrolog/site run build && pnpm --filter @rastrolog/site exec playwright test e2e/csp.spec.ts`
Expected: FAIL. "the policy really applies" gets `loaded` instead of `blocked`.

Put `ORIGIN` back to `http://localhost:4321`.

- [ ] **Step 2: Run the whole suite under the CSP**

Run: `site:e2e`
Expected: PASS, every spec in both projects, with no violations.

If a violation shows up, fix the page, not the policy. The policy is the spec's:
- **an inline script** means Astro inlined one: keep `vite.build.assetsInlineLimit: 0`;
- **a `blob:` worker** means the worker must stay a same-origin file;
- **a request to a new origin** has to be listed in the spec first.

- [ ] **Step 3: Commit**

```bash
pnpm run format && pnpm run lint && pnpm --filter @rastrolog/site run typecheck
git add js/site/e2e
git commit -m "test(site): run every e2e test under the production CSP"
```

---

### Task 3: Preview builds link to themselves

**Files:**
- Modify: `js/site/site.config.ts`
- Test: `js/site/test/config.test.ts`

**Interfaces:**
- Produces: `resolveConfig(env)`. `siteUrl` is `SITE_URL`, else `CF_PAGES_URL`, else `http://localhost:4321`. A release build (`RASTROLOG_SITE_RELEASE=1`) still requires `SITE_URL` itself.

- [ ] **Step 1: Write the failing tests**

Append inside the `describe("resolveConfig", …)` block of `js/site/test/config.test.ts`:

```ts
  it("a preview build without SITE_URL uses the deployment URL Pages provides (Review Focus 4)", () => {
    expect(resolveConfig({ CF_PAGES_URL: "https://4f2a.rastrolog.pages.dev" }).siteUrl).toBe(
      "https://4f2a.rastrolog.pages.dev",
    );
  });

  it("SITE_URL wins over CF_PAGES_URL", () => {
    const env = { SITE_URL: "https://rastrolog.com", CF_PAGES_URL: "https://4f2a.rastrolog.pages.dev" };
    expect(resolveConfig(env).siteUrl).toBe("https://rastrolog.com");
  });

  it("a release build still needs SITE_URL itself", () => {
    const env = {
      RASTROLOG_SITE_RELEASE: "1",
      CF_PAGES_URL: "https://rastrolog.pages.dev",
      KIT_FORM_GENERAL: "1",
      KIT_FORM_LATAM: "2",
    };
    expect(() => resolveConfig(env)).toThrow("SITE_URL must be set for a release build");
  });
```

Run: `pnpm --filter @rastrolog/site exec vitest run test/config.test.ts`
Expected: FAIL on the first test (`http://localhost:4321` instead of the Pages URL).

- [ ] **Step 2: Implement**

In `js/site/site.config.ts`, replace:

```ts
  const rawUrl = pick("SITE_URL", DEV.siteUrl);
```

with:

```ts
  // Pages sets CF_PAGES_URL to each deployment's own URL, so previews link to themselves.
  const rawUrl = pick("SITE_URL", env.CF_PAGES_URL?.trim() || DEV.siteUrl);
```

- [ ] **Step 3: Run the tests**

Run: `pnpm --filter @rastrolog/site exec vitest run test/config.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 4: Commit**

```bash
pnpm run format && pnpm run lint
git add js/site/site.config.ts js/site/test/config.test.ts
git commit -m "feat(site): preview builds use the Pages deployment URL"
```

---

### Task 4: `verify-live`, a check of the deployed site and DNS

**Files:**
- Create: `js/site/scripts/verify-live.ts`
- Modify: `js/site/package.json`
- Test: `js/site/test/verify-live.test.ts`

**Interfaces:**
- Consumes: `readHeadersFile`, `headerFor` (Task 1).
- Produces:
  - `interface Check { name: string; ok: boolean; detail: string }`;
  - `interface Deps { fetch(url: string, init?: RequestInit): Promise<Response>; resolveMx(host: string): Promise<{ exchange: string; priority: number }[]>; resolveTxt(host: string): Promise<string[][]> }`;
  - `verifyLive(origin: string, pagesDev: string, csp: string, deps: Deps): Promise<Check[]>`;
  - a CLI: `pnpm --filter @rastrolog/site run verify-live [origin] [pagesDev]` prints one line per check and exits 1 if any fails.

- [ ] **Step 1: Write the failing test**

`js/site/test/verify-live.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { type Deps, verifyLive } from "../scripts/verify-live.ts";

const ORIGIN = "https://rastrolog.com";
const PAGES_DEV = "https://rastrolog.pages.dev";
const CSP = "default-src 'self'";

function deps(over: { responses?: Record<string, Response>; mx?: { exchange: string; priority: number }[]; txt?: string[][] } = {}): Deps {
  const page = () =>
    new Response("<!doctype html>", {
      status: 200,
      headers: {
        "content-security-policy": CSP,
        "strict-transport-security": "max-age=31536000; includeSubDomains",
        "x-content-type-options": "nosniff",
      },
    });
  const responses: Record<string, () => Response> = {
    [`${ORIGIN}/`]: page,
    [`${ORIGIN}/es/`]: page,
    "https://www.rastrolog.com/es/?check=example.com": () =>
      new Response(null, { status: 301, headers: { location: `${ORIGIN}/es/?check=example.com` } }),
    [`${PAGES_DEV}/`]: () => new Response("", { status: 200, headers: { "x-robots-tag": "noindex" } }),
  };
  for (const [url, res] of Object.entries(over.responses ?? {})) responses[url] = () => res;
  return {
    fetch: async (url) => {
      const make = responses[url];
      if (make === undefined) throw new TypeError(`fetch failed: ${url}`);
      return make();
    },
    resolveMx: async () =>
      over.mx ?? [
        { exchange: "fwd1.porkbun.com", priority: 10 },
        { exchange: "fwd2.porkbun.com", priority: 20 },
      ],
    resolveTxt: async () => over.txt ?? [["v=spf1 include:_spf.porkbun.com ~all"]],
  };
}

const failing = async (d: Deps) =>
  (await verifyLive(ORIGIN, PAGES_DEV, CSP, d)).filter((c) => !c.ok).map((c) => c.name);

describe("verifyLive", () => {
  it("passes when the site, redirect, headers and email records are right", async () => {
    expect(await failing(deps())).toEqual([]);
  });

  it("names each problem", async () => {
    const d = deps({
      responses: {
        [`${ORIGIN}/es/`]: new Response("", { status: 404 }),
        "https://www.rastrolog.com/es/?check=example.com": new Response("", { status: 200 }),
        [`${PAGES_DEV}/`]: new Response("", { status: 200 }),
      },
      mx: [{ exchange: "mx.example.net", priority: 10 }],
      txt: [["v=spf1 -all"]],
    });
    expect(await failing(d)).toEqual([
      "GET /es/",
      "www redirects to the apex",
      "pages.dev is noindex",
      "email forwarding (MX)",
      "SPF",
    ]);
  });

  it("reports a header that differs from _headers", async () => {
    const d = deps({ responses: { [`${ORIGIN}/`]: new Response("", { status: 200 }) } });
    const checks = await verifyLive(ORIGIN, PAGES_DEV, CSP, d);
    expect(checks.find((c) => c.name === "security headers")).toMatchObject({
      ok: false,
      detail: "Content-Security-Policy differs from _headers; no HSTS; no nosniff",
    });
  });

  it("a network failure is a failed check, not a crash", async () => {
    const d = deps();
    d.fetch = async () => {
      throw new TypeError("getaddrinfo ENOTFOUND rastrolog.com");
    };
    const checks = await verifyLive(ORIGIN, PAGES_DEV, CSP, d);
    expect(checks.find((c) => c.name === "GET /")).toEqual({
      name: "GET /",
      ok: false,
      detail: "getaddrinfo ENOTFOUND rastrolog.com",
    });
  });
});
```

Run: `pnpm --filter @rastrolog/site exec vitest run test/verify-live.test.ts`
Expected: FAIL, `Cannot find module '../scripts/verify-live.ts'`.

- [ ] **Step 2: Write the script**

`js/site/scripts/verify-live.ts`:

```ts
// Checks the live site after a deploy or a DNS change: both pages, the production
// headers, the www redirect, pages.dev noindex, and that Porkbun's email forwarding
// survived the nameserver move.
// Run: pnpm --filter @rastrolog/site run verify-live [origin] [pagesDev]
import { resolveMx, resolveTxt } from "node:dns/promises";
import { fileURLToPath } from "node:url";
import { headerFor, readHeadersFile } from "./headers-file.ts";

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export interface Deps {
  fetch(url: string, init?: RequestInit): Promise<Response>;
  resolveMx(host: string): Promise<{ exchange: string; priority: number }[]>;
  resolveTxt(host: string): Promise<string[][]>;
}

export async function verifyLive(origin: string, pagesDev: string, csp: string, deps: Deps): Promise<Check[]> {
  const host = new URL(origin).hostname;
  const checks: Check[] = [];
  const check = async (name: string, run: () => Promise<[boolean, string]>) => {
    try {
      const [ok, detail] = await run();
      checks.push({ name, ok, detail });
    } catch (err) {
      checks.push({ name, ok: false, detail: err instanceof Error ? err.message : String(err) });
    }
  };
  const get = (url: string) => deps.fetch(url, { redirect: "manual" });

  for (const path of ["/", "/es/"]) {
    await check(`GET ${path}`, async () => {
      const res = await get(`${origin}${path}`);
      return [res.status === 200, `HTTP ${res.status}`];
    });
  }
  await check("security headers", async () => {
    const h = (await get(`${origin}/`)).headers;
    const problems = [
      h.get("content-security-policy") === csp ? null : "Content-Security-Policy differs from _headers",
      (h.get("strict-transport-security") ?? "").includes("max-age=31536000") ? null : "no HSTS",
      h.get("x-content-type-options") === "nosniff" ? null : "no nosniff",
    ].filter((p): p is string => p !== null);
    return [problems.length === 0, problems.length === 0 ? "all present" : problems.join("; ")];
  });
  await check("www redirects to the apex", async () => {
    const res = await get(`https://www.${host}/es/?check=example.com`);
    const location = res.headers.get("location");
    return [res.status === 301 && location === `${origin}/es/?check=example.com`, `HTTP ${res.status} → ${location}`];
  });
  await check("pages.dev is noindex", async () => {
    const tag = (await get(`${pagesDev}/`)).headers.get("x-robots-tag") ?? "";
    return [tag.includes("noindex"), tag === "" ? "no X-Robots-Tag" : tag];
  });
  await check("email forwarding (MX)", async () => {
    const mx = (await deps.resolveMx(host)).map((r) => `${r.priority} ${r.exchange.toLowerCase()}`).sort();
    return [mx.includes("10 fwd1.porkbun.com") && mx.includes("20 fwd2.porkbun.com"), mx.join(", ")];
  });
  await check("SPF", async () => {
    const spf = (await deps.resolveTxt(host)).map((parts) => parts.join("")).find((t) => t.startsWith("v=spf1"));
    return [spf?.includes("include:_spf.porkbun.com") === true, spf ?? "no SPF record"];
  });
  return checks;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const origin = process.argv[2] ?? "https://rastrolog.com";
  const pagesDev = process.argv[3] ?? "https://rastrolog.pages.dev";
  const csp = headerFor(readHeadersFile(), "/*", "Content-Security-Policy") ?? "";
  const checks = await verifyLive(origin, pagesDev, csp, {
    fetch: (url, init) => fetch(url, init),
    resolveMx,
    resolveTxt,
  });
  for (const c of checks) console.log(`${c.ok ? "ok  " : "FAIL"} ${c.name}: ${c.detail}`);
  process.exit(checks.every((c) => c.ok) ? 0 : 1);
}
```

In `js/site/package.json` `scripts`, add `"verify-live": "node scripts/verify-live.ts"`.

- [ ] **Step 3: Run the tests**

Run: `pnpm --filter @rastrolog/site exec vitest run test/verify-live.test.ts`
Expected: PASS, 4 tests.

Run: `pnpm --filter @rastrolog/site run verify-live`
Expected before launch: exit 1, with failures. The live DNS still points at Porkbun's parking page. This only proves the script runs against the real network; no pass is expected yet.

- [ ] **Step 4: Commit**

```bash
pnpm run format && pnpm run lint && pnpm --filter @rastrolog/site run typecheck
git add js/site/scripts/verify-live.ts js/site/test/verify-live.test.ts js/site/package.json
git commit -m "feat(site): verify-live checks the deployed site, headers and DNS"
```

---

### Task 5: Deploy docs, kept in sync with the repo

**Files:**
- Modify: `js/site/README.md`, `CLAUDE.md`, `CHANGELOG.md`
- Test: `js/site/test/deploy-docs.test.ts`

**Interfaces:**
- Consumes: the Pages settings from the spec; `verify-live` (Task 4).

- [ ] **Step 1: Write the failing test**

`js/site/test/deploy-docs.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const workspace = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  packageManager: string;
};

describe("js/site/README.md deploy settings (Review Focus 5)", () => {
  it("PNPM_VERSION matches the workspace's packageManager", () => {
    const pinned = workspace.packageManager.replace(/^pnpm@/, "");
    expect(readme).toContain(`| \`PNPM_VERSION\` | \`${pinned}\` |`);
  });

  it("gives the build command the spec names", () => {
    expect(readme).toContain(
      "`pnpm install --frozen-lockfile && pnpm --filter rastrolog run build && pnpm --filter @rastrolog/site run build`",
    );
  });
});
```

Run: `pnpm --filter @rastrolog/site exec vitest run test/deploy-docs.test.ts`
Expected: FAIL (the README has no Deploy section yet).

- [ ] **Step 2: Write the Deploy section**

Append to `js/site/README.md`:

````markdown
## Deploy

Cloudflare Pages builds and deploys this site through its Git integration. GitHub holds no Cloudflare credentials, and no workflow deploys anything.
- A merge to `main` that touches `js/**`, `signals.json` or `README.md` deploys `https://rastrolog.com`.
- Every PR gets a preview URL. Cloudflare marks previews `noindex`.

### Pages project settings

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | `js` |
| Build command | `pnpm install --frozen-lockfile && pnpm --filter rastrolog run build && pnpm --filter @rastrolog/site run build` |
| Build output directory | `site/dist` |
| Build watch paths (include) | `js/**`, `signals.json`, `README.md` |

Variables for both environments:

| Variable | Value |
| --- | --- |
| `NODE_VERSION` | `24` |
| `PNPM_VERSION` | `11.27.1` |
| `SKIP_DEPENDENCY_INSTALL` | `1` |

`PNPM_VERSION` must equal `packageManager` in `js/package.json`; `test/deploy-docs.test.ts` checks it. `SKIP_DEPENDENCY_INSTALL` keeps Pages from running its own install before the build command.

Production only: `SITE_URL=https://rastrolog.com`, `KIT_FORM_GENERAL`, `KIT_FORM_LATAM` and `RASTROLOG_SITE_RELEASE=1`. Previews get none of these: `site.config.ts` takes the preview's own URL from `CF_PAGES_URL`, and the placeholder Kit IDs make preview signups fail harmlessly.

`public/_headers` sets the production headers (CSP, HSTS and the rest). The e2e suite serves every page under the same CSP.

### Launch checklist (once)

1. **Kit.** Do the "Kit setup" above: two forms, the `checked_domain` field, and the report link in both confirmation emails. Note both form IDs. The production build fails without them.
2. **Cloudflare zone.** In Cloudflare, add the site `rastrolog.com` on the Free plan. Before switching nameservers, make the zone's DNS match these records exactly:

   | Type | Name | Content | Proxy |
   | --- | --- | --- | --- |
   | MX | `rastrolog.com` | `fwd1.porkbun.com`, priority 10 | DNS only |
   | MX | `rastrolog.com` | `fwd2.porkbun.com`, priority 20 | DNS only |
   | TXT | `rastrolog.com` | `v=spf1 include:_spf.porkbun.com ~all` | DNS only |
   | A | `www` | `192.0.2.1` | Proxied |

   Delete anything else Cloudflare imported from Porkbun: the apex `ALIAS`/`A`, the `*` CNAME, and the two `_acme-challenge` TXT records.
3. **Nameservers.** In Porkbun (Domain Management, then Authoritative Nameservers), replace Porkbun's nameservers with the two Cloudflare shows. Wait for Cloudflare to report the zone active.
4. **Pages project.** In Workers & Pages, choose Create, then Pages, then Connect to Git. When GitHub asks, grant the Cloudflare app access to `csmatar/rastrolog` only. Name the project `rastrolog`, then enter the settings and variables above.
5. **Custom domain.** In the project, go to Custom domains and add `rastrolog.com`.
6. **www redirect.** Under Rules, create a Bulk Redirect list with one entry: `www.rastrolog.com` to `https://rastrolog.com`, status 301, with preserve query string, subpath matching, preserve path suffix and include subdomains all on. Enable a Bulk Redirect rule that uses the list.
7. **Web Analytics.** In the project's Metrics, enable Web Analytics.
8. **Check.** From `js/`, run `pnpm --filter @rastrolog/site run verify-live`. Every line should read `ok`.
````

Replace the README's existing Configuration table row for `SITE_URL` with:

```markdown
| `SITE_URL` | Pages' `CF_PAGES_URL`, else `http://localhost:4321` | The site's origin, for canonical and hreflang links |
```

In `CLAUDE.md`, in the Site commands block, add after the `lhci` line:

```bash
pnpm --filter @rastrolog/site run verify-live    # checks rastrolog.com: pages, headers, www redirect, MX/SPF
```

and add this bullet to "Repository workflow and security":

```markdown
- The site deploys through Cloudflare Pages' Git integration on merge to `main` (settings and the launch checklist are in `js/site/README.md`). GitHub holds no Cloudflare credentials; don't add a deploy token or deploy step to any workflow.
```

In `CHANGELOG.md`, under `## [Unreleased]` → `### Added`, add:

```markdown
- The landing page deploys to https://rastrolog.com through Cloudflare Pages, with a strict Content-Security-Policy that the e2e suite enforces.
```

- [ ] **Step 3: Run the tests**

Run: `pnpm --filter @rastrolog/site exec vitest run test/deploy-docs.test.ts`
Expected: PASS, 2 tests.

Run: `pnpm run format && pnpm run lint && pnpm run typecheck && pnpm run test && site:e2e`
Expected: everything passes.

- [ ] **Step 4: Commit**

```bash
git add js/site/README.md js/site/test/deploy-docs.test.ts CLAUDE.md CHANGELOG.md
git commit -m "docs(site): Cloudflare Pages settings and the launch checklist"
```

---

### Task 6: Launch (with the maintainer)

No code. The agent may not act in any dashboard, change DNS or switch nameservers, because those are outward actions the maintainer takes. The agent's part is to walk the maintainer through `js/site/README.md` → "Launch checklist", one step at a time, and to verify each step from outside.

- [ ] **Step 1: Merge this branch first**

Open the PR for `epic-3c-deploy` and wait for green CI. The maintainer merges it. Pages builds whatever is on `main`, so the headers and the `CF_PAGES_URL` fallback must be there before the project is connected.

- [ ] **Step 2: Kit (checklist 1)**

Ask for one form's `<form action="…">` line from its HTML embed code.
- If it isn't `https://app.kit.com/forms/<id>/subscriptions`, update `KIT_FORM_BASE` in `js/site/src/lib/kit.ts` and its tests in a follow-up PR.
- Also ask the maintainer to submit a test email through the Kit form's own hosted page, to confirm double opt-in and the `checked_domain` link.

- [ ] **Step 3: DNS and nameservers (checklist 2–3)**

After the maintainer switches nameservers, run from `js/`:

```bash
dig +short NS rastrolog.com
dig +short MX rastrolog.com
dig +short TXT rastrolog.com
```

Expected:
- the two Cloudflare nameservers;
- `10 fwd1.porkbun.com.` and `20 fwd2.porkbun.com.`;
- the SPF record.

Don't go on until all three match.

- [ ] **Step 4: Pages, domain, redirect, analytics (checklist 4–7)**

After the maintainer connects the project and the first production build finishes, ask for the build log's last lines if it failed. Then run `pnpm --filter @rastrolog/site run verify-live`.
Expected: every check `ok`. A failing `www redirects` usually means the redirect rule isn't enabled or the `www` A record isn't proxied.

- [ ] **Step 5: Lighthouse against the live site**

Run from `js/site`:

```bash
pnpm exec lhci collect --url=https://rastrolog.com/ --url=https://rastrolog.com/es/ --numberOfRuns=3 && pnpm exec lhci assert
```

Expected: the budgets in `lighthouserc.json` pass.

`lighthouserc.json` still names a `startServerCommand`, so build the site first (`pnpm --filter rastrolog run build && pnpm --filter @rastrolog/site run build`). lhci then starts the local preview, which goes unused, and collects only the `--url` pages.

- [ ] **Step 6: Record it**

Add a line to `CHANGELOG.md` → Unreleased, in the next release PR: "Live at https://rastrolog.com". Tell the maintainer what's still open, including the Performance-100 decision.
