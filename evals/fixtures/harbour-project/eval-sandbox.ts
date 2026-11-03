// The eval sandbox cannot open a local port, and Chromium runs there only as one process.
// One process holds one page only, so each test gets its own browser.
// The scaffold writes the file .eval-sandbox. When it exists, inEvalSandbox(test) gives each test a new
// browser, and the context gets each page from app/respond.mjs directly: no request leaves the browser.
// Outside the sandbox, inEvalSandbox(test) returns the test unchanged, and playwright.config.ts starts the server.
import { existsSync } from "node:fs";
import type { BrowserContext, TestType } from "@playwright/test";
// @ts-expect-error The fixture app is plain JavaScript and has no types.
import { createApp } from "./app/respond.mjs";

export const IN_EVAL_SANDBOX = existsSync(".eval-sandbox");

type Response = { status: number; headers: Record<string, string | string[]>; body: string };

const list = (value: string | string[] | undefined) => (value === undefined ? [] : Array.isArray(value) ? value : [value]);

/** Add each Set-Cookie value to a Cookie header. A cookie with Max-Age=0 is removed. */
function withCookies(cookie: string, setCookies: string[]): string {
  const jar = new Map(cookie.split(";").map((p) => p.trim()).filter(Boolean).map((p) => [p.slice(0, p.indexOf("=")), p] as const));
  for (const set of setCookies) {
    const pair = set.split(";")[0]!.trim();
    const name = pair.slice(0, pair.indexOf("="));
    if (/;\s*Max-Age=0/i.test(set)) jar.delete(name);
    else jar.set(name, pair);
  }
  return [...jar.values()].join("; ");
}

async function serveApp(context: BrowserContext): Promise<void> {
  const app = createApp();
  await context.route("http://localhost:4400/**", async (route) => {
    const request = route.request();
    let url = new URL(request.url());
    let cookie = (await request.headerValue("cookie")) ?? "";
    const setCookies: string[] = [];
    let res: Response = app.respond({ method: request.method(), url, cookie });
    // Chromium does not send the request after a fulfilled redirect through the route, so follow it here.
    // The address bar keeps the first URL.
    for (let hops = 0; res.status >= 300 && res.status < 400 && hops < 5; hops += 1) {
      const set = list(res.headers["Set-Cookie"]);
      setCookies.push(...set);
      cookie = withCookies(cookie, set);
      url = new URL(String(res.headers.Location), url);
      res = app.respond({ method: "GET", url, cookie });
    }
    setCookies.push(...list(res.headers["Set-Cookie"]));
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(res.headers)) if (name !== "Set-Cookie") headers[name] = list(value).join(", ");
    if (setCookies.length > 0) headers["Set-Cookie"] = setCookies.join("\n");
    await route.fulfill({ status: res.status, headers, body: res.body });
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function inEvalSandbox<T extends TestType<any, any>>(test: T): T {
  if (!IN_EVAL_SANDBOX) return test;
  return test.extend({
    context: async ({ playwright, browserName, launchOptions, viewport, baseURL, userAgent, deviceScaleFactor, isMobile, hasTouch, colorScheme, reducedMotion }, use) => {
      const browser = await playwright[browserName].launch({ ...launchOptions, args: [...(launchOptions.args ?? []), "--single-process", "--no-zygote"] });
      const context = await browser.newContext({ viewport, baseURL, userAgent, deviceScaleFactor, isMobile, hasTouch, colorScheme, reducedMotion });
      await serveApp(context);
      await use(context);
      await browser.close();
    },
  }) as unknown as T;
}
