import { describe, expect, it } from "vitest";
import { normalizeDomainInput } from "../src/domain.js";
import { summarizeLlmsTxt } from "../src/llms.js";

describe("summarizeLlmsTxt", () => {
  it("reads the first H1 and counts Markdown links", () => {
    const text =
      "# Example Docs\n\n> Summary\n\n## Docs\n- [Start](https://example.com/start): intro\n- [API](/api.md)\n\n# Second heading\n";
    expect(summarizeLlmsTxt(text)).toEqual({ title: "Example Docs", links: 2 });
  });

  it("no H1 and no links", () => {
    expect(summarizeLlmsTxt("## Only an H2\nplain text")).toEqual({ title: null, links: 0 });
  });

  it("counts links exactly as the Markdown link pattern matches them", () => {
    const LINK = /\[[^\]\n]*\]\([^)\s]+\)/g;
    const alphabet = ["[", "]", "(", ")", "a", " ", "\n"];
    let seed = 1;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed;
    };
    for (let n = 0; n < 2000; n++) {
      let text = "";
      const length = next() % 24;
      for (let k = 0; k < length; k++) text += alphabet[next() % alphabet.length];
      expect(summarizeLlmsTxt(text).links, JSON.stringify(text)).toBe(
        text.match(LINK)?.length ?? 0,
      );
    }
  });

  it("stays fast on hostile input", () => {
    const started = performance.now();
    summarizeLlmsTxt(`[${"[".repeat(200_000)}`);
    expect(performance.now() - started).toBeLessThan(200);
  });
});

describe("normalizeDomainInput", () => {
  it.each([
    ["example.com", "example.com", "https://example.com"],
    ["  EXAMPLE.com  ", "example.com", "https://example.com"],
    ["https://www.example.com/path?x#y", "www.example.com", "https://www.example.com"],
    ["http://example.com", "example.com", "https://example.com"],
    ["example.com.", "example.com", "https://example.com"],
    ["example.com:8443", "example.com", "https://example.com:8443"],
    ["bücher.de", "xn--bcher-kva.de", "https://xn--bcher-kva.de"],
  ])("%j -> %s", (input, host, origin) => {
    expect(normalizeDomainInput(input)).toEqual({ ok: true, host, origin });
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["localhost", "local"],
    ["intranet", "local"],
    ["printer.local", "local"],
    ["app.localhost", "local"],
    ["192.168.0.1", "ip"],
    ["[::1]", "ip"],
    ["ftp://example.com", "invalid"],
    ["exa mple.com", "invalid"],
  ])("%j is rejected as %s", (input, reason) => {
    expect(normalizeDomainInput(input)).toEqual({ ok: false, reason });
  });
});
