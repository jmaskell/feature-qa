/** Milliseconds for each part of a step, by name. A step record keeps it, and `qa timings` sums it up. */
export type Timings = Record<string, number>;

/** Run fn and add its time in whole milliseconds to timings[key]. With no timings, only run fn. */
export async function timed<T>(timings: Timings | undefined, key: string, fn: () => Promise<T>): Promise<T> {
  if (!timings) return fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    timings[key] = (timings[key] ?? 0) + Math.round(performance.now() - start);
  }
}

export interface TimingRow { part: string; steps: number; median: number; p95: number; max: number; total: number }

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] ?? 0;
}

/** Pure. One row for each part: the median, p95, max and total over the steps that have the part. "total" is the sum of the parts of a step. */
export function timingTable(steps: Array<{ timings?: Timings }>): TimingRow[] {
  const byPart = new Map<string, number[]>();
  const add = (part: string, ms: number) => byPart.set(part, [...(byPart.get(part) ?? []), ms]);
  for (const s of steps) {
    if (!s.timings) continue;
    const parts = Object.entries(s.timings);
    for (const [part, ms] of parts) add(part, ms);
    // Nested parts ("a11y.axe") are inside their parent ("checks"), so only the top-level parts make the total.
    // The after-test record has only "after-test.*" parts, so it adds no total.
    const top = parts.filter(([p]) => !p.includes("."));
    if (top.length > 0) add("total", top.reduce((sum, [, ms]) => sum + ms, 0));
  }
  return [...byPart.entries()]
    .map(([part, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return { part, steps: sorted.length, median: quantile(sorted, 0.5), p95: quantile(sorted, 0.95), max: sorted.at(-1) ?? 0, total: sorted.reduce((a, b) => a + b, 0) };
    })
    .sort((a, b) => b.total - a.total);
}
