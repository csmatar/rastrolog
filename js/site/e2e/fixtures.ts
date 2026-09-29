// Every page in the e2e suite is served with the production Content-Security-Policy
// from public/_headers (astro preview doesn't apply _headers, Pages does). Any
// violation fails the test, so a change that breaks under production headers fails CI.
import { test as base, expect } from "@playwright/test";
import { headerFor, readHeadersFile } from "../scripts/headers-file.ts";

const ORIGIN = "http://localhost:4321";
const CSP = headerFor(readHeadersFile(), "/*", "Content-Security-Policy");
if (CSP === undefined) throw new Error("public/_headers has no Content-Security-Policy for /*");

export const test = base.extend<{ csp: string[] }>({
  csp: [
    async ({ page }, use) => {
      const violations: string[] = [];
      await page.route(`${ORIGIN}/**`, async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          headers: { ...response.headers(), "content-security-policy": CSP },
        });
      });
      page.on("console", (message) => {
        if (message.text().includes("Content Security Policy")) violations.push(message.text());
      });
      await page.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (event) => {
          console.error(
            `Content Security Policy: ${event.violatedDirective} blocked ${event.blockedURI}`,
          );
        });
      });
      await use(violations);
      expect(violations, "Content Security Policy violations").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
