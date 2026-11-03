import type { Browser, BrowserContext, Page, Response } from "@playwright/test";
import { finding } from "../findings.ts";
import type { Finding, QaConfig } from "../types.ts";

export interface AccessProbe { route: string; role: string; expected: "allow" | "deny" }

export interface AccessOptions {
  /**
   * Decide if the app denied the request. The default is `defaultIsDenied`.
   * The default has two limits:
   * - A soft deny (status 200 with an "access denied" page) counts as allowed.
   * - A route whose allowed result is itself a redirect counts as denied.
   * To catch a soft deny, call `defaultIsDenied` and add a text check on the page.
   */
  isDenied?: (res: Response | null, page: Page, probe: AccessProbe) => Promise<boolean>;
  beforeEach?: (context: BrowserContext) => Promise<void>;
  /**
   * Sign in once for each role and start the later probes from that session. Default true.
   * Each finding still comes from a fresh sign-in (see checkAccess). Set false to sign in again for every probe.
   */
  reuseSignIn?: boolean;
}

const ANONYMOUS = "anonymous";

// One probe for each route and each role, plus anonymous. A missing cell means "deny".
export function accessProbes(config: QaConfig): AccessProbe[] {
  const roles = [...config.roles.map((r) => r.name), ANONYMOUS];
  return config.routes.flatMap((route) =>
    roles.map((role) => ({ route, role, expected: config.accessMatrix[route]?.[role] ?? "deny" })),
  );
}

// Compare two paths. A trailing slash does not count as a difference.
export function samePath(a: string, b: string): boolean {
  const clean = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p) || "/";
  return clean(a) === clean(b);
}

// Denied: status 401, 403 or 404, no response, or a redirect to a different path.
export async function defaultIsDenied(res: Response | null, page: Page, probe: AccessProbe): Promise<boolean> {
  if (res === null) return true;
  if ([401, 403, 404].includes(res.status())) return true;
  return !samePath(new URL(page.url()).pathname, new URL(probe.route, "http://placeholder").pathname);
}

type SessionState = Awaited<ReturnType<BrowserContext["storageState"]>>;
type Attempt = { denied: boolean; alive: boolean } | { error: unknown };

/**
 * Open each route as each role and as the signed-out visitor, and compare the result with the matrix.
 *
 * With `reuseSignIn` (the default), each role signs in once and the later probes start from that session.
 * A session can end on the server during the check (a probe can sign the role out), and then a later probe sees a
 * signed-out visitor. So a result from a reused session counts only when it is the expected result:
 * - An expected allow counts. A session that ended gives a deny, not an allow.
 * - An expected deny counts only when the role can still open a witness route in the same context after the probe.
 *   A witness route is a route that the matrix allows for the role and that the signed-out visitor could not open in this run.
 * Every other result runs again with a fresh sign-in, so each finding comes from a fresh sign-in.
 */
export async function checkAccess(browser: Browser, config: QaConfig, opts: AccessOptions = {}): Promise<Finding[]> {
  const isDenied = opts.isDenied ?? defaultIsDenied;
  const reuse = opts.reuseSignIn ?? true;
  const probes = accessProbes(config);
  // The signed-out visitor goes first, so the witness routes are known before the roles sign in.
  const ordered = [...probes.filter((p) => p.role === ANONYMOUS), ...probes.filter((p) => p.role !== ANONYMOUS)];
  // The findings keep the order of accessProbes: route by route.
  const found = new Map<AccessProbe, Finding>();
  const deniedToAnonymous = new Set<string>();
  const sessions = new Map<string, SessionState>();
  const witnessOf = (role: string) => config.routes.find((r) => config.accessMatrix[r]?.[role] === "allow" && deniedToAnonymous.has(r));

  // Run one probe in a new context. With `state`, the context starts with that session and the role does not sign in.
  const attempt = async (probe: AccessProbe, state?: SessionState): Promise<Attempt> => {
    const context = await browser.newContext({ baseURL: config.baseURL, ...(state ? { storageState: state } : {}) });
    try {
      if (opts.beforeEach) await opts.beforeEach(context);
      const page = await context.newPage();
      if (probe.role !== ANONYMOUS && !state) {
        await config.roles.find((r) => r.name === probe.role)?.signIn?.(page);
        // Save the session before the probe opens its route, so a route that ends the session does not change the saved one.
        if (reuse) sessions.set(probe.role, await context.storageState());
      }
      const denied = await isDenied(await page.goto(probe.route), page, probe);
      let alive = false;
      const witness = state && denied ? witnessOf(probe.role) : undefined;
      if (witness !== undefined) {
        alive = !(await isDenied(await page.goto(witness), page, { route: witness, role: probe.role, expected: "allow" }));
      }
      return { denied, alive };
    } catch (error) {
      return { error };
    } finally {
      await context.close();
    }
  };

  for (const probe of ordered) {
    const state = sessions.get(probe.role);
    let result: Attempt | undefined;
    // An expected deny needs a witness route to count, so with no witness the probe signs in at once.
    if (state && (probe.expected === "allow" || witnessOf(probe.role) !== undefined)) {
      const reused = await attempt(probe, state);
      const expected = !("error" in reused) && (probe.expected === "allow" ? !reused.denied : reused.denied && reused.alive);
      if (expected) result = reused;
    }
    result ??= await attempt(probe);
    if ("error" in result) {
      const name = result.error instanceof Error ? result.error.name : "Error";
      found.set(probe, finding({ check: "access", rule: "probe-error", severity: "fail", route: probe.route, message: `The probe for role "${probe.role}" failed (${name}).` }));
      continue;
    }
    if (probe.role === ANONYMOUS && result.denied) deniedToAnonymous.add(probe.route);
    if (probe.expected === "allow" && result.denied) {
      found.set(probe, finding({ check: "access", rule: "allowed-but-denied", severity: "warn", route: probe.route, message: `Role "${probe.role}" must open this route, but the app denied it.` }));
    } else if (probe.expected === "deny" && !result.denied) {
      found.set(probe, finding({ check: "access", rule: "denied-but-allowed", severity: "fail", route: probe.route, message: `Role "${probe.role}" must not open this route, but the app allowed it.` }));
    }
  }
  return probes.flatMap((p) => found.get(p) ?? []);
}
