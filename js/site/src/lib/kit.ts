// Kit (kit.com) form endpoints. KIT_FORM_BASE is what Kit's HTML embed code posts to;
// js/site/README.md says how to re-check it against a real form before a release.
import type { FetchLike } from "./site-fetch.ts";

export const KIT_FORM_BASE = "https://app.kit.com/forms";

export function kitFormAction(formId: string): string {
  return `${KIT_FORM_BASE}/${encodeURIComponent(formId)}/subscriptions`;
}

const defaultFetch: FetchLike = (input, init) => fetch(input, init);

/** POST the fields the way the native form would (urlencoded), with no cookies. */
export async function submitToKit(
  action: string,
  body: URLSearchParams,
  fetchImpl: FetchLike = defaultFetch,
): Promise<"ok" | "error"> {
  try {
    const res = await fetchImpl(action, {
      method: "POST",
      body,
      mode: "cors",
      credentials: "omit",
      headers: { Accept: "application/json" },
    });
    return res.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}
