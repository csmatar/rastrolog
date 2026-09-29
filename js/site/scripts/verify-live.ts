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

  for (const path of ["/", "/es/"]) {
    await check(`GET ${path}`, async () => {
      const res = await get(`${origin}${path}`);
      return [res.status === 200, `HTTP ${res.status}`];
    });
  }
  await check("security headers", async () => {
    const h = (await get(`${origin}/`)).headers;
    const problems = [
      h.get("content-security-policy") === csp
        ? null
        : "Content-Security-Policy differs from _headers",
      (h.get("strict-transport-security") ?? "").includes("max-age=31536000") ? null : "no HSTS",
      h.get("x-content-type-options") === "nosniff" ? null : "no nosniff",
    ].filter((p): p is string => p !== null);
    return [problems.length === 0, problems.length === 0 ? "all present" : problems.join("; ")];
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
