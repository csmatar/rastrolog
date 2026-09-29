# Epic 2: JS snippet and TypeScript classifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship npm package `rastrolog`: a ≤ 2 KB gzipped script tag that classifies `document.referrer` and sends an `ai_referral` event to the analytics a site already runs, plus an ESM classifier. The classifier behaves exactly like the Python package on every `conformance/` fixture.

**Architecture:** A pnpm workspace in `js/` has two packages:
- **`js/core`** (private): codegen turns `signals.json` into compact typed tables, and a port of Python's classifiers reads them.
- **`js/snippet`** (published as `rastrolog`): a runtime that decides `window.aiTraffic` and remembers it in `sessionStorage`, plus one dispatcher per analytics tool.

esbuild bundles an IIFE (`dist/snippet.min.js`) and an ESM entry (`dist/index.js`); tsc emits the declarations. CI gates size, forbidden network APIs, conformance and Playwright e2e. The release workflow publishes to npm from the same tag as PyPI.

**Tech Stack:** Node 24 LTS (native TypeScript type-stripping for scripts), pnpm 11, TypeScript 7 (strict), Biome 2, vitest 5 with happy-dom, esbuild 0.28, size-limit 14, Playwright (Chromium), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-28-epic-2-js-snippet-design.md` (revised 2026-09-29) and `docs/superpowers/specs/2026-09-28-rastrolog-overview-design.md`. The behavioural contract for the classifiers is `conformance/README.md`. GitHub epic: #2.

## Global Constraints

- The snippet is ≤ 2 KB gzipped (`size-limit`, `"limit": "2 KB"`, `"gzip": true`).
- The snippet makes no network calls and uses no cookies or `localStorage`. The only storage is `sessionStorage["rastrolog"]`, and it has no runtime dependencies.
- The snippet never throws into the host page: every storage access, every dispatcher, the callback and the entry point sit inside `try/catch`.
- Python and TS classifiers must pass the same `conformance/` fixtures. Never special-case one language. If a fixture looks wrong, stop and ask; don't skip it.
- Browser code targets ES2020 (`lib: ["ES2020", "DOM"]`). Build and test scripts run on Node 24 with native type stripping, so they may only use erasable TypeScript syntax: no `enum`, `namespace` or parameter properties.
- npm and PyPI share one version. `js/snippet/package.json` `version` always equals `python/pyproject.toml` `version` (currently `0.1.1`). This epic does **not** bump the version; the 0.2.0 release PR does.
- The script-tag contract is frozen within 0.x. It covers the `data-all` and `data-callback` attributes, `window.aiTraffic` = `{ source, vendor, landing }` or `null`, the `rastrolog:match` `CustomEvent`, the `sessionStorage` key `rastrolog`, and these event names:
  - GA4: `ai_referral` with `ai_source`, and the user property `ai_last_source`;
  - Plausible: `AI Referral` with prop `source`;
  - PostHog: `ai_referral` with `source`, and `setPersonProperties({ai_last_source})`;
  - Fathom: `AI Referral - <source>`;
  - Umami: `ai_referral` with `source`;
  - Matomo: `["trackEvent","AI Referral",source]`;
  - GTM: `{event:"ai_referral", ai_source}`.
- Supply chain:
  - `pnpm install --frozen-lockfile` in CI;
  - `minimumReleaseAge: 10080` (7 days) in `pnpm-workspace.yaml`;
  - dependency build scripts only for an explicit allowlist;
  - every GitHub Action pinned to a full SHA with a `# vX.Y.Z` comment, `persist-credentials: false`, and minimal commented `permissions`;
  - `uvx zizmor --persona=pedantic .github/` reports nothing.
- Work stays on branch `epic-2-js-snippet`; `main` is protected. No Claude attribution in commits or PR text. Never commit the private planning note.
- Never publish from a laptop. `npm publish` and `pnpm publish` are denied locally.

## Review Focus

These are the failure modes most likely to hit a real site; the spec implies them but doesn't test them. Each one is pinned by a test in the task named.

1. **Storage blocked.** Some sandboxed iframes and privacy modes make reading `window.sessionStorage` throw. The snippet must still set `window.aiTraffic` and dispatch on landing; only the carry-over is lost. (Task 4)
2. **Snippet injected after `load`** (by Google Tag Manager, or a late `async` loader). `document.readyState` is already `"complete"` and `load` never fires again, so the snippet must dispatch immediately. (Task 4)
3. **Snippet included twice** (theme plus plugin, or a hard-coded tag plus a tag manager). The second copy must do nothing, so events aren't doubled. (Task 4)
4. **No `document.currentScript`.** When injected by some tag managers or as a module, the script element is null. Defaults apply (first tool wins, no callback), with no crash. (Task 4)
5. **Garbage in `sessionStorage["rastrolog"]`.** Another script, an old version or a user edit can leave invalid JSON or the wrong shape. Treat it as "no stored source", never as a crash or as a bogus `aiTraffic`. (Task 4)

Referrer parsing is also a parity risk: WHATWG `URL` disagrees with Python's `urlsplit`. It isn't listed above because Task 2 deliberately pins it with new shared fixtures and a `urlsplit`-compatible parser.

## Rulings made while planning

- **`hostOf` instead of `URL`.** The spec says `classifyReferrer` "uses `URL` in a try/catch". WHATWG `URL` disagrees with Python's `urlsplit` on inputs that were checked on 2026-09-29:
  - `https:chatgpt.com`: `URL` reads `chatgpt.com`, Python reads no host;
  - `https://chatgpt.com:99999/`: `URL` throws, Python reads `chatgpt.com`;
  - both backslash-before-`@` cases.

  CLAUDE.md's parity rule outranks the spec's implementation hint. Task 2 therefore implements a small `hostOf()` that mirrors `urlsplit` and adds those inputs to `conformance/referrers.json`, where Python's suite checks them too.
- **Declarations.** TypeScript 7 has no stable programmatic API, so no d.ts bundler is used. The published types are core's own `.d.ts` files, emitted by `tsc` into `dist/core/`, plus a two-line `dist/index.d.ts` that re-exports them. A consumer typecheck proves they resolve.
- **The SRI block in the READMEs is marker-delimited** (`<!-- rastrolog:sri:start -->` … `<!-- rastrolog:sri:end -->`). `pnpm --filter rastrolog run sri --write` fills it in the release PR; `release.yml` runs `--check`. CI doesn't check it on normal PRs, because the block describes the last release, not the current build.

---

## File structure

```
js/
├─ package.json                 private workspace root: scripts, shared devDeps, packageManager
├─ pnpm-workspace.yaml          packages, minimumReleaseAge, build-script allowlist
├─ pnpm-lock.yaml               committed
├─ tsconfig.base.json           strict, ES2020, Bundler resolution, noEmit
├─ biome.json                   lint + format
├─ core/                        "@rastrolog/core" (private, sideEffects: false, exports ./src/index.ts)
│  ├─ package.json
│  ├─ tsconfig.json             typecheck src + scripts + test
│  ├─ tsconfig.build.json       declarations for src only
│  ├─ vitest.config.ts
│  ├─ scripts/tables.ts         buildTables(), renderModule(): pure, tested
│  ├─ scripts/codegen.ts        IO wrapper: signals.json → src/*.gen.ts
│  ├─ src/types.ts              Match, Purpose, ReferrerRow, CrawlerRow
│  ├─ src/host.ts               normalizeHost(), hostOf()
│  ├─ src/referrer.ts           classifyReferrer()
│  ├─ src/userAgent.ts          classifyUserAgent()
│  ├─ src/index.ts              public exports
│  ├─ src/referrers.gen.ts      generated, gitignored
│  ├─ src/crawlers.gen.ts       generated, gitignored
│  └─ test/{tables,host,classify,conformance}.test.ts
└─ snippet/                     published as "rastrolog"
   ├─ package.json / tsconfig.json / vitest.config.ts / vitest.bundle.config.ts / playwright.config.ts
   ├─ README.md                 npm README (Task 9)
   ├─ src/dispatch.ts           AiTraffic, AnalyticsWindow, DISPATCHERS, dispatch()
   ├─ src/runtime.ts            start(): options, carry-over, aiTraffic, scheduling, callback, event
   ├─ src/snippet.ts            IIFE entry
   ├─ src/index.ts              ESM entry: re-exports from @rastrolog/core
   ├─ scripts/build.ts          esbuild (IIFE + ESM), index.d.ts, LICENSE copy
   ├─ scripts/sri.ts            sriHash(), pinnedBlock(), replaceBlock(); --write / --check
   ├─ test/{dispatch,runtime,sri}.test.ts
   ├─ test/consumer/{consumer.ts,tsconfig.json}   published-types check
   ├─ bundle/bundle.test.ts     scans the built dist/snippet.min.js
   └─ e2e/{snippet.spec.ts,pages/*.html,pages/stubs/*.js}
```

Also modified:
- `conformance/referrers.json` (Task 2);
- `.gitignore`, `.github/workflows/{ci,codeql,release}.yml`, `.github/dependabot.yml`, `.pre-commit-config.yaml`, `.claude/settings.json` and `CLAUDE.md` (Tasks 1, 7, 8);
- `README.md`, `CHANGELOG.md` and `CONTRIBUTING.md` (Task 9).

---

### Task 1: Workspace scaffold and signals codegen

**Files:**
- Create: `js/package.json`, `js/pnpm-workspace.yaml`, `js/tsconfig.base.json`, `js/biome.json`
- Create: `js/core/package.json`, `js/core/tsconfig.json`, `js/core/tsconfig.build.json`, `js/core/vitest.config.ts`
- Create: `js/core/src/types.ts`, `js/core/src/host.ts` (only `normalizeHost` in this task)
- Create: `js/core/scripts/tables.ts`, `js/core/scripts/codegen.ts`
- Test: `js/core/test/tables.test.ts`
- Modify: `.gitignore` (add `js/snippet/LICENSE`)

**Interfaces:**
- Produces:
  - `normalizeHost(host: string): string` in `js/core/src/host.ts`;
  - the types `Purpose`, `Match`, `ReferrerRow`, `CrawlerRow` in `js/core/src/types.ts`;
  - the generated `REFERRERS: readonly ReferrerRow[]` in `js/core/src/referrers.gen.ts` and `CRAWLERS: readonly CrawlerRow[]` in `js/core/src/crawlers.gen.ts`;
  - the scripts `pnpm --filter @rastrolog/core run codegen|test|typecheck`, plus root `pnpm run lint|typecheck|test|build`.

- [ ] **Step 1: Create the workspace root files**

`js/package.json`:

```json
{
  "name": "rastrolog-workspace",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@11.27.1",
  "engines": { "node": ">=24" },
  "scripts": {
    "lint": "biome ci .",
    "format": "biome check --write .",
    "typecheck": "pnpm -r run typecheck",
    "test": "pnpm -r run test",
    "build": "pnpm -r run build"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.5.12",
    "@types/node": "^24.0.0",
    "typescript": "^7.0.2",
    "vitest": "^5.0.0"
  }
}
```

`js/pnpm-workspace.yaml`:

```yaml
packages:
  - core
  - snippet

# Supply chain: never resolve a version published less than 7 days ago
# (minutes; matches Dependabot's 7-day cooldown in .github/dependabot.yml).
minimumReleaseAge: 10080

# pnpm blocks dependency lifecycle scripts by default; allow only what needs one.
onlyBuiltDependencies:
  - esbuild
```

`js/tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": []
  }
}
```

`js/biome.json`:

```json
{
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true, "root": ".." },
  "files": { "includes": ["**", "!**/dist", "!**/*.gen.ts", "!**/playwright-report", "!**/test-results"] },
  "formatter": { "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "javascript": { "formatter": { "quoteStyle": "double" } }
}
```

Append to the repo-root `.gitignore`, under `# Generated`:

```
js/snippet/LICENSE
```

- [ ] **Step 2: Create the core package skeleton**

`js/core/package.json`:

```json
{
  "name": "@rastrolog/core",
  "private": true,
  "type": "module",
  "sideEffects": false,
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "codegen": "node scripts/codegen.ts",
    "typecheck": "node scripts/codegen.ts && tsc -p tsconfig.json",
    "test": "node scripts/codegen.ts && vitest run"
  }
}
```

`js/core/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "types": ["node"], "allowImportingTsExtensions": true },
  "include": ["src", "scripts", "test", "vitest.config.ts"]
}
```

