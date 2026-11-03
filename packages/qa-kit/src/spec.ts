export interface SpecState { id: string; screen: string; state: string; sees: string; how: string }
export interface SpecItem { id: string; text: string }

/** The lines under a "## <heading>" up to the next "## " heading. */
function section(md: string, heading: string): string[] {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim().toLowerCase() === `## ${heading.toLowerCase()}`);
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^##\s/.test(l));
  return end < 0 ? rest : rest.slice(0, end);
}

function cells(row: string): string[] {
  const PIPE = "\u0000";
  return row.trim().replace(/\\\|/g, PIPE).replace(/^\||\|$/g, "").split("|").map((c) => c.trim().replaceAll(PIPE, "|"));
}

export function parseStates(md: string): SpecState[] {
  const rows = section(md, "States").filter((l) => l.trim().startsWith("|"));
  const [header, , ...body] = rows;
  if (!header) return [];
  const h = cells(header).map((c) => c.toLowerCase());
  if (h[0] !== "screen" || h[1] !== "state") return [];
  return body.map(cells).filter((c) => c[0] && c[1]).map(([screen = "", state = "", sees = "", how = ""]) => ({ id: `${screen}: ${state}`, screen, state, sees, how }));
}

// Only a bullet at column 0 is an item. An indented sub-bullet adds detail to the item above it.
function listItems(md: string, heading: string, prefix: string): SpecItem[] {
  return section(md, heading)
    .map((l) => /^[-*]\s+(?:\[[ xX]\]\s+)?(.+)$/.exec(l)?.[1]?.trim())
    .filter((t): t is string => Boolean(t))
    .map((text, i) => ({ id: `${prefix}${i + 1}`, text }));
}

export const parseCriteria = (md: string) => listItems(md, "Acceptance criteria", "AC");
export const parseFlows = (md: string) => listItems(md, "Interaction test plan", "IT");

const lit = (s: string) => JSON.stringify(s);
const comment = (s: string) => s.replace(/\r?\n/g, " ").replace(/\*\//g, "* /");

/** A Playwright spec with one test.fixme for each state and each flow. A person or the planning-qa skill fills each one. */
export function specSkeleton(input: { feature: string; configImport: string; states: SpecState[]; criteria: SpecItem[]; flows: SpecItem[] }): string {
  const lines = [
    `// QA spec skeleton for ${comment(input.feature)}. Made by "qa skeleton".`,
    `// Each test is test.fixme until it reaches its state from a named seed scenario and asserts the expected values.`,
    `import { createQaTest } from "@feature-qa/kit";`,
    `import config from ${lit(input.configImport)};`,
    ``,
    `const test = createQaTest(config);`,
    ``,
    `// Acceptance criteria. Tag each qa.step with the ids it proves.`,
    ...input.criteria.map((c) => `// ${c.id}: ${comment(c.text)}`),
    ``,
    `test.describe(${lit(input.feature)}, () => {`,
  ];
  for (const s of input.states) {
    lines.push(
      `  test.fixme(${lit(s.id)}, async ({ page, qa }) => {`,
      `    // How they got here: ${comment(s.how)}`,
      `    // Expected: ${comment(s.sees)}`,
      `    await qa.step(${lit(s.state)}, { state: ${lit(s.id)}, criteria: [] });`,
      `  });`,
    );
  }
  for (const f of input.flows) {
    lines.push(
      `  test.fixme(${lit(`${f.id}: ${f.text.slice(0, 60)}`)}, async ({ page, qa }) => {`,
      `    // Flow: ${comment(f.text)}`,
      `    await qa.step(${lit(f.id)}, { criteria: [] });`,
      `  });`,
    );
  }
  lines.push(`});`, ``);
  return lines.join("\n");
}
