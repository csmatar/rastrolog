import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { headerFor, parseHeaders, readHeadersFile } from "../scripts/headers-file.ts";

const CSP =
  "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self' https:; form-action https://app.kit.com; frame-src https://www.youtube-nocookie.com; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'";

describe("public/_headers", () => {
  const rules = readHeadersFile();

  it("sets the spec's security headers on every page", () => {
    expect(headerFor(rules, "/*", "Content-Security-Policy")).toBe(CSP);
    expect(headerFor(rules, "/*", "Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains",
    );
    expect(headerFor(rules, "/*", "X-Content-Type-Options")).toBe("nosniff");
    expect(headerFor(rules, "/*", "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headerFor(rules, "/*", "Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
  });

  it("caches hashed assets for a year", () => {
    expect(headerFor(rules, "/_astro/*", "Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
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
