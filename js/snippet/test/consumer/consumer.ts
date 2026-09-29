// Typechecked against the *published* types (dist/), resolved through the
// package's own "exports" by name, exactly as a user's project would.
import { classifyReferrer, classifyUserAgent, type Match } from "rastrolog";

const referral: Match | null = classifyReferrer("https://chatgpt.com/", { ownHost: "example.com" });
const crawler: Match | null = classifyUserAgent("GPTBot/1.4");
export const ids: (string | undefined)[] = [referral?.id, crawler?.vendorName];
