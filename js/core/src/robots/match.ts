import type { RobotsRule } from "./parse.js";

/**
 * RFC 9309 §2.2.3: "*" matches any sequence, a trailing "$" anchors the end,
 * and otherwise the pattern is a prefix. With "*" as the only wildcard, taking
 * each literal piece at its leftmost occurrence is exact, and each piece is one
 * indexOf, so matching stays near-linear even on hostile patterns.
 */
export function patternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const pieces = (anchored ? pattern.slice(0, -1) : pattern).split("*");
  const first = pieces[0] ?? "";
  if (!path.startsWith(first)) return false;
  const last = pieces.length - 1;
  if (last === 0) return !anchored || path.length === first.length;
  let at = first.length;
  for (let k = 1; k < last; k++) {
    const piece = pieces[k] ?? "";
    if (piece === "") continue;
    const found = path.indexOf(piece, at);
    if (found < 0) return false;
    at = found + piece.length;
  }
  const tail = pieces[last] ?? "";
  if (anchored) return path.length - tail.length >= at && path.endsWith(tail);
  return tail === "" || path.indexOf(tail, at) >= 0;
}

/** RFC 9309 §2.2.2: the longest matching pattern wins; on a tie, allow wins. No match: allowed. */
export function decide(
  rules: readonly RobotsRule[],
  path: string,
): { allowed: boolean; rule: RobotsRule | null } {
  let best: RobotsRule | null = null;
  for (const rule of rules) {
    if (rule.pattern === "" || !patternMatches(rule.pattern, path)) continue;
    const longer = best === null || rule.pattern.length > best.pattern.length;
    const tieToAllow =
      best !== null && rule.pattern.length === best.pattern.length && rule.allow && !best.allow;
    if (longer || tieToAllow) best = rule;
  }
  return { allowed: best === null || best.allow, rule: best };
}
