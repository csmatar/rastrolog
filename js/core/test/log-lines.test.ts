// The shared line-level contract: conformance/log_lines.json (generated from Python).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MalformedLineError } from "../src/logs/errors.js";
import { detect, type Format, makeParser } from "../src/logs/formats.js";
import { formatIsoSeconds } from "../src/logs/time.js";

interface LineCase {
  name: string;
  format: Format;
  lines: string[];
  expect: unknown[];
}

const CASES = JSON.parse(
  readFileSync(new URL("../../../conformance/log_lines.json", import.meta.url), "utf8"),
) as LineCase[];

function run(c: LineCase): unknown[] {
  const parser = makeParser(c.format);
  return c.lines.map((line) => {
    try {
      const r = parser.parse(line);
      return r === null
        ? "ignored"
        : {
            ts: formatIsoSeconds(r.ts),
            path: r.path,
            status: r.status,
            ua: r.ua,
            referrer: r.referrer,
          };
    } catch (err) {
      if (err instanceof MalformedLineError) return "malformed";
      throw err;
    }
  });
}

describe("log_lines.json", () => {
  it.each(CASES)("$name", (c) => {
    expect(run(c)).toEqual(c.expect);
  });
});

describe("detect", () => {
  it.each([
    ["#Version: 1.0", "cloudfront"],
    ["  #Fields: date time", "cloudfront"],
    ["2026-09-20\t08:00:00\tLAX1", "cloudfront"],
    ['https 2026-09-20T08:00:00Z a b c d e f 200 200 1 2 "GET / HTTP/1.1" "x" y', "alb"],
    ['1.2.3.4 - - [28/Sep/2026:12:00:00 +0000] "GET / HTTP/1.1" 200 5 "-" "x"', "combined"],
  ])("%j -> %s", (line, format) => {
    expect(detect(line)).toBe(format);
  });

  it("an unknown first line is reported", () => {
    expect(() => detect("hello world")).toThrow(
      "unrecognised log format; first line was: hello world",
    );
  });
});

describe("hostile input (Review Focus 3)", () => {
  it("an unterminated user agent full of escapes is malformed in linear time", () => {
    const line = `1.2.3.4 - - [28/Sep/2026:12:00:00 +0000] "GET / HTTP/1.1" 200 5 "-" "${'\\"'.repeat(50_000)}`;
    const started = performance.now();
    expect(() => makeParser("combined").parse(line)).toThrow(MalformedLineError);
    expect(performance.now() - started).toBeLessThan(200);
  });
});
