# Plan B — finish the checks, add the judges, the report and the skills

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make feature-qa usable end to end: the scripted checks that Plan A left out, a judge queue that sends a model only the screens that changed, one HTML report for the owner, the three skills, the four judge agents, and plugin evals on the fake lettings company.

**Architecture:** Everything that a script can do goes in `packages/qa-kit` and its `qa` command line (`src/cli.ts`, run by Node 24 type stripping). The skills call the `qa` command and dispatch the judge agents only for the tasks that `qa pending` prints. A judge writes a JSON verdict file. `qa record` checks it and puts it in the verdict cache. `qa report` builds the page. The plugin evals run the skills on a copy of the fixture app in the `claude plugin eval` sandbox.

**Tech Stack:** TypeScript ESM on Node 24 (type stripping, `.ts` imports), Playwright 1.63 (Chromium and WebKit), Vitest 5, axe-core, Claude Code plugin skills and agents, `claude plugin eval` (Claude Code 2.1.287).

**Spec:** `docs/spec.md`. Plan A follow-ups and rulings: `docs/plans/2026-10-11-a-followups.md`.

## Global Constraints

- Nothing in `packages/qa-kit`, `skills/`, `agents/` or `templates/` names a project, a brand, a design system or an identity provider. Project facts come only from the `QaConfig` adapter. (AGENTS.md)
- `packages/qa-kit` has two runtime dependencies at most: `@axe-core/playwright`, and `@playwright/test` as a peer dependency. (AGENTS.md) No PNG library: the visual diff uses a browser canvas.
- `fixtures/lettings-app` has no npm dependencies. It uses `node:http` only.
- Every fixture value is fake. Emails end in `@example.test`. Phones use `07700 900xxx`.
- Each new rule is red on its planted defect and green on the clean app, in Chromium and WebKit. A rule with no planted defect goes in `NO_DEFECT_YET` with the reason and the spec that proves it.
- A new rule needs a planted defect, a `RULES` entry in `test/unit/registry.test.ts` and a matrix entry in the same commit.
- A check returns findings. It never throws for a defect.
- "Assert before you judge": a model judges only "is this good?", never "is this true?". (spec §3.1)
- "The model sees only what changed": a verdict is stored against a hash; an unchanged input keeps its verdict. (spec §3.4)
- A judge `✗` (`fail`) blocks the run. A taste item goes to the owner list. A visual change never fails the run by itself. (spec §4.1, §4.4)
- Judges get fresh context and no build context. Copy judge: Sonnet (changed 2026-10-12: an A/B showed Haiku plus re-checks cost more and broke the output format once). Hierarchy judge: Sonnet. First-use and coherence: Sonnet, once per feature. (spec §4.4)
- Personal data never leaves the machine. Never run against a hosted production system. `.qa/` stays local.
- Change the README in the same commit as the behaviour that it describes.
- Run `npm test` before every commit. A task that changes only `skills/`, `agents/`, `evals/` or docs runs `npm run check:plugin` and `npm run test:unit` in place of the full suite.
- Markdown, skill text and code comments use Simplified Technical English: one idea in one sentence, active voice, plain words.
- SKILL.md: body 500 words or less, description starts "Use when" and is under 500 characters. (product-design convention)
- No skill text without a failing eval first (RED, then GREEN). (product-design convention)
- Commit messages end with a `Co-Authored-By:` line that names the model that wrote the commit.

## Review Focus

1. The same text at two widths must give one copy-judge task, not two. Owner cost: a doubled model bill on every run. Pinned in Task 7 step 1.
2. Page text that holds `<script>` or `"` must show as text in the report, never run. Pinned in Task 8 step 1.
3. A judge that writes bad JSON, an unknown key or an unknown verdict must not reach the cache. `qa record` refuses the whole file and names each problem. Pinned in Task 7 step 1.
4. A baseline from another machine with a different image size must give `changed` with ratio 1, not a crash. Pinned in Task 6 step 1.
5. A `design.md` with no States section, or with `\|` inside a cell, must give a clear exit 2 or the right cell text. Pinned in Task 9 step 1.

---

### Task 1: Read-only grids, reflow with no viewport, known limits

**Files:**
- Modify: `packages/qa-kit/src/interactive.ts`
- Modify: `packages/qa-kit/src/checks/interaction.ts` (the `NO_POINTER_ROLES` set)
- Modify: `packages/qa-kit/src/checks/a11y.ts` (`checkReflow`)
- Modify: `fixtures/lettings-app/pages.mjs` (`detail`), `fixtures/lettings-app/pages.mjs` `css()` (grid style)
- Modify: `packages/qa-kit/test/unit/registry.test.ts`
- Create: `packages/qa-kit/test/e2e/interactive.spec.ts`
- Modify: `packages/qa-kit/test/e2e/a11y.spec.ts`
- Modify: `README.md`, `docs/plans/2026-10-11-a-followups.md`

**Interfaces:**
- Produces: `ITEM_ROLES` (exported from `interactive.ts` and `index.ts`). `WIDGET_ROLES` no longer holds `gridcell` or `treeitem`. New rule `a11y/reflow-skipped` (warn).

- [ ] **Step 1: Write the failing tests**

`packages/qa-kit/test/e2e/interactive.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { INTERACTIVE_SELECTOR } from "../../src/interactive.ts";

test("a grid cell or a tree item is a control only when it has a tabindex", async ({ page }) => {
  await page.setContent(`
    <div role="grid" aria-readonly="true"><div role="row">
      <span role="gridcell" id="a">1</span><span role="gridcell" id="b" tabindex="-1">2</span>
    </div></div>
    <ul role="tree"><li role="treeitem" id="c">x</li><li role="treeitem" id="d" tabindex="0">y</li></ul>`);
  const matches = await page.evaluate(
    (sel) => ["a", "b", "c", "d"].map((id) => document.getElementById(id)!.matches(sel)),
    INTERACTIVE_SELECTOR,
  );
  expect(matches).toEqual([false, true, false, true]);
});
```

Add to `packages/qa-kit/test/e2e/a11y.spec.ts`:

```ts
test("reflow gives a warning and changes nothing when the viewport is null", async ({ browser }) => {
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();
  await page.goto("http://localhost:4400/");
  const found = await checkReflow(page);
  expect(found.map((f) => [f.rule, f.severity])).toEqual([["reflow-skipped", "warn"]]);
  expect(page.viewportSize()).toBeNull();
  await context.close();
});
```

In `detail()` of `fixtures/lettings-app/pages.mjs`, add a read-only ARIA grid after the facts list, on every property page:

```js
const history = `<h2 id="rent-history">Rent history</h2><div role="grid" aria-readonly="true" aria-labelledby="rent-history" class="grid"><div role="row"><span role="columnheader">Month</span><span role="columnheader">Paid</span></div><div role="row"><span role="gridcell">October 2026</span><span role="gridcell">£${p.rent}</span></div></div>`;
```

Put `${history}` after `${start}` in the page body. In `css()`, add `.grid [role=row] { display: flex; gap: 16px; }`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm -w @feature-qa/kit run test:e2e -- interactive.spec.ts a11y.spec.ts matrix.spec.ts -g "grid cell|viewport is null|clean app"`
Expected: FAIL. The grid test gives `[true, true, true, true]`. The reflow test gets `[]` and a resized window. The clean matrix for `/properties/p1` fails with `interaction/pointer-cursor` and `conformance/not-a-component` on the grid cells.

- [ ] **Step 3: Write the implementation**

In `packages/qa-kit/src/interactive.ts`, remove `"treeitem"` and `"gridcell"` from `WIDGET_ROLES`, and add:

```ts
/**
 * Item roles inside a grid or a tree. An item is a control only when it has a tabindex.
 * An interactive grid gives each cell a tabindex (0 or -1, a roving tabindex). A read-only grid gives none.
 */
export const ITEM_ROLES = ["gridcell", "treeitem"] as const;

