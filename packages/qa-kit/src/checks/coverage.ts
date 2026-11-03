import { finding } from "../findings.ts";
import type { Finding } from "../types.ts";

export interface CoverageInput {
  states: string[];
  criteria: string[];
  steps: Array<{ state?: string; criteria?: string[] }>;
}

// Report each state that no step reaches and each criterion that no step tests.
export function coverage(input: CoverageInput): Finding[] {
  const reached = new Set(input.steps.map((s) => s.state).filter((s): s is string => s !== undefined));
  const tested = new Set(input.steps.flatMap((s) => s.criteria ?? []));
  const out: Finding[] = [];
  for (const state of input.states) {
    if (!reached.has(state)) {
      out.push(finding({ check: "coverage", rule: "state-not-reached", severity: "fail", state, message: `No step reaches the state "${state}".` }));
    }
  }
  for (const criterion of input.criteria) {
    if (!tested.has(criterion)) {
      out.push(finding({ check: "coverage", rule: "criterion-without-test", severity: "fail", message: `No step tests the criterion "${criterion}".` }));
    }
  }
  return out;
}
