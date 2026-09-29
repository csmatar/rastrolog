import { describe, expect, it } from "vitest";
import { readCheckParam, reportUrl, siteOf, stripScheme } from "../src/lib/check-param.ts";

describe("?check=", () => {
  it.each([
    ["?check=example.com", "example.com"],
    ["?check=https%3A%2F%2Fwww.Example.com%2Fpath", "www.example.com"],
    ["?check=example.com%3A8443", "example.com:8443"],
    ["?check=localhost", null],
    ["?check=192.168.0.1", null],
    ["?check=", null],
    ["?other=1", null],
    ["", null],
  ] as const)("%j → %j", (search, expected) => {
    expect(readCheckParam(search)).toBe(expected);
  });

  it("report links keep the page's language", () => {
    expect(reportUrl("/es/", "example.com")).toBe("/es/?check=example.com");
    expect(reportUrl("/", "example.com:8443")).toBe("/?check=example.com%3A8443");
  });

  it("siteOf drops the scheme and keeps a port", () => {
    expect(siteOf("https://example.com:8443")).toBe("example.com:8443");
  });
});

describe("stripScheme: the field already shows https://, so a pasted one goes", () => {
  it.each([
    ["https://dev.to/", "dev.to/"],
    ["http://example.com/pricing?x=1", "example.com/pricing?x=1"],
    ["HTTPS://Example.com", "Example.com"],
    ["  https://example.com", "example.com"],
    ["example.com", "example.com"],
    ["example.com/?next=https://x.test", "example.com/?next=https://x.test"],
    ["https:/", "https:/"],
    ["ftp://example.com", "ftp://example.com"],
  ])("%s → %s", (input, expected) => {
    expect(stripScheme(input)).toBe(expected);
  });
});
