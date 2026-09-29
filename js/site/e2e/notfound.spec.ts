import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures.ts";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// Without a 404 page, Pages answers every unknown address with the home page and a 200.
for (const path of ["/no-such-page", "/es/no-existe"]) {
  test(`${path} is a real 404, in English and Spanish`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nothing here");
    await expect(page.getByRole("link", { name: "Go to the home page" })).toHaveAttribute(
      "href",
      "/",
    );
    const spanish = page.locator('main section[lang="es"]');
    await expect(spanish.getByRole("heading")).toHaveText("Aquí no hay nada");
    await expect(spanish.getByRole("link", { name: "Ir a la página principal" })).toHaveAttribute(
      "href",
      "/es/",
    );
  });
}

test("the 404 passes axe", async ({ page }) => {
  await page.goto("/no-such-page");
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(results.violations).toEqual([]);
});
