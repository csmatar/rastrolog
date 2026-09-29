// The spec's "corpus of real robots.txt files": each parses and checks quickly, and a
// few verdicts per file are checked by hand against the snapshot (fixtures/robots/README.md).
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkRobots } from "../src/robots/check.js";

const DIR = new URL("./fixtures/robots/", import.meta.url);
const FILES = readdirSync(DIR)
  .filter((f) => f.endsWith(".txt"))
  .sort();
const read = (host: string) => readFileSync(new URL(`${host}.txt`, DIR), "utf8");
const verdicts = (host: string) => new Map(checkRobots(read(host)).map((v) => [v.token, v]));

describe("real robots.txt corpus", () => {
  it("has the five snapshots", () => {
    expect(FILES).toEqual([
      "en.wikipedia.org.txt",
      "github.com.txt",
      "www.google.com.txt",
      "www.nytimes.com.txt",
      "www.theguardian.com.txt",
    ]);
  });

  it.each(FILES)("%s is checked for every crawler in well under a frame", (file) => {
    const text = readFileSync(new URL(file, DIR), "utf8");
    const started = performance.now();
    const all = checkRobots(text);
    expect(performance.now() - started).toBeLessThan(50);
    expect(all).toHaveLength(28);
  });

  it("github.com: an AI group that allows some pages, and Bytespider shut out", () => {
    const v = verdicts("github.com");
    expect(v.get("GPTBot")).toMatchObject({ verdict: "partial", source: "token" });
    expect(v.get("GPTBot")?.lines[0]).toEqual({ line: 3, text: "User-agent: GPTBot" });
    expect(v.get("Bytespider")).toMatchObject({
      verdict: "blocked",
      source: "token",
      lines: [
        { line: 94, text: "User-agent: Bytespider" },
        { line: 95, text: "Disallow: /" },
      ],
    });
    expect(v.get("MistralAI-Training")).toMatchObject({ verdict: "partial", source: "star" });
  });

  it("www.nytimes.com: GPTBot blocked, Googlebot's two groups merged", () => {
    const v = verdicts("www.nytimes.com");
    expect(v.get("GPTBot")).toMatchObject({
      verdict: "blocked",
      source: "token",
      lines: [
        { line: 232, text: "User-agent: GPTBot" },
        { line: 233, text: "Disallow: /" },
      ],
    });
    const googlebot = v.get("Googlebot");
    expect(googlebot).toMatchObject({ verdict: "partial", source: "token" });
    expect(
      googlebot?.lines.filter((l) => l.text === "User-agent: Googlebot").map((l) => l.line),
    ).toEqual([16, 130]);
  });

  it("www.theguardian.com: Anthropic's crawlers named and blocked, GPTBot left to User-agent: *", () => {
    const v = verdicts("www.theguardian.com");
    expect(v.get("ClaudeBot")).toMatchObject({ verdict: "blocked", source: "token" });
    expect(v.get("GPTBot")).toMatchObject({ verdict: "partial", source: "star" });
  });

  it.each(["en.wikipedia.org", "www.google.com"])("%s: nothing blocked outright", (host) => {
    const all = checkRobots(read(host));
    expect(all.filter((v) => v.verdict === "blocked")).toEqual([]);
    expect(all.every((v) => v.verdict === "partial")).toBe(true);
  });
});
