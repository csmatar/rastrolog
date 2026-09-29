// The classifiers alone: what the published snippet re-exports. Its declarations
// (emitted by tsconfig.build.json) reach no DOM types and no robots or log code.
export { classifyReferrer, type ReferrerOptions } from "./referrer.js";
export type { Match, Purpose } from "./types.js";
export { classifyUserAgent } from "./userAgent.js";
