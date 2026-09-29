// RFC 9309 robots.txt parsing. Agents use the widely deployed product-token rule:
// the leading run of [A-Za-z_-], compared case-insensitively ("GPTBot/1.0" -> "gptbot").

export interface RobotsLine {
  /** 1-based line number in the file. */
  line: number;
  /** The line as written, trimmed (comment included), for showing evidence. */
  text: string;
}

export interface RobotsAgent extends RobotsLine {
  /** Lowercased product token, or "*". */
  product: string;
}

export interface RobotsRule extends RobotsLine {
  allow: boolean;
  pattern: string;
}

export interface RobotsGroup {
  agents: RobotsAgent[];
  rules: RobotsRule[];
}

/** RFC 9309 §2.5: parsers must handle at least 500 KiB; the rest is ignored. */
export const ROBOTS_MAX_CHARS = 512_000;

const PRODUCT = /^[A-Za-z_-]+/;

export function parseRobots(input: string): RobotsGroup[] {
  const text = (input.charCodeAt(0) === 0xfeff ? input.slice(1) : input).slice(0, ROBOTS_MAX_CHARS);
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let sawRule = false;
  const lines = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const hash = raw.indexOf("#");
    const body = (hash >= 0 ? raw.slice(0, hash) : raw).trim();
    const colon = body.indexOf(":");
    if (colon < 0) continue;
    const key = body.slice(0, colon).trim().toLowerCase();
    const value = body.slice(colon + 1).trim();
    const entry = { line: i + 1, text: raw.trim() };
    if (key === "user-agent") {
      if (current === null || sawRule) {
        current = { agents: [], rules: [] };
        groups.push(current);
        sawRule = false;
      }
      const product = value.startsWith("*") ? "*" : (PRODUCT.exec(value)?.[0] ?? "").toLowerCase();
      current.agents.push({ ...entry, product });
    } else if ((key === "allow" || key === "disallow") && current !== null) {
      current.rules.push({ ...entry, allow: key === "allow", pattern: value });
      sawRule = true;
    }
  }
  return groups;
}
