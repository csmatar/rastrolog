// The page embeds clientStrings(lang) as JSON in #rl-strings; scripts read it once.
import type { ClientStrings } from "../i18n/client.ts";

let cached: ClientStrings | null = null;

export function readStrings(): ClientStrings {
  if (cached === null) {
    const el = document.getElementById("rl-strings");
    if (el === null) throw new Error("rastrolog: missing #rl-strings");
    cached = JSON.parse(el.textContent ?? "") as ClientStrings;
  }
  return cached;
}
