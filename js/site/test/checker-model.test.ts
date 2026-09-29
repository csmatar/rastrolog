import { readFileSync } from "node:fs";
import { checkRobots, parseRobots } from "@rastrolog/core";
import { describe, expect, it } from "vitest";
import { en } from "../src/i18n/en.ts";
import { es } from "../src/i18n/es.ts";
import { fmt } from "../src/i18n/format.ts";
import {
  countLines,
  countVerdicts,
  fileMark,
  groupVerdicts,
  headlineVars,
  llmsLine,
  nextCrawler,
  robotsLine,
  subline,
  summarize,
} from "../src/lib/checker-model.ts";

const SAMPLE = readFileSync(new URL("./fixtures/robots-sample.txt", import.meta.url), "utf8");
const LLMS = readFileSync(new URL("./fixtures/llms-sample.txt", import.meta.url), "utf8");
const verdicts = checkRobots(SAMPLE);
const total = verdicts.length;

describe("counts, headline and sub line", () => {
  it("counts the design's sample", () => {
    expect(countVerdicts(verdicts)).toEqual({
      total,
      allowed: total - 5,
      blocked: 4,
      partial: 1,
      named: 5,
    });
  });

  it("writes the headline and the sub line in both languages", () => {
    const c = countVerdicts(verdicts);
    expect(fmt(en.checker.headline, headlineVars(c, "example.com", "en"))).toBe(
      `example.com lets ${total - 5} of ${total} AI crawlers in.`,
    );
    expect(fmt(es.checker.headline, headlineVars(c, "example.com", "es"))).toBe(
      `example.com deja pasar a ${total - 5} de ${total} rastreadores de IA.`,
    );
    expect(subline(c, "en", en.checker)).toBe(
      "4 are blocked everywhere, and 1 is blocked on some pages.",
    );
    expect(subline(c, "es", es.checker)).toBe(
      "4 están bloqueados en todo el sitio y 1 está bloqueado en algunas páginas.",
    );
    expect(subline({ ...c, blocked: 1, partial: 0 }, "en", en.checker)).toBe(
      "1 is blocked everywhere.",
    );
    expect(subline({ ...c, blocked: 0, partial: 0 }, "en", en.checker)).toBe("None are blocked.");
  });
});

describe("summary sentences", () => {
  it("one sentence per verdict per purpose, vendors in signals.json order", () => {
    expect(summarize(verdicts, "example.com", "en", en.checker)).toEqual([
      {
        verdict: "blocked",
        text: "OpenAI, Google, Common Crawl, and ByteDance can't collect training data from example.com.",
      },
      {
        verdict: "allowed",
        text: "Anthropic, Amazon, Apple, Meta, and Mistral AI can collect training data.",
      },
      { verdict: "allowed", text: "Every AI assistant can fetch a page when a person asks." },
      { verdict: "partial", text: "Perplexity can index only some pages." },
      {
        verdict: "allowed",
        text: "OpenAI, Anthropic, Google, Microsoft, Amazon, Apple, Meta, You.com, and Mistral AI can index example.com.",
      },
    ]);
  });

  it("Spanish verbs agree with one vendor or several", () => {
    const one = summarize(
      checkRobots("User-agent: GPTBot\nDisallow: /\n"),
      "example.com",
      "es",
      es.checker,
    );
    expect(one[0]).toEqual({
      verdict: "blocked",
      text: "OpenAI no puede recolectar datos de entrenamiento de example.com.",
    });
    expect(summarize(verdicts, "example.com", "es", es.checker)[0]?.text).toBe(
      "OpenAI, Google, Common Crawl y ByteDance no pueden recolectar datos de entrenamiento de example.com.",
    );
  });

  it("no robots.txt: one 'every …' sentence per purpose", () => {
    expect(
      summarize(checkRobots(null), "example.com", "en", en.checker).map((l) => l.text),
    ).toEqual([
      "Every AI company on the list can collect training data from example.com.",
      "Every AI assistant can fetch a page when a person asks.",
      "Every search crawler on the list can index example.com.",
    ]);
  });

  it("everything blocked: one 'no …' sentence per purpose", () => {
    const lines = summarize(
      checkRobots("User-agent: *\nDisallow: /\n"),
      "example.com",
      "en",
      en.checker,
    );
    expect(lines.map((l) => l.verdict)).toEqual(["blocked", "blocked", "blocked"]);
    expect(lines[0]?.text).toBe(
      "No AI company on the list can collect training data from example.com.",
    );
  });
});

