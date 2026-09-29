// Checks the live site after a deploy or a DNS change: both pages, the production
// headers, that the build had its production variables (canonical links, real Kit
// forms), the www redirect, pages.dev noindex, the nameservers, and that Porkbun's
// email forwarding survived the nameserver move.
// Run: pnpm --filter @rastrolog/site run verify-live [origin] [pagesDev]
import { Resolver } from "node:dns/promises";
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
  resolveNs(host: string): Promise<string[]>;
}

interface Page {
  status: number;
  headers: Headers;
  html: string;
}

const PAGES = ["/", "/es/"];
const KIT_FORM = /^https:\/\/app\.kit\.com\/forms\/\d+\/subscriptions$/;

// The machine's resolver may rewrite answers (a router or VPN), and would hide a
// missing MX record behind its cache, so DNS goes to public resolvers.
export function publicResolver(): Resolver {
  const resolver = new Resolver({ timeout: 3000, tries: 2 });
  resolver.setServers(["1.1.1.1", "8.8.8.8"]);
  return resolver;
}

export async function verifyLive(
  origin: string,
  pagesDev: string,
  csp: string,
  deps: Deps,
): Promise<Check[]> {
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
  const pages = new Map<string, Promise<Page>>();
  const page = (path: string): Promise<Page> => {
    let loaded = pages.get(path);
    if (loaded === undefined) {
      loaded = get(`${origin}${path}`).then(async (res) => ({
        status: res.status,
        headers: res.headers,
        html: await res.text(),
      }));
      pages.set(path, loaded);
    }
    return loaded;
  };

  for (const path of PAGES) {
    await check(`GET ${path}`, async () => {
      const { status } = await page(path);
      return [status === 200, `HTTP ${status}`];
    });
  }
  await check("security headers", async () => {
    const h = (await page("/")).headers;
    const problems = [
      h.get("content-security-policy") === csp
        ? null
        : "Content-Security-Policy differs from _headers",
      (h.get("strict-transport-security") ?? "").includes("max-age=31536000") ? null : "no HSTS",
      h.get("x-content-type-options") === "nosniff" ? null : "no nosniff",
    ].filter((p): p is string => p !== null);
    return [problems.length === 0, problems.length === 0 ? "all present" : problems.join("; ")];
  });
  await check("site is indexable", async () => {
    const tag = (await page("/")).headers.get("x-robots-tag");
    return [tag === null, tag === null ? "no X-Robots-Tag" : `X-Robots-Tag: ${tag}`];
  });
  // A build without SITE_URL falls back to the deployment's pages.dev URL.
  await check("canonical links", async () => {
    const wrong: string[] = [];
    for (const path of PAGES) {
      const href = /<link rel="canonical" href="([^"]*)"/.exec((await page(path)).html)?.[1];
      if (href !== `${origin}${path}`) wrong.push(`${path} → ${href ?? "none"}`);
    }
    return [wrong.length === 0, wrong.length === 0 ? "both point at the origin" : wrong.join("; ")];
  });
  // A build without the Kit IDs ships placeholder forms that can't subscribe anyone.
  await check("Kit forms", async () => {
    const actions = new Set<string>();
    for (const path of PAGES) {
      for (const m of (await page(path)).html.matchAll(
        /(?:action|data-action-general|data-action-latam)="(https:\/\/app\.kit\.com\/[^"]*)"/g,
      )) {
        actions.add(m[1] ?? "");
      }
    }
    const placeholders = [...actions].filter((a) => !KIT_FORM.test(a));
    if (actions.size === 0) return [false, "no Kit form found"];
    return [
      placeholders.length === 0,
      placeholders.length === 0
        ? `${actions.size} form actions`
        : `placeholder form: ${placeholders.join(", ")}`,
    ];
  });
  await check("www redirects to the apex", async () => {
    const res = await get(`https://www.${host}/es/?check=example.com`);
    const location = res.headers.get("location");
    return [
      res.status === 301 && location === `${origin}/es/?check=example.com`,
      `HTTP ${res.status} → ${location}`,
    ];
  });
  await check("pages.dev is noindex", async () => {
    const tag = (await get(`${pagesDev}/`)).headers.get("x-robots-tag") ?? "";
    return [tag.includes("noindex"), tag === "" ? "no X-Robots-Tag" : tag];
  });
  await check("nameservers on Cloudflare", async () => {
    const ns = (await deps.resolveNs(host)).map((n) => n.toLowerCase()).sort();
    return [ns.length > 0 && ns.every((n) => n.endsWith(".ns.cloudflare.com")), ns.join(", ")];
  });
  await check("email forwarding (MX)", async () => {
    const mx = (await deps.resolveMx(host))
      .map((r) => `${r.priority} ${r.exchange.toLowerCase()}`)
      .sort();
    return [
      mx.includes("10 fwd1.porkbun.com") && mx.includes("20 fwd2.porkbun.com"),
      mx.join(", "),
    ];
  });
  await check("SPF", async () => {
    const spf = (await deps.resolveTxt(host))
      .map((parts) => parts.join(""))
      .find((t) => t.startsWith("v=spf1"));
    return [spf?.includes("include:_spf.porkbun.com") === true, spf ?? "no SPF record"];
  });
  return checks;
}

// import.meta.main, not an argv[1] comparison, which fails through a symlinked path.
if (import.meta.main) {
  const origin = process.argv[2] ?? "https://rastrolog.com";
  const pagesDev = process.argv[3] ?? "https://rastrolog.pages.dev";
  const csp = headerFor(readHeadersFile(), "/*", "Content-Security-Policy") ?? "";
  const dns = publicResolver();
  const checks = await verifyLive(origin, pagesDev, csp, {
    fetch: (url, init) => fetch(url, init),
    resolveMx: (host) => dns.resolveMx(host),
    resolveTxt: (host) => dns.resolveTxt(host),
    resolveNs: (host) => dns.resolveNs(host),
  });
  for (const c of checks) console.log(`${c.ok ? "ok  " : "FAIL"} ${c.name}: ${c.detail}`);
  process.exit(checks.every((c) => c.ok) ? 0 : 1);
}