`js/core/tsconfig.build.json` (only the snippet build uses it, in Task 5):

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "noEmit": false, "declaration": true, "emitDeclarationOnly": true, "rootDir": "src" },
  "include": ["src"]
}
```

`js/core/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
```

- [ ] **Step 3: Write the types and `normalizeHost`**

`js/core/src/types.ts`:

```ts
export type Purpose = "training" | "user_fetch" | "search_index";

/** What a user agent or referrer was classified as. Python's `Match`, in camelCase. */
export interface Match {
  kind: "crawler" | "referral";
  /** Stable id from signals.json, e.g. "openai-gptbot" or "chatgpt". */
  id: string;
  vendor: string;
  vendorName: string;
  /** Referrals only: the product name, e.g. "ChatGPT". */
  product?: string;
  /** Crawlers only: the user-agent token, e.g. "GPTBot". */
  token?: string;
  /** Crawlers only. */
  purpose?: Purpose;
  /** False for search-engine crawlers (Googlebot, bingbot, Applebot); true for every referral. */
  aiSpecific: boolean;
}

/** One referrer entry: id, vendor, vendor name, product, normalised hosts. */
export type ReferrerRow = readonly [
  id: string,
  vendor: string,
  vendorName: string,
  product: string,
  hosts: readonly string[],
];

/** One `match: "user_agent"` crawler. Rows are ordered longest token first. */
export type CrawlerRow = readonly [
  id: string,
  vendor: string,
  vendorName: string,
  token: string,
  purpose: Purpose,
  aiSpecific: boolean,
];
```

`js/core/src/host.ts`:

```ts
/** Lowercase, drop trailing dots and one leading "www." (Python: `normalize_host`). */
export function normalizeHost(host: string): string {
  const h = host.trim().toLowerCase().replace(/\.+$/, "");
  return h.startsWith("www.") ? h.slice(4) : h;
}
```

- [ ] **Step 4: Write the failing codegen tests**

`js/core/test/tables.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildTables, renderModule } from "../scripts/tables.ts";
import { normalizeHost } from "../src/host.js";

const crawler = (id: string, token: string, extra: Record<string, unknown> = {}) => ({
  id,
  vendor: "v",
  vendor_name: "V",
  token,
  match: "user_agent",
  purpose: "training",
  ai_specific: true,
  ...extra,
});
const referrer = (id: string, hosts: unknown[]) => ({
  id,
  vendor: "v",
  vendor_name: "V",
  product: id.toUpperCase(),
  hosts,
});
const signals = (over: Record<string, unknown> = {}) => ({
  schema_version: 1,
  crawlers: [],
  referrers: [],
  ...over,
});

describe("normalizeHost", () => {
  it.each([
    ["WWW.Example.COM", "example.com"],
    ["claude.ai.", "claude.ai"],
    ["claude.ai..", "claude.ai"],
    [" www.www.x.com ", "www.x.com"],
    ["wwwx.com", "wwwx.com"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeHost(input)).toBe(expected);
  });
});

describe("buildTables", () => {
  it("keeps only user_agent crawlers, longest token first, ties in file order", () => {
    const { crawlers } = buildTables(
      signals({
        crawlers: [
          crawler("a", "Bot"),
          crawler("b", "LongerBot"),
          crawler("c", "Ext-Token", { match: "robots_only" }),
          crawler("d", "Cat"),
        ],
      }),
    );
    expect(crawlers.map((row) => row[3])).toEqual(["LongerBot", "Bot", "Cat"]);
    expect(crawlers[0]).toEqual(["b", "v", "V", "LongerBot", "training", true]);
  });

  it("normalises referrer hosts", () => {
    const { referrers } = buildTables(
      signals({ referrers: [referrer("x", ["WWW.Chat.Example.", "chat2.example"])] }),
    );
    expect(referrers).toEqual([["x", "v", "V", "X", ["chat.example", "chat2.example"]]]);
  });

  it.each([
    ["unsupported schema_version", signals({ schema_version: 2 })],
    ["duplicate id", signals({ crawlers: [crawler("a", "A"), crawler("a", "B")] })],
    ["purpose", signals({ crawlers: [crawler("a", "A", { purpose: "spying" })] })],
    ["match", signals({ crawlers: [crawler("a", "A", { match: "header" })] })],
    ["token", signals({ crawlers: [crawler("a", "A", { token: 7 })] })],
    ["ai_specific", signals({ crawlers: [crawler("a", "A", { ai_specific: "yes" })] })],
    ["listed twice", signals({ referrers: [referrer("x", ["a.com"]), referrer("y", ["WWW.A.com"])] })],
    ["must not be empty", signals({ referrers: [referrer("x", [])] })],
    ["hosts[0]", signals({ referrers: [referrer("x", [""])] })],
  ])("rejects %s", (message, bad) => {
    expect(() => buildTables(bad)).toThrow(message);
  });

  it("covers every entry in the real signals.json", () => {
    const real = JSON.parse(
      readFileSync(new URL("../../../signals.json", import.meta.url), "utf8"),
    ) as { crawlers: { id: string; match: string }[]; referrers: { id: string }[] };
    const { crawlers, referrers } = buildTables(real);
    const uaIds = real.crawlers.filter((c) => c.match === "user_agent").map((c) => c.id);
    expect(crawlers.map((row) => row[0]).sort()).toEqual([...uaIds].sort());
    expect(referrers.map((row) => row[0])).toEqual(real.referrers.map((r) => r.id));
  });
});

describe("renderModule", () => {
  it("renders a typed, generated TS module", () => {
    expect(renderModule("REFERRERS", "ReferrerRow", [["x", "v", "V", "X", ["x.com"]]])).toBe(
      [
        "// Generated by scripts/codegen.ts from signals.json. Do not edit.",
        'import type { ReferrerRow } from "./types.js";',
        "",
        "export const REFERRERS: readonly ReferrerRow[] = [",
        '  ["x","v","V","X",["x.com"]],',
        "];",
        "",
      ].join("\n"),
    );
  });
});
```

- [ ] **Step 5: Install and run the tests to verify they fail**

Run: `cd js && pnpm install`

This creates `js/pnpm-lock.yaml` and must pass the 7-day `minimumReleaseAge`. If pnpm 11 reports that `onlyBuiltDependencies` is unknown or renamed, or that esbuild's build script was ignored, change the setting to the name pnpm prints in its message, then re-run until install is clean.

Run: `cd js/core && pnpm exec vitest run test/tables.test.ts`
Expected: FAIL, with the error `Cannot find module '../scripts/tables.ts'`.

- [ ] **Step 6: Implement `tables.ts` and `codegen.ts`**

`js/core/scripts/tables.ts`:

```ts
// Pure codegen logic: validate the fields the classifiers read and build
// compact tables. Full JSON Schema validation stays in pre-commit and the
// Python suite. Erasable TypeScript only: this runs under Node's type stripping.
import { normalizeHost } from "../src/host.ts";
import type { CrawlerRow, Purpose, ReferrerRow } from "../src/types.ts";

const PURPOSES: readonly string[] = ["training", "user_fetch", "search_index"];

export interface Tables {
  referrers: ReferrerRow[];
  crawlers: CrawlerRow[];
}

function fail(message: string): never {
  throw new Error(`signals.json: ${message}`);
}

