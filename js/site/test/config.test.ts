import { describe, expect, it } from "vitest";
import { resolveConfig } from "../site.config.ts";

describe("resolveConfig", () => {
  it("uses local defaults outside a release", () => {
    expect(resolveConfig({})).toMatchObject({
      siteUrl: "http://localhost:4321",
      kit: { general: "test-general", latam: "test-latam" },
    });
  });

  it("reads the environment and keeps only the origin of SITE_URL", () => {
    const config = resolveConfig({
      SITE_URL: "https://rastrolog.example/some/path",
      KIT_FORM_GENERAL: " 1234567 ",
      KIT_FORM_LATAM: "7654321",
    });
    expect(config).toMatchObject({
      siteUrl: "https://rastrolog.example",
      kit: { general: "1234567", latam: "7654321" },
    });
  });

  it("refuses a release build without the deploy values", () => {
    expect(() =>
      resolveConfig({ RASTROLOG_SITE_RELEASE: "1", SITE_URL: "https://x.example" }),
    ).toThrow("KIT_FORM_GENERAL must be set for a release build");
  });

  it("rejects a SITE_URL that isn't a URL", () => {
    expect(() => resolveConfig({ SITE_URL: "not a url" })).toThrow(
      "SITE_URL is not a URL: not a url",
    );
  });

  it("a preview build without SITE_URL uses the deployment URL Pages provides (Review Focus 4)", () => {
    expect(resolveConfig({ CF_PAGES_URL: "https://4f2a.rastrolog.pages.dev" }).siteUrl).toBe(
      "https://4f2a.rastrolog.pages.dev",
    );
  });

  it("SITE_URL wins over CF_PAGES_URL", () => {
    const env = {
      SITE_URL: "https://rastrolog.com",
      CF_PAGES_URL: "https://4f2a.rastrolog.pages.dev",
    };
    expect(resolveConfig(env).siteUrl).toBe("https://rastrolog.com");
  });

  it("a release build still needs SITE_URL itself", () => {
    const env = {
      RASTROLOG_SITE_RELEASE: "1",
      CF_PAGES_URL: "https://rastrolog.pages.dev",
      KIT_FORM_GENERAL: "1",
      KIT_FORM_LATAM: "2",
    };
    expect(() => resolveConfig(env)).toThrow("SITE_URL must be set for a release build");
  });
});
