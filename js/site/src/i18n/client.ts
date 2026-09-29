// The strings the browser scripts need, serialised into the page as JSON
// (<script type="application/json" id="rl-strings">). Scripts import only the
// ClientStrings type from here, so the tables never reach the JS bundle.
import type { Lang } from "./format.ts";
import { strings } from "./index.ts";

export function clientStrings(lang: Lang) {
  const t = strings(lang);
  return {
    lang,
    checker: t.checker,
    logs: t.logs,
    ask: t.ask,
    signup: { sentBody: t.signup.sentBody },
  };
}

export type ClientStrings = ReturnType<typeof clientStrings>;

/** "<" is escaped, so no string can close the surrounding <script> tag. */
export function clientJson(lang: Lang): string {
  return JSON.stringify(clientStrings(lang)).replace(/</g, "\\u003c");
}
