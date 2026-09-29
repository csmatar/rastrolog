import { describe, expect, it } from "vitest";
import { pinnedBlock, replaceBlock, SRI_END, SRI_START, sriHash } from "../scripts/sri.ts";

describe("sri", () => {
  it("hashes like the SRI spec (sha384, base64)", () => {
    expect(sriHash(new TextEncoder().encode("abc"))).toBe(
      "sha384-ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP/W+2AhgcroefMI1i67KE0yCWn",
    );
  });

  it("renders the pinned script tag", () => {
    expect(pinnedBlock("0.2.0", "sha384-x")).toBe(
      [
        SRI_START,
        "```html",
        '<script src="https://cdn.jsdelivr.net/npm/rastrolog@0.2.0/dist/snippet.min.js" integrity="sha384-x" crossorigin="anonymous" defer></script>',
        "```",
        SRI_END,
      ].join("\n"),
    );
  });

  it("replaces only the marked block", () => {
    const text = `before\n${SRI_START}\nold\n${SRI_END}\nafter\n`;
    expect(replaceBlock(text, "NEW")).toBe("before\nNEW\nafter\n");
  });

  it("refuses a file without markers", () => {
    expect(() => replaceBlock("no markers here", "NEW")).toThrow("rastrolog:sri");
  });
});
