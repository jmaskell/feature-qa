import { expect, test } from "@playwright/test";

test("the home page loads with its stylesheet", async ({ page }) => {
  const css = page.waitForResponse("**/style.css");
  await page.goto("/?defect=none");
  expect((await css).status()).toBe(200);
  await expect(page.locator("html")).toHaveAttribute("data-brand", "lettings");
});

test("a signed-out person goes to sign-in", async ({ page }) => {
  await page.goto("/properties");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("an agent can sign in and see the properties", async ({ page }) => {
  await page.goto("/sign-in?as=agent");
  await expect(page.getByRole("heading", { level: 1, name: "Properties" })).toBeVisible();
});

test("a landlord cannot open the tenants list", async ({ page }) => {
  await page.goto("/sign-in?as=landlord");
  const res = await page.goto("/tenants");
  expect(res?.status()).toBe(403);
});

test("a defect is switched on and off by the query", async ({ page }) => {
  await page.goto("/?defect=conformance-root");
  await expect(page.locator("html")).not.toHaveAttribute("data-brand", "lettings");
  await page.goto("/?defect=none");
  await expect(page.locator("html")).toHaveAttribute("data-brand", "lettings");
});

test("the third-party defect request succeeds and writes no console error", async ({ page }) => {
  const problems: string[] = [];
  const sinkRequests: string[] = [];
  page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
  page.on("requestfailed", (r) => problems.push(`failed ${r.url()}`));
  page.on("request", (r) => r.url().includes("127.0.0.1:4401") && sinkRequests.push(r.url()));
  await page.goto("/sign-in?as=agent");
  await page.goto("/report?defect=leaks-third-party");
  await page.waitForLoadState("networkidle");
  expect(problems).toEqual([]);
  expect(sinkRequests).toHaveLength(1);
  await page.goto("/?defect=none");
});

test("a malformed cookie does not crash the server", async ({ request }) => {
  const res = await request.get("/", { headers: { cookie: "qa_defect=%E0%A4%A" } });
  expect(res.status()).toBe(200);
});
