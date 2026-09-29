import { expect, test } from "@playwright/test";

const ORIGIN = "http://localhost:4321";

for (const [path, lang] of [
  ["/", "en"],
  ["/es/", "es"],
] as const) {
  test(`${path} has its language, alternates, self-hosted fonts and no third-party requests`, async ({
    page,
  }) => {
    const errors: string[] = [];
    const external: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (!r.url().startsWith(`${ORIGIN}/`)) external.push(r.url());
    });

    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${ORIGIN}${path}`);
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
      "href",
      `${ORIGIN}/`,
    );
    await expect(page.locator('link[rel="alternate"][hreflang="es"]')).toHaveAttribute(
      "href",
      `${ORIGIN}/es/`,
    );
    await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
      "href",
      `${ORIGIN}/`,
    );
    const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(bodyFont).toContain("IBM Plex Sans");
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });
}
