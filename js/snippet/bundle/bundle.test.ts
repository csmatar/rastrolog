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

describe("package.json", () => {
  // `pnpm pack` must be able to publish it, and a dependency on the unpublished,
  // unclaimed @rastrolog scope would invite dependency confusion.
  it("references no workspace or private package", () => {
    const manifest = read("package.json");
    expect(manifest).not.toContain("workspace:");
    expect(manifest).not.toContain("@rastrolog/");
  });
});
