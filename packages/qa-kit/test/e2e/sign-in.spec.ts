import { expect, test, type Browser, type Page } from "@playwright/test";
import { forgetSignIn, reuseSignIn } from "../../src/sign-in.ts";

const BASE = "http://localhost:4400";
const LANDING = { landing: "/properties" };

// A sign-in that counts its runs. The fixture's "/sign-in?as=agent" sets the role cookie and goes to /properties.
function agent(page: Page, runs: { n: number }, path = "/sign-in?as=agent") {
  return async () => {
    runs.n += 1;
    await page.goto(path);
  };
}

async function newPage(browser: Browser): Promise<Page> {
  return (await browser.newContext({ baseURL: BASE })).newPage();
}

test("the second sign-in reuses the saved session", async ({ browser }, info) => {
  const key = `agent-${info.testId}`;
  const runs = { n: 0 };
  const first = await newPage(browser);
  await reuseSignIn(first, key, agent(first, runs), LANDING);
  const second = await newPage(browser);
  await reuseSignIn(second, key, agent(second, runs), LANDING);
  expect(runs.n).toBe(1);
  expect(new URL(second.url()).pathname).toBe("/properties");
  await expect(second.getByRole("link", { name: "Switch role" })).toBeVisible();
});

test("a saved session that the app refuses signs in again", async ({ browser }, info) => {
  const key = `agent-${info.testId}`;
  const runs = { n: 0 };
  const first = await newPage(browser);
  await reuseSignIn(first, key, agent(first, runs), LANDING);
  const second = await newPage(browser);
  // The server ended the session: the first visit to the landing page answers 403.
  let refused = false;
  await second.route(`${BASE}/properties`, (route) => {
    if (refused) return route.continue();
    refused = true;
    return route.fulfill({ status: 403, contentType: "text/html", body: "<h1>Signed out</h1>" });
  });
  await reuseSignIn(second, key, agent(second, runs), LANDING);
  expect(runs.n).toBe(2);
  await expect(second.getByRole("link", { name: "Switch role" })).toBeVisible();
});

test("a sign-in that does not end on the landing page is not saved", async ({ browser }, info) => {
  const key = `nobody-${info.testId}`;
  const runs = { n: 0 };
  for (let i = 0; i < 2; i++) {
    const page = await newPage(browser);
    // "/sign-in" with no role shows the sign-in page and sets no session.
    await reuseSignIn(page, key, agent(page, runs, "/sign-in"), LANDING);
  }
  expect(runs.n).toBe(2);
});

test("forgetSignIn makes the next call sign in again", async ({ browser }, info) => {
  const key = `agent-${info.testId}`;
  const runs = { n: 0 };
  const first = await newPage(browser);
  await reuseSignIn(first, key, agent(first, runs), LANDING);
  forgetSignIn(key);
  const second = await newPage(browser);
  await reuseSignIn(second, key, agent(second, runs), LANDING);
  expect(runs.n).toBe(2);
});