/** CSS selector for a control. Use it with Element.matches() in the browser. */
export const INTERACTIVE_SELECTOR = [
  ...NATIVE,
  ...WIDGET_ROLES.map((r) => `[role=${r}]`),
  ...ITEM_ROLES.map((r) => `[role=${r}][tabindex]`),
].join(",");
```

Export `ITEM_ROLES` from `src/index.ts`. In `checks/interaction.ts`, add `"gridcell"` to `NO_POINTER_ROLES`: a focusable grid cell takes the keyboard, not always a click. Search `src/` for other uses of `WIDGET_ROLES` and keep their meaning.

In `checks/a11y.ts`, replace the start of `checkReflow` and delete `DEFAULT_SIZE`:

```ts
export async function checkReflow(page: Page): Promise<Finding[]> {
  const original = page.viewportSize();
  // With no fixed viewport the window size belongs to the caller. The check cannot restore it, so it does not run.
  if (original === null) {
    return [finding({ check: "a11y", rule: "reflow-skipped", severity: "warn", message: "The viewport has no fixed size, so the reflow rule did not run." })];
  }
  await page.setViewportSize({ width: REFLOW_WIDTH, height: 256 });
  // ... the rest stays as it is.
```

In `test/unit/registry.test.ts`, add `"reflow-skipped"` to `RULES.a11y`, and add to `NO_DEFECT_YET`:
`"a11y/reflow-skipped": "A warning that needs a context with no viewport; proved in a11y.spec.ts."`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS in Chromium and WebKit.

- [ ] **Step 5: Write the known limits in the README**

Add a section `## Known limits` after `## Privacy` in `README.md`:

```markdown
## Known limits

- An `ignore` entry with a `route` does not match the findings of the after-test record from the smoke and leak watchers. Those findings have no route. Use `check` and `rule` to drop them.
- The focus rule presses Shift once for each control before it focuses the control. An app that acts on Shift sees these key presses.
- The `server-log` leak rule reads the log lines that the server writes while a test runs. When tests run in parallel against one server, a leak can show on the wrong test. Run the leak scan with one worker to find the test.
- `reflow-skipped` (`warn`): the viewport has no fixed size, so the reflow rule did not run.
```

Add `reflow-skipped` under `### a11y` in the Checks section with the same text. In `docs/plans/2026-10-11-a-followups.md`, append ` — Done in Plan B Task 1.` to the gridcell, route-ignore, checkReflow, checkFocus and server-log lines.

- [ ] **Step 6: Commit**

```bash
git add -A packages/qa-kit fixtures README.md docs/plans/2026-10-11-a-followups.md
git commit -m "fix: read-only grid cells are not controls; reflow skips with no viewport"
```

---

### Task 2: Overlap of controls, and declared actions in the adapter

**Files:**
- Modify: `packages/qa-kit/src/checks/layout.ts`, `packages/qa-kit/src/checks/smoke.ts`, `packages/qa-kit/src/types.ts`, `packages/qa-kit/src/fixture.ts`, `packages/qa-kit/src/index.ts`
- Modify: `fixtures/lettings-app/defects.mjs`, `fixtures/lettings-app/pages.mjs`
- Modify: `packages/qa-kit/test/unit/layout.test.ts`, `packages/qa-kit/test/unit/registry.test.ts`, `packages/qa-kit/test/e2e/matrix.spec.ts`, `packages/qa-kit/test/e2e/smoke.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `checkAction(page, locator, label)` and `samePath(a, b)` (exported from `checks/access.ts`).
- Produces:
  - `interface DeclaredAction { route: string; role?: string; selector: string; label: string }` in `types.ts`; `QaConfig.actions?: DeclaredAction[]`.
  - `checkDeclaredActions(page: Page, config: QaConfig, role?: string): Promise<Finding[]>` in `checks/smoke.ts`.
  - `StepOptions.actionsAs?: string`: after the page checks, `qa.step` runs the declared actions for that role. Use `"anonymous"` for a signed-out visitor.
  - New rules `layout/overlap` (fail) and `smoke/action-missing` (fail).

- [ ] **Step 1: Write the failing tests**

Add to `packages/qa-kit/test/unit/layout.test.ts` (use the file's `el()` helper):

```ts
describe("overlap", () => {
  const ctl = (selector: string, x: number, y: number, extra: Partial<ElementInfo["style"]> = {}) =>
    el({ selector, interactive: true, tag: "a", box: { x, y, width: 80, height: 24 }, style: extra });
  it("flags two controls whose boxes cross by more than 2px", () => {
    const out = layoutRules([ctl("body > a:nth-child(1)", 0, 0), ctl("body > a:nth-child(2)", 40, 0)], vp);
    expect(out.map((f) => [f.rule, f.selector])).toEqual([["overlap", "body > a:nth-child(2)"]]);
  });
  it("allows boxes that touch or cross by 2px or less", () => {
    expect(layoutRules([ctl("body > a:nth-child(1)", 0, 0), ctl("body > a:nth-child(2)", 78, 0)], vp)).toEqual([]);
  });
  it("skips a control inside another control, and fixed or sticky controls", () => {
    expect(layoutRules([ctl("body > a:nth-child(1)", 0, 0), ctl("body > a:nth-child(1) > button:nth-child(1)", 10, 0)], vp)).toEqual([]);
    expect(layoutRules([ctl("body > a:nth-child(1)", 0, 0), ctl("body > a:nth-child(2)", 40, 0, { position: "fixed" })], vp)).toEqual([]);
    expect(layoutRules([ctl("body > a:nth-child(1)", 0, 0), ctl("body > a:nth-child(2)", 40, 0, { position: "sticky" })], vp)).toEqual([]);
  });
});
```

Add to `packages/qa-kit/test/e2e/smoke.spec.ts`:

```ts
test("checkDeclaredActions runs only the actions for this route and role", async ({ page }) => {
  const config = defineQaConfig({
    baseURL: "http://localhost:4400", routes: ["/properties"], roles: [{ name: "agent" }], scenarios: [], accessMatrix: {},
    actions: [
      { route: "/properties", role: "agent", selector: "[data-action=add-property]", label: "Add property" },
      { route: "/properties", role: "landlord", selector: "[data-action=nothing]", label: "Not for agents" },
      { route: "/tenants", selector: "[data-action=nothing]", label: "Other page" },
    ],
  });
  await page.goto("/sign-in?as=agent");
  await page.goto("/properties");
  expect(await checkDeclaredActions(page, config, "agent")).toEqual([]);
});

test("checkDeclaredActions reports a declared action that is not on the page", async ({ page }) => {
  const config = defineQaConfig({
    baseURL: "http://localhost:4400", routes: ["/"], roles: [], scenarios: [], accessMatrix: {},
    actions: [{ route: "/", selector: "[data-action=missing]", label: "Missing" }],
  });
  await page.goto("/");
  const found = await checkDeclaredActions(page, config, "anonymous");
  expect(found.map((f) => [f.check, f.rule, f.severity])).toEqual([["smoke", "action-missing", "fail"]]);
});
```

Add two defects to `fixtures/lettings-app/defects.mjs`:

```js
  { id: "layout-overlap", check: "layout", rule: "overlap", route: "/properties", role: "agent", description: "The second nav link sits 40px over the first." },
  { id: "smoke-action-missing", check: "smoke", rule: "action-missing", route: "/properties", role: "agent", description: "The add button lost its data-action attribute." },
```

In `pages.mjs`: in `css()`, add `if (ctx.defect === "layout-overlap") out += ".top nav a + a { margin-left: -40px; }";` (follow how `css()` adds other defects). In `properties()`, when `ctx.defect === "smoke-action-missing"`, give the add button `data-act="add-property"` in place of `data-action="add-property"`.

In `matrix.spec.ts`, add to `config`:

```ts
  actions: [{ route: "/properties", role: "agent", selector: "[data-action=add-property]", label: "Add property" }],
```

and replace the hard-coded `checkAction(... "Add property")` block in `runAllChecks` with:

```ts
  found.push(...(await checkDeclaredActions(page, config, role ?? "anonymous")));
```

Add `"overlap"` to `RULES.layout` and `"action-missing"` to `RULES.smoke`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run typecheck; npm run test:unit -- layout registry; npm -w @feature-qa/kit run test:e2e -- smoke.spec.ts matrix.spec.ts`
Expected: FAIL. `checkDeclaredActions` is not defined. `actions` is not in `QaConfig`. No overlap finding.

- [ ] **Step 3: Write the implementation**

In `types.ts`:

```ts
/** A primary action on a route. The smoke check clicks it and expects the page to change. */
export interface DeclaredAction {
  route: string;      // path, for example "/properties"
  role?: string;      // the role that has the action; unset means every role, "anonymous" means signed out
  selector: string;   // CSS selector of the control
  label: string;      // short name for messages, no personal data
}
```

Add `actions?: DeclaredAction[];` to `QaConfig`.

In `checks/layout.ts`, at the end of `layoutRules`, before the return:

```ts
  // Rule 5: two visible controls overlap. A control inside another control does not count.
  // Fixed and sticky boxes move with the scroll, so their document position does not tell.
  const OVERLAP_TOLERANCE_PX = 2;
  const controls = els.filter((e) => e.interactive && e.style.position !== "fixed" && e.style.position !== "sticky");
  for (let i = 0; i < controls.length; i++) {
    for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i] as ElementInfo;
      const b = controls[j] as ElementInfo;
      if (b.selector.startsWith(`${a.selector} > `) || a.selector.startsWith(`${b.selector} > `)) continue;
      const w = Math.min(a.box.x + a.box.width, b.box.x + b.box.width) - Math.max(a.box.x, b.box.x);
      const h = Math.min(a.box.y + a.box.height, b.box.y + b.box.height) - Math.max(a.box.y, b.box.y);
      if (w > OVERLAP_TOLERANCE_PX && h > OVERLAP_TOLERANCE_PX) {
        out.push(finding({ check: "layout", rule: "overlap", severity: "fail", message: "Two controls overlap.", selector: b.selector }));
      }
    }
  }
```

In `checks/smoke.ts`:

```ts
/**
 * Click each declared action for the current route and role, in order, and expect the page to change.
 * Run it after the page checks: an action changes the page.
 */
export async function checkDeclaredActions(page: Page, config: QaConfig, role?: string): Promise<Finding[]> {
  const path = pathOf(page.url());
  if (path === undefined) return [];
  const out: Finding[] = [];
  for (const action of config.actions ?? []) {
    if (!samePath(action.route, path)) continue;
    if (action.role !== undefined && action.role !== role) continue;
    const locator = page.locator(action.selector);
    if ((await locator.count()) === 0) {
      out.push(finding({
        check: "smoke", rule: "action-missing", severity: "fail", route: path,
        message: `The declared action "${action.label.slice(0, 40)}" is not on the page.`,
      }));
      continue;
    }
    out.push(...(await checkAction(page, locator.first(), action.label)));
  }
  return out;
}
```

Import `samePath` from `./access.ts`. If that makes an import cycle, move `samePath` to `findings.ts` and re-export it from `access.ts`.

In `fixture.ts`, add `actionsAs?: string;` to `StepOptions`. In `qa.step`, after `runPageChecks`:

```ts
          if (opts.actionsAs !== undefined) found.push(...(await checkDeclaredActions(page, config, opts.actionsAs)));
```

(`found` must be `let`/a mutable array; pass the result through `filterIgnored` with `config.ignore` like the other findings.) Export `checkDeclaredActions` and `type DeclaredAction` from `index.ts`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS. If a new defect also fails another check in one browser, add that check to its `alsoFails` with a comment that names the cause, as the existing defects do.

- [ ] **Step 5: Change the README**

- Under `### layout`: `- \`overlap\`: two visible controls overlap by more than 2px. A control inside another control, and fixed or sticky controls, do not count.`
- Under `### smoke`: `- \`action-missing\`: a declared action is not on the page.` Change `dead-action` to: `a declared action did not change the page in 2 seconds.`
- In "Adapter options": `- \`actions\`: the primary actions, each with \`route\`, an optional \`role\`, a \`selector\` and a \`label\`. Call \`qa.step(name, { actionsAs: "<role>" })\` to click them after the page checks.`
- Remove the two rows "layout: no overlap" and "A declared action" from "Not built in Plan A".

- [ ] **Step 6: Commit**

```bash
git add -A packages/qa-kit fixtures README.md
git commit -m "feat: overlap rule and declared actions in the adapter"
```

---

### Task 3: Copy — every accessible name, and case drift

**Files:**
- Modify: `packages/qa-kit/src/checks/copy.ts`, `packages/qa-kit/src/types.ts`, `packages/qa-kit/src/index.ts`
- Modify: `fixtures/lettings-app/defects.mjs`, `fixtures/lettings-app/pages.mjs`
- Modify: `packages/qa-kit/test/unit/copy.test.ts`, `packages/qa-kit/test/unit/registry.test.ts`, `packages/qa-kit/test/e2e/matrix.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Produces:
  - `CopyRules.caseRule?: "sentence" | "title"`, `CopyRules.properNouns?: string[]`, `CopyRules.rulesFile?: string` (path to the project's copy rules; the copy judge reads it in Task 7).
  - `CopyInput.names?: string[]` and `CopyInput.labels?: string[]`.
  - `caseDrift(label: string, rule: "sentence" | "title", properNouns?: string[]): boolean` (pure, exported).
  - New rule `copy/case-drift` (fail).

- [ ] **Step 1: Write the failing tests**

Add to `packages/qa-kit/test/unit/copy.test.ts`:

```ts
import { caseDrift, copyRules } from "../../src/checks/copy.ts";

describe("caseDrift", () => {
  it("flags a capital inside a sentence-case label", () => {
    expect(caseDrift("Add Property", "sentence")).toBe(true);
    expect(caseDrift("Add property", "sentence")).toBe(false);
  });
  it("keeps proper nouns, acronyms, I, and a capital after a full stop or a colon", () => {
    expect(caseDrift("Sign in with Harbour Lettings", "sentence", ["Harbour Lettings"])).toBe(false);
    expect(caseDrift("Download the PDF", "sentence")).toBe(false);
    expect(caseDrift("Can I pay now", "sentence")).toBe(false);
    expect(caseDrift("Saved. Next step", "sentence")).toBe(false);
    expect(caseDrift("Status: Let", "sentence")).toBe(false);
  });
  it("matches the longest proper noun first and keeps the word count", () => {
    expect(caseDrift("Harbour Lettings Home", "sentence", ["Harbour", "Harbour Lettings"])).toBe(true);
  });
  it("flags a lower-case word in a title-case label, but not a small word", () => {
    expect(caseDrift("Add New property", "title")).toBe(true);
    expect(caseDrift("Terms of Use", "title")).toBe(false);
  });
});

describe("copyRules with names and labels", () => {
  it("scans accessible names for doubled punctuation and identifiers", () => {
    const out = copyRules({ text: [], buttons: [], labelValuePairs: [], names: ["Close..", "user_id"] });
    expect(out.map((f) => f.rule).sort()).toEqual(["doubled-punctuation", "leaked-identifier"]);
  });
  it("checks the case rule on labels only", () => {
    const input = { text: ["12 Harbour Row, Penzance"], buttons: [], labelValuePairs: [], labels: ["Add Property"] };
    expect(copyRules(input, { caseRule: "sentence" }).map((f) => [f.rule, f.sample])).toEqual([["case-drift", "Add Property"]]);
    expect(copyRules(input, {})).toEqual([]);
  });
});
```

Add a defect to `defects.mjs`:

```js
  { id: "copy-case", check: "copy", rule: "case-drift", route: "/properties", role: "agent", description: "The add button says 'Add Property' in a sentence-case app." },
```

In `pages.mjs` `properties()`, make `addLabel` `"Add Property"` when `ctx.defect === "copy-case"`. Add `"case-drift"` to `RULES.copy`. In `matrix.spec.ts`, set `copy: { bannedTerms: ["seamless"], maxButtonWords: 4, emptyValueWord: "None", caseRule: "sentence", properNouns: ["Harbour Lettings"] }`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- copy registry`
Expected: FAIL. `caseDrift` is not exported.

- [ ] **Step 3: Write the implementation**

In `types.ts`, add to `CopyRules`:

```ts
  caseRule?: "sentence" | "title";         // the case of labels: buttons, tabs, menu items, options, h2–h6, th, label, legend
  properNouns?: string[];                  // words and phrases that keep their capitals, e.g. a company name
  rulesFile?: string;                      // path to the project's copy rules; the copy judge reads it
```

In `checks/copy.ts`:

```ts
// Words that stay lower case inside a title-case label.
const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "with"]);
// A placeholder keeps the word count when a proper noun is taken out.
const HOLE = "⁣";

/**
 * Pure. True when a label breaks the case rule.
 * The first word of each clause is free. A clause starts after ". ", "! ", "? " or ": ".
 * Only plain words count: an acronym (PDF), a mixed word (iPhone) or a number is skipped.
 */
export function caseDrift(label: string, rule: "sentence" | "title", properNouns: string[] = []): boolean {
  let t = label;
  for (const p of [...properNouns].sort((a, b) => b.length - a.length)) {
    t = t.replace(new RegExp(`(?<!\\w)${escapeRegExp(p)}(?!\\w)`, "g"), p.split(/\s+/).map(() => HOLE).join(" "));
  }
  for (const clause of t.split(/[.!?:]\s+/)) {
    const tokens = clause.trim().split(/\s+/);
    for (let i = 1; i < tokens.length; i++) {
      const w = (tokens[i] ?? "").replace(/^[("'“‘]+|[)"'”’,;]+$/g, "");
      if (!/^[A-Za-z][a-z'’-]*$/.test(w)) continue;
      if (rule === "sentence" && /^[A-Z]/.test(w) && w !== "I") return true;
      if (rule === "title" && /^[a-z]/.test(w) && !SMALL_WORDS.has(w)) return true;
    }
  }
  return false;
}
```

In `copyRules`: change `const all = [...input.text, ...input.buttons];` to `const all = [...input.text, ...input.buttons, ...(input.names ?? [])];`, and add before the return:

```ts
  if (rules.caseRule) {
    for (const label of input.labels ?? []) {
      if (caseDrift(label, rules.caseRule, rules.properNouns)) {
        add(out("case-drift", "fail", `A label does not follow the ${rules.caseRule} case rule.`, label));
      }
    }
  }
```

In `checkCopy`, build `names` and `labels` from the collected elements:

```ts
  const { names } = await collectText(page); // reuse the result you already have; do not collect twice
  const LABEL_ROLES = new Set(["button", "tab", "menuitem", "option"]);
  const LABEL_TAGS = new Set(["button", "h2", "h3", "h4", "h5", "h6", "th", "label", "legend"]);
  const labels = els
    .filter((e) => LABEL_TAGS.has(e.tag) || LABEL_ROLES.has(e.role ?? ""))
    .map((e) => (e.interactive ? e.name : e.text))
    .filter((t) => t !== "");
  return copyRules({ text, buttons, labelValuePairs, values, names, labels }, rules);
```

Labels leave out `h1` and links: they often hold record data, such as a name or an address. Export `caseDrift` from `index.ts`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS. The clean pages pass with `caseRule: "sentence"`.

- [ ] **Step 5: Change the README**

Under `### copy`: add `- \`case-drift\`: a label does not follow the adapter's case rule (\`copy.caseRule\`). Labels are the names of buttons, tabs, menu items and options, and the text of h2 to h6, th, label and legend. h1 and links are not labels, because they often hold record data. \`copy.properNouns\` keep their capitals.` Say that the rules now also scan every accessible name. Add `copy.rulesFile` to "Adapter options". Remove the two copy rows from "Not built in Plan A".

- [ ] **Step 6: Commit**

```bash
git add -A packages/qa-kit fixtures README.md
git commit -m "feat: copy rules scan every accessible name and check the case rule"
```

---

### Task 4: Forced colours

**Files:**
- Modify: `packages/qa-kit/src/checks/a11y.ts`, `packages/qa-kit/src/run-checks.ts`, `packages/qa-kit/src/index.ts`
- Modify: `fixtures/lettings-app/defects.mjs`, `fixtures/lettings-app/pages.mjs`
- Modify: `packages/qa-kit/test/e2e/a11y.spec.ts`, `packages/qa-kit/test/unit/registry.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `collectElements(page)` (for the selectors, so `ignore` matches).
- Produces: `checkForcedColors(page: Page): Promise<Finding[]>`. New rule `a11y/forced-colors` (fail). `runPageChecks` runs it inside the `a11y` page check.

The rule reads computed styles. It does not emulate forced colours, because WebKit does not support the emulation. In forced-colours mode the browser removes background colours. A control that shows only a background colour then disappears.

- [ ] **Step 1: Write the failing tests**

Add to `packages/qa-kit/test/e2e/a11y.spec.ts`:

```ts
test("forced colours: a control with only a background colour disappears", async ({ page }) => {
  await page.setContent(`
    <button id="bg" aria-label="Map" style="width:44px;height:44px;border:0;background:#0a6"></button>
    <button id="text" style="border:0;background:#0a6">Save</button>
    <button id="border" aria-label="Map" style="width:44px;height:44px;border:1px solid transparent;background:#0a6"></button>
    <button id="icon" aria-label="Map" style="border:0;background:#0a6"><svg width="20" height="20" aria-hidden="true"><rect width="20" height="20"/></svg></button>
    <button id="opt-out" aria-label="Map" style="width:44px;height:44px;border:0;background:#0a6;forced-color-adjust:none"></button>
    <input id="field" aria-label="Name" style="border:0;background:#eee">`);
  const found = await checkForcedColors(page);
  expect(found.map((f) => [f.rule, f.severity])).toEqual([["forced-colors", "fail"]]);
  expect(found[0]?.selector).toContain("button:nth-child(1)");
});
```

Note on `#opt-out`: WebKit may not know `forced-color-adjust`. If WebKit reports `#opt-out`, read the property with `getPropertyValue("forced-color-adjust")` and treat an empty value as `auto`. Then mark that line of the test as Chromium-only with `test.info().project.name`, and write the reason in a comment.

Add a defect:

```js
  { id: "a11y-forced-colors", check: "a11y", rule: "forced-colors", route: "/properties", role: "agent", description: "A map toggle is a coloured square with no border, text or icon." },
```

In `pages.mjs` `properties()`, when `ctx.defect === "a11y-forced-colors"`, push to `extras`:

```js
`<button type="button" data-ds data-slot="button" data-variant="button:primary" class="btn" aria-label="Show map" style="width:44px;height:44px;padding:0;border:0;background:#0a6"></button>`
```

Add `"forced-colors"` to `RULES.a11y`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm -w @feature-qa/kit run test:e2e -- a11y.spec.ts -g "forced colours"`
Expected: FAIL. `checkForcedColors` is not defined.

- [ ] **Step 3: Write the implementation**

In `checks/a11y.ts`:

```ts
import { collectElements } from "../collect.ts";

/**
 * Forced colours: each enabled control must keep a text, an icon or a border.
 * The browser removes background colours in forced-colours mode, so a control that shows only a background disappears.
 * Form fields are drawn by the browser, so they always pass. forced-color-adjust: none means the author handles the mode.
 */
export async function checkForcedColors(page: Page): Promise<Finding[]> {
  const controls = (await collectElements(page)).filter((e) => e.interactive && !e.disabled);
  const lost = await page.evaluate((selectors) => selectors.filter((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const s = getComputedStyle(el);
    if ((s.getPropertyValue("forced-color-adjust") || "auto") === "none") return false;
    if (["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) return false;
    if ((el.textContent ?? "").trim() !== "") return false;
    if (el.querySelector("img, svg, picture, video, canvas")) return false;
    if (s.backgroundImage.includes("url(")) return false;
    const sides = ["top", "right", "bottom", "left"];
    return !sides.some((side) => parseFloat(s.getPropertyValue(`border-${side}-width`)) > 0
      && !["none", "hidden"].includes(s.getPropertyValue(`border-${side}-style`)));
  }), controls.map((e) => e.selector));
  return lost.map((selector) => finding({
    check: "a11y", rule: "forced-colors", severity: "fail", selector,
    message: "In forced-colours mode this control shows no text, icon or border, so it disappears.",
  }));
}
```

In `run-checks.ts`, inside `if (wanted.has("a11y"))`, add `found.push(...(await checkForcedColors(page)));` after `checkA11y`. Export it from `index.ts`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS. The clean app passes. If a clean control fails, check the fixture CSS first: the rule is right when the control has no text, icon or border.

- [ ] **Step 5: Change the README**

Under `### a11y`: `- \`forced-colors\`: an enabled control has no text, icon or border, so it disappears in forced-colours mode. The rule reads computed styles and does not emulate the mode, so it works in WebKit too.` Remove the forced colours row from "Not built in Plan A".

- [ ] **Step 6: Commit**

```bash
git add -A packages/qa-kit fixtures README.md
git commit -m "feat: forced-colours rule"
```

---

### Task 5: Profiles

**Files:**
- Create: `packages/qa-kit/src/profiles.ts`
- Modify: `packages/qa-kit/src/fixture.ts`, `packages/qa-kit/src/index.ts`
- Create: `packages/qa-kit/test/unit/profiles.test.ts`, `packages/qa-kit/test/e2e/profiles.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Produces:
  - `QA_VIEWPORTS = { phone: {375×812}, tablet: {768×1024}, laptop: {1280×800}, desktop: {1440×900} }`, `type QaViewport`, `type QaBrowser = "chromium" | "webkit"`.
  - `qaProjects(opts?: QaProfileOptions): Array<{ name: string; use: Record<string, unknown> }>`.
  - The `createQaTest` result has the test option `qaTextScale: number` (default 1).

- [ ] **Step 1: Write the failing tests**

`packages/qa-kit/test/unit/profiles.test.ts`:

```ts
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
```

`packages/qa-kit/test/e2e/profiles.spec.ts`:

```ts
import { expect } from "@playwright/test";
import { createQaTest } from "../../src/fixture.ts";
import { defineQaConfig } from "../../src/config.ts";

const config = defineQaConfig({ baseURL: "http://localhost:4400", routes: ["/"], roles: [], scenarios: [], accessMatrix: {} });
const test = createQaTest(config);

test.describe("text scale 200%", () => {
  test.use({ qaTextScale: 2 });
  test("doubles the root font size before the page scripts run", async ({ page, qa }) => {
    void qa;
    await page.goto("/");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe("32px");
  });
});

test("the default text scale changes nothing", async ({ page, qa }) => {
  void qa;
  await page.goto("/");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe("16px");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- profiles; npm -w @feature-qa/kit run test:e2e -- profiles.spec.ts`
Expected: FAIL. `profiles.ts` does not exist. `qaTextScale` is not an option.

- [ ] **Step 3: Write the implementation**

`packages/qa-kit/src/profiles.ts`:

```ts
import { devices } from "@playwright/test";

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
}

const DEVICE: Record<QaBrowser, string> = { chromium: "Desktop Chrome", webkit: "Desktop Safari" };

/** Playwright projects for the QA profiles. Put the result in the `projects` list of playwright.config.ts. */
export function qaProjects(opts: QaProfileOptions = {}): Array<{ name: string; use: Record<string, unknown> }> {
  const browsers = opts.browsers ?? ["chromium", "webkit"];
  const viewports = opts.viewports ?? (Object.keys(QA_VIEWPORTS) as QaViewport[]);
  const extras = opts.extras ?? ["dark", "reduced-motion", "text-200"];
  const at = opts.extraViewport ?? "phone";
  const out: Array<{ name: string; use: Record<string, unknown> }> = [];
  for (const b of browsers) {
    const base = devices[DEVICE[b]];
    for (const v of viewports) out.push({ name: `${b}-${v}`, use: { ...base, viewport: { ...QA_VIEWPORTS[v] } } });
    for (const x of extras) {
      const use: Record<string, unknown> = { ...base, viewport: { ...QA_VIEWPORTS[at] } };
      if (x === "dark") use.colorScheme = "dark";
      if (x === "reduced-motion") use.reducedMotion = "reduce";
      if (x === "text-200") use.qaTextScale = 2;
      out.push({ name: `${b}-${at}-${x}`, use });
    }
  }
  return out;
}
```

In `fixture.ts`, change the extend call to:

```ts
  return base.extend<{ qa: Qa; qaTextScale: number }>({
    qaTextScale: [1, { option: true }],
    qa: async ({ page, qaTextScale }, use, testInfo) => {
      if (qaTextScale !== 1) {
        // Text zoom: a larger root font size. It applies before the page scripts run and again when the document is ready.
        await page.addInitScript((scale) => {
          const apply = () => { if (document.documentElement) document.documentElement.style.fontSize = `${scale * 100}%`; };
          apply();
          document.addEventListener("DOMContentLoaded", apply);
        }, qaTextScale);
      }
      // ... the rest of the fixture stays as it is.
```

Export `QA_VIEWPORTS`, `qaProjects` and the types from `index.ts`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Change the README**

Add a section `## Profiles` after "Add the kit to a project": `qaProjects()` makes 14 projects: each browser at 375, 768, 1280 and 1440, and dark mode, reduced motion and 200% text once for each browser at 375. Show:

```ts
import { ensureQaRunId, qaProjects } from "@feature-qa/kit";
ensureQaRunId();
export default defineConfig({ projects: qaProjects({ browsers: ["chromium", "webkit"] }) });
```

Say: "Content stress (long names, accents) comes from the seed data. Add a scenario with long and accented values." Remove the profiles row from "Not built in Plan A".

- [ ] **Step 6: Commit**

```bash
git add -A packages/qa-kit README.md
git commit -m "feat: QA profiles for widths, dark mode, reduced motion and 200% text"
```

---

### Task 6: Visual baselines

**Files:**
- Create: `packages/qa-kit/src/visual.ts`
- Modify: `packages/qa-kit/src/types.ts` (`CHECK_IDS`), `packages/qa-kit/src/index.ts`
- Create: `packages/qa-kit/test/e2e/visual.spec.ts`
- Modify: `packages/qa-kit/test/unit/registry.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `readManifest(dir)`, `StepRecord` (`manifest.ts`).
- Produces:
  - `"visual"` in `CHECK_IDS`. Rules `visual/new-baseline` (warn) and `visual/changed` (warn).
  - `interface ImageDiff { sameSize: boolean; changed: number; total: number; ratio: number }`
  - `compareImages(browser: Browser, a: Buffer, b: Buffer): Promise<ImageDiff>`
  - `interface VisualResult { stepId: string; status: "same" | "changed" | "new"; ratio: number }`
  - `diffRun(opts: { runDir: string; baselineDir: string; browser: Browser; tolerance?: number }): Promise<{ results: VisualResult[]; findings: Finding[] }>`. It writes `<runDir>/visual.json` (the results array).
  - `approveBaselines(runDir: string, baselineDir: string, ids?: string[]): Promise<string[]>`
  - `defaultBaselineDir(root?: string): string` → `<root>/qa-baselines`.

Baselines hold fake data only, so a project can commit `qa-baselines/`. Screenshots differ between machines (fonts), so a project compares only against baselines from the same machine or the same CI image.

- [ ] **Step 1: Write the failing tests**

`packages/qa-kit/test/e2e/visual.spec.ts`:

```ts
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { appendStep, type StepRecord } from "../../src/manifest.ts";
import { approveBaselines, compareImages, diffRun } from "../../src/visual.ts";

async function shot(page: import("@playwright/test").Page, defect = "none"): Promise<Buffer> {
  await page.context().addCookies([{ name: "qa_defect", value: defect, url: "http://localhost:4400" }]);
  await page.goto("/");
  return page.screenshot({ animations: "disabled" });
}

test("compareImages finds no change in the same page and a change in a defect", async ({ page, browser }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  const a = await shot(page);
  const b = await shot(page);
  const c = await shot(page, "layout-type");
  expect((await compareImages(browser, a, b)).changed).toBe(0);
  const diff = await compareImages(browser, a, c);
  expect(diff.sameSize).toBe(true);
  expect(diff.changed).toBeGreaterThan(0);
});

test("compareImages gives ratio 1 for images of different sizes", async ({ page, browser }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  const a = await shot(page);
  await page.setViewportSize({ width: 400, height: 600 });
  const b = await shot(page);
  expect(await compareImages(browser, a, b)).toMatchObject({ sameSize: false, ratio: 1 });
});

test("diffRun marks new steps, approve stores them, and the next run is the same", async ({ page, browser }) => {
  const runDir = await mkdtemp(join(tmpdir(), "qa-run-"));
  const baselineDir = await mkdtemp(join(tmpdir(), "qa-base-"));
  await page.setViewportSize({ width: 800, height: 600 });
  const step: StepRecord = {
    id: "chromium/visual/home/01-home/800x600", name: "home", route: "/", viewport: "800x600", project: "chromium",
    screenshot: "screenshots/chromium/visual/home/01-home/800x600.png", text: [], names: [], title: "", aria: "", findings: [], hash: "h",
  };
  await appendStep(runDir, step);
  const { mkdir } = await import("node:fs/promises");
  await mkdir(join(runDir, "screenshots/chromium/visual/home/01-home"), { recursive: true });
  await writeFile(join(runDir, step.screenshot), await shot(page));

  const first = await diffRun({ runDir, baselineDir, browser });
  expect(first.results.map((r) => r.status)).toEqual(["new"]);
  expect(first.findings.map((f) => [f.check, f.rule, f.severity])).toEqual([["visual", "new-baseline", "warn"]]);
  expect(await approveBaselines(runDir, baselineDir)).toEqual([step.id]);
  const second = await diffRun({ runDir, baselineDir, browser });
  expect(second.results.map((r) => r.status)).toEqual(["same"]);
  expect(second.findings).toEqual([]);
  expect(JSON.parse(await readFile(join(runDir, "visual.json"), "utf8"))).toEqual(second.results);
});
```

In `registry.test.ts`: add `visual: ["new-baseline", "changed"]` to `RULES`; add to `NO_DEFECT_YET`:
`"visual/new-baseline": "Compares two runs, not one page; proved in visual.spec.ts."` and `"visual/changed": "Compares two runs, not one page; proved in visual.spec.ts."`. Change the test "has a planted defect for every check except coverage" to skip `coverage` and `visual`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm -w @feature-qa/kit run test:e2e -- visual.spec.ts`
Expected: FAIL. `visual.ts` does not exist.

- [ ] **Step 3: Write the implementation**

`packages/qa-kit/src/visual.ts`:

```ts
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Browser } from "@playwright/test";
import { finding } from "./findings.ts";
import { readManifest } from "./manifest.ts";
import type { Finding } from "./types.ts";

export interface ImageDiff { sameSize: boolean; changed: number; total: number; ratio: number }
export interface VisualResult { stepId: string; status: "same" | "changed" | "new"; ratio: number }

/** The share of pixels that may change before a step counts as changed. */
export const VISUAL_TOLERANCE = 0.001;
// A pixel counts as changed when one colour channel moves by more than this. It ignores anti-alias noise.
const CHANNEL_TOLERANCE = 24;

export function defaultBaselineDir(root: string = process.cwd()): string {
  return join(root, "qa-baselines");
}

/** Compare two PNG images in a blank browser page with a canvas. No image library is needed. */
export async function compareImages(browser: Browser, a: Buffer, b: Buffer): Promise<ImageDiff> {
  const page = await browser.newPage();
  try {
    return await page.evaluate(async ([a64, b64, tol]) => {
      const load = async (s: string) => { const img = new Image(); img.src = `data:image/png;base64,${s}`; await img.decode(); return img; };
      const [ia, ib] = await Promise.all([load(a64), load(b64)]);
      const total = Math.max(ia.width * ia.height, ib.width * ib.height);
      if (ia.width !== ib.width || ia.height !== ib.height) return { sameSize: false, changed: total, total, ratio: 1 };
      const pixels = (img: HTMLImageElement) => {
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, img.width, img.height).data;
      };
      const pa = pixels(ia);
      const pb = pixels(ib);
      let changed = 0;
      for (let i = 0; i < pa.length; i += 4) {
        if (Math.abs(pa[i]! - pb[i]!) > tol || Math.abs(pa[i + 1]! - pb[i + 1]!) > tol || Math.abs(pa[i + 2]! - pb[i + 2]!) > tol) changed++;
      }
      return { sameSize: true, changed, total, ratio: total === 0 ? 0 : changed / total };
    }, [a.toString("base64"), b.toString("base64"), CHANNEL_TOLERANCE] as const);
  } finally {
    await page.close();
  }
}

const exists = (p: string) => access(p).then(() => true, () => false);
const baselineOf = (baselineDir: string, stepId: string) => join(baselineDir, `${stepId}.png`);

/**
 * Compare each step screenshot of a run with its approved baseline.
 * The findings are warnings only: a visual change goes to a judge or to the owner. It never fails the run by itself.
 */
export async function diffRun(opts: { runDir: string; baselineDir: string; browser: Browser; tolerance?: number }): Promise<{ results: VisualResult[]; findings: Finding[] }> {
  const tolerance = opts.tolerance ?? VISUAL_TOLERANCE;
  const { steps } = await readManifest(opts.runDir);
  const results: VisualResult[] = [];
  const findings: Finding[] = [];
  for (const step of steps) {
    if (!step.screenshot) continue;
    const base = baselineOf(opts.baselineDir, step.id);
    const where = { route: step.route, viewport: step.viewport, ...(step.state === undefined ? {} : { state: step.state }) };
    if (!(await exists(base))) {
      results.push({ stepId: step.id, status: "new", ratio: 1 });
      findings.push(finding({ check: "visual", rule: "new-baseline", severity: "warn", message: `The step "${step.name.slice(0, 40)}" has no approved baseline.`, ...where }));
      continue;
    }
    const diff = await compareImages(opts.browser, await readFile(base), await readFile(join(opts.runDir, step.screenshot)));
    const status = diff.ratio > tolerance ? "changed" : "same";
    results.push({ stepId: step.id, status, ratio: diff.ratio });
    if (status === "changed") {
      findings.push(finding({ check: "visual", rule: "changed", severity: "warn", message: `${(diff.ratio * 100).toFixed(2)}% of the pixels changed.`, ...where }));
    }
  }
  await writeFile(join(opts.runDir, "visual.json"), JSON.stringify(results, null, 2));
  return { results, findings };
}

/** Copy the screenshots of a run to the baselines. With ids, copy only those steps. Return the ids copied. */
export async function approveBaselines(runDir: string, baselineDir: string, ids?: string[]): Promise<string[]> {
  const wanted = ids ? new Set(ids) : null;
  const done: string[] = [];
  for (const step of (await readManifest(runDir)).steps) {
    if (!step.screenshot || (wanted && !wanted.has(step.id))) continue;
    const target = baselineOf(baselineDir, step.id);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(runDir, step.screenshot), target);
    done.push(step.id);
  }
  return done;
}
```

Add `"visual"` to `CHECK_IDS` in `types.ts`. Export everything above from `index.ts`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS in Chromium and WebKit.

- [ ] **Step 5: Change the README**

Add `### visual` under "Checks": the rules, that they are warnings only, the baseline folder `qa-baselines/` (commit it, fake data only), and the note on machines and fonts. Remove the visual row from "Not built in Plan A".

- [ ] **Step 6: Commit**

```bash
git add -A packages/qa-kit README.md
git commit -m "feat: visual baselines with a canvas pixel diff"
```

---

### Task 7: Judge queue, verdict record and the `qa` command

**Files:**
- Create: `packages/qa-kit/src/judges.ts`, `packages/qa-kit/src/cli.ts`
- Modify: `packages/qa-kit/src/cache.ts` (`Verdict`), `packages/qa-kit/src/manifest.ts` (`latestRunDir`), `packages/qa-kit/src/fixture.ts` (`StepOptions.mock`), `packages/qa-kit/src/index.ts`, `packages/qa-kit/package.json` (`bin`)
- Create: `packages/qa-kit/test/unit/judges.test.ts`, `packages/qa-kit/test/unit/cli.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `readManifest`, `runDir`, `defaultCacheDir`, `getVerdict`, `putVerdict`, `verdictKey`, `diffRun`, `approveBaselines`, `defaultBaselineDir`.
- Produces:
  - `Verdict` gets `taste?: string[]` and `model?: string`.
  - `StepOptions.mock?: string` and `StepRecord.mock?: string`: a path to the mock region (PNG or HTML), relative to the project root.
  - `latestRunDir(root?: string): Promise<string | null>` in `manifest.ts`: the run directory whose `run.json` changed last.
  - In `judges.ts`:
    - `JUDGES: Record<JudgeId, { version: string; scope: "step" | "feature"; reads: "text" | "screenshot" }>`, with `JudgeId = "copy" | "hierarchy" | "first-use" | "coherence"`.
    - `interface JudgeInputStep { id: string; name: string; route: string; state?: string; viewport: string; text?: string[]; names?: string[]; title?: string; screenshot?: string; mock?: string }`. `screenshot` and `mock` are absolute paths.
    - `interface JudgeInput { judge: JudgeId; key: string; rulesFile?: string; rubric?: string; task?: string; steps: JudgeInputStep[] }`
    - `interface JudgeIndexEntry { judge: JudgeId; key: string; stepIds: string[]; input: string; cached: boolean }` (`input` is an absolute path)
    - `pendingJudgeTasks(opts: { runDir: string; cacheDir: string; judges: JudgeId[]; rulesFile?: string; rubric?: string; task?: string; featureProject?: string }): Promise<JudgeIndexEntry[]>`. It writes each input to `<runDir>/judge-inputs/<judge>/<key>.json`, merges the entries into `<runDir>/judge-index.json`, and returns only the entries with `cached: false`.
    - `interface VerdictRecord { key: string; judge: JudgeId; verdict: "pass" | "fail" | "cannot-judge"; reason: string; taste?: string[]; model?: string }`
    - `validateVerdicts(data: unknown): VerdictRecord[]`. It throws one `Error` that lists every problem.
    - `recordVerdicts(opts: { runDir: string; cacheDir: string; records: VerdictRecord[] }): Promise<number>`. It refuses a key that has no input file in the run. It writes nothing when one record is bad.
    - `DEFAULT_RUBRIC = "Can I scan this, and do I know what the question is?"`
  - `qa` command (`src/cli.ts`), with these subcommands. Each prints JSON to stdout. Exit 0 on success, 1 when a blocking result exists (named per command), 2 on a usage error.
    - `qa latest` → `{ "runDir": "..." }`
    - `qa pending --judges copy,hierarchy [--run <dir>] [--rules <file>] [--rubric <text>] [--task <text>]` → the pending entries.
    - `qa record <file> [--run <dir>]` → `{ "recorded": n }`
    - `qa visual [--run <dir>] [--baselines <dir>]` → `{ "results": [...], "findings": [...] }`
    - `qa approve [--run <dir>] [--baselines <dir>] [ids...]` → `{ "approved": [...] }`
    - `--run` defaults to `latestRunDir()`. The cache is `defaultCacheDir()`. The baselines are `defaultBaselineDir()`.

The copy judge keys on the text only: the same text at two widths gives one task (Review Focus 1). The other step judges key on the step hash (screenshot and text). The feature judges key on all step hashes of one project.

- [ ] **Step 1: Write the failing tests**

`packages/qa-kit/test/unit/judges.test.ts`:

```ts
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getVerdict } from "../../src/cache.ts";
import { appendStep, type StepRecord } from "../../src/manifest.ts";
import { pendingJudgeTasks, recordVerdicts, validateVerdicts } from "../../src/judges.ts";

function step(id: string, viewport: string, text: string[], hash: string, project = "chromium"): StepRecord {
  return { id: `${project}/spec/t/01-home/${viewport}-${id}`, name: "home", route: "/", viewport, project,
    screenshot: `screenshots/${id}.png`, text, names: [], title: "Home", aria: "", findings: [], hash };
}

async function run(steps: StepRecord[]) {
  const runDir = await mkdtemp(join(tmpdir(), "qa-run-"));
  const cacheDir = await mkdtemp(join(tmpdir(), "qa-cache-"));
  for (const s of steps) await appendStep(runDir, s);
  return { runDir, cacheDir };
}

describe("pendingJudgeTasks", () => {
  it("gives one copy task for the same text at two widths, and one hierarchy task for each screenshot", async () => {
    const { runDir, cacheDir } = await run([step("a", "375x812", ["Hello"], "h1"), step("b", "1280x800", ["Hello"], "h2")]);
    const tasks = await pendingJudgeTasks({ runDir, cacheDir, judges: ["copy", "hierarchy"] });
    expect(tasks.filter((t) => t.judge === "copy").map((t) => t.stepIds.length)).toEqual([2]);
    expect(tasks.filter((t) => t.judge === "hierarchy")).toHaveLength(2);
    const input = JSON.parse(await readFile(tasks[0]!.input, "utf8"));
    expect(input.steps[0].text).toEqual(["Hello"]);
  });

  it("skips the after-test record and steps with no screenshot", async () => {
    const after = { ...step("c", "375x812", [], "h3"), name: "after-test", screenshot: "" };
    const { runDir, cacheDir } = await run([after]);
    expect(await pendingJudgeTasks({ runDir, cacheDir, judges: ["copy", "hierarchy"] })).toEqual([]);
  });

  it("returns nothing for a judge whose verdict is cached, and marks it cached in the index", async () => {
    const { runDir, cacheDir } = await run([step("a", "375x812", ["Hello"], "h1")]);
    const [task] = await pendingJudgeTasks({ runDir, cacheDir, judges: ["copy"] });
    await recordVerdicts({ runDir, cacheDir, records: [{ key: task!.key, judge: "copy", verdict: "pass", reason: "Plain words." }] });
    expect(await pendingJudgeTasks({ runDir, cacheDir, judges: ["copy"] })).toEqual([]);
    const index = JSON.parse(await readFile(join(runDir, "judge-index.json"), "utf8"));
    expect(index.map((e: { cached: boolean }) => e.cached)).toEqual([true]);
  });

  it("gives one feature task over the steps of one project", async () => {
    const { runDir, cacheDir } = await run([
      step("a", "375x812", ["A"], "h1", "chromium"), step("b", "375x812", ["B"], "h2", "chromium"), step("c", "375x812", ["C"], "h3", "webkit"),
    ]);
    const tasks = await pendingJudgeTasks({ runDir, cacheDir, judges: ["first-use"], task: "Find a property." });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.stepIds).toHaveLength(2);
    expect(JSON.parse(await readFile(tasks[0]!.input, "utf8")).task).toBe("Find a property.");
  });
});

describe("validateVerdicts and recordVerdicts", () => {
  it("lists every problem and records nothing", async () => {
    expect(() => validateVerdicts([{ key: "k", judge: "copy", verdict: "maybe", reason: "" }, { judge: "nope" }]))
      .toThrow(/verdict.*maybe[\s\S]*reason[\s\S]*judge.*nope/);
    expect(() => validateVerdicts("not a list")).toThrow(/array/);
  });

  it("refuses a key that has no input in the run", async () => {
    const { runDir, cacheDir } = await run([step("a", "375x812", ["Hello"], "h1")]);
    await expect(recordVerdicts({ runDir, cacheDir, records: [{ key: "f".repeat(64), judge: "copy", verdict: "pass", reason: "x" }] }))
      .rejects.toThrow(/no input/);
  });

  it("stores the verdict with the judge version", async () => {
    const { runDir, cacheDir } = await run([step("a", "375x812", ["Hello"], "h1")]);
    const [task] = await pendingJudgeTasks({ runDir, cacheDir, judges: ["copy"] });
    await recordVerdicts({ runDir, cacheDir, records: [{ key: task!.key, judge: "copy", verdict: "fail", reason: "Jargon.", taste: ["Shorter heading"] }] });
    expect(await getVerdict(cacheDir, task!.key)).toMatchObject({ judge: "copy", judgeVersion: "1", verdict: "fail", taste: ["Shorter heading"] });
  });
});
```

`packages/qa-kit/test/unit/cli.test.ts`:

```ts
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { appendStep } from "../../src/manifest.ts";

const CLI = resolve(import.meta.dirname, "../../src/cli.ts");
const exec = promisify(execFile);
async function qa(cwd: string, ...args: string[]) {
  try {
    const { stdout } = await exec("node", [CLI, ...args], { cwd });
    return { code: 0, out: stdout };
  } catch (e) {
    const err = e as { code: number; stdout: string; stderr: string };
    return { code: err.code, out: err.stdout, err: err.stderr };
  }
}

describe("qa command", () => {
  it("exits 2 with usage text for an unknown command", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "qa-cli-"));
    const r = await qa(cwd, "nope");
    expect(r.code).toBe(2);
  });

  it("finds the latest run, lists pending tasks, and records verdicts", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "qa-cli-"));
    const runDir = join(cwd, ".qa", "runs", "r1");
    await appendStep(runDir, { id: "chromium/s/t/01-a/375x812", name: "a", route: "/", viewport: "375x812", project: "chromium",
      screenshot: "screenshots/a.png", text: ["Hi"], names: [], title: "", aria: "", findings: [], hash: "h" });
    expect(JSON.parse((await qa(cwd, "latest")).out).runDir).toBe(runDir);
    const pending = JSON.parse((await qa(cwd, "pending", "--judges", "copy")).out);
    expect(pending).toHaveLength(1);
    const file = join(cwd, "v.json");
    await writeFile(file, JSON.stringify([{ key: pending[0].key, judge: "copy", verdict: "pass", reason: "Fine." }]));
    expect(JSON.parse((await qa(cwd, "record", file)).out)).toEqual({ recorded: 1 });
    expect(JSON.parse((await qa(cwd, "pending", "--judges", "copy")).out)).toEqual([]);
  });

  it("exits 2 and records nothing for a bad verdict file", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "qa-cli-"));
    await appendStep(join(cwd, ".qa", "runs", "r1"), { id: "c/s/t/01-a/1x1", name: "a", route: "/", viewport: "1x1", project: "c",
      screenshot: "s.png", text: [], names: [], title: "", aria: "", findings: [], hash: "h" });
    const file = join(cwd, "v.json");
    await writeFile(file, "{not json");
    expect((await qa(cwd, "record", file)).code).toBe(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- judges cli`
Expected: FAIL. `judges.ts` and `cli.ts` do not exist.

- [ ] **Step 3: Write the implementation**

In `cache.ts`, add `taste?: string[]; model?: string;` to `Verdict`.

In `manifest.ts`, add `mock?: string;` to `StepRecord` and:

```ts
/** The run directory under <root>/.qa/runs whose run.json changed last, or null when there is none. */
export async function latestRunDir(root: string = process.cwd()): Promise<string | null> {
  const base = join(root, ".qa", "runs");
  let best: { dir: string; time: number } | null = null;
  for (const entry of await readdir(base, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue;
    const dir = join(base, entry.name);
    const time = await stat(join(dir, "run.json")).then((s) => s.mtimeMs, () => -1);
    if (time >= 0 && (best === null || time > best.time)) best = { dir, time };
  }
  return best?.dir ?? null;
}
```

In `fixture.ts`, add `mock?: string;` to `StepOptions` and copy it into the record like `state`.

`packages/qa-kit/src/judges.ts`:

```ts
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { getVerdict, putVerdict, verdictKey } from "./cache.ts";
import { readManifest, type StepRecord } from "./manifest.ts";

export type JudgeId = "copy" | "hierarchy" | "first-use" | "coherence";
export const JUDGES: Record<JudgeId, { version: string; scope: "step" | "feature"; reads: "text" | "screenshot" }> = {
  copy: { version: "1", scope: "step", reads: "text" },
  hierarchy: { version: "1", scope: "step", reads: "screenshot" },
  "first-use": { version: "1", scope: "feature", reads: "screenshot" },
  coherence: { version: "1", scope: "feature", reads: "screenshot" },
};
export const DEFAULT_RUBRIC = "Can I scan this, and do I know what the question is?";

export interface JudgeInputStep { id: string; name: string; route: string; state?: string; viewport: string; text?: string[]; names?: string[]; title?: string; screenshot?: string; mock?: string }
export interface JudgeInput { judge: JudgeId; key: string; rulesFile?: string; rubric?: string; task?: string; steps: JudgeInputStep[] }
export interface JudgeIndexEntry { judge: JudgeId; key: string; stepIds: string[]; input: string; cached: boolean }
export interface VerdictRecord { key: string; judge: JudgeId; verdict: "pass" | "fail" | "cannot-judge"; reason: string; taste?: string[]; model?: string }

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const judgeable = (s: StepRecord) => s.name !== "after-test" && s.screenshot !== "";

function inputStep(runDir: string, s: StepRecord, reads: "text" | "screenshot"): JudgeInputStep {
  const base: JudgeInputStep = { id: s.id, name: s.name, route: s.route, viewport: s.viewport, ...(s.state === undefined ? {} : { state: s.state }) };
  if (reads === "text") return { ...base, text: s.text, names: s.names, title: s.title };
  return { ...base, screenshot: resolve(runDir, s.screenshot), ...(s.mock === undefined ? {} : { mock: resolve(s.mock) }) };
}

export async function pendingJudgeTasks(opts: {
  runDir: string; cacheDir: string; judges: JudgeId[]; rulesFile?: string; rubric?: string; task?: string; featureProject?: string;
}): Promise<JudgeIndexEntry[]> {
  const steps = (await readManifest(opts.runDir)).steps.filter(judgeable);
  const entries: JudgeIndexEntry[] = [];
  for (const judge of opts.judges) {
    const spec = JUDGES[judge];
    const groups = new Map<string, StepRecord[]>();
    if (spec.scope === "step") {
      for (const s of steps) {
        const content = spec.reads === "text" ? sha(JSON.stringify({ text: s.text, names: s.names, title: s.title })) : s.hash;
        groups.set(content, [...(groups.get(content) ?? []), s]);
      }
    } else {
      const project = opts.featureProject ?? [...new Set(steps.map((s) => s.project))].sort()[0];
      const mine = steps.filter((s) => s.project === project).sort((a, b) => a.id.localeCompare(b.id));
      if (mine.length > 0) groups.set(sha(JSON.stringify(mine.map((s) => s.hash))), mine);
    }
    for (const [content, group] of groups) {
      const key = verdictKey(content, judge, spec.version);
      const input: JudgeInput = {
        judge, key,
        ...(judge === "copy" && opts.rulesFile ? { rulesFile: resolve(opts.rulesFile) } : {}),
        ...(judge === "hierarchy" ? { rubric: opts.rubric ?? DEFAULT_RUBRIC } : {}),
        ...(spec.scope === "feature" && opts.task ? { task: opts.task } : {}),
        // A copy task shows one step: the others have the same text.
        steps: (spec.reads === "text" ? group.slice(0, 1) : group).map((s) => inputStep(opts.runDir, s, spec.reads)),
      };
      const file = join(opts.runDir, "judge-inputs", judge, `${key}.json`);
      await mkdir(join(opts.runDir, "judge-inputs", judge), { recursive: true });
      await writeFile(file, JSON.stringify(input, null, 2));
      entries.push({ judge, key, stepIds: group.map((s) => s.id), input: file, cached: (await getVerdict(opts.cacheDir, key)) !== null });
    }
  }
  const indexFile = join(opts.runDir, "judge-index.json");
  const old: JudgeIndexEntry[] = JSON.parse(await readFile(indexFile, "utf8").catch(() => "[]"));
  const merged = [...old.filter((e) => !opts.judges.includes(e.judge)), ...entries];
  await writeFile(indexFile, JSON.stringify(merged, null, 2));
  return entries.filter((e) => !e.cached);
}

const VERDICTS = new Set(["pass", "fail", "cannot-judge"]);
const REASON_MAX = 400;
const TASTE_MAX = 5;

/** Check a judge's output. Throw one Error that lists every problem. */
export function validateVerdicts(data: unknown): VerdictRecord[] {
  if (!Array.isArray(data)) throw new Error("The verdict file must hold a JSON array.");
  const problems: string[] = [];
  data.forEach((r, i) => {
    const at = `item ${i}`;
    if (typeof r !== "object" || r === null) { problems.push(`${at}: not an object`); return; }
    const v = r as Record<string, unknown>;
    if (typeof v.key !== "string" || !/^[0-9a-f]{64}$/.test(v.key)) problems.push(`${at}: key must be 64 hex characters`);
    if (typeof v.judge !== "string" || !(v.judge in JUDGES)) problems.push(`${at}: judge "${String(v.judge)}" is not known`);
    if (typeof v.verdict !== "string" || !VERDICTS.has(v.verdict)) problems.push(`${at}: verdict "${String(v.verdict)}" must be pass, fail or cannot-judge`);
    if (typeof v.reason !== "string" || v.reason.trim() === "" || v.reason.length > REASON_MAX) problems.push(`${at}: reason must be 1 to ${REASON_MAX} characters`);
    if (v.taste !== undefined && (!Array.isArray(v.taste) || v.taste.length > TASTE_MAX || v.taste.some((t) => typeof t !== "string" || t.length > 200))) {
      problems.push(`${at}: taste must be at most ${TASTE_MAX} strings of 200 characters or less`);
    }
  });
  if (problems.length > 0) throw new Error(`The verdict file has problems:\n${problems.join("\n")}`);
  return data as VerdictRecord[];
}

/** Put each verdict in the cache. Refuse the whole list when one key has no input in this run. */
export async function recordVerdicts(opts: { runDir: string; cacheDir: string; records: VerdictRecord[] }): Promise<number> {
  const records = validateVerdicts(opts.records);
  for (const r of records) {
    const input = join(opts.runDir, "judge-inputs", r.judge, `${r.key}.json`);
    if (!(await access(input).then(() => true, () => false))) throw new Error(`The key ${r.key.slice(0, 12)}… has no input in this run for the ${r.judge} judge.`);
  }
  for (const r of records) {
    await putVerdict(opts.cacheDir, r.key, {
      judge: r.judge, judgeVersion: JUDGES[r.judge].version, verdict: r.verdict, reason: r.reason,
      ...(r.taste ? { taste: r.taste } : {}), ...(r.model ? { model: r.model } : {}),
    });
  }
  return records.length;
}
```

`packages/qa-kit/src/cli.ts`:

```ts
#!/usr/bin/env node
// The qa command. Each subcommand prints JSON to stdout.
// Exit codes: 0 done, 1 a blocking result, 2 a usage error or bad input.
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { defaultCacheDir, latestRunDir } from "./manifest.ts";
import { JUDGES, pendingJudgeTasks, recordVerdicts, validateVerdicts, type JudgeId } from "./judges.ts";
import { approveBaselines, defaultBaselineDir, diffRun } from "./visual.ts";

class UsageError extends Error {}

const USAGE = `Usage: qa <command> [options]
  latest                                   print the latest run directory
  pending --judges <list> [--rules f] [--rubric t] [--task t] [--run d]
  record <verdicts.json> [--run d]
  visual [--run d] [--baselines d]
  approve [--run d] [--baselines d] [step ids...]`;

async function runOf(value: string | undefined): Promise<string> {
  const dir = value ?? (await latestRunDir());
  if (!dir) throw new UsageError("No run found in .qa/runs. Run the Playwright specs first.");
  return dir;
}

type Command = (args: string[]) => Promise<{ out: unknown; code?: number }>;

export const COMMANDS: Record<string, Command> = {
  async latest() {
    return { out: { runDir: await runOf(undefined) } };
  },
  async pending(args) {
    const { values } = parseArgs({ args, options: { judges: { type: "string" }, rules: { type: "string" }, rubric: { type: "string" }, task: { type: "string" }, run: { type: "string" } } });
    const judges = (values.judges ?? "").split(",").filter(Boolean) as JudgeId[];
    const unknown = judges.filter((j) => !(j in JUDGES));
    if (judges.length === 0 || unknown.length > 0) throw new UsageError(`--judges must list known judges: ${Object.keys(JUDGES).join(", ")}`);
    const out = await pendingJudgeTasks({ runDir: await runOf(values.run), cacheDir: defaultCacheDir(), judges,
      ...(values.rules ? { rulesFile: values.rules } : {}), ...(values.rubric ? { rubric: values.rubric } : {}), ...(values.task ? { task: values.task } : {}) });
    return { out };
  },
  async record(args) {
    const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { run: { type: "string" } } });
    const file = positionals[0];
    if (!file) throw new UsageError("record needs a verdict file.");
    let data: unknown;
    try { data = JSON.parse(await readFile(file, "utf8")); } catch { throw new UsageError(`${file} is not valid JSON.`); }
    let records;
    try { records = validateVerdicts(data); } catch (e) { throw new UsageError((e as Error).message); }
    try {
      return { out: { recorded: await recordVerdicts({ runDir: await runOf(values.run), cacheDir: defaultCacheDir(), records }) } };
    } catch (e) {
      if (e instanceof UsageError) throw e;
      throw new UsageError((e as Error).message);
    }
  },
  async visual(args) {
    const { values } = parseArgs({ args, options: { run: { type: "string" }, baselines: { type: "string" } } });
    const { chromium } = await import("@playwright/test");
    const browser = await chromium.launch();
    try {
      return { out: await diffRun({ runDir: await runOf(values.run), baselineDir: values.baselines ?? defaultBaselineDir(), browser }) };
    } finally {
      await browser.close();
    }
  },
  async approve(args) {
    const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { run: { type: "string" }, baselines: { type: "string" } } });
    const approved = await approveBaselines(await runOf(values.run), values.baselines ?? defaultBaselineDir(), positionals.length ? positionals : undefined);
    return { out: { approved } };
  },
};

