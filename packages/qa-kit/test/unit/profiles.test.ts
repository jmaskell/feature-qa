import { describe, expect, it } from "vitest";
import { QA_VIEWPORTS, qaProjects } from "../../src/profiles.ts";

describe("qaProjects", () => {
  it("makes each browser at each width, and each extra once per browser at the phone width", () => {
    const names = qaProjects().map((p) => p.name);
    expect(names).toEqual([
      "chromium-phone", "chromium-tablet", "chromium-laptop", "chromium-desktop",
      "chromium-phone-dark", "chromium-phone-reduced-motion", "chromium-phone-text-200",
      "webkit-phone", "webkit-tablet", "webkit-laptop", "webkit-desktop",
      "webkit-phone-dark", "webkit-phone-reduced-motion", "webkit-phone-text-200",
    ]);
  });
  it("sets the use options of each extra", () => {
    const byName = Object.fromEntries(qaProjects({ browsers: ["chromium"], viewports: ["laptop"] }).map((p) => [p.name, p.use]));
    expect(byName["chromium-laptop"]?.viewport).toEqual(QA_VIEWPORTS.laptop);
    expect(byName["chromium-phone-dark"]?.colorScheme).toBe("dark");
    expect(byName["chromium-phone-reduced-motion"]?.reducedMotion).toBe("reduce");
    expect(byName["chromium-phone-text-200"]?.qaTextScale).toBe(2);
    expect(byName["chromium-phone-dark"]?.viewport).toEqual(QA_VIEWPORTS.phone);
  });
  it("makes no extras when the list is empty", () => {
    expect(qaProjects({ browsers: ["webkit"], viewports: ["phone"], extras: [] }).map((p) => p.name)).toEqual(["webkit-phone"]);
  });
});

describe("qaProjects with profilesAs snapshots", () => {
  it("runs the journeys at phone and laptop, and takes every other profile as a snapshot under its old name", () => {
    const projects = qaProjects({ profilesAs: "snapshots" });
    expect(projects.map((p) => p.name)).toEqual(["chromium-phone", "chromium-laptop", "webkit-phone", "webkit-laptop"]);
    const snaps = (name: string) => (projects.find((p) => p.name === name)?.use.qaSnapshots as { profiles: Array<{ project: string }> }).profiles.map((s) => s.project);
    expect(snaps("chromium-phone")).toEqual(["chromium-tablet", "chromium-phone-dark", "chromium-phone-reduced-motion", "chromium-phone-text-200"]);
    expect(snaps("webkit-laptop")).toEqual(["webkit-desktop"]);
    const all = projects.flatMap((p) => [p.name, ...snaps(p.name)]).sort();
    expect(all).toEqual(qaProjects().map((p) => p.name).sort());
  });
  it("sets the viewport and the media features of each snapshot", () => {
    const [phone] = qaProjects({ profilesAs: "snapshots", browsers: ["chromium"] });
    expect((phone?.use.qaSnapshots as { profiles: unknown }).profiles).toEqual([
      { project: "chromium-tablet", viewport: QA_VIEWPORTS.tablet },
      { project: "chromium-phone-dark", viewport: QA_VIEWPORTS.phone, colorScheme: "dark" },
      { project: "chromium-phone-reduced-motion", viewport: QA_VIEWPORTS.phone, reducedMotion: "reduce" },
      { project: "chromium-phone-text-200", viewport: QA_VIEWPORTS.phone, textScale: 2 },
    ]);
  });
  it("uses the given journey viewports", () => {
    const projects = qaProjects({ profilesAs: "snapshots", browsers: ["webkit"], journeyViewports: ["desktop"], extras: [] });
    expect(projects.map((p) => [p.name, (p.use.qaSnapshots as { profiles: Array<{ project: string }> }).profiles.map((s) => s.project)])).toEqual([
      ["webkit-desktop", ["webkit-phone", "webkit-tablet", "webkit-laptop"]],
    ]);
  });
});
