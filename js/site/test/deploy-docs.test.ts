import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const workspace = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as {
  packageManager: string;
};

describe("js/site/README.md deploy settings (Review Focus 5)", () => {
  it("PNPM_VERSION matches the workspace's packageManager", () => {
    const pinned = workspace.packageManager.replace(/^pnpm@/, "");
    expect(readme).toContain(`| \`PNPM_VERSION\` | \`${pinned}\` |`);
  });

  it("gives the build command the spec names", () => {
    expect(readme).toContain(
      "`pnpm install --frozen-lockfile && pnpm --filter rastrolog run build && pnpm --filter @rastrolog/site run build`",
    );
  });

  it("keeps Kit's no-JavaScript signup inside form-action", () => {
    // form-action allows only app.kit.com, and Chrome also checks the redirect after a POST.
    expect(readme).toContain(
      "leave **After subscribing** on Kit's own success message, with no redirect URL",
    );
    expect(readme).toContain("with JavaScript disabled");
  });

  it("keeps Cloudflare from changing how AI crawlers see the site", () => {
    expect(readme).toContain("choose the option that allows all crawlers");
    expect(readme).toContain("Leave managed robots.txt and Bot Fight Mode off");
  });
});