describe("grouped table", () => {
  it("groups by purpose, blocked first, with the deciding lines as evidence", () => {
    const groups = groupVerdicts(verdicts);
    expect(groups.map((g) => g.purpose)).toEqual(["training", "user_fetch", "search_index"]);
    expect(groups[0]).toMatchObject({ blocked: 4, partial: 0 });
    expect(groups[0]?.rows[0]).toEqual({
      token: "GPTBot",
      vendorName: "OpenAI",
      verdict: "blocked",
      evidence: "User-agent: GPTBot  Disallow: /",
    });
    expect(groups[2]?.rows[0]).toMatchObject({
      token: "PerplexityBot",
      verdict: "partial",
      evidence: "User-agent: PerplexityBot  Disallow: /drafts/",
    });
    expect(groups[1]?.rows[0]).toMatchObject({
      verdict: "allowed",
      evidence: "User-agent: *  Allow: /",
    });
  });

  it("no robots.txt means no evidence lines", () => {
    expect(groupVerdicts(checkRobots(null))[0]?.rows[0]?.evidence).toBeNull();
  });
});

describe("what the next new crawler gets", () => {
  it.each([
    ["the sample (User-agent: * allows /)", SAMPLE, "open"],
    ["User-agent: * blocks /", "User-agent: *\nDisallow: /\n", "closed"],
    ["no User-agent: * group", "User-agent: GPTBot\nDisallow: /\n", "open"],
  ])("%s", (_name, text, expected) => {
    expect(nextCrawler(checkRobots(text), parseRobots(text))).toBe(expected);
  });

  it("no robots.txt", () => {
    expect(nextCrawler(checkRobots(null), null)).toBe("none");
  });
});

describe("file status lines", () => {
  it("robots.txt", () => {
    const t = en.checker;
    expect(robotsLine({ kind: "found", status: 200, text: SAMPLE }, "en", t)).toBe(
      "robots.txt · 200 · 17 lines",
    );
    expect(robotsLine({ kind: "pasted", text: "User-agent: *" }, "en", t)).toBe(
      "robots.txt · pasted · 1 line",
    );
    expect(robotsLine({ kind: "missing", status: 404 }, "en", t)).toBe(
      "robots.txt · 404 · none, so every crawler is allowed by default",
    );
    expect(robotsLine({ kind: "missing", status: 403 }, "en", t)).toBe(
      "robots.txt · 403 · crawlers treat that as no robots.txt, so everything is allowed",
    );
    expect(robotsLine({ kind: "html", status: 200 }, "en", t)).toBe(
      "robots.txt · 200 · a web page came back instead, so no rules apply",
    );
  });

  it("llms.txt", () => {
    const t = en.checker;
    expect(llmsLine({ kind: "found", status: 200, text: LLMS }, "en", t)).toBe(
      'llms.txt · 200 · "Example Docs" · 12 links',
    );
    expect(llmsLine({ kind: "found", status: 200, text: "- [a](/a)" }, "en", t)).toBe(
      "llms.txt · 200 · 1 link",
    );
    expect(llmsLine({ kind: "pasted", text: LLMS }, "es", es.checker)).toBe(
      "llms.txt · pegado · 12 enlaces",
    );
    expect(llmsLine({ kind: "missing", status: 404 }, "en", t)).toBe("No llms.txt");
    expect(llmsLine({ kind: "html", status: 200 }, "en", t)).toBe("No llms.txt");
    expect(llmsLine({ kind: "server-error", status: 502 }, "en", t)).toBe("No llms.txt");
    expect(llmsLine({ kind: "unreachable" }, "en", t)).toBe("llms.txt · couldn't be read");
  });

  it("countLines ignores one trailing newline", () => {
    expect([countLines(""), countLines("a"), countLines("a\n"), countLines("a\r\nb\rc\n")]).toEqual(
      [0, 1, 1, 3],
    );
  });
});

describe("file status marks", () => {
  it.each([
    [{ kind: "found", status: 200, text: "x" }, "ok"],
    [{ kind: "pasted", text: "x" }, "ok"],
    [{ kind: "missing", status: 404 }, "none"],
    [{ kind: "html", status: 200 }, "none"],
    [{ kind: "server-error", status: 503 }, "warn"],
    [{ kind: "unreachable" }, "warn"],
  ] as const)("%j -> %s", (source, mark) => {
    expect(fileMark(source)).toBe(mark);
  });
});
