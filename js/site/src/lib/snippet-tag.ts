// The install section shows the released snippet pinned with Subresource Integrity.
// README.md carries it between markers that every release rewrites and release.yml
// checks, so the hash always matches a file that's actually on npm.
import readme from "../../../../README.md?raw";

const START = "<!-- rastrolog:sri:start -->";
const END = "<!-- rastrolog:sri:end -->";

export function pinnedSnippetTag(markdown: string): string {
  const from = markdown.indexOf(START);
  const to = markdown.indexOf(END);
  if (from < 0 || to < from) throw new Error("README.md lost its rastrolog:sri markers");
  const tag = markdown
    .slice(from + START.length, to)
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("<script ") && line.includes('integrity="sha384-'));
  if (tag === undefined)
    throw new Error("no pinned <script> tag between the rastrolog:sri markers");
  return tag;
}

export const PINNED_SNIPPET_TAG = pinnedSnippetTag(readme);