export async function main(argv: string[]): Promise<number> {
  const [name, ...rest] = argv;
  const command = name ? COMMANDS[name] : undefined;
  if (!command) { process.stderr.write(`${USAGE}\n`); return 2; }
  try {
    const { out, code } = await command(rest);
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    return code ?? 0;
  } catch (e) {
    process.stderr.write(`qa ${name}: ${(e as Error).message}\n`);
    return e instanceof UsageError || (e as { code?: string }).code === "ERR_PARSE_ARGS_UNKNOWN_OPTION" ? 2 : 1;
  }
}

// npx runs the command through a symlink in node_modules/.bin, so compare real paths.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) process.exitCode = await main(process.argv.slice(2));
```

The `visual` command uses Chromium for the pixel compare in every case. The compare is the same in each browser.

In `packages/qa-kit/package.json`, add `"bin": { "qa": "./src/cli.ts" }`. Run `npm install` at the root, so the workspace links `node_modules/.bin/qa`. Export `pendingJudgeTasks`, `recordVerdicts`, `validateVerdicts`, `JUDGES`, `DEFAULT_RUBRIC`, `latestRunDir` and the types from `index.ts`.

Note: Node strips types only for files outside `node_modules`. The CLI runs when the kit is a workspace or a `file:` link (a symlink). A published package needs a build step first. Write this in the README.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS. Also run `npx qa nope; echo $?` from the repo root. Expected: the usage text and `2`.

- [ ] **Step 5: Change the README**

Add a section `## The qa command` with the subcommands, the exit codes, the type-stripping note, and this flow: "Run the specs. Run `qa pending`. Give each pending input file to its judge. Run `qa record` with the judge's verdict file. Run `qa report`." Add `mock` to the `qa.step` options.

