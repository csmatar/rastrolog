import { expect, test } from "./fixtures.ts";

const loadScript = (src: string) =>
  new Promise<string>((resolve) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve("loaded");
    s.onerror = () => resolve("blocked");
    document.head.append(s);
  });

test("Cloudflare's analytics beacon may load (Review Focus 1)", async ({ page }) => {
  await page.route("https://static.cloudflareinsights.com/beacon.min.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: "window.__beacon = 1;" }),
  );
  await page.goto("/");
  expect(
    await page.evaluate(loadScript, "https://static.cloudflareinsights.com/beacon.min.js"),
  ).toBe("loaded");
  expect(await page.evaluate(() => (window as { __beacon?: number }).__beacon)).toBe(1);
});

test("the click-to-load YouTube embed may load (Review Focus 2)", async ({ page }) => {
  await page.route("https://www.youtube-nocookie.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<p>video</p>" }),
  );
  await page.goto("/");
  await page.evaluate(() => {
    const frame = document.createElement("iframe");
    frame.src = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1";
    document.body.append(frame);
  });
  await expect(page.frameLocator("iframe").getByText("video")).toBeVisible();
});

test("the policy really applies: a script from elsewhere is refused (Review Focus 3)", async ({
  page,
  csp,
}) => {
  await page.route("https://evil.example/x.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: "" }),
  );
  await page.goto("/");
  expect(await page.evaluate(loadScript, "https://evil.example/x.js")).toBe("blocked");
  await expect.poll(() => csp.some((v) => v.includes("script-src"))).toBe(true);
  csp.splice(0); // expected here; the fixture checks the rest of the test
});
