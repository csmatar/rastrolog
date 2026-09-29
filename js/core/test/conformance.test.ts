// The shared contract: every case in conformance/ must classify exactly as in Python.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyReferrer, classifyUserAgent } from "../src/index.js";

const load = <T>(path: string): T =>
  JSON.parse(readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8")) as T;

interface Expect {
  id: string;
}
interface UaCase {
  ua: string;
  expect: Expect | null;
}
interface ReferrerCase {
  referrer: string;
  own_host?: string;
  expect: Expect | null;
}
interface Signals {
  crawlers: { id: string; match: string }[];
  referrers: { id: string }[];
}

const UA_CASES = load<UaCase[]>("conformance/user_agents.json");
const REFERRER_CASES = load<ReferrerCase[]>("conformance/referrers.json");
const SIGNALS = load<Signals>("signals.json");

const covered = (cases: { expect: Expect | null }[]) =>
  new Set(cases.flatMap((c) => (c.expect ? [c.expect.id] : [])));

describe("user_agents.json", () => {
  it.each(UA_CASES)("$ua", (c) => {
    expect(classifyUserAgent(c.ua)?.id ?? null).toBe(c.expect?.id ?? null);
  });

  it("has a positive fixture for every user_agent crawler", () => {
    const ids = covered(UA_CASES);
    const missing = SIGNALS.crawlers.filter((c) => c.match === "user_agent" && !ids.has(c.id));
    expect(missing.map((c) => c.id)).toEqual([]);
  });
});

describe("referrers.json", () => {
  it.each(REFERRER_CASES)("$referrer (own_host: $own_host)", (c) => {
    expect(classifyReferrer(c.referrer, { ownHost: c.own_host })?.id ?? null).toBe(
      c.expect?.id ?? null,
    );
  });

  it("has a positive fixture for every referrer", () => {
    const ids = covered(REFERRER_CASES);
    expect(SIGNALS.referrers.filter((r) => !ids.has(r.id)).map((r) => r.id)).toEqual([]);
  });
});