function record(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${where} must be an object`);
  }
  return value as Record<string, unknown>;
}

function text(obj: Record<string, unknown>, key: string, where: string): string {
  const value = obj[key];
  if (typeof value !== "string" || value === "") fail(`${where}.${key} must be a non-empty string`);
  return value;
}

function list(obj: Record<string, unknown>, key: string, where: string): unknown[] {
  const value = obj[key];
  if (!Array.isArray(value)) fail(`${where}.${key} must be an array`);
  return value;
}

export function buildTables(signals: unknown): Tables {
  const root = record(signals, "root");
  if (root.schema_version !== 1) fail(`unsupported schema_version ${String(root.schema_version)}`);
  const ids = new Set<string>();
  const claim = (id: string, where: string): void => {
    if (ids.has(id)) fail(`${where}: duplicate id ${id}`);
    ids.add(id);
  };

  const crawlers: CrawlerRow[] = [];
  list(root, "crawlers", "root").forEach((raw, i) => {
    const where = `crawlers[${i}]`;
    const c = record(raw, where);
    const id = text(c, "id", where);
    claim(id, where);
    const match = text(c, "match", where);
    if (match !== "user_agent" && match !== "robots_only") {
      fail(`${where}.match must be user_agent or robots_only`);
    }
    const purpose = text(c, "purpose", where);
    if (!PURPOSES.includes(purpose)) fail(`${where}.purpose ${purpose} is not a known purpose`);
    const aiSpecific = c.ai_specific;
    if (typeof aiSpecific !== "boolean") fail(`${where}.ai_specific must be a boolean`);
    const token = text(c, "token", where);
    if (match === "user_agent") {
      crawlers.push([
        id,
        text(c, "vendor", where),
        text(c, "vendor_name", where),
        token,
        purpose as Purpose,
        aiSpecific,
      ]);
    }
  });
  // Longest token first, so a longer token wins over a shorter one it contains.
  // Array.prototype.sort is stable, so equal lengths keep signals.json order,
  // exactly like Python's list.sort(key=..., reverse=True).
  crawlers.sort((a, b) => b[3].length - a[3].length);

  const hosts = new Set<string>();
  const referrers = list(root, "referrers", "root").map((raw, i): ReferrerRow => {
    const where = `referrers[${i}]`;
    const r = record(raw, where);
    const id = text(r, "id", where);
    claim(id, where);
    const normalized = list(r, "hosts", where).map((h, j) => {
      if (typeof h !== "string" || h === "") fail(`${where}.hosts[${j}] must be a non-empty string`);
      const host = normalizeHost(h);
      if (hosts.has(host)) fail(`${where}: host ${host} is listed twice`);
      hosts.add(host);
      return host;
    });
    if (normalized.length === 0) fail(`${where}.hosts must not be empty`);
    return [id, text(r, "vendor", where), text(r, "vendor_name", where), text(r, "product", where), normalized];
  });
  return { referrers, crawlers };
}

export function renderModule(
  constName: string,
  typeName: "ReferrerRow" | "CrawlerRow",
  rows: readonly unknown[],
): string {
  const body = rows.map((row) => `  ${JSON.stringify(row)},`).join("\n");
  return [
    "// Generated by scripts/codegen.ts from signals.json. Do not edit.",
    `import type { ${typeName} } from "./types.js";`,
    "",
    `export const ${constName}: readonly ${typeName}[] = [`,
    body,
    "];",
    "",
  ].join("\n");
}
```

`js/core/scripts/codegen.ts`:

```ts
// signals.json -> src/referrers.gen.ts + src/crawlers.gen.ts (gitignored).
// Runs before every typecheck, test and build: `node scripts/codegen.ts`.
import { readFileSync, writeFileSync } from "node:fs";
import { buildTables, renderModule } from "./tables.ts";

const signals: unknown = JSON.parse(
  readFileSync(new URL("../../../signals.json", import.meta.url), "utf8"),
);
const { referrers, crawlers } = buildTables(signals);
writeFileSync(
  new URL("../src/referrers.gen.ts", import.meta.url),
  renderModule("REFERRERS", "ReferrerRow", referrers),
);
writeFileSync(
  new URL("../src/crawlers.gen.ts", import.meta.url),
  renderModule("CRAWLERS", "CrawlerRow", crawlers),
);
console.log(`codegen: ${referrers.length} referrers, ${crawlers.length} user-agent crawlers`);
```

- [ ] **Step 7: Run the tests, codegen and typecheck to verify they pass**

Run: `cd js && pnpm --filter @rastrolog/core run test`
Expected: first `codegen: 12 referrers, 26 user-agent crawlers`, then every test in `tables.test.ts` PASSES.

Run: `cd js && pnpm --filter @rastrolog/core run typecheck && pnpm run lint`
Expected: no errors. Fix anything Biome reports with `pnpm run format`, then re-run `pnpm run lint`. `git status` must not list `js/core/src/*.gen.ts`, because they're gitignored.

- [ ] **Step 8: Commit**

```bash
git add .gitignore js/package.json js/pnpm-workspace.yaml js/pnpm-lock.yaml js/tsconfig.base.json js/biome.json js/core
git commit -m "feat(js): pnpm workspace and signals.json codegen for @rastrolog/core"
```

---

### Task 2: TypeScript classifiers and shared conformance

**Files:**
- Modify: `js/core/src/host.ts` (add `hostOf`)
- Create: `js/core/src/referrer.ts`, `js/core/src/userAgent.ts`, `js/core/src/index.ts`
- Test: `js/core/test/host.test.ts`, `js/core/test/classify.test.ts`, `js/core/test/conformance.test.ts`
- Modify: `conformance/referrers.json` (new parity fixtures, inserted before the `""` case)

**Interfaces:**
- Consumes: `normalizeHost`, `REFERRERS`, `CRAWLERS`, `Match`, `ReferrerRow`, `CrawlerRow` (Task 1).
- Produces:
  - `hostOf(url: string): string | null`;
  - `classifyReferrer(url: string | null | undefined, options?: ReferrerOptions): Match | null`, where `interface ReferrerOptions { ownHost?: string | null | undefined }`;
  - `classifyUserAgent(ua: string | null | undefined): Match | null`;
  - `js/core/src/index.ts` exporting `hostOf`, `normalizeHost`, `classifyReferrer`, `classifyUserAgent` and the types `ReferrerOptions`, `Match`, `Purpose`, `ReferrerRow`, `CrawlerRow`.

- [ ] **Step 1: Add the parity fixtures to `conformance/referrers.json`**

Insert these lines immediately before `{ "referrer": "", "expect": null }`. Keep the one-case-per-line style:

```json
  { "referrer": "https:chatgpt.com", "expect": null, "note": "no '//' authority, so urlsplit finds no host. A WHATWG URL parser reads chatgpt.com here; the TS port must not." },
  { "referrer": "https://chatgpt.com:99999/", "expect": { "id": "chatgpt" }, "note": "an out-of-range port doesn't stop urlsplit reading the host, while WHATWG URL throws. The TS port must match urlsplit." },
  { "referrer": "https://evil.com\\@chatgpt.com/", "expect": { "id": "chatgpt" }, "note": "mirror of the chatgpt.com\\@evil.com case: urlsplit takes the host after the last '@'" },
  { "referrer": "https://user:pw@CHATGPT.com/", "expect": { "id": "chatgpt" }, "note": "userinfo is ignored; the host is lowercased" },
  { "referrer": "  https://chatgpt.com/\n", "expect": { "id": "chatgpt" }, "note": "surrounding whitespace is stripped" },
  { "referrer": "https://chat\tgpt.com/", "expect": { "id": "chatgpt" }, "note": "tab, CR and LF are deleted anywhere in the URL (urlsplit and WHATWG URL agree)" },
  { "referrer": "//chatgpt.com/", "expect": null, "note": "scheme-relative: no scheme" },
  { "referrer": "android-app://com.google.android.gm/", "expect": null, "note": "any scheme is accepted, but this host isn't listed" },
```

Run: `cd python && uv run pytest tests/test_conformance.py -q`
Expected: PASS. These expectations were checked against Python on 2026-09-29. If any of them fails, stop and report; don't change the expectation.

- [ ] **Step 2: Write the failing tests**

`js/core/test/host.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hostOf } from "../src/host.js";

// Expected values are Python's urllib.parse.urlsplit(url).hostname
// (null when there's no scheme or no host, or when urlsplit raises).
describe("hostOf mirrors urlsplit", () => {
  it.each([
    ["https://chatgpt.com/", "chatgpt.com"],
    ["HTTPS://CHATGPT.COM:443/c", "chatgpt.com"],
    ["https://user:pw@chatgpt.com/", "chatgpt.com"],
    ["https://evil.com\\@chatgpt.com/", "chatgpt.com"],
    ["https://chatgpt.com\\@evil.com/", "evil.com"],
    ["https://chat\tgpt.com/", "chatgpt.com"],
    ["https://[::1]:8080/", "::1"],
    ["https://chatgpt.com?x", "chatgpt.com"],
    ["https://chatgpt.com#x", "chatgpt.com"],
    ["https://chatgpt.com:99999/", "chatgpt.com"],
    ["android-app://com.google.android.gm/", "com.google.android.gm"],
    ["https:chatgpt.com", null],
    ["//chatgpt.com/", null],
    ["chatgpt.com", null],
    ["1https://chatgpt.com/", null],
    ["http://[::1", null],
    ["http://::1]/", null],
    ["https:///path", null],
    ["mailto:someone@chatgpt.com", null],
  ])("%j -> %j", (url, expected) => {
    expect(hostOf(url)).toBe(expected);
  });
});
```

`js/core/test/classify.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyReferrer, classifyUserAgent } from "../src/index.js";

const GPTBOT =
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.4; +https://openai.com/gptbot";

describe("Match shape", () => {
  it("referral", () => {
    expect(classifyReferrer("https://chatgpt.com/")).toEqual({
      kind: "referral",
      id: "chatgpt",
      vendor: "openai",
      vendorName: "OpenAI",
      product: "ChatGPT",
      aiSpecific: true,
    });
  });

  it("crawler", () => {
    expect(classifyUserAgent(GPTBOT)).toEqual({
      kind: "crawler",
      id: "openai-gptbot",
      vendor: "openai",
      vendorName: "OpenAI",
      token: "GPTBot",
      purpose: "training",
      aiSpecific: true,
    });
  });
});

describe("empty and missing input", () => {
  it.each([null, undefined, "", "   "])("classifyReferrer(%j) is null", (value) => {
    expect(classifyReferrer(value)).toBeNull();
  });

  it.each([null, undefined, "", "   "])("classifyUserAgent(%j) is null", (value) => {
    expect(classifyUserAgent(value)).toBeNull();
  });

  it("ownHost null, undefined or empty is ignored", () => {
    for (const ownHost of [null, undefined, ""]) {
      expect(classifyReferrer("https://chatgpt.com/", { ownHost })?.id).toBe("chatgpt");
    }
  });
});

describe("ownHost", () => {
  it("is exact-host after normalisation, not a subdomain match", () => {
    expect(classifyReferrer("https://www.chatgpt.com/", { ownHost: "chatgpt.com" })).toBeNull();
    expect(classifyReferrer("https://foo.chatgpt.com/", { ownHost: "chatgpt.com" })?.id).toBe(
      "chatgpt",
    );
  });
});
```

`js/core/test/conformance.test.ts`:

```ts
// The shared contract: every case in conformance/ must classify exactly as in Python.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyReferrer, classifyUserAgent } from "../src/index.js";

const load = <T>(path: string): T =>
  JSON.parse(readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8")) as T;

interface Expect {
  id: string;
}
interface UaCase {
  ua: string;
  expect: Expect | null;
}
interface ReferrerCase {
  referrer: string;
  own_host?: string;
  expect: Expect | null;
}
interface Signals {
  crawlers: { id: string; match: string }[];
  referrers: { id: string }[];
}

const UA_CASES = load<UaCase[]>("conformance/user_agents.json");
const REFERRER_CASES = load<ReferrerCase[]>("conformance/referrers.json");
const SIGNALS = load<Signals>("signals.json");

const covered = (cases: { expect: Expect | null }[]) =>
  new Set(cases.flatMap((c) => (c.expect ? [c.expect.id] : [])));

describe("user_agents.json", () => {
  it.each(UA_CASES)("$ua", (c) => {
    expect(classifyUserAgent(c.ua)?.id ?? null).toBe(c.expect?.id ?? null);
  });

  it("has a positive fixture for every user_agent crawler", () => {
    const ids = covered(UA_CASES);
    const missing = SIGNALS.crawlers.filter((c) => c.match === "user_agent" && !ids.has(c.id));
    expect(missing.map((c) => c.id)).toEqual([]);
  });
});

describe("referrers.json", () => {
  it.each(REFERRER_CASES)("$referrer (own_host: $own_host)", (c) => {
    expect(classifyReferrer(c.referrer, { ownHost: c.own_host })?.id ?? null).toBe(
      c.expect?.id ?? null,
    );
  });

  it("has a positive fixture for every referrer", () => {
    const ids = covered(REFERRER_CASES);
    expect(SIGNALS.referrers.filter((r) => !ids.has(r.id)).map((r) => r.id)).toEqual([]);
  });
});
```

Run: `cd js && pnpm --filter @rastrolog/core run test`
Expected: FAIL. `host.test.ts` fails because `hostOf` isn't exported; the others fail with `Cannot find module '../src/index.js'`.

- [ ] **Step 3: Implement `hostOf`, the classifiers and the index**

Append to `js/core/src/host.ts`:

```ts
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;

/**
 * The lowercased hostname of `url`, read the way Python's `urllib.parse.urlsplit`
 * reads it. Deliberately not WHATWG `URL`, which disagrees on inputs pinned in
 * conformance/referrers.json (for example `https:chatgpt.com` and an
 * out-of-range port). Returns null when there's no scheme, no `//` authority,
 * no host, or unbalanced IPv6 brackets (where urlsplit raises).
 */
export function hostOf(url: string): string | null {
  const s = url.replace(/[\t\r\n]/g, "");
  const scheme = SCHEME.exec(s);
  if (!scheme) return null;
  const rest = s.slice(scheme[0].length);
  if (!rest.startsWith("//")) return null;
  const netloc = rest.slice(2).split(/[/?#]/, 1)[0] ?? "";
  if (netloc.includes("[") !== netloc.includes("]")) return null;
  const hostPort = netloc.slice(netloc.lastIndexOf("@") + 1);
  const open = hostPort.indexOf("[");
  const host =
    open >= 0
      ? (hostPort.slice(open + 1).split("]", 1)[0] ?? "")
      : (hostPort.split(":", 1)[0] ?? "");
  return host ? host.toLowerCase() : null;
}
```

`js/core/src/referrer.ts`:

```ts
import { hostOf, normalizeHost } from "./host.js";
import { REFERRERS } from "./referrers.gen.js";
import type { Match, ReferrerRow } from "./types.js";

export interface ReferrerOptions {
  /** The site's own host. A referrer from exactly this host (after normalisation) is never a referral. */
  ownHost?: string | null | undefined;
}

function toMatch([id, vendor, vendorName, product]: ReferrerRow): Match {
  return { kind: "referral", id, vendor, vendorName, product, aiSpecific: true };
}

/** Classify a Referer header / `document.referrer`. Rules: conformance/README.md. */
export function classifyReferrer(
  url: string | null | undefined,
  options: ReferrerOptions = {},
): Match | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  const hostname = hostOf(trimmed);
  if (!hostname) return null;
  const host = normalizeHost(hostname);
  if (options.ownHost && host === normalizeHost(options.ownHost)) return null;
  const labels = host.split(".");
  for (let start = 0; start < labels.length - 1; start++) {
    const candidate = labels.slice(start).join(".");
    const row = REFERRERS.find((r) => r[4].includes(candidate));
    if (row) return toMatch(row);
  }
  return null;
}
```

`js/core/src/userAgent.ts`:

```ts
import { CRAWLERS } from "./crawlers.gen.js";
import type { CrawlerRow, Match } from "./types.js";

function toMatch([id, vendor, vendorName, token, purpose, aiSpecific]: CrawlerRow): Match {
  return { kind: "crawler", id, vendor, vendorName, token, purpose, aiSpecific };
}

/** Classify a User-Agent header. Case-insensitive; the longest matching token wins. */
export function classifyUserAgent(ua: string | null | undefined): Match | null {
  if (!ua || !ua.trim()) return null;
  const lowered = ua.toLowerCase();
  const row = CRAWLERS.find((r) => lowered.includes(r[3].toLowerCase()));
  return row ? toMatch(row) : null;
}
```

`js/core/src/index.ts`:

```ts
export { hostOf, normalizeHost } from "./host.js";
export { classifyReferrer, type ReferrerOptions } from "./referrer.js";
export type { CrawlerRow, Match, Purpose, ReferrerRow } from "./types.js";
export { classifyUserAgent } from "./userAgent.js";
```

- [ ] **Step 4: Run all checks to verify they pass**

Run: `cd js && pnpm --filter @rastrolog/core run test && pnpm run typecheck && pnpm run lint`
Expected: every test passes, including every line of `user_agents.json` and `referrers.json` (the new fixtures too), and typecheck and lint are clean.

Run: `cd python && uv run pytest -q`
Expected: every test passes.

- [ ] **Step 5: Commit**

```bash
git add conformance/referrers.json js/core
git commit -m "feat(js): TS classifiers passing the shared conformance suite

hostOf() mirrors Python's urlsplit instead of WHATWG URL, which disagrees on
schemeless-authority, out-of-range-port and backslash-userinfo referrers;
those inputs are now shared fixtures so both languages are held to them."
```

---

### Task 3: Analytics dispatchers

**Files:**
- Create: `js/snippet/package.json`, `js/snippet/tsconfig.json`, `js/snippet/vitest.config.ts`
- Create: `js/snippet/src/dispatch.ts`
- Test: `js/snippet/test/dispatch.test.ts`

**Interfaces:**
- Consumes: nothing from core yet; `package.json` declares `@rastrolog/core` for Task 4.
- Produces:
  - `interface AiTraffic { source: string; vendor: string; landing: boolean }`;
  - `interface AnalyticsWindow` (the optional `gtag`, `plausible`, `posthog`, `fathom`, `umami`, `_paq`, `dataLayer`);
  - `type Dispatcher = (w: AnalyticsWindow, source: string) => boolean`;
  - `DISPATCHERS: readonly Dispatcher[]`;
  - `dispatch(w: AnalyticsWindow, source: string, all: boolean): number`.

- [ ] **Step 1: Create the snippet package skeleton**

`js/snippet/package.json`:

```json
{
  "name": "rastrolog",
  "version": "0.1.1",
  "description": "Spot visitors from ChatGPT, Claude, Perplexity and other AI chat products, and send them to the analytics you already run. One script tag, under 2 KB.",
  "keywords": ["ai", "analytics", "referrer", "chatgpt", "perplexity", "claude", "ga4", "plausible", "posthog"],
  "license": "MIT",
  "homepage": "https://github.com/csmatar/rastrolog#readme",
  "bugs": "https://github.com/csmatar/rastrolog/issues",
  "repository": { "type": "git", "url": "git+https://github.com/csmatar/rastrolog.git", "directory": "js/snippet" },
  "type": "module",
  "sideEffects": ["./dist/snippet.min.js"],
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./snippet": "./dist/snippet.min.js",
    "./package.json": "./package.json"
  },
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "publishConfig": { "access": "public", "provenance": true },
  "scripts": {
    "codegen": "node ../core/scripts/codegen.ts",
    "typecheck": "pnpm run codegen && tsc -p tsconfig.json",
    "test": "pnpm run codegen && vitest run"
  },
  "devDependencies": {
    "@rastrolog/core": "workspace:*",
    "happy-dom": "^20.14.3"
  }
}
```

`js/snippet/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "types": ["node"], "allowImportingTsExtensions": true },
  "include": ["src", "test", "scripts", "bundle", "e2e", "*.config.ts"],
  "exclude": ["test/consumer"]
}
```

`js/snippet/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
```

Run: `cd js && pnpm install`
Expected: lockfile updated and install clean.

- [ ] **Step 2: Write the failing dispatcher tests**

`js/snippet/test/dispatch.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { type AnalyticsWindow, dispatch } from "../src/dispatch.js";