- [ ] **Step 6: Commit**

```bash
git add -A packages/qa-kit package-lock.json README.md
git commit -m "feat: judge queue, verdict record and the qa command"
```

---

### Task 8: The report

**Files:**
- Create: `packages/qa-kit/src/report.ts`
- Modify: `packages/qa-kit/src/cli.ts` (add `report`), `packages/qa-kit/src/index.ts`
- Create: `packages/qa-kit/test/unit/report.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `readManifest`, `JudgeIndexEntry` (from `<runDir>/judge-index.json`), `getVerdict`, `VisualResult` (from `<runDir>/visual.json`).
- Produces:
  - `interface ReportVerdict { judge: string; key: string; verdict: "pass" | "fail" | "cannot-judge"; reason: string; taste?: string[] }`
  - `interface ReportData { runId: string; startedAt: string; steps: StepRecord[]; verdicts: Record<string, ReportVerdict[]>; featureVerdicts: ReportVerdict[]; visual: Record<string, VisualResult>; pending: number }`. `verdicts` and `visual` are keyed by step id. A step judge's verdict goes on each step that it covers. A feature judge's verdict goes in `featureVerdicts`. `pending` counts index entries with no cached verdict.
  - `loadReportData(runDir: string, cacheDir: string): Promise<ReportData>`
  - `interface OwnerItem { kind: "cannot-judge" | "taste" | "visual"; stepId?: string; text: string }`
  - `ownerList(data: ReportData): OwnerItem[]`: each `cannot-judge` verdict, each taste item, each `changed` or `new` visual result. Nothing else.
  - `isBlocked(data: ReportData): boolean`: true when a step has a `fail` finding, or a verdict is `fail`.
  - `renderReport(data: ReportData, runDir: string): string`: one static HTML page with inline CSS and no script.
  - `writeReport(runDir: string, cacheDir: string): Promise<{ path: string; blocked: boolean; owner: OwnerItem[]; pending: number }>`. It writes `<runDir>/report.html`.
  - `qa report [--run d]` prints the `writeReport` result. Exit 1 when `blocked` is true.

- [ ] **Step 1: Write the failing tests**

`packages/qa-kit/test/unit/report.test.ts`:

```ts
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { putVerdict } from "../../src/cache.ts";
import { appendStep, type StepRecord } from "../../src/manifest.ts";
import { isBlocked, loadReportData, ownerList, renderReport, writeReport } from "../../src/report.ts";

