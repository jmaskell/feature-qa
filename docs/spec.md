# feature-qa — design

Date: 2026-10-11
Status: the owner approved the direction on 2026-10-11. This file records it. Plans A, B and C are built. Plan C is the first project adapter, for a private project.

## 1. Purpose

Reduce manual QA by the product owner. Before the owner looks at a feature, a QA pass finds the defects that the owner usually finds.

The plugin works in any web project that uses Playwright. Nothing in the plugin is specific to one project. Each project gives one adapter file.

## 2. Evidence: what the owner finds by hand

Three surveys on 2026-10-11 (tobira QA records and fix commits, session transcripts, tooling in five repos):

| Defect kind | Share | Example |
|---|---|---|
| Layout, spacing, alignment, overflow | about 30% | rows that do not align, a 13px left offset, no space under a button |
| The screen says something the data does not support | about 20% | "None reported" over a "Yes" answer, a header count that differs from the flags |
| Copy | about 15% | doubled full stop, "To investigate: To investigate:", text that sounds like AI |
| Wrong or mixed component | about 12% | two styles of one button, the old style on one section |
| Interaction state | about 8% | no pointer cursor, Esc does nothing, focus lost (reported 4 times) |
| Composition, hierarchy | about 10% | one score shown three times, hard to scan |
| Dev environment broken | some | no styling in Safari, a static page, "where is the dev server?" |

The earlier screenshot-judge pass (tobira) passed 33 of 35 steps on PLAN-490. Then 13 owner QA rounds and 71 fix commits followed. Causes:

1. The builder wrote the expected outcomes. A defect in an outcome passed.
2. The judge had pixels only. It could not compare the screen with the data.
3. The consistency verdict was advisory.
4. It ran at one viewport.
5. Missing seed data made the judge use other records, with no report.

## 3. Principles

1. **Assert before you judge.** A check that a script can do is a script. A model judges only "is this good?", never "is this true?".
2. **Expected values come from the spec, not from the builder.** The states table, the acceptance criteria and the seed data give the expected values before the build.
3. **A check must fail first.** Each check has a planted defect that makes it fail. A check that cannot fail is removed.
4. **The model sees only what changed.** Each verdict is stored against a hash of the screenshot and the DOM text. An unchanged screen keeps its verdict.
5. **Each owner finding becomes a check.** The fix adds a rule or a test and a line in the ledger.
6. **The owner reviews a report, not a walk.**
7. **Personal data never leaves the machine.** Fixtures and seeds are fake. The pass never runs against a hosted production system.

## 4. Parts

```
claude-feature-qa/
├── .claude-plugin/          marketplace.json, plugin.json (plugin name: feature-qa)
├── packages/qa-kit/         TypeScript library on Playwright. The scripted checks.
├── skills/                  planning-qa, running-qa, ratcheting-qa
├── agents/                  the judges
├── templates/               qa.config.ts, scenario list, report, ledger
├── fixtures/lettings-app/   the fake company app, clean and with planted defects
├── evals/                   plugin evals (claude plugin eval)
└── scripts/                 repo checks
```

### 4.1 qa-kit (scripted, no tokens)

Each check is a function that takes a Playwright `Page` (or run data) and the adapter, and returns findings. A finding has: check id, severity (`fail` or `warn`), route, state, viewport, a selector or a text sample, and a message.

| Check | What it asserts |
|---|---|
| `smoke` | The server answers. Each stylesheet answers 200. The body font is not the browser default. No console error, page error, CSP violation or hydration error. One declared action changes the page. |
| `layout` | No horizontal overflow. No clipped text. No overlap of visible interactive boxes. Siblings in a list or a stack share one left edge (2px tolerance). Font size and weight pairs are in the adapter's type scale. |
| `interaction` | Each enabled clickable element has `cursor: pointer`. Each focusable element shows a visible focus style. Hover does not change the box size or position. Escape closes an open dialog or popover. |
| `a11y` | axe-core with WCAG 2.2 AA tags. Reflow at 320 CSS px (400% zoom). Forced colours: no control loses its border or text. |
| `copy` | On the rendered text and accessible names: doubled punctuation, a repeated label prefix, leaked identifiers (UUID, snake_case, long camelCase), banned terms from the adapter, button labels longer than the adapter's limit, more than one empty-value word on a page, title-case or lower-case drift from the adapter's case rule. |
| `conformance` | Each interactive element is a design-system component, from the adapter's markers. For each component type, the page uses no more variants than the adapter allows. The adapter's required root attributes are present. |
| `leaks` | The known seed values (names, emails, phones, answers) do not appear in URLs, page titles, `localStorage`, `sessionStorage`, cookies, requests to other origins, or the server log captured during the run. |
| `access` | Each route × each role (signed out included) gives the result in the adapter's matrix. Default: denied. An id swap to another owner's record is denied. |
| `coverage` | Each state in the spec's states table was reached by a test. Each acceptance criterion has at least one test tag. |
| `visual` | Pixel diff against approved baselines. A changed image goes to a judge or to the owner. It never fails the run by itself. |