describe("each tool", () => {
  it("GA4 sends ai_referral and sets the user property", () => {
    const gtag = vi.fn();
    expect(dispatch({ gtag }, "chatgpt", false)).toBe(1);
    expect(gtag.mock.calls).toEqual([
      ["event", "ai_referral", { ai_source: "chatgpt" }],
      ["set", "user_properties", { ai_last_source: "chatgpt" }],
    ]);
  });

  it("Plausible sends the AI Referral goal with a source prop", () => {
    const plausible = vi.fn();
    dispatch({ plausible }, "claude", false);
    expect(plausible).toHaveBeenCalledWith("AI Referral", { props: { source: "claude" } });
  });

  it("PostHog captures and sets a person property", () => {
    const posthog = { capture: vi.fn(), setPersonProperties: vi.fn() };
    dispatch({ posthog }, "perplexity", false);
    expect(posthog.capture).toHaveBeenCalledWith("ai_referral", { source: "perplexity" });
    expect(posthog.setPersonProperties).toHaveBeenCalledWith({ ai_last_source: "perplexity" });
  });

  it("PostHog without setPersonProperties still captures", () => {
    const posthog = { capture: vi.fn() };
    expect(dispatch({ posthog }, "perplexity", false)).toBe(1);
    expect(posthog.capture).toHaveBeenCalledOnce();
  });

  it("Fathom puts the source in the event name", () => {
    const fathom = { trackEvent: vi.fn() };
    dispatch({ fathom }, "gemini", false);
    expect(fathom.trackEvent).toHaveBeenCalledWith("AI Referral - gemini");
  });

  it("Umami tracks ai_referral with a source", () => {
    const umami = { track: vi.fn() };
    dispatch({ umami }, "copilot", false);
    expect(umami.track).toHaveBeenCalledWith("ai_referral", { source: "copilot" });
  });

  it("Matomo pushes a trackEvent", () => {
    const _paq: unknown[] = [];
    dispatch({ _paq }, "grok", false);
    expect(_paq).toEqual([["trackEvent", "AI Referral", "grok"]]);
  });

  it("GTM-only pushes a dataLayer event", () => {
    const dataLayer: unknown[] = [];
    dispatch({ dataLayer }, "chatgpt", false);
    expect(dataLayer).toEqual([{ event: "ai_referral", ai_source: "chatgpt" }]);
  });
});

describe("order and data-all", () => {
  const everything = () => ({
    gtag: vi.fn(),
    plausible: vi.fn(),
    posthog: { capture: vi.fn() },
    fathom: { trackEvent: vi.fn() },
    umami: { track: vi.fn() },
    _paq: [] as unknown[],
    dataLayer: [] as unknown[],
  });

  it("first detected tool wins by default", () => {
    const w = everything();
    expect(dispatch(w, "chatgpt", false)).toBe(1);
    expect(w.gtag).toHaveBeenCalled();
    expect(w.plausible).not.toHaveBeenCalled();
    expect(w._paq).toEqual([]);
  });

  it("all sends to every detected tool, but GTM defers to gtag", () => {
    const w = everything();
    expect(dispatch(w, "chatgpt", true)).toBe(6);
    expect(w.plausible).toHaveBeenCalled();
    expect(w.posthog.capture).toHaveBeenCalled();
    expect(w.fathom.trackEvent).toHaveBeenCalled();
    expect(w.umami.track).toHaveBeenCalled();
    expect(w._paq).toHaveLength(1);
    expect(w.dataLayer).toEqual([]);
  });

  it("follows the documented order when gtag is absent", () => {
    const w: AnalyticsWindow = { _paq: [], dataLayer: [], umami: { track: vi.fn() } };
    dispatch(w, "chatgpt", false);
    expect(w.umami?.track).toHaveBeenCalled();
    expect(w._paq).toEqual([]);
  });

  it("returns 0 and does nothing when no tool is present", () => {
    expect(dispatch({}, "chatgpt", true)).toBe(0);
  });

  it("ignores non-function look-alikes", () => {
    const w = { gtag: "nope", posthog: {}, fathom: { trackEvent: 1 } } as unknown as AnalyticsWindow;
    expect(dispatch(w, "chatgpt", true)).toBe(0);
  });
});

describe("a throwing tool", () => {
  const boom = () => {
    throw new Error("analytics blew up");
  };

  it("counts as handled and never throws out", () => {
    const plausible = vi.fn();
    expect(() => dispatch({ gtag: vi.fn(boom), plausible }, "chatgpt", false)).not.toThrow();
    expect(plausible).not.toHaveBeenCalled();
  });

  it("does not stop the others under data-all", () => {
    const plausible = vi.fn();
    expect(dispatch({ gtag: vi.fn(boom), plausible }, "chatgpt", true)).toBe(2);
    expect(plausible).toHaveBeenCalled();
  });
});
```

Run: `cd js/snippet && pnpm exec vitest run test/dispatch.test.ts`
Expected: FAIL with `Cannot find module '../src/dispatch.js'`.

- [ ] **Step 3: Implement `dispatch.ts`**

`js/snippet/src/dispatch.ts`:

```ts
/** What the snippet exposes as `window.aiTraffic` and passes to the callback and event. */
export interface AiTraffic {
  /** Referrer id from signals.json, e.g. "chatgpt". */
  source: string;
  /** Vendor slug, e.g. "openai". */
  vendor: string;
  /** True on the page the visitor landed on from the AI product; false on later pages of the session. */
  landing: boolean;
}

type Props = Record<string, string>;

/** The analytics globals the snippet knows about. Every one is optional. */
export interface AnalyticsWindow {
  gtag?: (...args: unknown[]) => void;
  plausible?: (event: string, options?: { props?: Props }) => void;
  posthog?: {
    capture?: (event: string, properties?: Props) => void;
    setPersonProperties?: (properties: Props) => void;
  };
  fathom?: { trackEvent?: (name: string) => void };
  umami?: { track?: (event: string, data?: Props) => void };
  _paq?: unknown[];
  dataLayer?: unknown[];
}

/** Returns false when the tool isn't on the page; otherwise sends and returns true. */
export type Dispatcher = (w: AnalyticsWindow, source: string) => boolean;

// Verified against each vendor's docs on 2026-09-28 (see the Epic 2 spec).
const ga4: Dispatcher = (w, source) => {
  const { gtag } = w;
  if (typeof gtag !== "function") return false;
  gtag("event", "ai_referral", { ai_source: source });
  gtag("set", "user_properties", { ai_last_source: source });
  return true;
};

const plausible: Dispatcher = (w, source) => {
  if (typeof w.plausible !== "function") return false;
  w.plausible("AI Referral", { props: { source } });
  return true;
};

const posthog: Dispatcher = (w, source) => {
  const ph = w.posthog;
  if (typeof ph?.capture !== "function") return false;
  ph.capture("ai_referral", { source });
  if (typeof ph.setPersonProperties === "function") ph.setPersonProperties({ ai_last_source: source });
  return true;
};

const fathom: Dispatcher = (w, source) => {
  const f = w.fathom;
  if (typeof f?.trackEvent !== "function") return false;
  f.trackEvent(`AI Referral - ${source}`); // Fathom events carry no properties
  return true;
};

const umami: Dispatcher = (w, source) => {
  const u = w.umami;
  if (typeof u?.track !== "function") return false;
  u.track("ai_referral", { source });
  return true;
};

const matomo: Dispatcher = (w, source) => {
  if (!Array.isArray(w._paq)) return false;
  w._paq.push(["trackEvent", "AI Referral", source]);
  return true;
};

// gtag.js creates dataLayer too, so a gtag site is handled by ga4 and skipped here.
const gtm: Dispatcher = (w, source) => {
  if (!Array.isArray(w.dataLayer) || typeof w.gtag === "function") return false;
  w.dataLayer.push({ event: "ai_referral", ai_source: source });
  return true;
};

export const DISPATCHERS: readonly Dispatcher[] = [ga4, plausible, posthog, fathom, umami, matomo, gtm];

/**
 * Send the referral to the analytics tools on the page, in DISPATCHERS order.
 * The first detected tool wins unless `all`. A detected tool that throws still
 * counts as handled and never stops the others. Returns how many tools were detected.
 */
