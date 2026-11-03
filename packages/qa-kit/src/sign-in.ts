import type { BrowserContext, Page } from "@playwright/test";
import { samePath } from "./checks/access.ts";

type SessionState = Awaited<ReturnType<BrowserContext["storageState"]>>;

// The saved sessions of this worker process, by browser type and key.
const saved = new Map<string, SessionState>();

export interface ReuseSignInOptions {
  /** The path where a signed-in person lands, for example "/staff/tasks". The helper opens it to test a saved session. */
  landing: string;
}

const savedKey = (page: Page, key: string) => `${page.context().browser()?.browserType().name() ?? "browser"}\u0000${key}`;

async function onLanding(page: Page, landing: string, status: number | undefined): Promise<boolean> {
  return (status === undefined || status < 400) && samePath(new URL(page.url()).pathname, new URL(landing, "http://placeholder").pathname);
}

/**
 * Sign in with a saved session, or run `signIn` and save the session.
 * `key` names the person, for example a role or an email address. The sessions stay in this worker process.
 * - With a saved session, the helper adds it to the context and opens `landing`. The session works when the page stays on
 *   `landing` with a status below 400. Then `signIn` does not run, and the page is on `landing`.
 * - Otherwise the helper takes the saved session out of the context and runs `signIn`. It saves the new session only when
 *   `signIn` ends on `landing`. So a sign-in that ends somewhere else (for example "your access has ended") runs each time.
 * A test that signs out or ends the session on the server calls `forgetSignIn(key)`. An app that checks the session
 * only in the token (not on the server) accepts an ended session until the token expires.
 */
export async function reuseSignIn(page: Page, key: string, signIn: () => Promise<void>, opts: ReuseSignInOptions): Promise<void> {
  const context = page.context();
  const id = savedKey(page, key);
  const state = saved.get(id);
  if (state) {
    const before = await context.storageState();
    const names = new Set(state.cookies.map((c) => `${c.name}\u0000${c.domain}\u0000${c.path}`));
    await context.setStorageState({
      cookies: [...before.cookies.filter((c) => !names.has(`${c.name}\u0000${c.domain}\u0000${c.path}`)), ...state.cookies],
      origins: [...before.origins.filter((o) => !state.origins.some((s) => s.origin === o.origin)), ...state.origins],
    });
    const res = await page.goto(opts.landing);
    if (await onLanding(page, opts.landing, res?.status())) return;
    saved.delete(id);
    await context.setStorageState(before);
  }
  await signIn();
  if (await onLanding(page, opts.landing, undefined)) saved.set(id, await context.storageState());
}

/** Forget the saved session of `key`, or every saved session when no key is given. */
export function forgetSignIn(key?: string): void {
  if (key === undefined) return saved.clear();
  for (const id of [...saved.keys()]) if (id.endsWith(`\u0000${key}`)) saved.delete(id);
}