The kit also has:

- **Fixtures for Playwright tests:** `qa.step(name, { state, criteria })` records a screenshot, the DOM text, the ARIA snapshot and the findings of each check into a run manifest.
- **Profiles:** viewports 375, 768, 1280, 1440; light and dark; reduced motion; content stress (long names, accents, 200% text). WebKit and Chromium.
- **Verdict cache:** `hash(screenshot + DOM text + judge id + judge version)` → verdict.
- **Report builder:** one static HTML page: each step × viewport, the mock region beside it, findings, verdicts, and a short list for the owner (`⊘` and taste items only).
- **Ledger:** `qa-catches.md`, one line for each owner finding: date, what, the check that now catches it.

### 4.2 Adapter (one file in each project)

`qa.config.ts` exports `defineQaConfig({...})`:

- `baseURL`, how to start the app, and the routes.
- `roles`: a name and a `signIn(page)` function for each role. The plugin does not know how a project signs in.
- `scenarios`: named seed records, each with the states it reaches and its known values for the leak scan.
- `accessMatrix`: route × role → `allow` or `deny`.
- `designSystem`: component markers (attribute or class pattern), allowed variants, type scale, required root attributes.
- `copy`: path to the copy rules, banned terms, button label limit, case rule, the one empty-value word.
- `specs`: where to find the states table and the acceptance criteria of a feature.

### 4.3 Skills

- **planning-qa.** Input: a feature's spec (states table, criteria, test plan). Output: a scenario list (seed records needed, by name), and a Playwright spec skeleton with one `qa.step` per state and criterion tag. Runs before the build. It writes the expected values from the spec and the seed data.
- **running-qa.** Starts the app (or reuses a server), runs the specs with the qa-kit fixtures, then runs the judges on changed steps only, builds the report, and stops for the owner. A failed scripted check is fixed in code, with at most 3 attempts per step.
- **ratcheting-qa.** Input: one owner finding. Output: one new rule or test that fails on the current code, the fix, and one ledger line.

### 4.4 Judges (agents)

Each judge gets fresh context and no build context. Each gives `✓`, `✗` or `⊘` for each step, with a reason.

| Judge | Input | Model |
|---|---|---|
| Copy | Extracted strings and the project's copy rules | Sonnet (changed 2026-10-12: an A/B showed Haiku plus re-checks cost more and broke the output format once) |
| Hierarchy and mock | Screenshot, mock region, the owner's rubric ("Can I scan this, and do I know what the question is?") | Sonnet |
| First use | A persona with no context, one task, the screenshots in order | Sonnet, once per feature |
| Coherence | Screens from each surface of the product (site, emails, app) | Sonnet, once per feature |

A `✗` blocks the run. A taste item goes to the owner list.

## 5. The fake company and the evals

The fake company is the lettings company of the product-design evals, so both plugins test one world. `fixtures/lettings-app/` is a plain HTML app on a small Node server (no framework, starts in under one second). It has:

- a clean build, which passes every check;
- one planted defect for each check (for example `?defect=cursor` removes the pointer cursor), which must fail exactly that check;
- seed tenants and properties with fake values for the leak scan;
- two roles (letting agent, landlord) and a fake sign-in.

Evals:

1. **Unit (vitest + Playwright):** each check is red on its planted defect and green on the clean build.
2. **Plugin (`claude plugin eval`):** the skills find the planted defects in a run; no judge runs on an unchanged step; ratcheting-qa adds a check that fails before the fix.

## 6. First project adapter

The first adapter is for a private project. It holds:

- a fake OIDC server in the local stack for staff sign-in. The project's auth service accepts an issuer that is not the real identity provider;
- the design-system component markers and the token type scale;
- the project's copy rules.

## 7. Later

- Performance budgets (query count per page, bundle growth, Web Vitals) after a baseline exists.
- Production metrics for each journey step.
- An adapter preset in the design-system repo.

## 8. Out of scope

- Real identity providers in tests.
- Runs against hosted production systems.
- Publishing the package or the plugin. The owner decides that later.
