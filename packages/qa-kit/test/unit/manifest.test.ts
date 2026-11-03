import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appendStep, type StepRecord } from "../../src/manifest.ts";

const step = (id: string): StepRecord => ({
  id, name: "n", route: "/", viewport: "1x1", project: "p", screenshot: "", text: [], names: [], title: "", aria: "", findings: [], hash: "h",
});

describe("appendStep", () => {
  it("writes a step with a safe id", async () => {
    const dir = await mkdtemp(join(tmpdir(), "qa-"));
    await expect(appendStep(dir, step("p/spec/test/01-a/1x1"))).resolves.toBeUndefined();
  });
  it("refuses an id with a .. segment", async () => {
    const dir = await mkdtemp(join(tmpdir(), "qa-"));
    await expect(appendStep(dir, step("p/../../escape"))).rejects.toThrow("step id");
  });
  it("refuses an absolute id", async () => {
    const dir = await mkdtemp(join(tmpdir(), "qa-"));
    await expect(appendStep(dir, step("/tmp/escape"))).rejects.toThrow("step id");
  });
});