const base: StepRecord = { id: "chromium/s/t/01-home/375x812", name: "Home <b>", route: "/", viewport: "375x812", project: "chromium",
  screenshot: "screenshots/chromium/s/t/01-home/375x812.png", text: ['<script>alert("x")</script>'], names: [], title: "", aria: "", findings: [], hash: "h" };

async function fixture(step: StepRecord = base) {
  const runDir = await mkdtemp(join(tmpdir(), "qa-rep-"));
  const cacheDir = await mkdtemp(join(tmpdir(), "qa-cache-"));
  await appendStep(runDir, step);
  return { runDir, cacheDir };
}

describe("report", () => {
  it("escapes page text and names, and links the screenshot by a relative path", async () => {
    const { runDir, cacheDir } = await fixture();
    const html = renderReport(await loadReportData(runDir, cacheDir), runDir);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Home &lt;b&gt;");
    expect(html).toContain('src="screenshots/chromium/s/t/01-home/375x812.png"');
  });

  it("puts only cannot-judge, taste and visual items on the owner list", async () => {
    const { runDir, cacheDir } = await fixture();
    const index = [
      { judge: "copy", key: "a".repeat(64), stepIds: [base.id], input: "x", cached: true },
      { judge: "hierarchy", key: "b".repeat(64), stepIds: [base.id], input: "y", cached: true },
      { judge: "hierarchy", key: "c".repeat(64), stepIds: [base.id], input: "z", cached: false },
    ];
    await writeFile(join(runDir, "judge-index.json"), JSON.stringify(index));
    await putVerdict(cacheDir, "a".repeat(64), { judge: "copy", judgeVersion: "1", verdict: "pass", reason: "Fine.", taste: ["Warmer tone"] });
    await putVerdict(cacheDir, "b".repeat(64), { judge: "hierarchy", judgeVersion: "1", verdict: "cannot-judge", reason: "No mock." });
    await writeFile(join(runDir, "visual.json"), JSON.stringify([{ stepId: base.id, status: "changed", ratio: 0.2 }]));
    const data = await loadReportData(runDir, cacheDir);
    expect(ownerList(data).map((i) => i.kind).sort()).toEqual(["cannot-judge", "taste", "visual"]);
    expect(data.pending).toBe(1);
    expect(isBlocked(data)).toBe(false);
  });

  it("is blocked by a fail finding or a fail verdict, and writes report.html", async () => {
    const failing = { ...base, findings: [{ check: "copy" as const, rule: "doubled-punctuation", severity: "fail" as const, message: "Text has doubled punctuation." }] };
    const { runDir, cacheDir } = await fixture(failing);
    const result = await writeReport(runDir, cacheDir);
    expect(result.blocked).toBe(true);
    expect(await readFile(result.path, "utf8")).toContain("doubled-punctuation");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- report`
Expected: FAIL. `report.ts` does not exist.

- [ ] **Step 3: Write the implementation**

`packages/qa-kit/src/report.ts`:

```ts
import { readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { getVerdict } from "./cache.ts";
import type { JudgeIndexEntry } from "./judges.ts";
import { JUDGES } from "./judges.ts";
import { readManifest, type StepRecord } from "./manifest.ts";
import type { VisualResult } from "./visual.ts";

export interface ReportVerdict { judge: string; key: string; verdict: "pass" | "fail" | "cannot-judge"; reason: string; taste?: string[] }
export interface ReportData {
  runId: string; startedAt: string; steps: StepRecord[];
  verdicts: Record<string, ReportVerdict[]>; featureVerdicts: ReportVerdict[];
  visual: Record<string, VisualResult>; pending: number;
}
export interface OwnerItem { kind: "cannot-judge" | "taste" | "visual"; stepId?: string; text: string }

const readJson = async <T>(file: string, fallback: T): Promise<T> => readFile(file, "utf8").then((t) => JSON.parse(t) as T, () => fallback);

export async function loadReportData(runDir: string, cacheDir: string): Promise<ReportData> {
  const manifest = await readManifest(runDir);
  const index = await readJson<JudgeIndexEntry[]>(join(runDir, "judge-index.json"), []);
  const visualList = await readJson<VisualResult[]>(join(runDir, "visual.json"), []);
  const verdicts: Record<string, ReportVerdict[]> = {};
  const featureVerdicts: ReportVerdict[] = [];
  let pending = 0;
  for (const entry of index) {
    const v = await getVerdict(cacheDir, entry.key);
    if (!v) { pending++; continue; }
    const rv: ReportVerdict = { judge: entry.judge, key: entry.key, verdict: v.verdict, reason: v.reason, ...(v.taste ? { taste: v.taste } : {}) };
    if (JUDGES[entry.judge]?.scope === "feature") featureVerdicts.push(rv);
    else for (const id of entry.stepIds) (verdicts[id] ??= []).push(rv);
  }
  return { runId: manifest.runId, startedAt: manifest.startedAt, steps: manifest.steps, verdicts, featureVerdicts,
    visual: Object.fromEntries(visualList.map((r) => [r.stepId, r])), pending };
}

export function ownerList(data: ReportData): OwnerItem[] {
  const out: OwnerItem[] = [];
  const seen = new Set<string>();
  const fromVerdict = (v: ReportVerdict, stepId?: string) => {
    if (seen.has(`${v.key}|${stepId ?? ""}`)) return;
    seen.add(`${v.key}|${stepId ?? ""}`);
    if (v.verdict === "cannot-judge") out.push({ kind: "cannot-judge", ...(stepId ? { stepId } : {}), text: `${v.judge}: ${v.reason}` });
    for (const t of v.taste ?? []) out.push({ kind: "taste", ...(stepId ? { stepId } : {}), text: `${v.judge}: ${t}` });
  };
  // A copy verdict covers several steps. Show it once, on its first step.
  const shown = new Set<string>();
  for (const [stepId, list] of Object.entries(data.verdicts)) {
    for (const v of list) { if (!shown.has(v.key)) { shown.add(v.key); fromVerdict(v, stepId); } }
  }
  for (const v of data.featureVerdicts) fromVerdict(v);
  for (const r of Object.values(data.visual)) {
    if (r.status !== "same") out.push({ kind: "visual", stepId: r.stepId, text: r.status === "new" ? "No approved baseline." : `${(r.ratio * 100).toFixed(2)}% of the pixels changed.` });
  }
  return out;
}

export function isBlocked(data: ReportData): boolean {
  return data.steps.some((s) => s.findings.some((f) => f.severity === "fail"))
    || Object.values(data.verdicts).some((l) => l.some((v) => v.verdict === "fail"))
    || data.featureVerdicts.some((v) => v.verdict === "fail");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const SYMBOL = { pass: "✓", fail: "✗", "cannot-judge": "⊘" } as const;
const testOf = (id: string) => id.split("/").slice(0, -2).join("/");

function mockHtml(step: StepRecord, runDir: string): string {
  if (!step.mock) return "";
  const src = esc(relative(runDir, resolve(step.mock)));
  return /\.(png|jpe?g|webp|gif)$/i.test(step.mock)
    ? `<figure><img loading="lazy" src="${src}" alt="Mock"><figcaption>Mock</figcaption></figure>`
    : `<figure><iframe sandbox src="${src}" title="Mock"></iframe><figcaption>Mock</figcaption></figure>`;
}

function stepHtml(step: StepRecord, data: ReportData, runDir: string): string {
  const findings = step.findings.length === 0 ? "<p>No findings.</p>" : `<table><tr><th>Severity</th><th>Rule</th><th>Message</th><th>Where</th></tr>${
    step.findings.map((f) => `<tr class="${f.severity}"><td>${f.severity}</td><td>${esc(`${f.check}/${f.rule}`)}</td><td>${esc(f.message)}${f.count ? ` (${f.count}×)` : ""}</td><td><code>${esc(f.selector ?? f.sample ?? "")}</code></td></tr>`).join("")}</table>`;
  const verdicts = (data.verdicts[step.id] ?? []).map((v) => `<li class="${v.verdict}">${SYMBOL[v.verdict]} ${esc(v.judge)}: ${esc(v.reason)}</li>`).join("");
  const visual = data.visual[step.id];
  const shot = step.screenshot ? `<figure><img loading="lazy" src="${esc(step.screenshot)}" alt="Screenshot of ${esc(step.name)}"><figcaption>Build</figcaption></figure>` : "";
  return `<article><h3>${esc(step.name)}</h3><p class="meta">${esc(step.route)} · ${esc(step.viewport)} · ${esc(step.project)}${step.state ? ` · state: ${esc(step.state)}` : ""}${visual ? ` · visual: ${visual.status}` : ""}</p>
<div class="shots">${shot}${mockHtml(step, runDir)}</div>${findings}${verdicts ? `<ul class="verdicts">${verdicts}</ul>` : ""}</article>`;
}

export function renderReport(data: ReportData, runDir: string): string {
  const blocked = isBlocked(data);
  const owner = ownerList(data);
  const byTest = new Map<string, StepRecord[]>();
  for (const s of data.steps) byTest.set(testOf(s.id), [...(byTest.get(testOf(s.id)) ?? []), s]);
  const fails = data.steps.flatMap((s) => s.findings.filter((f) => f.severity === "fail")).length;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>QA report ${esc(data.runId)}</title><style>
body{font:15px/1.5 system-ui,sans-serif;margin:0 auto;max-width:1200px;padding:16px;color:#1a1a1a;background:#fff}
.status{padding:12px 16px;border-radius:6px;font-weight:600}.blocked{background:#fde8e8}.ready{background:#e6f4ea}
.shots{display:flex;gap:16px;flex-wrap:wrap}figure{margin:0;max-width:100%}img,iframe{max-width:560px;width:100%;border:1px solid #ccc}
iframe{height:420px}table{border-collapse:collapse;width:100%;margin:8px 0}td,th{border:1px solid #ddd;padding:4px 8px;text-align:left;vertical-align:top}
tr.fail td:first-child,li.fail{color:#a50e0e}li.cannot-judge{color:#7a5b00}article{border-top:1px solid #ddd;padding:16px 0}.meta{color:#555}
</style></head><body>
<h1>QA report</h1><p class="meta">Run ${esc(data.runId)} · started ${esc(data.startedAt)} · ${data.steps.length} steps · ${fails} failures · ${data.pending} judge tasks not done</p>
<p class="status ${blocked ? "blocked" : "ready"}">${blocked ? "Blocked: fix the failures below before the owner looks." : "Ready for the owner."}</p>
<h2>For you</h2>${owner.length === 0 ? "<p>Nothing needs your judgement.</p>" : `<ul>${owner.map((i) => `<li>${esc(i.kind)}: ${esc(i.text)}${i.stepId ? ` <code>${esc(i.stepId)}</code>` : ""}</li>`).join("")}</ul>`}
${data.featureVerdicts.length ? `<h2>Feature judges</h2><ul>${data.featureVerdicts.map((v) => `<li class="${v.verdict}">${SYMBOL[v.verdict]} ${esc(v.judge)}: ${esc(v.reason)}</li>`).join("")}</ul>` : ""}
${[...byTest].map(([test, steps]) => `<section><h2>${esc(test)}</h2>${steps.map((s) => stepHtml(s, data, runDir)).join("")}</section>`).join("")}
</body></html>`;
}

export async function writeReport(runDir: string, cacheDir: string): Promise<{ path: string; blocked: boolean; owner: OwnerItem[]; pending: number }> {
  const data = await loadReportData(runDir, cacheDir);
  const path = join(runDir, "report.html");
  await writeFile(path, renderReport(data, runDir));
  return { path, blocked: isBlocked(data), owner: ownerList(data), pending: data.pending };
}
```

In `cli.ts`, add to `COMMANDS` and to `USAGE` (`report [--run d]`):

```ts
  async report(args) {
    const { values } = parseArgs({ args, options: { run: { type: "string" } } });
    const result = await writeReport(await runOf(values.run), defaultCacheDir());
    return { out: result, code: result.blocked ? 1 : 0 };
  },
```

Export the report functions and types from `index.ts`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Change the README**

Add `qa report` to "The qa command": what the page shows, that the owner list holds only `⊘` verdicts, taste items and visual changes, that the page has no script, and that it stays in `.qa/`.

- [ ] **Step 6: Commit**

```bash
git add -A packages/qa-kit README.md
git commit -m "feat: one static HTML report with the owner list"
```

---

### Task 9: Spec parser, spec skeleton, coverage command and the ledger

**Files:**
- Create: `packages/qa-kit/src/spec.ts`, `packages/qa-kit/src/ledger.ts`
- Modify: `packages/qa-kit/src/cli.ts` (add `skeleton`, `coverage`, `ledger`), `packages/qa-kit/src/index.ts`
- Create: `packages/qa-kit/test/unit/spec.test.ts`, `packages/qa-kit/test/unit/ledger.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `coverage(input)` from `checks/coverage.ts`, `readManifest`.
- Produces:
  - `interface SpecState { id: string; screen: string; state: string; sees: string; how: string }`. `id` is `"<screen>: <state>"`.
  - `interface SpecItem { id: string; text: string }`. Criteria ids are `AC1`, `AC2`… in file order. Flow ids are `IT1`, `IT2`….
  - `parseStates(md: string): SpecState[]`: the first table under a `## States` heading. The table header must start with `Screen | State`. `\|` inside a cell is a literal pipe.
  - `parseCriteria(md: string): SpecItem[]`: list items under `## Acceptance criteria` (`- [ ] x`, `- [x] x` or `- x`).
  - `parseFlows(md: string): SpecItem[]`: list items under `## Interaction test plan`.
  - `specSkeleton(input: { feature: string; configImport: string; states: SpecState[]; criteria: SpecItem[]; flows: SpecItem[] }): string`: a Playwright spec. Each state and each flow is a `test.fixme`, so nothing passes before a person fills it.
  - `appendLedger(file: string, entry: { date: string; what: string; check: string }): Promise<void>`. It creates the file with `LEDGER_HEADER` when it is missing. It escapes `|` in cells.
  - `LEDGER_HEADER` (exported string).
  - `qa skeleton --design <design.md> --issue <issue.md> --feature <name> --config <import path> --out <file>` → `{ "out": file, "states": n, "criteria": n, "flows": n }`. Exit 2 when the design has no States table or the out file exists.
  - `qa coverage --design <design.md> --issue <issue.md> [--run d]` → the coverage findings. Exit 1 when one exists.
  - `qa ledger --what <text> --check <check/rule or test path> [--file qa-catches.md] [--date YYYY-MM-DD]` → `{ "file": ... }`.

- [ ] **Step 1: Write the failing tests**

`packages/qa-kit/test/unit/spec.test.ts`:

```ts
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
```

`packages/qa-kit/test/unit/ledger.test.ts`:

```ts
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
```

Add to `test/unit/cli.test.ts`:

```ts
  it("skeleton refuses a design with no States table", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "qa-cli-"));
    await writeFile(join(cwd, "design.md"), "# Design\n");
    await writeFile(join(cwd, "issue.md"), "## Acceptance criteria\n- [ ] x\n");
    const r = await qa(cwd, "skeleton", "--design", "design.md", "--issue", "issue.md", "--feature", "F", "--config", "./qa.config.ts", "--out", "f.spec.ts");
    expect(r.code).toBe(2);
  });

  it("coverage exits 1 when a state is not reached", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "qa-cli-"));
    await writeFile(join(cwd, "design.md"), "## States\n| Screen | State | Sees | How |\n|---|---|---|---|\n| P | Let | x | y |\n");
    await writeFile(join(cwd, "issue.md"), "## Acceptance criteria\n- [ ] x\n");
    await appendStep(join(cwd, ".qa", "runs", "r1"), { id: "c/s/t/01-a/1x1", name: "a", route: "/", viewport: "1x1", project: "c",
      screenshot: "s.png", text: [], names: [], title: "", aria: "", findings: [], hash: "h", state: "P: Let" });
    const r = await qa(cwd, "coverage", "--design", "design.md", "--issue", "issue.md");
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).map((f: { rule: string }) => f.rule)).toEqual(["criterion-without-test"]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- spec ledger cli`
Expected: FAIL. `spec.ts` and `ledger.ts` do not exist.

- [ ] **Step 3: Write the implementation**

`packages/qa-kit/src/spec.ts`:

```ts
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

function listItems(md: string, heading: string, prefix: string): SpecItem[] {
  return section(md, heading)
    .map((l) => /^\s*[-*]\s+(?:\[[ xX]\]\s+)?(.+)$/.exec(l)?.[1]?.trim())
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
```

`packages/qa-kit/src/ledger.ts`:

```ts
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const LEDGER_HEADER = `# QA catches

One row for each defect that the owner found by hand. Each row names the check or the test that now catches it.

| Date | What the owner found | Caught now by |
|---|---|---|
`;

const cell = (s: string) => s.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();

export async function appendLedger(file: string, entry: { date: string; what: string; check: string }): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, LEDGER_HEADER, { flag: "wx" }).catch((e) => {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  });
  await appendFile(file, `| ${cell(entry.date)} | ${cell(entry.what)} | ${cell(entry.check)} |\n`);
}
```

In `cli.ts`, add to `COMMANDS` and `USAGE`:

```ts
  async skeleton(args) {
    const { values } = parseArgs({ args, options: { design: { type: "string" }, issue: { type: "string" }, feature: { type: "string" }, config: { type: "string" }, out: { type: "string" } } });
    const { design, issue, feature, config, out } = values;
    if (!design || !issue || !feature || !config || !out) throw new UsageError("skeleton needs --design, --issue, --feature, --config and --out.");
    const designMd = await readFile(design, "utf8");
    const states = parseStates(designMd);
    if (states.length === 0) throw new UsageError(`${design} has no "## States" table that starts with "| Screen | State |".`);
    const criteria = parseCriteria(await readFile(issue, "utf8"));
    const flows = parseFlows(designMd);
    try {
      await writeFile(out, specSkeleton({ feature, configImport: config, states, criteria, flows }), { flag: "wx" });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new UsageError(`${out} exists. Choose another --out.`);
      throw e;
    }
    return { out: { out, states: states.length, criteria: criteria.length, flows: flows.length } };
  },
  async coverage(args) {
    const { values } = parseArgs({ args, options: { design: { type: "string" }, issue: { type: "string" }, run: { type: "string" } } });
    if (!values.design || !values.issue) throw new UsageError("coverage needs --design and --issue.");
    const states = parseStates(await readFile(values.design, "utf8")).map((s) => s.id);
    const criteria = parseCriteria(await readFile(values.issue, "utf8")).map((c) => c.id);
    const { steps } = await readManifest(await runOf(values.run));
    const found = coverage({ states, criteria, steps });
    return { out: found, code: found.length > 0 ? 1 : 0 };
  },
  async ledger(args) {
    const { values } = parseArgs({ args, options: { what: { type: "string" }, check: { type: "string" }, file: { type: "string" }, date: { type: "string" } } });
    if (!values.what || !values.check) throw new UsageError("ledger needs --what and --check.");
    const file = values.file ?? "qa-catches.md";
    await appendLedger(file, { date: values.date ?? new Date().toISOString().slice(0, 10), what: values.what, check: values.check });
    return { out: { file } };
  },
```

Export the spec and ledger functions from `index.ts`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Change the README**

Add `skeleton`, `coverage` and `ledger` to "The qa command". Say that the criterion ids `AC1`… follow the order in `issue.md`, so a reorder changes them.

- [ ] **Step 6: Commit**

```bash
git add -A packages/qa-kit README.md
git commit -m "feat: spec parser, spec skeleton, coverage command and the ledger"
```

---

### Task 10: The judge agents and the plugin check script

**Files:**
- Create: `agents/copy-judge.md`, `agents/hierarchy-judge.md`, `agents/first-use-judge.md`, `agents/coherence-judge.md`
- Create: `scripts/check-plugin.mjs`
- Create: `packages/qa-kit/test/unit/plugin-check.test.ts`
- Modify: `package.json` (root: `check:plugin`, and `test` runs it first)
- Modify: `.claude-plugin/plugin.json` (`"experimental": { "evals": "evals" }`)
- Modify: `README.md` (an agents table and a skills table)

**Interfaces:**
- Consumes: the `JudgeInput` JSON files (Task 7) and the `VerdictRecord` shape that `qa record` checks.
- Produces:
  - Four agents. Each reads the input files that it is given and writes one JSON array of `VerdictRecord` to the output path it is given. Each returns one line: the output path and the count of each verdict.
  - `scripts/check-plugin.mjs` exports `checkPlugin(root: string): Promise<string[]>` (the problems) and exits 1 when there are any.

The plugin check enforces:
1. Each `skills/<name>/SKILL.md` has `name: <name>`, a description that starts "Use when" and is under 500 characters, and a body of 500 words or less.
2. Each `agents/*.md` has `name` (equal to the file name), `description`, `model` (one of `haiku`, `sonnet`, `opus`, `inherit`) and `tools`.
3. No file in `skills/`, `agents/` or `templates/` holds a banned word: `Harbour`, `lettings`, `Supabase`, `Next.js`, `React`, `Tailwind`, `Microsoft`, `Entra`, `patient`, `clinic`. A line with `portability-allow` is exempt.
4. The README has a row `` | `<name>` | `` for each skill directory and each agent file, and no row for a missing one.
5. `.claude-plugin/plugin.json` parses, has `"name": "feature-qa"`, and has `experimental.evals` equal to `"evals"`.

- [ ] **Step 1: Write the failing test**

`packages/qa-kit/test/unit/plugin-check.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- plugin-check`
Expected: FAIL. `scripts/check-plugin.mjs` does not exist.

- [ ] **Step 3: Write the script and the agents**

`scripts/check-plugin.mjs`. Use `node:fs/promises` only, and parse frontmatter with a small reader: the lines between the first two `---` lines, each `key: value`.

```js
#!/usr/bin/env node
// Repo checks for the plugin: skill and agent frontmatter, word limits, portability, README tables, plugin.json.
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

const BANNED = ["Harbour", "lettings", "Supabase", "Next.js", "React", "Tailwind", "Microsoft", "Entra", "patient", "clinic"];
const MODELS = new Set(["haiku", "sonnet", "opus", "inherit"]);

function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { fields: {}, body: text };
  const fields = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) fields[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { fields, body: m[2] };
}

const list = (dir) => readdir(dir, { withFileTypes: true }).catch(() => []);

async function filesUnder(dir) {
  const out = [];
  for (const e of await list(dir)) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await filesUnder(p)));
    else out.push(p);
  }
  return out;
}

export async function checkPlugin(root) {
  const problems = [];
  const skills = (await list(join(root, "skills"))).filter((e) => e.isDirectory()).map((e) => e.name);
  for (const name of skills) {
    const file = join(root, "skills", name, "SKILL.md");
    const text = await readFile(file, "utf8").catch(() => null);
    if (text === null) { problems.push(`skills/${name}: no SKILL.md`); continue; }
    const { fields, body } = frontmatter(text);
    if (fields.name !== name) problems.push(`skills/${name}/SKILL.md: name must be "${name}"`);
    const d = fields.description ?? "";
    if (!d.startsWith("Use when")) problems.push(`skills/${name}/SKILL.md: description must start "Use when"`);
    if (d.length >= 500) problems.push(`skills/${name}/SKILL.md: description is ${d.length} characters, the limit is 499`);
    const words = body.split(/\s+/).filter(Boolean).length;
    if (words > 500) problems.push(`skills/${name}/SKILL.md: body is ${words} words, the limit is 500`);
  }
  const agents = (await list(join(root, "agents"))).filter((e) => e.isFile() && e.name.endsWith(".md")).map((e) => e.name);
  for (const fileName of agents) {
    const { fields } = frontmatter(await readFile(join(root, "agents", fileName), "utf8"));
    const name = basename(fileName, ".md");
    if (fields.name !== name) problems.push(`agents/${fileName}: name must be "${name}"`);
    if (!fields.description) problems.push(`agents/${fileName}: description is missing`);
    if (!MODELS.has(fields.model ?? "")) problems.push(`agents/${fileName}: model must be one of ${[...MODELS].join(", ")}`);
    if (!fields.tools) problems.push(`agents/${fileName}: tools is missing`);
  }
  for (const dir of ["skills", "agents", "templates"]) {
    for (const file of await filesUnder(join(root, dir))) {
      const lines = (await readFile(file, "utf8")).split(/\r?\n/);
      lines.forEach((line, i) => {
        if (line.includes("portability-allow")) return;
        for (const word of BANNED) {
          if (new RegExp(`(?<![\\w.])${word.replace(/\./g, "\\.")}(?![\\w])`, "i").test(line)) {
            problems.push(`${file.slice(root.length + 1)}:${i + 1}: banned word "${word}"`);
          }
        }
      });
    }
  }
  const readme = await readFile(join(root, "README.md"), "utf8").catch(() => "");
  const rows = new Set([...readme.matchAll(/^\| `([\w-]+)` \|/gm)].map((m) => m[1]));
  const expected = new Set([...skills, ...agents.map((a) => basename(a, ".md"))]);
  for (const n of expected) if (!rows.has(n)) problems.push(`README.md: no table row for "${n}"`);
  for (const n of rows) if (!expected.has(n)) problems.push(`README.md: row for "${n}", which does not exist`);
  try {
    const plugin = JSON.parse(await readFile(join(root, ".claude-plugin", "plugin.json"), "utf8"));
    if (plugin.name !== "feature-qa") problems.push(`.claude-plugin/plugin.json: name must be "feature-qa"`);
    if (plugin.experimental?.evals !== "evals") problems.push(`.claude-plugin/plugin.json: experimental.evals must be "evals"`);
  } catch {
    problems.push(".claude-plugin/plugin.json: not valid JSON");
  }
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = await checkPlugin(process.cwd());
  for (const p of problems) console.error(p);
  if (problems.length === 0) console.log("PASS: plugin check");
  process.exitCode = problems.length === 0 ? 0 : 1;
}
```

Note: the README table rule matches only rows that start with `` | `name` | ``. Write the README rule tables in that form and no other table in that form. The README itself may name the fixture app, because the check does not scan the README for banned words.

Root `package.json` scripts: add `"check:plugin": "node scripts/check-plugin.mjs"`. Change `test` to `npm run check:plugin && npm run typecheck && npm run test:unit && npm run test:e2e`.

`agents/copy-judge.md`:

```markdown
---
name: copy-judge
description: Judges the copy of QA steps against the project's copy rules. Reads judge input files from the qa command and writes one verdict file. Use only from the running-qa skill.
model: haiku
tools: Read, Write
---

You judge the words on a screen. You do not know how the feature was built. You see only the input files.

## Input

The dispatch gives you a list of input files and one output path. Each input file is JSON: `judge`, `key`, `rulesFile` (optional), and `steps`. Each step has `text`, `names` and `title`. Read `rulesFile` first when it is set.

## What to judge

A script already checks doubled punctuation, repeated labels, identifiers, banned terms, button length, empty values and case. Do not judge those again.

Judge only what a rule file or a careful editor would see:

- The text breaks a rule in the rules file. Name the rule.
- The text is unclear, uses jargon, or sounds like generated text.
- Two names for one thing on one screen.
- A label that does not say what the control does.

Do not judge if a value is true. You cannot see the data.

## Verdicts

- `pass`: no problem that a rule names.
- `fail`: a problem that a rule names. Quote the words and the rule in `reason`.
- `cannot-judge`: you cannot tell, for example the text is cut off or a rule is unclear.

Put a matter of taste (a better word, a warmer tone) in `taste`, not in `fail`. At most 5 items.

## Output

Write one JSON array to the output path. One item for each input file:

`{ "key": "<key from the input>", "judge": "copy", "verdict": "pass" | "fail" | "cannot-judge", "reason": "<one or two sentences, at most 400 characters>", "taste": ["..."] }`

Copy `key` exactly. Then reply with one line: the output path and the count of each verdict.
```

`agents/hierarchy-judge.md`:

```markdown
---
name: hierarchy-judge
description: Judges the visual hierarchy of QA step screenshots against the mock and the owner's rubric. Reads judge input files from the qa command and writes one verdict file. Use only from the running-qa skill.
model: sonnet
tools: Read, Write
---

You judge how a screen reads to the person who uses it. You do not know how the feature was built. You see only the input files and the images they name.

## Input

The dispatch gives you a list of input files and one output path. Each input file is JSON: `judge`, `key`, `rubric`, and `steps`. Each step has `screenshot` (an absolute image path), and may have `mock` (an image or HTML path), `route`, `state` and `viewport`. Read each image with the Read tool.

## What to judge

Answer the rubric first. Then look for:

- The main question or action of the screen does not stand out.
- One value shows two or more times.
- The order does not follow the task.
- The build differs from the mock in a way that changes the meaning or the order. A different pixel size is not a difference.
- Two styles of one component on one screen.

A script already checks overflow, clipped text, alignment, overlap, the type scale and focus. Do not judge those again.

## Verdicts

- `pass`: the rubric answer is yes, and you found no problem above.
- `fail`: a problem above. Name the place on the screen in `reason`.
- `cannot-judge`: the image does not load, or there is no way to tell.

Put a matter of taste in `taste`, not in `fail`. At most 5 items.

## Output

Write one JSON array to the output path, one item for each input file:

`{ "key": "<key>", "judge": "hierarchy", "verdict": "...", "reason": "<at most 400 characters>", "taste": ["..."] }`

Copy `key` exactly. Then reply with one line: the output path and the count of each verdict.
```

`agents/first-use-judge.md`:

```markdown
---
name: first-use-judge
description: Walks a feature's screenshots in order as a person with no context and judges if they can finish one task. Reads one judge input file from the qa command and writes one verdict file. Use only from the running-qa skill.
model: sonnet
tools: Read, Write
---

You are a person who has never seen this product. You have one task. You see the screens in order, and nothing else.

## Input

The dispatch gives you one input file and one output path. The input is JSON: `judge`, `key`, `task`, and `steps` in order. Each step has `screenshot`, `name`, `route` and may have `state`. Read each image with the Read tool, in order.

## What to judge

At each screen, say to yourself what you think you must do next, before you look at the next screen. Then check:

- Could you find the next action without help?
- Did a word or a state confuse you?
- Did a screen lose your place in the task?

## Verdicts

- `pass`: you could finish the task.
- `fail`: you got stuck. Name the screen and the reason.
- `cannot-judge`: the task is missing or the screens do not show it.

Put an easier path or a better word in `taste`. At most 5 items.

## Output

Write one JSON array with one item to the output path:

`{ "key": "<key>", "judge": "first-use", "verdict": "...", "reason": "<at most 400 characters>", "taste": ["..."] }`

Then reply with one line: the output path and the verdict.
```

`agents/coherence-judge.md`:

```markdown
---
name: coherence-judge
description: Compares screens across the surfaces of one feature (site, app, emails) and judges if they feel like one product. Reads one judge input file from the qa command and writes one verdict file. Use only from the running-qa skill.
model: sonnet
tools: Read, Write
---

You check that the surfaces of one feature feel like one product. You see only the input file and the images it names.

## Input

The dispatch gives you one input file and one output path. The input is JSON: `judge`, `key`, and `steps`. Each step has `screenshot`, `name` and `route`. Read each image with the Read tool.

## What to judge

- One thing has two names across the screens.
- The tone changes from one surface to the next.
- One component looks different on two screens.
- A screen promises something that the next screen does not do.

## Verdicts

- `pass`: no problem above.
- `fail`: a problem above. Name both screens.
- `cannot-judge`: the images do not load.

Put a matter of taste in `taste`. At most 5 items.

## Output

Write one JSON array with one item to the output path:

`{ "key": "<key>", "judge": "coherence", "verdict": "...", "reason": "<at most 400 characters>", "taste": ["..."] }`

Then reply with one line: the output path and the verdict.
```

In `.claude-plugin/plugin.json`, add `"experimental": { "evals": "evals" }`. In `README.md`, add a `## Agents` section with a table: `| Agent | Model | What it judges |` and one row for each agent, in the form `` | `copy-judge` | haiku | … | ``. Add a `## Skills` section with the same table form for the three skills, and the text "(Tasks 12 to 14)" until they exist. Do not write a skills row before its skill directory exists: the check fails on a row for a missing skill. Add each skill row in its own task.

- [ ] **Step 4: Run the checks**

Run: `npm run check:plugin && npm run test:unit -- plugin-check`
Expected: `PASS: plugin check`, and the test passes.

- [ ] **Step 5: Check one judge by hand**

Make a run from the fixture. Run `npm -w @feature-qa/kit run test:e2e -- fixture.spec.ts --project chromium`. Then run `npx qa pending --judges copy --run <the run dir>`. Dispatch the `copy-judge` agent (model haiku) on two of the input files with an output path in the scratch directory. Run `npx qa record <output>`. Expected: `{ "recorded": 2 }`. If the agent output fails `qa record`, change the agent text until it passes, and say in the report what you changed. This step proves that the agent output and the validator agree.

- [ ] **Step 6: Commit**

```bash
git add -A agents scripts packages/qa-kit/test/unit/plugin-check.test.ts package.json .claude-plugin README.md
git commit -m "feat: the four judge agents and the plugin check script"
```

---

### Task 11: Eval fixtures, a sandbox spike, the eval cases and the RED baseline

**Files:**
- Create: `evals/README.md`
- Create: `evals/fixtures/harbour-project/` (the project that the cases copy): `package.json`, `qa.config.ts`, `playwright.config.ts`, `specs/property-page.spec.ts`, `copy-rules.md`, `docs/plans/7-property-page/issue.md`, `docs/plans/7-property-page/design.md`
- Create: `evals/scaffold-common.sh`
- Create: `evals/q0-smoke/`, `evals/q1-planning/`, `evals/q2-running-finds-defect/`, `evals/q3-no-judge-on-unchanged/`, `evals/q4-ratchet/` (each: `case.yaml`, `prompt.md`, `scaffold.sh`, `graders/*.md`)
- Create: `evals/fixtures/make-cache.mjs` (makes the pre-recorded verdict cache for q3)
- Create: `evals/baselines/2026-10-11-red.md`
- Modify: `fixtures/lettings-app/server.mjs` (read `PORT` from the environment: it does already; check)
- Modify: `.gitignore` (`evals/results/`, `evals/.browsers-path`)
- Modify: `README.md`

**Interfaces:**
- Consumes: the `qa` command (Tasks 7 to 9), the judge agents (Task 10), `qaProjects` (Task 5), the fixture app.
- Produces: five eval cases and the RED record. Tasks 12 to 14 run the cases to GREEN.

The eval sandbox gives each run a fresh `HOME`. Playwright finds its browsers under `HOME` by default, so the spike checks this first.

- [ ] **Step 1: Build the harbour project**

`evals/fixtures/harbour-project/` is a small project that uses the kit the way an adopter does.

- `qa.config.ts`: `export default defineQaConfig({...})`, with the same values as the `config` in `packages/qa-kit/test/e2e/matrix.spec.ts` after Task 3 (routes, roles with `signIn`, the `lettings` scenario from `seed.mjs`, the access matrix, `designSystem`, `copy` with `caseRule: "sentence"`, `properNouns: ["Harbour Lettings"]`, `rulesFile: "copy-rules.md"`, and `actions`). Import `KNOWN_VALUES` from `./app/seed.mjs`.
- `playwright.config.ts`: `ensureQaRunId()`, `testDir: "./specs"`, `workers: 1`, `use: { baseURL: "http://localhost:4400" }`, `projects: qaProjects({ browsers: ["chromium"], viewports: ["phone", "laptop"], extras: [] })`, `webServer: { command: "node app/server.mjs", url: "http://localhost:4400", reuseExistingServer: false }`. At the top, if the file `.browsers-path` exists, set `process.env.PLAYWRIGHT_BROWSERS_PATH` to its text.
- `specs/property-page.spec.ts`: one test for each state in `design.md`, signed in as `agent`, with `qa.step(...)` and `state` ids that match `design.md` exactly, `actionsAs: "agent"` on the list step, and criteria tags `AC1`… from `issue.md`.
- `copy-rules.md`: 8 short copy rules (sentence case, plain words, no "please", say what the button does, and so on).
- `docs/plans/7-property-page/design.md`: the product-design template (States table `| Screen | State | What the person sees | How they got here |` with four rows: Properties list, Property page Let, Property page Vacant, Message dialog open), an "Interaction test plan" with two flows.
- `docs/plans/7-property-page/issue.md`: an outcome line, and "## Acceptance criteria" with four `- [ ]` items.
- `package.json`: `{ "name": "harbour-project", "private": true, "type": "module" }`.

`evals/scaffold-common.sh` (each case's `scaffold.sh` calls it). It runs in the workspace root:

```bash
#!/usr/bin/env bash
# Copy the harbour project and the fixture app into the eval workspace, and link the repo's node_modules.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/.." && pwd)"
cp -R "$here/fixtures/harbour-project/." .
mkdir -p app && cp -R "$repo/fixtures/lettings-app/." app/
ln -s "$repo/node_modules" node_modules
if [ -f "$here/.browsers-path" ]; then cp "$here/.browsers-path" .browsers-path; fi
git init -q && git add -A && git -c user.email=eval@example.test -c user.name=eval commit -qm "scaffold"
```

Add `"evals:prepare": "node -e \"process.stdout.write(require('node:path').dirname(require('playwright-core/lib/server/registry/index').registry.findExecutable('chromium').executablePath()))\""` only if that API works. Otherwise, write `evals/.browsers-path` by hand from `npx playwright install --dry-run` output, and say so in `evals/README.md`. The value is the folder that holds the Playwright browsers, normally `~/Library/Caches/ms-playwright` on macOS.

- [ ] **Step 2: Run the sandbox spike (q0-smoke)**

`evals/q0-smoke/case.yaml`:

```yaml
schema_version: "1.1"
name: q0-smoke
runs: 1
plugins: ["../.."]
context:
  scaffold_script: scaffold.sh
execution:
  max_turns: 12
  timeout_seconds: 300
  allowed_tools: [Read, Bash]
```

`evals/q0-smoke/scaffold.sh`: `set -euo pipefail; bash "$(dirname "$0")/../scaffold-common.sh"`

`evals/q0-smoke/prompt.md`: `Run "npx playwright test --project chromium-phone" in this folder, then run "npx qa latest". Reply with the last 5 lines of each output.`

`evals/q0-smoke/graders/ran.md`:

```markdown
---
type: regex
target: last_message
match: contains
---
"runDir"
```

Run: `claude plugin eval . --trust-plugin --no-publish --scaffold --allow-tools Bash --ablation none --case q0-smoke --runs 1 --json evals/results/q0.json`

Expected: score 1.0. If it fails, read the trace (`--keep-temp`) and fix the cause. These are the likely causes:
- `schema_version "1.1"` refused: use `"1.0"`.
- `plugins` path wrong: the cases sit one level under `evals/`, so `["../.."]` is the repo root. Check it.
- The browsers are not found: fix `.browsers-path`.
- The `ln -s` is refused: copy the needed packages in place of a link.

Record each fact you confirm in `evals/README.md` under "Harness facts", with the Claude Code version. Do not go on until q0 passes. If q0 cannot pass after 3 changes, make every case use the pre-recorded run: copy `.qa/` from a run on this machine into the fixture, drop the Playwright run from the prompts, and record the ruling.

- [ ] **Step 3: Write the four behaviour cases**

Each case has `case.yaml` like q0, with `runs: 3`, `max_turns: 60`, `timeout_seconds: 900`, `allowed_tools: [Read, Write, Edit, Bash, Agent, Skill]`. Each prompt says that the owner is not available and where to stop. Never copy prompt words into a skill later.

**q1-planning.** Prompt: `The property page (docs/plans/7-property-page) is designed and the build has not started. Plan its QA so the build can be checked. The owner is not available. Write the QA plan files into qa/. End your reply with anything you need from the owner.`
The scaffold also deletes `specs/property-page.spec.ts`.
Graders:
- `skill.md`: `type: tool_used`, `tool: Skill`, `input_match: '"skill"\s*:\s*"(?:[\w-]+:)?planning-qa"'`, `arm: both`.
- `skeleton.md`: `type: tool_used`, `tool: Bash`, `input_match: 'qa skeleton'`, `min: 1`.
- `states.md`: `type: regex`, `target: { source: file, path: qa/property-page.spec.ts }`, `match: count:4`, body `state: "(Properties list|Property page|Message dialog)[^"]*"`. Adjust the alternatives to the four state ids of `design.md`, and keep `count:4`.
- `scenarios.md`: `type: file_exists`, `path: qa/property-page.scenarios.md`.
- `values.md`: `type: llm`, `focus: { source: file, path: qa/property-page.spec.ts }`, body: `PASS when each expected value in the spec comes from design.md or from a named seed record, and no test asserts a value that neither source gives.`

**q2-running-finds-defect.** The scaffold plants one source bug in `app/pages.mjs`: it replaces `const title = ctx.defect === "leaks-title" && t ? t.name : "Property details";` with `const title = t ? t.name : "Property details";` (the page title holds the tenant name). Prompt: `The build of the property page is done. Run the QA pass before the owner looks. The owner is not available. Fix what the QA pass finds, then stop and report.`
Graders:
- `skill.md`: `tool_used`, `Skill`, `input_match` for `running-qa`, `arm: both`.
- `report.md`: `type: file_exists`, `path: .qa/runs/*/report.html`.
- `fixed.md`: `type: regex`, `target: { source: file, path: app/pages.mjs }`, `match: not_contains`, body `const title = t \? t\.name : "Property details"`.
- `config-intact.md`: `type: regex`, `target: { source: file, path: qa.config.ts }`, `match: contains`, body `Grace Hopper|KNOWN_VALUES` (the agent must not remove the seed values to silence the leak).
- `reply.md`: `type: llm`, body: `PASS when the reply names the page-title leak of the tenant name, says it was fixed, and does not say that the feature passed before the fix.`

**q3-no-judge-on-unchanged.** The scaffold copies `evals/fixtures/qa-state/.qa/` into the workspace: one earlier run and a verdict cache with a `pass` verdict for every judge task of that run. Prompt: `Nothing changed since the last QA pass of the property page. Run the QA pass again before the owner looks. The owner is not available. Stop after the report.`
Graders:
- `skill.md`: `tool_used`, `Skill`, `running-qa`, `arm: both`.
- `pending.md`: `type: tool_used`, `tool: Bash`, `input_match: 'qa pending'`, `min: 1`.
- `no-judge.md`: `type: tool_used`, `tool: Agent`, `input_match: 'judge'`, `min: 0`, `max: 0`.
- `report.md`: `type: regex`, `target: trace`, `match: contains`, body `qa report`.

`evals/fixtures/make-cache.mjs` makes `evals/fixtures/qa-state/.qa/`. It runs the harbour project specs once in a temporary copy (the same scaffold steps), runs `qa pending --judges copy,hierarchy,first-use,coherence`, writes a `pass` verdict for each task with the reason "Recorded for the eval.", runs `qa record`, and copies `.qa/cache` and the run into `evals/fixtures/qa-state/.qa/`. Add `"evals:make-cache": "node evals/fixtures/make-cache.mjs"` to the root `package.json`. Run it once and commit the result. The screenshots hold fake data only.

If the screenshot hash differs between two runs on this machine, q3 fails for the hierarchy judge. That is a real defect of the cache (spec §3.4). Check it first: run the specs twice and compare the `hash` of one step. If the hashes differ, find the cause (fonts, the caret, the time) and fix it in `fixture.ts` before you go on. Record what you found.

**q4-ratchet.** The scaffold removes `caseRule` from `qa.config.ts` and changes the add button label in `app/pages.mjs` to `"Add Property"` for every role and defect. Prompt: `Owner QA finding on /properties: the add button says "Add Property". The app uses sentence case. Ratchet this finding so the QA pass catches it from now on. The owner is not available. Stop when done.`
Graders:
- `skill.md`: `tool_used`, `Skill`, `ratcheting-qa`, `arm: both`.
- `rule.md`: `type: regex`, `target: { source: file, path: qa.config.ts }`, `match: contains`, body `caseRule:\s*["']sentence["']`.
- `fixed.md`: `type: regex`, `target: { source: file, path: app/pages.mjs }`, `match: not_contains`, body `"Add Property"`.
- `ledger.md`: `type: regex`, `target: { source: file, path: qa-catches.md }`, `match: contains`, body `\| \d{4}-\d{2}-\d{2} \| .*Add Property.* \| .*case-drift.* \|`.
- `red-first.md`: `type: llm`, body: `PASS when the reply shows that the new check failed on the code before the fix, and passed after the fix.`

- [ ] **Step 4: Record the RED baseline**

The skills do not exist yet, so the plugin arm has only the agents. Run each behaviour case, both arms:

```bash
for c in q1-planning q2-running-finds-defect q3-no-judge-on-unchanged q4-ratchet; do
  claude plugin eval . --trust-plugin --no-publish --scaffold --allow-tools Bash Write Edit --judge-model sonnet \
    --case "$c" --runs 3 -j 3 --max-cost-usd 15 --json "evals/results/red-$c.json"
done
```

Write `evals/baselines/2026-10-11-red.md`: one table row for each case, with the score of each arm, the grader that failed most, and one line on what the agent did wrong. A case whose without arm already scores 0.8 or more teaches nothing: tighten its graders or drop it, and record the ruling.

- [ ] **Step 5: Write `evals/README.md` and change the README**

`evals/README.md`: how to run one case (the command above), the harness facts that the spike confirmed, `npm run evals:make-cache`, the `.browsers-path` step, the cost limit, and the rule: no skill text without a failing case first. Root README: a `## Evals` section that points to `evals/README.md`. Add `evals/results/` and `evals/.browsers-path` to `.gitignore`.

- [ ] **Step 6: Commit**

```bash
git add -A evals .gitignore package.json README.md
git commit -m "test: eval fixtures, the sandbox spike, four behaviour cases and the RED baseline"
```

---

### Task 12: The planning-qa skill and the adapter templates

**Files:**
- Create: `skills/planning-qa/SKILL.md`
- Create: `templates/qa.config.ts`, `templates/scenarios.md`
- Create: `evals/baselines/2026-10-11-planning-qa-green.md`
- Modify: `README.md` (skills table row)

**Interfaces:**
- Consumes: `qa skeleton`, `qa coverage`, the product-design `design.md` and `issue.md` format.
- Produces: the files `qa/<feature-slug>.spec.ts` and `qa/<feature-slug>.scenarios.md` in an adopter project. Task 13 runs them.

- [ ] **Step 1: Read the RED record for q1**

Read `evals/baselines/2026-10-11-red.md` and the q1 traces (`--keep-temp`, or run q1 once more with it). List each failure. The skill text answers only those failures.

- [ ] **Step 2: Write the templates**

`templates/qa.config.ts`: a commented adapter with every option of `QaConfig`, each with one line on what it is for. Use placeholder values such as `"/items"`, `"editor"`, `"[data-component]"`. Use no brand.

`templates/scenarios.md`:

```markdown
# QA scenarios: <feature>

Each scenario is a named seed record. A test reaches a state from a scenario, never from other data.

| Scenario | Seed record (name in the seed) | States it reaches | Known values for the leak scan |
|---|---|---|---|

## Content stress

| Scenario | What it stresses |
|---|---|
| long-values | The longest real value of each field |
| accents | Names with accents and apostrophes |
```

- [ ] **Step 3: Write the skill**

`skills/planning-qa/SKILL.md`. The frontmatter is:

```markdown
---
name: planning-qa
description: Use when a feature has a design.md (states table) and an issue.md (acceptance criteria) and its build has not started or has just started, to write the QA scenario list and a Playwright spec skeleton whose expected values come from the spec and the seed data, not from the build.
---
```

The body (500 words or less) has these parts, in this order:

1. **Why** (two sentences): the builder must not write the expected values; the spec and the seed data give them.
2. **Recipe**, numbered:
   1. Find `design.md` and `issue.md` of the feature. Read the seed data and `qa.config.ts`. If no `qa.config.ts` exists, copy `templates/qa.config.ts` (two levels above this skill's directory) and fill it from the project.
   2. Run `npx qa skeleton --design <design.md> --issue <issue.md> --feature "<title>" --config <relative path to qa.config.ts> --out qa/<feature-slug>.spec.ts`. Never write the skeleton by hand.
   3. Write `qa/<feature-slug>.scenarios.md` from `templates/scenarios.md`. Name one seed record for each state. When no seed record reaches a state, add it to the seed data with fake values, and say so.
   4. In each `test.fixme`: sign in, reach the state from its scenario, and assert each expected value from the "What the person sees" cell and the seed record. Tag `criteria` with the `AC` ids each test proves. Keep `test.fixme` on a test whose route does not exist yet.
   5. Run `npx qa coverage --design … --issue …` after a run. Each `AC` id needs a test.
3. **Rules**: never assert a value that neither the spec nor the seed gives; ask the owner (in the final reply) for a missing value. Never change `design.md`. One `qa.step` per state, with the state id exactly as the skeleton wrote it.
4. **The reply**: the files written, the scenarios added to the seed, the states with no route yet, and the questions for the owner.
5. **Red flags**: an expected value copied from the running app; a state with no named scenario; a removed `test.fixme` on a route that does not exist.

Adjust the text only to answer the RED failures of Step 1. Keep it under the word limit.

- [ ] **Step 4: Run q1 to GREEN**

Run: `claude plugin eval . --trust-plugin --no-publish --scaffold --allow-tools Bash Write Edit --judge-model sonnet --case q1-planning --runs 3 -j 3 --max-cost-usd 15 --json evals/results/green-q1.json`
Expected: the with arm scores 0.8 or more and beats the without arm. If not, read the traces, change only the skill text that caused the failure, and run again. At most 3 rounds. After 3 rounds, record the scores and the open failure in the GREEN record, and go on.

- [ ] **Step 5: Record GREEN, check and commit**

Write `evals/baselines/2026-10-11-planning-qa-green.md` (scores, rounds, what changed). Add the README row `` | `planning-qa` | … | ``. Run `npm run check:plugin && npm run test:unit`.

```bash
git add -A skills/planning-qa templates evals/baselines README.md
git commit -m "feat: planning-qa skill, adapter and scenario templates"
```

---

### Task 13: The running-qa skill

**Files:**
- Create: `skills/running-qa/SKILL.md`
- Create: `evals/baselines/2026-10-11-running-qa-green.md`
- Modify: `README.md` (skills table row)

**Interfaces:**
- Consumes: the Playwright specs, `qa pending`, `qa record`, `qa visual`, `qa coverage`, `qa report`, and the four judge agents.
- Produces: `.qa/runs/<id>/report.html` and a final reply for the owner.

- [ ] **Step 1: Read the RED record for q2 and q3**

As in Task 12 step 1.

- [ ] **Step 2: Write the skill**

`skills/running-qa/SKILL.md` frontmatter:

```markdown
---
name: running-qa
description: Use when a feature's build is done or changed and the owner has not yet looked at it, to run the scripted QA checks, send only the changed screens to the judge agents, fix what fails, and build one report for the owner.
---
```

The body (500 words or less), in this order:

1. **Recipe**, numbered:
   1. Start the app or reuse the running server that `playwright.config.ts` names. Run the specs: `npx playwright test`.
   2. For each test that failed on a `fail` finding, fix the code, not the check or the adapter. Run that test again. At most 3 attempts for each step. After 3, stop fixing that step and keep the failure in the report.
   3. Run `npx qa coverage --design … --issue …` when the feature has a design. A missing state or criterion is a failure: add the test.
   4. Run `npx qa visual`.
   5. Run `npx qa pending --judges copy,hierarchy --rules <copy.rulesFile from qa.config.ts>`. Run `npx qa pending --judges first-use,coherence --task "<the outcome line of issue.md>"` once per feature.
   6. When `qa pending` prints `[]`, dispatch no judge. Otherwise dispatch one agent for each judge that has tasks, with the list of input files and one output path under `.qa/`:
      - `copy-judge` with model haiku. Then send each `fail` or `cannot-judge` item again to `copy-judge` with model sonnet, and keep the Sonnet verdict.
      - `hierarchy-judge`, `first-use-judge` and `coherence-judge` as they are.
      Give a judge no build context: only the file paths.
   7. Run `npx qa record <output>` for each output. If it exits 2, send the error text to the same judge once, then record again.
   8. A `fail` verdict blocks: fix the cause if it is a defect, then run from step 1. A taste item does not block.
   9. Run `npx qa report`. Stop.
2. **Rules**: never weaken a check, an `ignore` entry or the seed values to make a run pass; an `ignore` entry needs the owner's reason. Never run against a hosted production system. Never paste page text into a judge dispatch.
3. **The reply**: the report path; blocked or ready; the fixes made; the owner list from `qa report` (`⊘`, taste, visual) and nothing else; what was not tested.
4. **Red flags**: a judge dispatched when `qa pending` printed `[]`; a changed `qa.config.ts` in a fix; "passed" with an open `fail`.

Adjust the text only to answer the RED failures of Step 1.

- [ ] **Step 3: Run q2 and q3 to GREEN**

Run each case as in Task 12 step 4 (`--case q2-running-finds-defect`, then `--case q3-no-judge-on-unchanged`). The same pass rule and the same limit of 3 rounds apply. Then run q1 once more as a regression check: the new skill must not break planning.

- [ ] **Step 4: Record GREEN, check and commit**

Write `evals/baselines/2026-10-11-running-qa-green.md`. Add the README row. Run `npm run check:plugin && npm run test:unit`.

```bash
git add -A skills/running-qa evals/baselines README.md
git commit -m "feat: running-qa skill"
```

---

### Task 14: The ratcheting-qa skill

**Files:**
- Create: `skills/ratcheting-qa/SKILL.md`
- Create: `evals/baselines/2026-10-11-ratcheting-qa-green.md`
- Modify: `README.md` (skills table row)

**Interfaces:**
- Consumes: the kit rules and adapter options, `qa ledger`, the Playwright specs.
- Produces: one new rule, adapter option or test that fails on the current code, the fix, and one ledger row.

- [ ] **Step 1: Read the RED record for q4**

As in Task 12 step 1.

- [ ] **Step 2: Write the skill**

`skills/ratcheting-qa/SKILL.md` frontmatter:

```markdown
---
name: ratcheting-qa
description: Use when the owner reports a defect that they found by hand in a feature that went through QA, to add one check or test that fails on the current code, fix the code, and add one line to the QA ledger, so the QA pass catches that kind of defect from now on.
---
```

The body (500 words or less), in this order:

1. **Recipe**, numbered:
   1. Name the kind of defect in one sentence, not the one instance.
   2. Choose the cheapest catch, in this order: an adapter option that turns on an existing rule (for example `copy.caseRule`, `copy.bannedTerms`, `designSystem.typeScale`, `actions`); a new assertion in the feature's spec; a new rule in the kit (only in the kit repo, with a planted defect). Never a judge prompt change for a defect that a script can see.
   3. Make the catch, then run it on the current code. It must fail. If it passes, the catch is wrong: go back to step 2.
   4. Fix the code. Run the catch again. It must pass. Run the whole QA spec to check nothing else broke.
   5. Run `npx qa ledger --what "<the owner's words>" --check "<check/rule or test path>"`.
2. **Rules**: one finding gives one catch. The catch must fail before the fix; show the failing output in the reply. Never add an `ignore` entry to "fix" a finding.
3. **The reply**: the kind of defect, the catch, the failing output before the fix, the passing output after, the ledger row.
4. **Red flags**: a catch that never failed; a fix with no catch; a catch that matches only the exact words of the finding.

Adjust the text only to answer the RED failures of Step 1.

- [ ] **Step 3: Run q4 to GREEN**

As in Task 12 step 4, with `--case q4-ratchet`. Then run q2 once more as a regression check.

- [ ] **Step 4: Record GREEN, check and commit**

Write `evals/baselines/2026-10-11-ratcheting-qa-green.md`. Add the README row. Run `npm run check:plugin && npm run test:unit`.

```bash
git add -A skills/ratcheting-qa evals/baselines README.md
git commit -m "feat: ratcheting-qa skill"
```

---

### Task 15: README, spec status and the follow-ups

**Files:**
- Modify: `README.md`, `docs/spec.md` (Status line only), `docs/plans/2026-10-11-a-followups.md`
- Create: `docs/plans/2026-10-11-b-followups.md`

- [ ] **Step 1: Make the README match the build**

- "Status": Plans A and B done; Plan C is the first project adapter.
- The parts tree: remove each "(Plan B)" marker.
- Delete the "Not built in Plan A" table. If a spec item is still not built, list it under `## Not built yet` with the plan that owns it.
- Add `## Use the plugin`: install the plugin, add the kit, copy `templates/qa.config.ts`, then the flow planning-qa → build → running-qa → owner → ratcheting-qa.
- Check each command, rule and option name in the README against the source with `grep`. Fix each one that differs.

- [ ] **Step 2: Write the Plan B follow-ups**

`docs/plans/2026-10-11-b-followups.md`: each finding parked during the build, each deferred minor finding, and each ruling, in the form of the Plan A follow-ups file. In the Plan A follow-ups file, mark each deferred minor finding that Plan B closed.

- [ ] **Step 3: Run everything**

Run: `npm test`
Expected: PASS, with the plugin check, the type check, the unit tests and the end-to-end tests in Chromium and WebKit.

- [ ] **Step 4: Commit**

```bash
git add -A README.md docs
git commit -m "docs: Plan B status, use of the plugin, and follow-ups"
```
