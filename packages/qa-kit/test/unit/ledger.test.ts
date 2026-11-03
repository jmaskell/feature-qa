import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appendLedger, LEDGER_HEADER } from "../../src/ledger.ts";

describe("appendLedger", () => {
  it("creates the file with the header, then adds one row for each entry", async () => {
    const file = join(await mkdtemp(join(tmpdir(), "qa-led-")), "qa-catches.md");
    await appendLedger(file, { date: "2026-10-11", what: "Button said 'Add Property'", check: "copy/case-drift" });
    await appendLedger(file, { date: "2026-10-12", what: "a | b", check: "test/e2e/x.spec.ts" });
    const text = await readFile(file, "utf8");
    expect(text.startsWith(LEDGER_HEADER)).toBe(true);
    expect(text).toContain("| 2026-10-11 | Button said 'Add Property' | copy/case-drift |");
    expect(text).toContain("| 2026-10-12 | a \\| b | test/e2e/x.spec.ts |");
  });
});
