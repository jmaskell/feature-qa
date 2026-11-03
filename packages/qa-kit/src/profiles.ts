import { loadPlaywright } from "./playwright.ts";

export const QA_VIEWPORTS = {
  phone: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  laptop: { width: 1280, height: 800 },
  desktop: { width: 1440, height: 900 },
} as const;
export type QaViewport = keyof typeof QA_VIEWPORTS;
export type QaBrowser = "chromium" | "webkit";
export type QaExtra = "dark" | "reduced-motion" | "text-200";

export interface QaProfileOptions {
  browsers?: QaBrowser[];      // default: chromium and webkit
  viewports?: QaViewport[];    // default: all four
  extras?: QaExtra[];          // default: all three. Each runs once for each browser, at extraViewport.
  extraViewport?: QaViewport;  // default: phone
  /**
   * "projects" (default): each viewport and each extra is a project, so each journey runs again in each one.
   * "snapshots": the journeys run only at journeyViewports. At each qa.step, the fixture also takes each other viewport and each extra
   * as a snapshot of the state that the journey reached. A snapshot has its own step record, under the project name that "projects" gives it.
   */
  profilesAs?: "projects" | "snapshots";
  /** With profilesAs "snapshots": the viewports where the journeys run. Default: phone and laptop, or the first viewport when neither is listed. */
  journeyViewports?: QaViewport[];
}

/**
 * One snapshot profile of a step. `project` is the name of the step record. The fixture sets the viewport, the media features
 * and the text scale, takes the step, and puts the page back.
 */
export interface QaSnapshot {
  project: string;
  viewport: { width: number; height: number };
  colorScheme?: "dark";
  reducedMotion?: "reduce";
  textScale?: number;
}

const DEVICE: Record<QaBrowser, string> = { chromium: "Desktop Chrome", webkit: "Desktop Safari" };

function extraUse(x: QaExtra): Record<string, unknown> {
  if (x === "dark") return { colorScheme: "dark" };
  if (x === "reduced-motion") return { reducedMotion: "reduce" };
  return { qaTextScale: 2 };
}

/** Playwright projects for the QA profiles. Put the result in the `projects` list of playwright.config.ts. */
export function qaProjects(opts: QaProfileOptions = {}): Array<{ name: string; use: Record<string, unknown> }> {
  const { devices } = loadPlaywright();
  const browsers = opts.browsers ?? ["chromium", "webkit"];
  const viewports = opts.viewports ?? (Object.keys(QA_VIEWPORTS) as QaViewport[]);
  const extras = opts.extras ?? ["dark", "reduced-motion", "text-200"];
  const at = opts.extraViewport ?? "phone";
  const out: Array<{ name: string; use: Record<string, unknown> }> = [];
  if (opts.profilesAs === "snapshots") {
    const preferred = (["phone", "laptop"] as QaViewport[]).filter((v) => viewports.includes(v));
    const journeys = opts.journeyViewports ?? (preferred.length > 0 ? preferred : viewports.slice(0, 1));
    // Each snapshot goes to the journey viewport with the nearest width.
    const nearest = (v: QaViewport) => journeys.reduce((best, j) => (Math.abs(QA_VIEWPORTS[j].width - QA_VIEWPORTS[v].width) < Math.abs(QA_VIEWPORTS[best].width - QA_VIEWPORTS[v].width) ? j : best));
    for (const b of browsers) {
      const base = devices[DEVICE[b]];
      for (const j of journeys) {
        const snapshots: QaSnapshot[] = [];
        for (const v of viewports) if (!journeys.includes(v) && nearest(v) === j) snapshots.push({ project: `${b}-${v}`, viewport: { ...QA_VIEWPORTS[v] } });
        if (nearest(at) === j) {
          for (const x of extras) {
            const use = extraUse(x);
            snapshots.push({
              project: `${b}-${at}-${x}`, viewport: { ...QA_VIEWPORTS[at] },
              ...(use.colorScheme ? { colorScheme: "dark" as const } : {}),
              ...(use.reducedMotion ? { reducedMotion: "reduce" as const } : {}),
              ...(use.qaTextScale ? { textScale: use.qaTextScale as number } : {}),
            });
          }
        }
        out.push({ name: `${b}-${j}`, use: { ...base, viewport: { ...QA_VIEWPORTS[j] }, qaSnapshots: { profiles: snapshots } } });
      }
    }
    return out;
  }
  for (const b of browsers) {
    const base = devices[DEVICE[b]];
    for (const v of viewports) out.push({ name: `${b}-${v}`, use: { ...base, viewport: { ...QA_VIEWPORTS[v] } } });
    for (const x of extras) out.push({ name: `${b}-${at}-${x}`, use: { ...base, viewport: { ...QA_VIEWPORTS[at] }, ...extraUse(x) } });
  }
  return out;
}
