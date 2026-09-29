import { describe, expect, it } from "vitest";
import { pyInt, pySplit, pySplitWs, pyStrip, pyUnquote } from "../src/logs/pytext.js";
import { formatIsoSeconds, parseClfTime, parseIsoUtc } from "../src/logs/time.js";

// Expected values are Python's own output (3.14), captured 2026-09-29.
describe("pyUnquote mirrors urllib.parse.unquote", () => {
  it.each([
    ["/caf%C3%A9", "/café"],
    ["/a%3Fb", "/a?b"],
    ["%E2%82", "�"],
    ["%F0%9F%98", "�"],
    ["%C3%28", "�("],
    ["%ED%A0%80", "���"],
    ["%zz", "%zz"],
    ["%4", "%4"],
    ["100%", "100%"],
    ["%%41", "%A"],
    ["/é%C3%A9", "/éé"],
    ["a+b", "a+b"],
    ["%EF%BB%BFx", "﻿x"],
    ["%41%42%43", "ABC"],
  ])("%j -> %j", (input, expected) => {
    expect(pyUnquote(input)).toBe(expected);
  });
});

describe("Python whitespace, split and int", () => {
  it.each([
    ["\x1c x \x1f", "x"],
    ["\x85x\xa0", "x"],
    ["﻿x﻿", "﻿x﻿"],
    [" \t\r\n\x0b\x0cx ", "x"],
    [" x　", "x"],
  ])("pyStrip(%j) = %j", (input, expected) => {
    expect(pyStrip(input)).toBe(expected);
  });

  it("pySplitWs is str.split()", () => {
    expect(pySplitWs("  date\ttime  cs-uri-stem \x1c x ")).toEqual([
      "date",
      "time",
      "cs-uri-stem",
      "x",
    ]);
    expect(pySplitWs("   ")).toEqual([]);
  });

  it("pySplit keeps the remainder like str.split(sep, maxsplit)", () => {
    expect(pySplit("28/Sep/2026:12:00:00 +0000", "/", 2)).toEqual([
      "28",
      "Sep",
      "2026:12:00:00 +0000",
    ]);
    expect(pySplit("a", "/", 2)).toEqual(["a"]);
  });

  it.each([
    ["08", 8],
    [" 8 ", 8],
    ["+5", 5],
    ["-0", 0],
    ["1_0", 10],
    ["1__0", null],
    ["", null],
    ["0x10", null],
  ])("pyInt(%j) = %j", (input, expected) => {
    expect(pyInt(input)).toBe(expected);
  });
});

describe("times", () => {
  it("CLF with an offset converts to UTC", () => {
    expect(formatIsoSeconds(parseClfTime("28/Sep/2026:12:00:00 +0530"))).toBe(
      "2026-09-28T06:30:00+00:00",
    );
  });

  it.each([
    "31/Feb/2026:12:00:00 +0000",
    "28/Foo/2026:12:00:00 +0000",
    "28/Sep/2026:12:00:00 +2400",
    "28/Sep/2026:12:00:00",
    "28/Sep/2026:24:00:00 +0000",
  ])("CLF %j is malformed", (value) => {
    expect(() => parseClfTime(value)).toThrow("malformed");
  });

  it("ISO with microseconds truncates to whole seconds", () => {
    expect(formatIsoSeconds(parseIsoUtc("2026-09-20T08:15:30.999999+00:00"))).toBe(
      "2026-09-20T08:15:30+00:00",
    );
  });

  it("years below 1000 keep four digits, like isoformat()", () => {
    expect(formatIsoSeconds(parseIsoUtc("0999-01-02T03:04:05+00:00"))).toBe(
      "0999-01-02T03:04:05+00:00",
    );
  });
});
