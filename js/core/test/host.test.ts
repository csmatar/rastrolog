import { describe, expect, it } from "vitest";
import { hostOf } from "../src/host.js";

// Expected values are Python's urllib.parse.urlsplit(url).hostname
// (null when there's no scheme or no host, or when urlsplit raises).
describe("hostOf mirrors urlsplit", () => {
  it.each([
    ["https://chatgpt.com/", "chatgpt.com"],
    ["HTTPS://CHATGPT.COM:443/c", "chatgpt.com"],
    ["https://user:pw@chatgpt.com/", "chatgpt.com"],
    ["https://evil.com\\@chatgpt.com/", "chatgpt.com"],
    ["https://chatgpt.com\\@evil.com/", "evil.com"],
    ["https://chat\tgpt.com/", "chatgpt.com"],
    ["https://[::1]:8080/", "::1"],
    ["https://chatgpt.com?x", "chatgpt.com"],
    ["https://chatgpt.com#x", "chatgpt.com"],
    ["https://chatgpt.com:99999/", "chatgpt.com"],
    ["android-app://com.google.android.gm/", "com.google.android.gm"],
    ["https:chatgpt.com", null],
    ["//chatgpt.com/", null],
    ["chatgpt.com", null],
    ["1https://chatgpt.com/", null],
    ["http://[::1", null],
    ["http://::1]/", null],
    ["https:///path", null],
    ["mailto:someone@chatgpt.com", null],
  ])("%j -> %j", (url, expected) => {
    expect(hostOf(url)).toBe(expected);
  });
});
