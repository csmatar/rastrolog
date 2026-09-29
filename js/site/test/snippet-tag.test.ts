import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pinnedSnippetTag } from "../src/lib/snippet-tag.ts";

const README = readFileSync(new URL("../../../README.md", import.meta.url), "utf8");

describe("pinnedSnippetTag", () => {
  it("reads the released, SRI-pinned tag between the README markers", () => {
    const tag = pinnedSnippetTag(README);
    expect(tag).toMatch(
      /^<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/rastrolog@\d+\.\d+\.\d+\/dist\/snippet\.min\.js" integrity="sha384-[A-Za-z0-9+/=]+" crossorigin="anonymous" defer><\/script>$/,
    );
  });

  it("fails the build if the markers or the tag go missing", () => {
    expect(() => pinnedSnippetTag("no markers here")).toThrow(
      "README.md lost its rastrolog:sri markers",
    );
    expect(() =>
      pinnedSnippetTag("<!-- rastrolog:sri:start -->\n```html\n```\n<!-- rastrolog:sri:end -->"),
    ).toThrow("no pinned <script> tag between the rastrolog:sri markers");
  });
});
