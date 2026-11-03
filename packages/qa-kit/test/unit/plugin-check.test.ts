import { cp, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error The script is plain JavaScript and has no types.
import { checkPlugin } from "../../../../scripts/check-plugin.mjs";

const ROOT = resolve(import.meta.dirname, "../../../..");

describe("checkPlugin", () => {
  it("passes on this repo", async () => {
    expect(await checkPlugin(ROOT)).toEqual([]);
  });

  it("names each broken rule", async () => {
    const root = await mkdtemp(join(tmpdir(), "qa-plugin-"));
    for (const dir of [".claude-plugin", "agents", "README.md"]) await cp(join(ROOT, dir), join(root, dir), { recursive: true });
    await writeFile(join(root, "agents", "bad-judge.md"), "---\nname: other\ndescription: x\n---\nUse it for the Harbour app.\n");
    const problems: string[] = await checkPlugin(root);
    expect(problems.join("\n")).toMatch(/bad-judge\.md.*name/);
    expect(problems.join("\n")).toMatch(/bad-judge\.md.*model/);
    expect(problems.join("\n")).toMatch(/bad-judge\.md.*Harbour/);
    expect(problems.join("\n")).toMatch(/README.*bad-judge/);
  });
});
