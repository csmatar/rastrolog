// llms.txt (https://llmstxt.org): a Markdown file whose first H1 names the site.

export interface LlmsSummary {
  /** Text of the first "# " heading, or null. */
  title: string | null;
  /** Number of Markdown links. */
  links: number;
}

export function summarizeLlmsTxt(input: string): LlmsSummary {
  const text = input.slice(0, 512_000);
  let title: string | null = null;
  for (const line of text.split(/\r\n|\r|\n/)) {
    if (line.startsWith("# ")) {
      title = line.slice(2).trim() || null;
      break;
    }
  }
  return { title, links: countLinks(text) };
}

const WHITESPACE = /\s/;

/**
 * How many times /\[[^\]\n]*\]\([^)\s]+\)/g would match, counted in one pass.
 * The regex itself backtracks quadratically on a long run of "[" with no "]".
 */
function countLinks(text: string): number {
  let links = 0;
  let open = false; // a "[" since the last "]", newline or link
  let urlFailsUntil = -1; // a "](" before this index hits the same dead end as an earlier one
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\n") {
      open = false;
    } else if (c === "[") {
      open = true;
    } else if (c === "]") {
      if (open && text[i + 1] === "(" && i >= urlFailsUntil) {
        let j = i + 2;
        while (j < text.length && text[j] !== ")" && !WHITESPACE.test(text[j] ?? "")) j++;
        if (text[j] === ")" && j > i + 2) {
          links++;
          open = false;
          i = j;
          continue;
        }
        urlFailsUntil = j;
      }
      open = false;
    }
  }
  return links;
}
