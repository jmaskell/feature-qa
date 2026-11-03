import { describe, expect, it } from "vitest";
import { parseCriteria, parseFlows, parseStates, specSkeleton } from "../../src/spec.ts";

const DESIGN = `# Design: PLAN-7

## States
| Screen | State | What the person sees | How they got here |
|---|---|---|---|
| Property page | Let | The tenant name and "Message tenant" | From the list |
| Property page | Vacant | "None" under Tenant | From the list |
| Property page | Rent a \\| b | A pipe | Typed |

## Interaction test plan
- Message: open the page → press "Message tenant" → the dialog opens
- Escape: open the dialog → press Escape → the dialog closes
`;
const ISSUE = `## Acceptance criteria
- [ ] Each state shows as specified.
- [x] The title holds no name.

## Sequence boundary
- Not a criterion.
`;

describe("spec parser", () => {
  it("reads the states table, with an escaped pipe", () => {
    const states = parseStates(DESIGN);
    expect(states.map((s) => s.id)).toEqual(["Property page: Let", "Property page: Vacant", "Property page: Rent a | b"]);
    expect(states[0]?.sees).toBe('The tenant name and "Message tenant"');
  });
  it("returns no states when there is no States section", () => {
    expect(parseStates("# Design\n\n## Mocks\n- none\n")).toEqual([]);
  });
  it("reads criteria and flows, and stops at the next heading", () => {
    expect(parseCriteria(ISSUE)).toEqual([{ id: "AC1", text: "Each state shows as specified." }, { id: "AC2", text: "The title holds no name." }]);
    expect(parseFlows(DESIGN).map((f) => f.id)).toEqual(["IT1", "IT2"]);
  });
  it("writes a skeleton with one fixme test for each state and flow, with safe string literals", () => {
    const out = specSkeleton({ feature: 'Property "page"', configImport: "../qa.config.ts", states: parseStates(DESIGN), criteria: parseCriteria(ISSUE), flows: parseFlows(DESIGN) });
    expect(out.match(/test\.fixme\(/g)).toHaveLength(5);
    expect(out).toContain('test.describe("Property \\"page\\""');
    expect(out).toContain('state: "Property page: Let"');
    expect(out).toContain("// AC2: The title holds no name.");
    expect(out).toContain('import config from "../qa.config.ts";');
  });
});

describe("list items", () => {
  it("reads only top-level bullets, so an indented sub-bullet is not a criterion or a flow", () => {
    const issue = "## Acceptance criteria\n- [ ] The agent sees the list.\n  - Sorted by address.\n    * Case does not matter.\n- [ ] The agent can add a property.\n";
    expect(parseCriteria(issue).map((c) => [c.id, c.text])).toEqual([["AC1", "The agent sees the list."], ["AC2", "The agent can add a property."]]);
    const design = "## Interaction test plan\n- Open the list.\n  - Check the order.\n";
    expect(parseFlows(design).map((f) => f.id)).toEqual(["IT1"]);
  });
});
