import type { QaConfig } from "./types.ts";

/**
 * Run config.preflight once, before the tests. Call it from the Playwright globalSetup file.
 * When the hook returns a message or throws, this throws one error with that message and no stack, so the run stops before the first test.
 */
export async function runPreflight(config: QaConfig): Promise<void> {
  if (!config.preflight) return;
  let problem: string | void;
  try {
    problem = await config.preflight();
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
  if (!problem) return;
  const error = new Error(`qa preflight: ${problem}`);
  error.stack = error.message; // one clear line: the stack of the hook does not help the person who runs QA
  throw error;
}
