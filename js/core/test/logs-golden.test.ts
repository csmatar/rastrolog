// The whole-file contract: every conformance/logs/*.log must aggregate to its
// .expected.json exactly (top=10, no own host), like Python's write_golden.py.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Aggregator, compareCodePoints, reportToDict } from "../src/logs/report.js";
import { parseLogText } from "../src/logs/session.js";

const LOGS = new URL("../../../conformance/logs/", import.meta.url);
const NAMES = readdirSync(LOGS)
  .filter((f) => f.endsWith(".log"))
  .map((f) => f.slice(0, -4))
  .sort();

describe("golden reports", () => {
  it("finds every fixture", () => {
    expect(NAMES).toEqual([
      "alb",
      "alb-microseconds",
      "apache",
      "cloudfront",
      "cloudfront-encoded-stem",
      "nginx",
    ]);
  });

  it.each(NAMES)("%s", (name) => {
    const text = readFileSync(new URL(`${name}.log`, LOGS), "utf8");
    const expected = JSON.parse(readFileSync(new URL(`${name}.expected.json`, LOGS), "utf8"));
    expect(reportToDict(parseLogText(text).report)).toEqual(expected);
  });

  it("reports what it read", () => {
    const text = readFileSync(new URL("nginx.log", LOGS), "utf8");
    const { format, records, skipped, truncated } = parseLogText(text);
    expect({ format, records, skipped, truncated }).toEqual({
      format: "combined",
      records: 14,
      skipped: 1,
      truncated: false,
    });
  });
});

describe("own host", () => {
  it("a referral from the site's own host is not a referral", () => {
    const aggregator = new Aggregator({ ownHost: "chatgpt.com" });
    aggregator.add({
      ts: 0,
      path: "/",
      status: 200,
      ua: "Mozilla/5.0",
      referrer: "https://www.chatgpt.com/",
    });
    expect(aggregator.result().referrals).toEqual([]);
  });
});

describe("compareCodePoints", () => {
  it("orders by Unicode code point, not UTF-16 unit", () => {
    // U+FF5E (BMP) sorts before U+1F600 by code point; UTF-16 "<" says the opposite.
    expect(["/\u{1F600}", "/～"].sort(compareCodePoints)).toEqual(["/～", "/\u{1F600}"]);
    expect(compareCodePoints("/a", "/a")).toBe(0);
    expect(compareCodePoints("/a", "/ab")).toBeLessThan(0);
  });
});
