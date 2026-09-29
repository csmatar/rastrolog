import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkRobots, summarizeByVendor } from "../src/robots/check.js";

const SAMPLE = [
  "User-agent: GPTBot",
  "Disallow: /",
  "",
  "User-agent: CCBot",
  "User-agent: Bytespider",
  "Disallow: /",
  "",
  "User-agent: Google-Extended",
  "Disallow: /",
  "",
  "User-agent: PerplexityBot",
  "Disallow: /drafts/",
  "",
  "User-agent: *",
  "Allow: /",
].join("\n");

const SIGNALS = JSON.parse(
  readFileSync(new URL("../../../signals.json", import.meta.url), "utf8"),
) as {
  crawlers: { token: string }[];
};

const byToken = (text: string | null) => new Map(checkRobots(text).map((v) => [v.token, v]));

describe("checkRobots", () => {
  it("returns one verdict per crawler token in signals.json, robots-only included", () => {
    const tokens = checkRobots(SAMPLE).map((v) => v.token);
    expect(tokens).toEqual(SIGNALS.crawlers.map((c) => c.token));
    expect(byToken(SAMPLE).get("Google-Extended")?.robotsOnly).toBe(true);
  });

  it("blocked, partial and allowed, with the lines that decided", () => {
    const v = byToken(SAMPLE);
    expect(v.get("GPTBot")).toMatchObject({
      verdict: "blocked",
      source: "token",
      lines: [
        { line: 1, text: "User-agent: GPTBot" },
        { line: 2, text: "Disallow: /" },
      ],
    });
    expect(v.get("Bytespider")).toMatchObject({ verdict: "blocked", source: "token" });
    expect(v.get("Google-Extended")).toMatchObject({ verdict: "blocked", source: "token" });
    expect(v.get("PerplexityBot")).toMatchObject({
      verdict: "partial",
      lines: [
        { line: 11, text: "User-agent: PerplexityBot" },
        { line: 12, text: "Disallow: /drafts/" },
      ],
    });
    expect(v.get("ClaudeBot")).toMatchObject({ verdict: "allowed", source: "star" });
    expect(v.get("ClaudeBot")?.lines.map((l) => l.line)).toEqual([14, 15]);
  });

  it("no robots.txt means everything is allowed", () => {
    for (const v of checkRobots(null))
      expect(v).toMatchObject({ verdict: "allowed", source: "none", lines: [] });
  });

  it("merges every group naming the token (RFC 9309)", () => {
    const v = byToken("User-agent: GPTBot\nDisallow: /a\n\nUser-agent: gptbot\nDisallow: /\n");
    expect(v.get("GPTBot")?.verdict).toBe("blocked");
  });

  it("a disallow counts as partial unless an allow of equal or greater length overrides it", () => {
    const v = byToken("User-agent: *\nDisallow: /docs\nAllow: /docs/\n");
    expect(v.get("ClaudeBot")?.verdict).toBe("partial"); // "/docs" itself is still disallowed
    const w = byToken("User-agent: *\nDisallow: /docs\nAllow: /docs\n");
    expect(w.get("ClaudeBot")?.verdict).toBe("allowed"); // tie -> allow wins everywhere
  });

  it("an empty Disallow allows everything", () => {
    expect(byToken("User-agent: *\nDisallow:\n").get("GPTBot")?.verdict).toBe("allowed");
  });

  it("wildcard disallows count as partial", () => {
    expect(byToken("User-agent: *\nDisallow: /*.pdf$\n").get("GPTBot")?.verdict).toBe("partial");
  });
});

describe("summarizeByVendor", () => {
  it("rolls each vendor's crawlers up by purpose", () => {
    const summary = new Map(summarizeByVendor(checkRobots(SAMPLE)).map((s) => [s.vendor, s]));
    expect(summary.get("openai")?.purposes).toEqual({
      training: "blocked",
      user_fetch: "allowed",
      search_index: "allowed",
    });
    expect(summary.get("google")?.purposes).toEqual({
      training: "blocked",
      user_fetch: "allowed",
      search_index: "allowed",
    });
    expect(summary.get("perplexity")?.purposes).toEqual({
      search_index: "partial",
      user_fetch: "allowed",
    });
  });

  it("says mixed when one purpose's crawlers disagree", () => {
    const summary = summarizeByVendor(checkRobots("User-agent: Google-Agent\nDisallow: /\n"));
    expect(summary.find((s) => s.vendor === "google")?.purposes.user_fetch).toBe("mixed");
  });
});
