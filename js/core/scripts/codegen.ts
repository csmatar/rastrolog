// signals.json -> src/referrers.gen.ts + src/crawlers.gen.ts (gitignored).
// Runs before every typecheck, test and build: `node scripts/codegen.ts`.
import { readFileSync, writeFileSync } from "node:fs";
import { buildTables, renderModule } from "./tables.ts";

const signals: unknown = JSON.parse(
  readFileSync(new URL("../../../signals.json", import.meta.url), "utf8"),
);
const { referrers, crawlers, all } = buildTables(signals);
writeFileSync(
  new URL("../src/referrers.gen.ts", import.meta.url),
  renderModule("REFERRERS", "ReferrerRow", referrers),
);
writeFileSync(
  new URL("../src/crawlers.gen.ts", import.meta.url),
  renderModule("CRAWLERS", "CrawlerRow", crawlers),
);
writeFileSync(
  new URL("../src/tokens.gen.ts", import.meta.url),
  renderModule("ALL_CRAWLERS", "TokenRow", all),
);
console.log(
  `codegen: ${referrers.length} referrers, ${crawlers.length} user-agent crawlers, ${all.length} tokens`,
);