export function dispatch(w: AnalyticsWindow, source: string, all: boolean): number {
  let found = 0;
  for (const send of DISPATCHERS) {
    let hit: boolean;
    try {
      hit = send(w, source);
    } catch {
      hit = true;
    }
    if (hit) {
      found++;
      if (!all) break;
    }
  }
  return found;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd js && pnpm --filter rastrolog run test && pnpm run typecheck && pnpm run lint`
Expected: every test in `dispatch.test.ts` passes, and typecheck and lint are clean.

- [ ] **Step 5: Commit**

```bash
git add js/pnpm-lock.yaml js/snippet
git commit -m "feat(snippet): dispatchers for GA4, Plausible, PostHog, Fathom, Umami, Matomo and GTM"
```

---

### Task 4: Snippet runtime and entry point

**Files:**
- Create: `js/snippet/src/runtime.ts`, `js/snippet/src/snippet.ts`, `js/snippet/src/index.ts`
- Test: `js/snippet/test/runtime.test.ts`

**Interfaces:**
- Consumes:
  - `classifyReferrer(url, { ownHost })` and the types `Match`, `Purpose`, `ReferrerOptions` from `@rastrolog/core`;
  - `AiTraffic`, `AnalyticsWindow` and `dispatch(w, source, all)` from `./dispatch.js`.
- Produces:
  - the constants `STORAGE_KEY = "rastrolog"` and `EVENT_NAME = "rastrolog:match"`;
  - `type SnippetWindow = Window & typeof globalThis & AnalyticsWindow & { aiTraffic?: AiTraffic | null }`;
  - `interface ScriptOptions { hasAttribute(name: string): boolean; getAttribute(name: string): string | null }`;
  - `interface StartInput { win: SnippetWindow; referrer: string; hostname: string; script: ScriptOptions | null }`;
  - `start(input: StartInput): AiTraffic | null`;
  - `src/index.ts` exporting `classifyReferrer`, `classifyUserAgent` and the types `Match`, `Purpose`, `ReferrerOptions`.

- [ ] **Step 1: Write the failing runtime tests**

`js/snippet/test/runtime.test.ts`:

```ts
import { Window } from "happy-dom";
import { describe, expect, it, vi } from "vitest";
import { EVENT_NAME, type ScriptOptions, type SnippetWindow, STORAGE_KEY, start } from "../src/runtime.js";

const CHATGPT = "https://chatgpt.com/";

/** A fresh happy-dom window on https://site.test/ whose `load` hasn't fired yet. */
function makeWindow(readyState: DocumentReadyState = "loading"): SnippetWindow {
  const win = new Window({ url: "https://site.test/landing" }) as unknown as SnippetWindow;
  Object.defineProperty(win.document, "readyState", { value: readyState, configurable: true });
  return win;
}

function script(attrs: Record<string, string> = {}): ScriptOptions {
  return {
    hasAttribute: (name) => name in attrs,
    getAttribute: (name) => attrs[name] ?? null,
  };
}

const fireLoad = (win: SnippetWindow) => win.dispatchEvent(new win.Event("load"));

const run = (win: SnippetWindow, referrer: string, attrs?: Record<string, string>) =>
  start({ win, referrer, hostname: "site.test", script: attrs ? script(attrs) : script() });

describe("landing from an AI product", () => {
  it("sets aiTraffic immediately and remembers the source for the session", () => {
    const win = makeWindow();
    expect(run(win, CHATGPT)).toEqual({ source: "chatgpt", vendor: "openai", landing: true });
    expect(win.aiTraffic).toEqual({ source: "chatgpt", vendor: "openai", landing: true });
    expect(JSON.parse(win.sessionStorage.getItem(STORAGE_KEY) ?? "null")).toEqual({
      source: "chatgpt",
      vendor: "openai",
    });
  });

  it("dispatches only after load", () => {
    const win = makeWindow();
    win.gtag = vi.fn();
    run(win, CHATGPT);
    expect(win.gtag).not.toHaveBeenCalled();
    fireLoad(win);
    expect(win.gtag).toHaveBeenCalledWith("event", "ai_referral", { ai_source: "chatgpt" });
  });

  it("dispatches immediately when load already fired (Review Focus 2)", () => {
    const win = makeWindow("complete");
    win.gtag = vi.fn();
    run(win, CHATGPT);
    expect(win.gtag).toHaveBeenCalledTimes(2);
  });

  it("calls data-callback, then fires rastrolog:match", () => {
    const win = makeWindow("complete");
    const order: string[] = [];
    (win as unknown as Record<string, unknown>).onAi = vi.fn(() => order.push("callback"));
    win.addEventListener(EVENT_NAME, (event) => {
      order.push("event");
      expect((event as CustomEvent).detail).toEqual({ source: "chatgpt", vendor: "openai", landing: true });
    });
    run(win, CHATGPT, { "data-callback": "onAi" });
    expect(order).toEqual(["callback", "event"]);
  });

  it("data-all sends to every tool", () => {
    const win = makeWindow("complete");
    win.gtag = vi.fn();
    win.plausible = vi.fn();
    run(win, CHATGPT, { "data-all": "" });
    expect(win.plausible).toHaveBeenCalled();
  });

  it("a throwing callback or non-function callback never throws out", () => {
    const win = makeWindow("complete");
    const seen = vi.fn();
    win.addEventListener(EVENT_NAME, seen);
    (win as unknown as Record<string, unknown>).bad = () => {
      throw new Error("boom");
    };
    expect(() => run(win, CHATGPT, { "data-callback": "bad" })).not.toThrow();
    expect(seen).toHaveBeenCalledOnce();
    const win2 = makeWindow("complete");
    (win2 as unknown as Record<string, unknown>).notAFunction = 42;
    expect(() => run(win2, CHATGPT, { "data-callback": "notAFunction" })).not.toThrow();
  });
});

describe("later pages in the same session", () => {
  it("carries the source over with landing: false and dispatches nothing", () => {
    const win = makeWindow("complete");
    win.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ source: "claude", vendor: "anthropic" }));
    win.gtag = vi.fn();
    const seen = vi.fn();
    win.addEventListener(EVENT_NAME, seen);
    expect(run(win, "https://site.test/pricing")).toEqual({
      source: "claude",
      vendor: "anthropic",
      landing: false,
    });
    expect(win.gtag).not.toHaveBeenCalled();
    expect(seen).not.toHaveBeenCalled();
  });

  it("a new AI referral replaces the stored one and is a landing again", () => {
    const win = makeWindow("complete");
    win.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ source: "claude", vendor: "anthropic" }));
    expect(run(win, CHATGPT)?.source).toBe("chatgpt");
    expect(JSON.parse(win.sessionStorage.getItem(STORAGE_KEY) ?? "null").source).toBe("chatgpt");
  });

  it("no AI referral and nothing stored gives null", () => {
    const win = makeWindow("complete");
    expect(run(win, "https://www.google.com/")).toBeNull();
    expect(win.aiTraffic).toBeNull();
  });

  it("the site's own host is never a referral", () => {
    const win = makeWindow("complete");
    expect(start({ win, referrer: "https://chatgpt.com/x", hostname: "www.chatgpt.com", script: null })).toBeNull();
  });
});

describe("Review Focus", () => {
  it("1: storage that throws still sets aiTraffic and dispatches", () => {
    const win = makeWindow("complete");
    Object.defineProperty(win, "sessionStorage", {
      get() {
        throw new Error("SecurityError");
      },
    });
    win.gtag = vi.fn();
    expect(run(win, CHATGPT)?.landing).toBe(true);
    expect(win.gtag).toHaveBeenCalled();
    expect(run(makeWindowWithThrowingStorage(), "https://site.test/next")).toBeNull();
  });

  it("3: a second copy of the snippet does nothing", () => {
    const win = makeWindow("complete");
    win.gtag = vi.fn();
    run(win, CHATGPT);
    run(win, CHATGPT);
    expect(win.gtag).toHaveBeenCalledTimes(2); // event + user_properties, once
  });

  it("4: no currentScript uses the defaults", () => {
    const win = makeWindow("complete");
    win.gtag = vi.fn();
    win.plausible = vi.fn();
    expect(() => start({ win, referrer: CHATGPT, hostname: "site.test", script: null })).not.toThrow();
    expect(win.gtag).toHaveBeenCalled();
    expect(win.plausible).not.toHaveBeenCalled();
  });

  it.each(["not json", "null", "42", '{"source":1,"vendor":"x"}', '{"source":"x"}'])(
    "5: garbage in sessionStorage (%s) is treated as nothing stored",
    (stored) => {
      const win = makeWindow("complete");
      win.sessionStorage.setItem(STORAGE_KEY, stored);
      expect(run(win, "https://site.test/next")).toBeNull();
    },
  );
});

function makeWindowWithThrowingStorage(): SnippetWindow {
  const win = makeWindow("complete");
  Object.defineProperty(win, "sessionStorage", {
    get() {
      throw new Error("SecurityError");
    },
  });
  return win;
}
```

Run: `cd js/snippet && pnpm exec vitest run test/runtime.test.ts`
Expected: FAIL with `Cannot find module '../src/runtime.js'`.

- [ ] **Step 2: Implement `runtime.ts`, `snippet.ts` and `index.ts`**

`js/snippet/src/runtime.ts`:

```ts
import { classifyReferrer } from "@rastrolog/core";
import { type AiTraffic, type AnalyticsWindow, dispatch } from "./dispatch.js";

export const STORAGE_KEY = "rastrolog";
export const EVENT_NAME = "rastrolog:match";

export type SnippetWindow = Window &
  typeof globalThis &
  AnalyticsWindow & { aiTraffic?: AiTraffic | null };

/** The bits of the <script> element the snippet reads (document.currentScript). */
export interface ScriptOptions {
  hasAttribute(name: string): boolean;
  getAttribute(name: string): string | null;
}

export interface StartInput {
  win: SnippetWindow;
  referrer: string;
  hostname: string;
  script: ScriptOptions | null;
}

type Stored = Pick<AiTraffic, "source" | "vendor">;

function save(win: SnippetWindow, { source, vendor }: Stored): void {
  try {
    win.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ source, vendor }));
  } catch {
    // Storage blocked: attribution just won't carry over to later pages.
  }
}

function load(win: SnippetWindow): Stored | null {
  try {
    const value: unknown = JSON.parse(win.sessionStorage.getItem(STORAGE_KEY) ?? "null");
    if (typeof value === "object" && value !== null) {
      const { source, vendor } = value as Record<string, unknown>;
      if (typeof source === "string" && typeof vendor === "string") return { source, vendor };
    }
  } catch {
    // Blocked storage or a value we didn't write: treat as nothing stored.
  }
  return null;
}

function announce(win: SnippetWindow, traffic: AiTraffic, all: boolean, callback: string | null): void {
  dispatch(win, traffic.source, all);
  try {
    const fn = callback ? (win as unknown as Record<string, unknown>)[callback] : undefined;
    if (typeof fn === "function") fn(traffic);
  } catch {
    // The page's own callback failed; that's not ours to surface.
  }
  try {
    win.dispatchEvent(new win.CustomEvent(EVENT_NAME, { detail: traffic }));
  } catch {
    // Never throw into the host page.
  }
}

/**
 * Classify this page view, set `window.aiTraffic`, and on an AI landing send the
 * event after `load`. A second copy of the snippet on the same page does nothing.
 */
export function start({ win, referrer, hostname, script }: StartInput): AiTraffic | null {
  if (win.aiTraffic !== undefined) return win.aiTraffic;
  const match = classifyReferrer(referrer, { ownHost: hostname });
  let traffic: AiTraffic | null;
  if (match) {
    traffic = { source: match.id, vendor: match.vendor, landing: true };
    save(win, traffic);
  } else {
    const stored = load(win);
    traffic = stored ? { ...stored, landing: false } : null;
  }
  win.aiTraffic = traffic;
  if (traffic?.landing) {
    const landed = traffic;
    const all = script?.hasAttribute("data-all") ?? false;
    const callback = script?.getAttribute("data-callback") ?? null;
    const go = () => announce(win, landed, all, callback);
    if (win.document.readyState === "complete") go();
    else win.addEventListener("load", go, { once: true });
  }
  return traffic;
}
```

`js/snippet/src/snippet.ts`:

```ts
// The <script> tag entry, bundled as an IIFE into dist/snippet.min.js.
import { type SnippetWindow, start } from "./runtime.js";

try {
  start({
    win: window as SnippetWindow,
    referrer: document.referrer,
    hostname: location.hostname,
    script: document.currentScript,
  });
} catch {
  // Never throw into the host page.
}
```

`js/snippet/src/index.ts`:

```ts
// ESM entry of the npm package: the classifiers, without the script-tag runtime.
export { classifyReferrer, classifyUserAgent } from "@rastrolog/core";
export type { Match, Purpose, ReferrerOptions } from "@rastrolog/core";
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `cd js && pnpm --filter rastrolog run test && pnpm run typecheck && pnpm run lint`
Expected: the dispatch and runtime tests all pass, and typecheck and lint are clean. If happy-dom's `readyState` override doesn't take (for example, if the "dispatches only after load" test sees an immediate dispatch), set it through the same `Object.defineProperty` on `win.document` in `makeWindow` as shown. Don't change `runtime.ts` to suit the test.

- [ ] **Step 4: Commit**

```bash
git add js/snippet
git commit -m "feat(snippet): runtime with session carry-over, load scheduling, callback and rastrolog:match"
```

---

### Task 5: Build, published types, size gate and bundle scan

**Files:**
- Create: `js/snippet/scripts/build.ts`, `js/snippet/scripts/sri.ts`, `js/snippet/vitest.bundle.config.ts`
- Create: `js/snippet/bundle/bundle.test.ts`, `js/snippet/test/sri.test.ts`
- Create: `js/snippet/test/consumer/consumer.ts`, `js/snippet/test/consumer/tsconfig.json`
- Modify: `js/snippet/package.json` (scripts, devDependencies, `size-limit`)

