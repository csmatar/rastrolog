import { spawnSync } from "node:child_process";
import { mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type Deps, publicResolver, verifyLive } from "../scripts/verify-live.ts";

const ORIGIN = "https://rastrolog.com";
const PAGES_DEV = "https://rastrolog.pages.dev";
const CSP = "default-src 'self'";

const html = (path: string, form = "123456") =>
  `<!doctype html><link rel="canonical" href="${ORIGIN}${path}"><form method="post" action="https://app.kit.com/forms/${form}/subscriptions" data-action-general="https://app.kit.com/forms/${form}/subscriptions" data-action-latam="https://app.kit.com/forms/654321/subscriptions">`;

function deps(
  over: {
    responses?: Record<string, Response>;
    mx?: { exchange: string; priority: number }[];
    txt?: string[][];
    ns?: string[];
  } = {},
): Deps {
  const page = (path: string) => () =>
    new Response(html(path), {
      status: 200,
      headers: {
        "content-security-policy": CSP,
        "strict-transport-security": "max-age=31536000; includeSubDomains",
        "x-content-type-options": "nosniff",
      },
    });
  const responses: Record<string, () => Response> = {
    [`${ORIGIN}/`]: page("/"),
    [`${ORIGIN}/es/`]: page("/es/"),
    "https://www.rastrolog.com/es/?check=example.com": () =>
      new Response(null, { status: 301, headers: { location: `${ORIGIN}/es/?check=example.com` } }),
    [`${PAGES_DEV}/`]: () =>
      new Response("", { status: 200, headers: { "x-robots-tag": "noindex" } }),
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
    resolveNs: async () => over.ns ?? ["ada.ns.cloudflare.com", "bob.ns.cloudflare.com"],
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
      ns: ["curitiba.ns.porkbun.com", "maceio.ns.porkbun.com"],
    });
    expect(await failing(d)).toEqual([
      "GET /es/",
      "canonical links",
      "www redirects to the apex",
      "pages.dev is noindex",
      "nameservers on Cloudflare",
      "email forwarding (MX)",
      "SPF",
    ]);
  });

  it("catches a production build made without the production variables", async () => {
    const preview = html("/", "test-general").replace(
      `${ORIGIN}/`,
      "https://4f2a.rastrolog.pages.dev/",
    );
    const d = deps({
      responses: {
        [`${ORIGIN}/`]: new Response(preview, {
          status: 200,
          headers: {
            "content-security-policy": CSP,
            "strict-transport-security": "max-age=31536000; includeSubDomains",
            "x-content-type-options": "nosniff",
            "x-robots-tag": "noindex",
          },
        }),
      },
    });
    const checks = await verifyLive(ORIGIN, PAGES_DEV, CSP, d);
    expect(checks.filter((c) => !c.ok)).toEqual([
      { name: "site is indexable", ok: false, detail: "X-Robots-Tag: noindex" },
      { name: "canonical links", ok: false, detail: "/ → https://4f2a.rastrolog.pages.dev/" },
      {
        name: "Kit forms",
        ok: false,
        detail: "placeholder form: https://app.kit.com/forms/test-general/subscriptions",
      },
    ]);
  });

  it("looks up DNS through public resolvers, not the machine's", () => {
    expect(publicResolver().getServers()).toEqual(["1.1.1.1", "8.8.8.8"]);
  });

  it("runs as a CLI when reached through a symlink", () => {
    const dir = mkdtempSync(join(tmpdir(), "verify-live-"));
    const link = join(dir, "verify-live.ts");
    symlinkSync(fileURLToPath(new URL("../scripts/verify-live.ts", import.meta.url)), link);
    const run = spawnSync(process.execPath, [link, "http://localhost:9", "http://localhost:9"], {
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(run.stdout).toContain("FAIL GET /:");
    expect(run.status).toBe(1);
  }, 40_000);

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
