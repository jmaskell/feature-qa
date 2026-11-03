import { createRequire } from "node:module";
import { join } from "node:path";

type PlaywrightTest = typeof import("@playwright/test");
let cached: PlaywrightTest | undefined;

/**
 * The project's @playwright/test. A kit that is linked with `file:` resolves its imports from its real
 * folder, so a plain import loads a second copy. Playwright refuses a second copy in one run.
 * So the kit resolves @playwright/test from the project folder only, and has no fallback.
 * A kit file that Playwright loads must not use `import.meta`: a project without "type": "module" loads it as CommonJS.
 * When the project has no @playwright/test, this throws a clear error. Any other error is thrown again.
 * With no argument, the result is cached for the process. A later change of process.cwd() is ignored.
 */
export function loadPlaywright(cwd?: string): PlaywrightTest {
  if (cwd === undefined && cached) return cached;
  const dir = cwd ?? process.cwd();
  let found: PlaywrightTest;
  try {
    found = createRequire(join(dir, "package.json"))("@playwright/test") as PlaywrightTest;
  } catch (error) {
    const e = error as { code?: unknown; message?: unknown };
    if (e?.code === "MODULE_NOT_FOUND" && String(e.message).startsWith("Cannot find module '@playwright/test'")) {
      throw new Error(`feature-qa: no @playwright/test in ${dir}. Install it in the project, and run Playwright from the project root.`);
    }
    throw error;
  }
  if (cwd === undefined) cached = found;
  return found;
}