**Interfaces:**
- Consumes: `src/snippet.ts`, `src/index.ts` and core's `tsconfig.build.json`.
- Produces:
  - `dist/snippet.min.js` (IIFE), `dist/index.js` (ESM), `dist/index.d.ts` and `dist/core/*.d.ts`;
  - the scripts `build`, `test:bundle`, `size` and `sri`;
  - `sriHash(bytes: Uint8Array): string`, `pinnedBlock(version: string, hash: string): string` and `replaceBlock(text: string, block: string): string`, plus the constants `SRI_START` and `SRI_END`, all in `scripts/sri.ts`.

- [ ] **Step 1: Add build tooling and scripts**

Merge into `js/snippet/package.json`:

```json
{
  "scripts": {
    "codegen": "node ../core/scripts/codegen.ts",
    "typecheck": "pnpm run codegen && tsc -p tsconfig.json",
    "test": "pnpm run codegen && vitest run",
    "build": "pnpm run codegen && node scripts/build.ts && tsc -p ../core/tsconfig.build.json --outDir dist/core",
    "test:bundle": "vitest run --config vitest.bundle.config.ts && tsc -p test/consumer/tsconfig.json",
    "size": "size-limit",
    "sri": "node scripts/sri.ts"
  },
  "devDependencies": {
    "@rastrolog/core": "workspace:*",
    "@size-limit/file": "^14.0.0",
    "esbuild": "^0.28.0",
    "happy-dom": "^20.14.3",
    "size-limit": "^14.0.0"
  },
  "size-limit": [{ "name": "snippet (gzip)", "path": "dist/snippet.min.js", "limit": "2 KB", "gzip": true }]
}
```

Run: `cd js && pnpm install`

- [ ] **Step 2: Write the failing bundle, SRI and consumer checks**

`js/snippet/vitest.bundle.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["bundle/**/*.test.ts"], environment: "node" },
});
```

`js/snippet/bundle/bundle.test.ts`:

```ts
// Runs against the built dist/: `pnpm run build && pnpm run test:bundle`.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const SNIPPET = read("dist/snippet.min.js");
const SIGNALS = JSON.parse(read("../../signals.json")) as {
  referrers: { hosts: string[] }[];
  crawlers: { token: string; match: string }[];
};

// Host nothing, store nothing: none of these may appear in the script-tag bundle.
const FORBIDDEN = [
  "fetch",
  "XMLHttpRequest",
  "sendBeacon",
  "WebSocket",
  "EventSource",
  "Image",
  "cookie",
  "localStorage",
  "indexedDB",
  "importScripts",
  "createElement",
  "eval",
];

describe("dist/snippet.min.js", () => {
  it.each(FORBIDDEN)("never references %s", (name) => {
    expect(SNIPPET).not.toMatch(new RegExp(`\\b${name}\\b`));
  });

  it("is a self-contained classic script", () => {
    expect(SNIPPET).not.toMatch(/\bimport\s*[({"']|\bexport\s/);
  });

  it("carries every referrer host from signals.json", () => {
    for (const host of SIGNALS.referrers.flatMap((r) => r.hosts)) {
      expect(SNIPPET).toContain(host.toLowerCase());
    }
  });

  it("does not bundle the crawler table (tree-shaken)", () => {
    for (const { token } of SIGNALS.crawlers.filter((c) => c.match === "user_agent")) {
      expect(SNIPPET).not.toContain(token);
    }
  });
});

describe("dist/index.js", () => {
  it("exports the classifiers and works", async () => {
    const mod = (await import("../dist/index.js")) as typeof import("../src/index.js");
    expect(mod.classifyReferrer("https://chatgpt.com/")?.id).toBe("chatgpt");
    expect(mod.classifyUserAgent("GPTBot/1.4")?.id).toBe("openai-gptbot");
  });
});
```

`js/snippet/test/sri.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pinnedBlock, replaceBlock, SRI_END, SRI_START, sriHash } from "../scripts/sri.ts";

describe("sri", () => {
  it("hashes like the SRI spec (sha384, base64)", () => {
    expect(sriHash(new TextEncoder().encode("abc"))).toBe(
      "sha384-ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP/W+2AhgcroefMI1i67KE0yCWn",
    );
  });

  it("renders the pinned script tag", () => {
    expect(pinnedBlock("0.2.0", "sha384-x")).toBe(
      [
        SRI_START,
        "```html",
        '<script src="https://cdn.jsdelivr.net/npm/rastrolog@0.2.0/dist/snippet.min.js" integrity="sha384-x" crossorigin="anonymous" defer></script>',
        "```",
        SRI_END,
      ].join("\n"),
    );
  });

  it("replaces only the marked block", () => {
    const text = `before\n${SRI_START}\nold\n${SRI_END}\nafter\n`;
    expect(replaceBlock(text, "NEW")).toBe("before\nNEW\nafter\n");
  });

  it("refuses a file without markers", () => {
    expect(() => replaceBlock("no markers here", "NEW")).toThrow("rastrolog:sri");
  });
});
```

`js/snippet/test/consumer/consumer.ts`:

```ts
// Typechecked against the *published* types (dist/), resolved through the
// package's own "exports" by name, exactly as a user's project would.
import { classifyReferrer, classifyUserAgent, type Match } from "rastrolog";

const referral: Match | null = classifyReferrer("https://chatgpt.com/", { ownHost: "example.com" });
const crawler: Match | null = classifyUserAgent("GPTBot/1.4");
export const ids: (string | undefined)[] = [referral?.id, crawler?.vendorName];
```

`js/snippet/test/consumer/tsconfig.json`:

```json
{
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "target": "ES2022",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": false,
    "types": []
  },
  "files": ["consumer.ts"]
}
```

Run: `cd js/snippet && pnpm exec vitest run test/sri.test.ts`
Expected: FAIL with `Cannot find module '../scripts/sri.ts'`.

- [ ] **Step 3: Implement `build.ts` and `sri.ts`**

`js/snippet/scripts/build.ts`:

```ts
// Builds dist/: the script-tag IIFE, the ESM entry, and index.d.ts (which
// re-exports core's declarations; `tsc` emits them into dist/core afterwards).
// Deterministic for a given lockfile: the release checks the SRI hash against it.
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const at = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));

rmSync(at("dist"), { recursive: true, force: true });
mkdirSync(at("dist"), { recursive: true });

const common = { bundle: true, target: "es2020", legalComments: "none", charset: "utf8" } as const;

await build({
  ...common,
  entryPoints: [at("src/snippet.ts")],
  outfile: at("dist/snippet.min.js"),
  format: "iife",
  platform: "browser",
  minify: true,
});

await build({
  ...common,
  entryPoints: [at("src/index.ts")],
  outfile: at("dist/index.js"),
  format: "esm",
  platform: "neutral",
});

writeFileSync(
  at("dist/index.d.ts"),
  [
    'export { classifyReferrer, classifyUserAgent } from "./core/index.js";',
    'export type { Match, Purpose, ReferrerOptions } from "./core/index.js";',
    "",
  ].join("\n"),
);

// npm packs LICENSE only from the package directory (gitignored copy).
copyFileSync(at("../../LICENSE"), at("LICENSE"));
```

`js/snippet/scripts/sri.ts`:

```ts
// Pinned-install block in the READMEs:
//   node scripts/sri.ts --write ../../README.md README.md   (release PR)
//   node scripts/sri.ts --check ../../README.md README.md   (release.yml)
// The block records the release in package.json "version" and the SHA-384 of
// dist/snippet.min.js, so run `pnpm run build` first.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const SRI_START = "<!-- rastrolog:sri:start -->";
export const SRI_END = "<!-- rastrolog:sri:end -->";

export function sriHash(bytes: Uint8Array): string {
  return `sha384-${createHash("sha384").update(bytes).digest("base64")}`;
}

export function pinnedBlock(version: string, hash: string): string {
  const src = `https://cdn.jsdelivr.net/npm/rastrolog@${version}/dist/snippet.min.js`;
  return [
    SRI_START,
    "```html",
    `<script src="${src}" integrity="${hash}" crossorigin="anonymous" defer></script>`,
    "```",
    SRI_END,
  ].join("\n");
}

export function replaceBlock(text: string, block: string): string {
  const start = text.indexOf(SRI_START);
  const end = text.indexOf(SRI_END);
  if (start < 0 || end < start) throw new Error(`missing ${SRI_START} ... ${SRI_END} markers`);
  return text.slice(0, start) + block + text.slice(end + SRI_END.length);
}

function main(argv: string[]): number {
  const [mode, ...files] = argv;
  if ((mode !== "--write" && mode !== "--check") || files.length === 0) {
    console.error("usage: sri.ts --write|--check FILE...");
    return 2;
  }
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    version: string;
  };
  const bundle = readFileSync(new URL("../dist/snippet.min.js", import.meta.url));
  const block = pinnedBlock(pkg.version, sriHash(bundle));
  let ok = true;
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const updated = replaceBlock(text, block);
    if (mode === "--write") {
      writeFileSync(file, updated);
      console.log(`sri: wrote ${file}`);
    } else if (updated !== text) {
      console.error(`sri: ${file} does not pin rastrolog@${pkg.version} with this build's hash`);
      ok = false;
    }
  }
  return ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
```

- [ ] **Step 4: Build and run every check to verify they pass**

Run: `cd js && pnpm --filter rastrolog run test`
Expected: the SRI tests pass.

Run: `cd js && pnpm --filter rastrolog run build && pnpm --filter rastrolog run test:bundle && pnpm --filter rastrolog run size`
Expected:
- `dist/` holds `snippet.min.js`, `index.js`, `index.d.ts` and `core/index.d.ts`;
- the bundle tests pass;
- the consumer typecheck is clean;
- size-limit reports a gzip size under 2 KB, with a result like `Size limit: 2 kB  Size: 1.x kB with gzip`.

If a forbidden-identifier test fails, the fix is in the source, not the list. If the size is over 2 KB, stop and report the number rather than raising the limit.

Run: `cd js && pnpm --filter rastrolog run build && shasum -a 384 snippet/dist/snippet.min.js && pnpm --filter rastrolog run build && shasum -a 384 snippet/dist/snippet.min.js`
Expected: both hashes are identical, which confirms the build is deterministic.

Run: `cd js && pnpm run typecheck && pnpm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add js/pnpm-lock.yaml js/snippet
git commit -m "build(snippet): esbuild IIFE + ESM, published types, 2 KB size gate, forbidden-API scan, SRI tool"
```

---

### Task 6: Playwright end-to-end tests with stub analytics

**Files:**
- Create: `js/snippet/playwright.config.ts`, `js/snippet/e2e/snippet.spec.ts`
- Create: the pages `js/snippet/e2e/pages/{ga4,plausible,posthog,next,callback}.html` and the stubs `js/snippet/e2e/pages/stubs/{ga4,plausible,posthog}.js`
- Modify: `js/snippet/package.json` (the `e2e` script and `@playwright/test`)

**Interfaces:**
- Consumes: the built `dist/snippet.min.js` from Task 5 (so run `pnpm --filter rastrolog run build` first).
- Produces: `pnpm --filter rastrolog run e2e`.

Approach: no web server. Playwright's `page.route` serves `https://site.test/**` from `e2e/pages`, and serves a one-link page at `https://chatgpt.com/`. Clicking the link is a real cross-origin HTTPS navigation, so the browser sets `document.referrer = "https://chatgpt.com/"` under its default referrer policy. No test hook exists in the product.

- [ ] **Step 1: Add Playwright**

Merge into `js/snippet/package.json`:

```json
{
  "scripts": { "e2e": "playwright test" },
  "devDependencies": { "@playwright/test": "^1.62.0" }
}
```

Run: `cd js && pnpm install && pnpm --filter rastrolog exec playwright install chromium`

- [ ] **Step 2: Write the pages, stubs and config**

The stubs mirror each vendor's own loader stub. Each one records calls so the test can read them.

`js/snippet/e2e/pages/stubs/ga4.js`:

```js
window.dataLayer = window.dataLayer || [];
window.gtag = function gtag() {
  window.dataLayer.push(arguments);
};
```

`js/snippet/e2e/pages/stubs/plausible.js`:

```js
window.plausible =
  window.plausible ||
  function plausible() {
    (window.plausible.q = window.plausible.q || []).push(Array.from(arguments));
  };
```

