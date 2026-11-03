import type { StepRecord } from "./manifest.ts";

/** One finding in a run, keyed by profile, test, step, check and rule, element and severity. `count` is the number of hits. */
export interface CompareRow { key: string; count: number }

export interface RunComparison {
  /** True when both runs have the same steps and the same findings with the same counts. */
  same: boolean;
  /** The findings that only run B has. Each one is a defect until a fresh run in the old mode shows it too. */
  added: CompareRow[];
  /** The findings that only run A has. Each one can be a lost catch. */
  removed: CompareRow[];
  /** The findings that both runs have, with a different count. */
  changed: Array<{ key: string; a: number; b: number }>;
  /** The steps that only one run has. A missing step can hide findings, so the comparison names it. */
  stepsOnlyInA: string[];
  stepsOnlyInB: string[];
  findings: { a: number; b: number };
}

// "<project>/<spec file>/<test title>/<NN>-<step slug>/<viewport>" → "<project> › <spec file>/<test title> › <NN>-<step slug>".
// The viewport is left out: the project names it.
function stepKey(step: StepRecord): string {
  const parts = step.id.split("/");
  return `${step.project} › ${parts.slice(1, 3).join("/")} › ${parts[3] ?? ""}`;
}

function findingRows(steps: StepRecord[]): Map<string, number> {
  const rows = new Map<string, number>();
  for (const step of steps) {
    for (const f of step.findings) {
      const key = `${stepKey(step)} › ${f.check}/${f.rule} › ${f.selector ?? "-"} › ${f.severity}`;
      rows.set(key, (rows.get(key) ?? 0) + (f.count ?? 1));
    }
  }
  return rows;
}

/** Pure. Compare the findings of two runs, keyed by profile, test, step, rule and element. */
export function compareRuns(a: StepRecord[], b: StepRecord[]): RunComparison {
  const ra = findingRows(a);
  const rb = findingRows(b);
  const added = [...rb].filter(([k]) => !ra.has(k)).map(([key, count]) => ({ key, count }));
  const removed = [...ra].filter(([k]) => !rb.has(k)).map(([key, count]) => ({ key, count }));
  const changed = [...ra].filter(([k, n]) => rb.has(k) && rb.get(k) !== n).map(([key, n]) => ({ key, a: n, b: rb.get(key)! }));
  const sa = new Set(a.map(stepKey));
  const sb = new Set(b.map(stepKey));
  const stepsOnlyInA = [...sa].filter((k) => !sb.has(k));
  const stepsOnlyInB = [...sb].filter((k) => !sa.has(k));
  const sum = (m: Map<string, number>) => [...m.values()].reduce((x, y) => x + y, 0);
  const byKey = (x: { key: string }, y: { key: string }) => x.key.localeCompare(y.key);
  return {
    same: added.length + removed.length + changed.length + stepsOnlyInA.length + stepsOnlyInB.length === 0,
    added: added.sort(byKey),
    removed: removed.sort(byKey),
    changed: changed.sort(byKey),
    stepsOnlyInA: stepsOnlyInA.sort(),
    stepsOnlyInB: stepsOnlyInB.sort(),
    findings: { a: sum(ra), b: sum(rb) },
  };
}
