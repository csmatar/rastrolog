import { describe, expect, it } from "vitest";
import { highlightTag } from "../src/lib/highlight-tag.ts";
import { PINNED_SNIPPET_TAG } from "../src/lib/snippet-tag.ts";

const TAG =
  '<script src="https://cdn.example/s.js" integrity="sha384-AbC+/=" crossorigin="anonymous" defer></script>';

describe("highlightTag", () => {
  it("splits a tag into coloured parts that join back to the input", () => {
    expect(highlightTag(TAG)).toEqual([
      { text: "<", kind: "punct" },
      { text: "script", kind: "tag" },
      { text: " ", kind: "space" },
      { text: "src", kind: "attr" },
      { text: '="', kind: "punct" },
      { text: "https://cdn.example/s.js", kind: "value" },
      { text: '"', kind: "punct" },
      { text: " ", kind: "space" },
      { text: "integrity", kind: "attr" },
      { text: '="', kind: "punct" },
      { text: "sha384-", kind: "value" },
      { text: "AbC+/=", kind: "hash" },
      { text: '"', kind: "punct" },
      { text: " ", kind: "space" },
      { text: "crossorigin", kind: "attr" },
      { text: '="', kind: "punct" },
      { text: "anonymous", kind: "value" },
      { text: '"', kind: "punct" },
      { text: " ", kind: "space" },
      { text: "defer", kind: "attr" },
      { text: "></", kind: "punct" },
      { text: "script", kind: "tag" },
      { text: ">", kind: "punct" },
    ]);
  });

  it("never changes the text, even for input it doesn't understand", () => {
    for (const input of [
      PINNED_SNIPPET_TAG,
      "",
      "plain text",
      '<a b="unterminated',
      "<<>>=\"'",
      "<x y=z>",
    ]) {
      expect(
        highlightTag(input)
          .map((t) => t.text)
          .join(""),
      ).toBe(input);
    }
  });
});