`js/snippet/e2e/pages/stubs/posthog.js`:

```js
window.posthog = {
  calls: [],
  capture(event, properties) {
    this.calls.push(["capture", event, properties]);
  },
  setPersonProperties(properties) {
    this.calls.push(["setPersonProperties", properties]);
  },
};
```

`js/snippet/e2e/pages/ga4.html`. The snippet comes first; the analytics stub is deferred after it, as on a real site:

```html
<!doctype html>
<meta charset="utf-8" />
<title>ga4</title>
<script src="/snippet.min.js" defer></script>
<script src="/stubs/ga4.js" defer></script>
<a id="next" href="/next.html">next</a>
```

`js/snippet/e2e/pages/plausible.html`:

```html
<!doctype html>
<meta charset="utf-8" />
<title>plausible</title>
<script src="/snippet.min.js" defer></script>
<script src="/stubs/plausible.js" defer></script>
```

`js/snippet/e2e/pages/posthog.html`:

```html
<!doctype html>
<meta charset="utf-8" />
<title>posthog</title>
<script src="/snippet.min.js" defer></script>
<script src="/stubs/posthog.js" defer></script>
```

`js/snippet/e2e/pages/next.html`:

```html
<!doctype html>
<meta charset="utf-8" />
<title>next</title>
<script src="/snippet.min.js" defer></script>
<script src="/stubs/ga4.js" defer></script>
```

`js/snippet/e2e/pages/callback.html`:

```html
<!doctype html>
<meta charset="utf-8" />
<title>callback</title>
<script>
  window.seen = [];
  window.onAi = (traffic) => window.seen.push(["callback", traffic]);
  addEventListener("rastrolog:match", (event) => window.seen.push(["event", event.detail]));
</script>
<script src="/snippet.min.js" data-callback="onAi" defer></script>
```

`js/snippet/playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? "github" : "list",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

- [ ] **Step 3: Write the e2e tests**

`js/snippet/e2e/snippet.spec.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

const SITE = "https://site.test";
const PAGES = new URL("./pages/", import.meta.url);
const SNIPPET = readFileSync(new URL("../dist/snippet.min.js", import.meta.url), "utf8");
const TYPES: Record<string, string> = { html: "text/html", js: "text/javascript" };

async function serveSite(page: Page) {
  await page.route(`${SITE}/**`, (route) => {
    const { pathname } = new URL(route.request().url());
    const file = new URL(`.${pathname}`, PAGES);
    if (pathname !== "/snippet.min.js" && !existsSync(file)) return route.fulfill({ status: 404 }); // e.g. /favicon.ico
    const body = pathname === "/snippet.min.js" ? SNIPPET : readFileSync(file, "utf8");
    return route.fulfill({ contentType: TYPES[pathname.split(".").pop() ?? ""] ?? "text/plain", body });
  });
}

/** Land on `path` by clicking a link on `from`, so the browser sets document.referrer. */
async function landFrom(page: Page, from: string, path: string) {
  await serveSite(page);
  await page.route(`${from}/`, (route) =>
    route.fulfill({ contentType: "text/html", body: `<a id="go" href="${SITE}${path}">go</a>` }),
  );
  await page.goto(`${from}/`);
  await Promise.all([page.waitForURL(`${SITE}${path}`), page.click("#go")]);
  await page.waitForLoadState("load");
}

const aiTraffic = (page: Page) => page.evaluate(() => (window as { aiTraffic?: unknown }).aiTraffic);

// Dispatch runs in a `load` listener, so positive tests wait for the stub to record calls.
// waitForFunction callbacks run in the page: keep them self-contained (no Node-side helpers).
type Recorded = { dataLayer?: unknown[]; plausible?: { q?: unknown[] }; posthog?: { calls: unknown[] }; seen?: unknown[] };

test("GA4 receives ai_referral and the user property", async ({ page }) => {
  await landFrom(page, "https://chatgpt.com", "/ga4.html");
  expect(await page.evaluate(() => document.referrer)).toBe("https://chatgpt.com/");
  await page.waitForFunction(() => ((window as unknown as Recorded).dataLayer?.length ?? 0) >= 2);
  expect(await aiTraffic(page)).toEqual({ source: "chatgpt", vendor: "openai", landing: true });
  const calls = await page.evaluate(() =>
    (window as unknown as { dataLayer: IArguments[] }).dataLayer.map((args) => Array.from(args)),
  );
  expect(calls).toEqual([
    ["event", "ai_referral", { ai_source: "chatgpt" }],
    ["set", "user_properties", { ai_last_source: "chatgpt" }],
  ]);
});

test("Plausible receives the AI Referral goal", async ({ page }) => {
  await landFrom(page, "https://claude.ai", "/plausible.html");
  await page.waitForFunction(() => ((window as unknown as Recorded).plausible?.q?.length ?? 0) >= 1);
  const queue = await page.evaluate(() => (window as unknown as { plausible: { q: unknown[] } }).plausible.q);
  expect(queue).toEqual([["AI Referral", { props: { source: "claude" } }]]);
});

test("PostHog captures and sets the person property", async ({ page }) => {
  await landFrom(page, "https://www.perplexity.ai", "/posthog.html");
  await page.waitForFunction(() => ((window as unknown as Recorded).posthog?.calls.length ?? 0) >= 2);
  const calls = await page.evaluate(() => (window as unknown as { posthog: { calls: unknown[] } }).posthog.calls);
  expect(calls).toEqual([
    ["capture", "ai_referral", { source: "perplexity" }],
    ["setPersonProperties", { ai_last_source: "perplexity" }],
  ]);
});

test("a non-AI referrer sends nothing", async ({ page }) => {
  await landFrom(page, "https://www.google.com", "/ga4.html");
  expect(await aiTraffic(page)).toBeNull();
  expect(await page.evaluate(() => (window as unknown as { dataLayer: unknown[] }).dataLayer)).toEqual([]);
});

test("the next page in the session carries the source without a second event", async ({ page }) => {
  await landFrom(page, "https://chatgpt.com", "/ga4.html");
  await Promise.all([page.waitForURL(`${SITE}/next.html`), page.click("#next")]);
  await page.waitForLoadState("load");
  expect(await aiTraffic(page)).toEqual({ source: "chatgpt", vendor: "openai", landing: false });
  expect(await page.evaluate(() => (window as unknown as { dataLayer: unknown[] }).dataLayer)).toEqual([]);
});

test("data-callback runs before the rastrolog:match event", async ({ page }) => {
  await landFrom(page, "https://chatgpt.com", "/callback.html");
  await page.waitForFunction(() => ((window as unknown as Recorded).seen?.length ?? 0) >= 2);
  const detail = { source: "chatgpt", vendor: "openai", landing: true };
  expect(await page.evaluate(() => (window as unknown as { seen: unknown[] }).seen)).toEqual([
    ["callback", detail],
    ["event", detail],
  ]);
});
```

- [ ] **Step 4: Run e2e to verify it passes**

Run: `cd js && pnpm --filter rastrolog run build && pnpm --filter rastrolog run e2e`
Expected: 6 passed.

If the first assertion shows `document.referrer` is `""`, Chromium didn't send a referrer for the routed navigation. Check that both origins are `https://`; the referrer is dropped on an HTTPS→HTTP downgrade. Don't add a test-only referrer override to the product.

Run: `cd js && pnpm run typecheck && pnpm run lint`
Expected: clean. The stubs deliberately copy each vendor's loader stub, including `arguments`. If Biome flags that (for example `noArguments`), add a `// biome-ignore lint/<group>/<rule>: mirrors the vendor's own loader stub` line above it; don't rewrite the stub's behaviour.

- [ ] **Step 5: Commit**

```bash
git add js/pnpm-lock.yaml js/snippet
git commit -m "test(snippet): Playwright e2e for GA4, Plausible, PostHog, carry-over and callback"
```

---

### Task 7: CI, security scanning, pre-commit and repo instructions

**Files:**
- Modify: `.github/workflows/ci.yml` (add the `js` and `e2e` jobs)
- Modify: `.github/workflows/codeql.yml` (add `javascript-typescript` to the matrix)
- Modify: `.github/dependabot.yml` (add the `npm` ecosystem)
- Modify: `.pre-commit-config.yaml` (add the `biome` and `tsc` hooks)
- Modify: `.claude/settings.json` (allow the new pnpm scripts)
- Modify: `CLAUDE.md` (JS commands and workflow notes)

**Interfaces:**
- Consumes: the root scripts `lint`, `typecheck`, `test` and `build`, plus the `rastrolog` scripts `test:bundle`, `size` and `e2e`.
- Produces: the CI check names `js` and `e2e (chromium)`, and `Analyze (javascript-typescript)` from CodeQL. The maintainer adds these to the `protect-main` required checks after merge (see the Maintainer steps).

- [ ] **Step 1: Add the CI jobs**

Append to the `jobs:` map in `.github/workflows/ci.yml`:

```yaml
  js:
    name: js
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: js
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0
        with:
          package_json_file: js/package.json # pnpm version comes from "packageManager"
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 24
          cache: pnpm
          cache-dependency-path: js/pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint
      - run: pnpm run typecheck
      - run: pnpm run test # includes the TS conformance suite
      - run: pnpm run build
      - run: pnpm --filter rastrolog run test:bundle # forbidden APIs, published types
      - run: pnpm --filter rastrolog run size # ≤ 2 KB gzipped
      - name: npm and PyPI versions match
        run: |
          npm_version="$(node -p "require('./snippet/package.json').version")"
          py_version="$(grep -m1 '^version' ../python/pyproject.toml | cut -d'"' -f2)"
          if [ "${npm_version}" != "${py_version}" ]; then
            echo "js/snippet is ${npm_version} but python is ${py_version}; they ship from one tag"
            exit 1
          fi

  e2e:
    name: e2e (chromium)
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: js
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0
        with:
          package_json_file: js/package.json
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 24
          cache: pnpm
          cache-dependency-path: js/pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter rastrolog exec playwright install --with-deps chromium
      - run: pnpm --filter rastrolog run build
      - run: pnpm --filter rastrolog run e2e
```

- [ ] **Step 2: Add CodeQL for JS/TS and Dependabot for npm**

In `.github/workflows/codeql.yml`, change the matrix line to:

```yaml
        language: [python, actions, javascript-typescript]
```

Also update the file's header comment: "for the Python package and for the GitHub Actions workflows themselves" becomes "for the Python package, the JS/TS workspace, and the GitHub Actions workflows themselves".

Append to `.github/dependabot.yml` under `updates:`, and add `# - npm: dev dependencies in js/pnpm-lock.yaml (the published package has no runtime deps).` to the header comment list:

```yaml
  - package-ecosystem: "npm"
    directory: "/js"
    schedule:
      interval: "weekly"
    commit-message:
      prefix: "chore(deps)"
    groups:
      js-dev:
        patterns: ["*"]
    open-pull-requests-limit: 5
    cooldown:
      default-days: 7
```

- [ ] **Step 3: Add the pre-commit hooks and Claude allowlist entries**

Append to the `repo: local` → `hooks:` list in `.pre-commit-config.yaml`:

```yaml
      - id: biome
        name: biome (js/)
        entry: pnpm --dir js run lint
        language: system
        pass_filenames: false
        files: ^js/
      - id: tsc
        name: tsc (js/)
        entry: pnpm --dir js run typecheck
        language: system
        pass_filenames: false
        files: ^(js/|signals\.json$)
```

Add these entries to `permissions.allow` in `.claude/settings.json`, after the existing `pnpm` lines. Keep the rest of the file byte-for-byte:

```json
      "Bash(pnpm run format)",
      "Bash(pnpm --filter rastrolog run test:bundle)",
      "Bash(pnpm --filter rastrolog run size)",
      "Bash(pnpm --filter rastrolog run e2e)",
      "Bash(pnpm --filter @rastrolog/core run codegen)",
```

- [ ] **Step 4: Document the JS workflow in `CLAUDE.md`**

In `## Commands`, after the Python block and before the "Pre-commit" line, add:

````markdown
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
````

In `## Repository workflow and security`, add this bullet after the Dependabot bullet:

```markdown
- JS supply chain: `pnpm install --frozen-lockfile` in CI, `minimumReleaseAge: 10080` and a build-script allowlist in `js/pnpm-workspace.yaml`. The published package has no runtime dependencies; keep it that way.
```

- [ ] **Step 5: Verify locally**

