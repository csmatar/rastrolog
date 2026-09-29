import { describe, expect, it } from "vitest";
import { decide, patternMatches } from "../src/robots/match.js";
import { parseRobots, ROBOTS_MAX_CHARS } from "../src/robots/parse.js";

// Google's documented robots.txt pattern examples.
describe("patternMatches", () => {
  const cases: [string, string[], string[]][] = [
    [
      "/fish",
      ["/fish", "/fish.html", "/fish/salmon.html", "/fishheads", "/fish.php?id=anything"],
      ["/Fish.asp", "/catfish", "/?id=fish"],
    ],
    ["/fish*", ["/fish", "/fish.html", "/fishheads/yummy.html"], ["/Fish.asp", "/catfish"]],
    [
      "/fish/",
      ["/fish/", "/fish/?id=anything", "/fish/salmon.htm"],
      ["/fish", "/fish.html", "/Fish/Salmon.asp"],
    ],
    [
      "/*.php",
      [
        "/index.php",
        "/folder/filename.php",
        "/folder/filename.php?parameters",
        "/folder/any.php.file.html",
      ],
      ["/", "/windows.PHP"],
    ],
    [
      "/*.php$",
      ["/filename.php", "/folder/filename.php"],
      ["/filename.php?parameters", "/filename.php/", "/filename.php5", "/windows.PHP"],
    ],
    ["/fish*.php", ["/fish.php", "/fishheads/catfish.php?parameters"], ["/Fish.PHP"]],
  ];
  it.each(cases)("%s", (pattern, yes, no) => {
    for (const path of yes)
      expect(patternMatches(pattern, path), `${pattern} ~ ${path}`).toBe(true);
    for (const path of no)
      expect(patternMatches(pattern, path), `${pattern} !~ ${path}`).toBe(false);
  });
});

describe("decide: longest match wins, allow wins ties", () => {
  const rules = (...lines: string[]) =>
    parseRobots(`User-agent: *\n${lines.join("\n")}`)[0]?.rules ?? [];
  it.each([
    [["Allow: /p", "Disallow: /"], "/page", true],
    [["Allow: /folder", "Disallow: /folder"], "/folder/page", true],
    [["Allow: /page", "Disallow: /*.htm"], "/page.htm", false],
    [["Allow: /page", "Disallow: /*.ph"], "/page.php", true],
    [["Allow: /$", "Disallow: /"], "/", true],
    [["Allow: /$", "Disallow: /"], "/page.htm", false],
    [["Disallow:"], "/anything", true],
    [[], "/", true],
  ] as const)("%j on %s -> allowed=%s", (lines, path, allowed) => {
    expect(decide(rules(...lines), path).allowed).toBe(allowed);
  });
});

describe("parseRobots (Review Focus 5)", () => {
  it("groups consecutive user-agents and merges nothing yet", () => {
    const groups = parseRobots(
      "User-agent: CCBot\nUser-agent: Bytespider\nDisallow: /\n\nUser-agent: *\nAllow: /\n",
    );
    expect(groups.map((g) => g.agents.map((a) => a.product))).toEqual([
      ["ccbot", "bytespider"],
      ["*"],
    ]);
    expect(groups[0]?.rules).toEqual([
      { line: 3, text: "Disallow: /", allow: false, pattern: "/" },
    ]);
  });

  it("handles BOM, CRLF, comments, case, spaces around the colon, and product versions", () => {
    const groups = parseRobots(
      "﻿# hi\r\nUSER-AGENT : GPTBot/1.0 # openai\r\nDISALLOW :  /private  # no\r\n",
    );
    expect(groups).toEqual([
      {
        agents: [{ line: 2, text: "USER-AGENT : GPTBot/1.0 # openai", product: "gptbot" }],
        rules: [{ line: 3, text: "DISALLOW :  /private  # no", allow: false, pattern: "/private" }],
      },
    ]);
  });

  it("ignores rules before any user-agent and unknown directives", () => {
    const groups = parseRobots(
      "Disallow: /x\nSitemap: https://example.com/s.xml\nUser-agent: *\nCrawl-delay: 5\nDisallow: /y\n",
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.rules.map((r) => r.pattern)).toEqual(["/y"]);
  });

  it("a user-agent after rules starts a new group", () => {
    const groups = parseRobots("User-agent: a\nDisallow: /1\nUser-agent: b\nDisallow: /2\n");
    expect(groups).toHaveLength(2);
  });
});

describe("hostile robots.txt (Review Focus 4)", () => {
  it("a pattern of many wildcards stays fast", () => {
    const started = performance.now();
    expect(patternMatches(`/${"*".repeat(5_000)}x$`, `/${"a".repeat(100_000)}`)).toBe(false);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("stops reading after 500 KiB", () => {
    const text = `User-agent: *\n${"#".repeat(ROBOTS_MAX_CHARS)}\nDisallow: /\n`;
    expect(parseRobots(text)[0]?.rules).toEqual([]);
  });
});
