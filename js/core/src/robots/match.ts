import type { RobotsRule } from "./parse.js";

/**
 * RFC 9309 §2.2.3: "*" matches any sequence, a trailing "$" anchors the end,
 * and otherwise the pattern is a prefix. A greedy two-pointer wildcard match:
 * worst case O(pattern x path), never exponential, unlike a translated regex.
 */
export function patternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const p = anchored ? pattern.slice(0, -1) : `${pattern}*`;
  let i = 0;
  let j = 0;
  let star = -1;
  let mark = 0;
  while (i < path.length) {
    if (j < p.length && p[j] !== "*" && p[j] === path[i]) {
      i++;
      j++;
    } else if (j < p.length && p[j] === "*") {
      star = j++;
      mark = i;
    } else if (star !== -1) {
      j = star + 1;
      i = ++mark;
    } else {
      return false;
    }
  }
  while (j < p.length && p[j] === "*") j++;
  return j === p.length;
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