Run: `uvx zizmor --persona=pedantic .github/`
Expected: `No findings to report`. Fix any finding in the workflow itself; don't add ignore comments without a one-line justification in the same comment.

Run: `cd python && uv run pre-commit run --all-files`
Expected: all hooks pass, including the new `biome (js/)` and `tsc (js/)`.

Run: `python3 -c "import json; json.load(open('.claude/settings.json'))"`
Expected: exit 0, meaning the JSON is valid.

- [ ] **Step 6: Commit**

```bash
git add .github .pre-commit-config.yaml .claude/settings.json CLAUDE.md
git commit -m "ci(js): js and e2e jobs, CodeQL for JS/TS, Dependabot for npm, pre-commit hooks"
```

---

### Task 8: Release workflow publishes npm from the same tag

**Files:**
- Modify: `.github/workflows/release.yml`
- Modify: `CLAUDE.md` (`## Releasing`)

**Interfaces:**
- Consumes: the `rastrolog` scripts `build`, `test:bundle`, `size` and `sri --check`, plus `pnpm pack`.
- Produces: an `npm-dist` artifact holding `rastrolog-<version>.tgz`, and a `publish to npm` job in the `npm` environment.

- [ ] **Step 1: Extend the build job**

In `.github/workflows/release.yml`:
- update the header comment to "Publishes to PyPI and npm on a v* tag…";
- say that both publish jobs wait for approval in their environments (`pypi`, `npm`).

Then, in the `build` job, insert these steps **after** the "Wheel contains signals.json" step and **before** the existing `upload-artifact` step:

```yaml
      - uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0
        with:
          package_json_file: js/package.json
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 24
          package-manager-cache: false # no shared cache in the release path (cache-poisoning guard)
      - name: Tag matches npm package version
        run: |
          version="$(node -p "require('./js/snippet/package.json').version")"
          if [ "v${version}" != "${GITHUB_REF_NAME}" ]; then
            echo "tag ${GITHUB_REF_NAME} does not match npm package version v${version}"
            exit 1
          fi
      - name: Build and test the JS workspace
        working-directory: js
        run: |
          pnpm install --frozen-lockfile
          pnpm run typecheck
          pnpm run test
          pnpm run build
          pnpm --filter rastrolog run test:bundle
          pnpm --filter rastrolog run size
      - name: Pinned SRI tag in the READMEs matches this build
        working-directory: js
        run: pnpm --filter rastrolog run sri --check ../../README.md README.md
      - name: Pack the npm tarball
        working-directory: js/snippet
        run: pnpm pack --pack-destination ../../npm-dist
      - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: npm-dist
          path: npm-dist/
```

- [ ] **Step 2: Add the npm publish job**

Append to `jobs:`:

```yaml
  publish-npm:
    name: publish to npm
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: npm
      url: https://www.npmjs.com/package/rastrolog
    permissions:
      id-token: write # npm trusted publishing (OIDC) and provenance; nothing else
    steps:
      - uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1
        with:
          name: npm-dist
          path: npm-dist
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 24 # bundles npm 11 (trusted publishing needs >= 11.5.1)
          registry-url: https://registry.npmjs.org
          package-manager-cache: false
      - name: Publish the tarball built by the build job (no project code runs here)
        env:
          # First release only (v0.2.0): npm can't set up trusted publishing for a
          # package that doesn't exist yet, so this one-day token (a secret of the
          # `npm` environment) is used once. Remove this env block after the trusted
          # publisher is configured; see CLAUDE.md -> Releasing.
          NODE_AUTH_TOKEN: ${{ secrets.NPM_FIRST_PUBLISH_TOKEN }}
        run: npm publish npm-dist/rastrolog-*.tgz --provenance --access public --ignore-scripts
```

- [ ] **Step 3: Verify the workflow statically**

Run: `uvx zizmor --persona=pedantic .github/`
Expected: `No findings to report`.

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release.yml'))"`. If PyYAML is missing, use `cd python && uv run python -c "…"`.
Expected: exit 0.

Dry-run the packing locally:

Run: `cd js && pnpm --filter rastrolog run build && cd snippet && pnpm pack --pack-destination /tmp/rastrolog-pack && tar -tzf /tmp/rastrolog-pack/rastrolog-0.1.1.tgz`
Expected: the list contains:
- `package/package.json`, `package/README.md` and `package/LICENSE`;
- `package/dist/snippet.min.js`, `package/dist/index.js` and `package/dist/index.d.ts`;
- `package/dist/core/index.d.ts`.

Nothing from `src/`, `test/` or `e2e/` should appear. If README.md is missing, that's expected until Task 9. Delete `/tmp/rastrolog-pack` afterwards.

- [ ] **Step 4: Update `CLAUDE.md` → `## Releasing`**

Replace the numbered steps with:

```markdown
1. Bump `version` in `python/pyproject.toml` **and** `js/snippet/package.json` to the same value, then run `cd python && uv lock`.
2. In `CHANGELOG.md`, rename **Unreleased** to `[x.y.z] - YYYY-MM-DD` and start a new empty **Unreleased**.
3. Pin the new snippet in the READMEs: `cd js && pnpm install --frozen-lockfile && pnpm --filter rastrolog run build && pnpm --filter rastrolog run sri --write ../../README.md README.md`.
4. Merge the PR to `main`, then tag `vX.Y.Z` on `main` and push the tag (only admins can create `v*` tags). `release.yml` does the rest:
   - checks that the tag matches both versions and the README SRI hash;
   - runs both test suites and builds both packages;
   - waits for a maintainer to approve each of the `pypi` and `npm` deployments;
   - publishes through trusted publishing, with provenance on npm.
```

After the "Configured (0.1.0 shipped with it)" paragraph, add:

```markdown
npm (first release, 0.2.0): trusted publishing can only be set up for an existing package. Before tagging v0.2.0:
1. Create the GitHub `npm` environment (required reviewer `@csmatar`, `v*` tags only).
2. Store a granular npm token that expires in 1 day as its secret `NPM_FIRST_PUBLISH_TOKEN`.

After v0.2.0 is on npm:
1. Add the trusted publisher on npmjs.com (repo `csmatar/rastrolog`, workflow `release.yml`, environment `npm`).
2. Delete the token and the secret, and set the package to disallow token publishing.
3. Open a PR that removes the `NODE_AUTH_TOKEN` env block from `release.yml`.
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release.yml CLAUDE.md
git commit -m "ci(release): publish npm from the same tag, gated by the npm environment

The build job tests, builds, checks the README SRI pin and packs the tarball
with read-only rights; the publish job has only id-token: write and runs no
project code. v0.2.0 uses a one-day token because npm trusted publishing
needs an existing package; the follow-up removes it."
```

---

### Task 9: Documentation and changelog

**Files:**
- Create: `js/snippet/README.md`
- Modify: `README.md` (new "In the browser" section)
- Modify: `CHANGELOG.md` (Unreleased)
- Modify: `CONTRIBUTING.md` (JS setup)

**Interfaces:**
- Consumes: the script-tag contract (Global Constraints), `SRI_START`/`SRI_END` (Task 5) and the release flow (Task 8).
- Produces: README text containing the SRI markers, in both READMEs.

- [ ] **Step 1: Write `js/snippet/README.md`**

Write this npm README (it's also what jsDelivr and npmjs.com show):

````markdown
# rastrolog

**Spot visitors from ChatGPT, Claude, Perplexity and other AI chat products, and send them to the analytics you already run.**

One script tag, under 2 KB gzipped. It reads `document.referrer`, and when a visitor arrives from an AI chat product it sends one `ai_referral` event to your analytics. It makes no network requests of its own, sets no cookies and uses no `localStorage`.

```html
<script src="https://cdn.jsdelivr.net/npm/rastrolog@0/dist/snippet.min.js" defer></script>
```

`@0` always serves the latest 0.x release, so new AI products are picked up automatically. For Subresource Integrity, pin an exact version instead:

<!-- rastrolog:sri:start -->
The pinned tag with its `integrity` hash is written here when the first npm release (0.2.0) is published.
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

The event is sent once, on the page the visitor lands on, after the page's `load` event, so analytics scripts loaded with `defer` or `async` are ready.

## Use it in your own code

```js
window.aiTraffic; // { source: "chatgpt", vendor: "openai", landing: true } or null
```

- `landing` is `true` on the landing page and `false` on later pages in the same tab session. The source is kept in `sessionStorage` under the key `rastrolog`.
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
````

- [ ] **Step 2: Add a browser section to the root `README.md`**

Insert a new section after `## Use` (and its code block) and before the next `##` heading:

````markdown
## In the browser

A script tag that sends an `ai_referral` event to the analytics you already run (GA4, Plausible, PostHog, Fathom, Umami, Matomo or Google Tag Manager). It's under 2 KB and makes no requests of its own:

```html
<script src="https://cdn.jsdelivr.net/npm/rastrolog@0/dist/snippet.min.js" defer></script>
```

Pinned, with Subresource Integrity:

<!-- rastrolog:sri:start -->
The pinned tag with its `integrity` hash is written here when the first npm release (0.2.0) is published.
<!-- rastrolog:sri:end -->

See [`js/snippet/README.md`](js/snippet/README.md) for what each analytics tool receives, `window.aiTraffic`, and the `rastrolog:match` event.
````

- [ ] **Step 3: Update `CHANGELOG.md` and `CONTRIBUTING.md`**

Under `## [Unreleased]` in `CHANGELOG.md`, add an `### Added` section above the existing sections:

```markdown
### Added

- npm package `rastrolog` (#2):
  - a script tag under 2 KB gzipped that sends an `ai_referral` event to GA4, Plausible, PostHog, Fathom, Umami, Matomo or Google Tag Manager;
  - `window.aiTraffic`, a `data-callback` attribute and a `rastrolog:match` event;
  - an ESM `classifyReferrer` / `classifyUserAgent` that passes the same conformance suite as the Python package.
- Conformance: referrer fixtures that pin Python's `urlsplit` behaviour where a WHATWG URL parser disagrees (`https:chatgpt.com`, out-of-range ports, backslash before `@`, whitespace and tabs).
```

In `CONTRIBUTING.md`, add a subsection for the JS workspace after the Python setup instructions. It covers Node 24, `cd js && pnpm install`, the commands from CLAUDE.md's JS block, and this rule: "Classifier changes must keep `js/core` and `python/` passing the same `conformance/` fixtures; a new edge case goes into `conformance/` so both languages test it."

Read `CONTRIBUTING.md` first and match its heading levels and tone.

- [ ] **Step 4: Verify**

Run: `cd js && pnpm --filter rastrolog run build && pnpm --filter rastrolog run sri --check ../../README.md README.md; echo "exit $?"`
Expected: `exit 1`. Both files report that they don't pin `rastrolog@0.1.1`. That's correct: the block is filled in by the 0.2.0 release PR, and the check only runs in `release.yml`.

Run: `cd js && pnpm --filter rastrolog run build && cd snippet && pnpm pack --pack-destination /tmp/rastrolog-pack && tar -tzf /tmp/rastrolog-pack/rastrolog-0.1.1.tgz | grep README && rm -rf /tmp/rastrolog-pack`
Expected: `package/README.md`.

Run: `cd python && uv run pre-commit run --all-files`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add js/snippet/README.md README.md CHANGELOG.md CONTRIBUTING.md
git commit -m "docs: snippet README, browser install section, changelog and contributing notes"
```

---

## Maintainer steps (not agent tasks)

Do these in order; each needs repository or registry admin rights.

1. **Before merging the epic PR:** do the manual checks from the spec, by loading the built snippet on a test page that has each real tool installed:
   - GA4 DebugView shows `ai_referral`;
   - PostHog live events shows `ai_referral`;
   - Plausible realtime shows `AI Referral`.
   Record the results in the PR.
2. **After the epic PR merges and `main` is green:** add `js`, `e2e (chromium)` and `Analyze (javascript-typescript)` to the required checks of the `protect-main` ruleset.
3. **Release 0.2.0:**
   1. Create the `npm` environment and the `NPM_FIRST_PUBLISH_TOKEN` secret (CLAUDE.md → Releasing).
   2. Open the release PR (version bump to 0.2.0, CHANGELOG, `sri --write`).
   3. Merge it, tag `v0.2.0` and approve both deployments.
4. **After 0.2.0 is on npm:** add the trusted publisher, delete the token and the secret, disallow token publishing, and merge the PR that removes `NODE_AUTH_TOKEN` from `release.yml`.
