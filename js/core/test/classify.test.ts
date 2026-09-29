import { describe, expect, it } from "vitest";
import { classifyReferrer, classifyUserAgent } from "../src/index.js";

const GPTBOT =
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.4; +https://openai.com/gptbot";

describe("Match shape", () => {
  it("referral", () => {
    expect(classifyReferrer("https://chatgpt.com/")).toEqual({
      kind: "referral",
      id: "chatgpt",
      vendor: "openai",
      vendorName: "OpenAI",
      product: "ChatGPT",
      aiSpecific: true,
    });
  });

  it("crawler", () => {
    expect(classifyUserAgent(GPTBOT)).toEqual({
      kind: "crawler",
      id: "openai-gptbot",
      vendor: "openai",
      vendorName: "OpenAI",
      token: "GPTBot",
      purpose: "training",
      aiSpecific: true,
    });
  });
});

describe("empty and missing input", () => {
  it.each([null, undefined, "", "   "])("classifyReferrer(%j) is null", (value) => {
    expect(classifyReferrer(value)).toBeNull();
  });

  it.each([null, undefined, "", "   "])("classifyUserAgent(%j) is null", (value) => {
    expect(classifyUserAgent(value)).toBeNull();
  });

  it("ownHost null, undefined or empty is ignored", () => {
    for (const ownHost of [null, undefined, ""]) {
      expect(classifyReferrer("https://chatgpt.com/", { ownHost })?.id).toBe("chatgpt");
    }
  });
});

describe("ownHost", () => {
  it("is exact-host after normalisation, not a subdomain match", () => {
    expect(classifyReferrer("https://www.chatgpt.com/", { ownHost: "chatgpt.com" })).toBeNull();
    expect(classifyReferrer("https://foo.chatgpt.com/", { ownHost: "chatgpt.com" })?.id).toBe(
      "chatgpt",
    );
  });
});
