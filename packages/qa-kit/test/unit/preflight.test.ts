import { describe, expect, it } from "vitest";
import { defineQaConfig } from "../../src/config.ts";
import { runPreflight } from "../../src/preflight.ts";

const base = { baseURL: "http://localhost:4400", routes: [], roles: [], scenarios: [], accessMatrix: {} };

describe("runPreflight", () => {
  it("does nothing with no hook, or when the hook returns nothing", async () => {
    await expect(runPreflight(defineQaConfig(base))).resolves.toBeUndefined();
    await expect(runPreflight(defineQaConfig({ ...base, preflight: async () => undefined }))).resolves.toBeUndefined();
  });

  it("throws one line with the message that the hook returns or throws", async () => {
    const dirty = defineQaConfig({ ...base, preflight: async () => "The seed database is dirty. Run npm run db:reset." });
    await expect(runPreflight(dirty)).rejects.toThrow("qa preflight: The seed database is dirty. Run npm run db:reset.");
    const broken = defineQaConfig({ ...base, preflight: async () => { throw new Error("The database does not answer."); } });
    const error = await runPreflight(broken).catch((e: Error) => e);
    expect((error as Error).stack).toBe("qa preflight: The database does not answer.");
  });
});
