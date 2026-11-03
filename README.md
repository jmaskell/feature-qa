# feature-qa

feature-qa finds the defects that the product owner usually finds by hand, before the owner looks at a feature.
It works in any web project that uses Playwright.
A script does each check that a script can do. A model judges only "is this good?", never "is this true?".
The expected values come from the feature spec and the seed data, not from the builder.
Each project gives one adapter file. Nothing in the kit is specific to one project.

## Status

Plans A, B and C are done: the qa-kit and the fixture (A), the judges, the skills, the report and the plugin evals (B), and the first project adapter (C).
Open findings are in `docs/plans/2026-10-11-a-followups.md` and `docs/plans/2026-10-11-b-followups.md`.

## Parts

```
claude-feature-qa/
├── .claude-plugin/          marketplace.json, plugin.json (plugin name: feature-qa)
├── packages/qa-kit/         TypeScript library on Playwright. The scripted checks.
├── fixtures/lettings-app/   the fake "Harbour Lettings" app, clean and with planted defects.
├── skills/                  planning-qa, running-qa, ratcheting-qa
├── agents/                  the judges
├── templates/               qa.config.ts, scenarios.md
├── evals/                   plugin evals
└── scripts/                 repo checks
```

The design is in `docs/spec.md`. The plan for the kit is in `docs/plans/`.

feature-qa works with the product-design plugin.
It reads the states table, the acceptance criteria and the interaction test plan of a feature's `design.md`.
The skills `planning-qa`, `running-qa` and `ratcheting-qa` do this.
Both plugins share one fake lettings company for their tests.

## Use the plugin

1. Install the plugin `feature-qa` from this repository's marketplace.
2. Add the kit to the project. See "Add the kit to a project".
3. Copy `templates/qa.config.ts` to the project root. Fill in the options.
4. Follow this flow for each feature:
   1. `planning-qa` writes the spec and the scenario list from `design.md` and `issue.md`.
   2. The build makes the specs pass.
   3. `running-qa` runs the checks and the judges, fixes the defects, and writes the report.
   4. The owner reads the report and the "For you" list.
   5. When the owner finds a defect by hand, `ratcheting-qa` adds one catch so the defect cannot return.

## Not built yet

Nothing from the spec is open for Plans A, B and C.
Performance budgets, production metrics and an adapter preset stay in spec section 7 "Later".

## Run the tests

1. Run `npm install`.
2. Run `npm test`.

`npm test` runs the plugin check, the type check, the unit tests and the end-to-end tests against the fixture app. The end-to-end tests run in Chromium and in WebKit. The full run takes about 7 minutes.
The plugin check fails when a skill, an agent or a template holds a banned word. To ban more words, for example the names of private projects, put them in `scripts/banned-words.local.txt`, one word on each line. Git ignores this file.
To time the page checks on the fixture pages, run `npx playwright test -c test/bench/playwright.config.ts` in `packages/qa-kit`.
To start the fixture app by hand, run `npm run fixture`.

## Agents

Four judge agents read the input files that `qa pending` writes. Each writes one file of verdicts for `qa record`.

| Agent | Model | What it judges |
| --- | --- | --- |
| `copy-judge` | sonnet | The words of each step against the project's copy rules. |
| `hierarchy-judge` | sonnet | The visual hierarchy of each screenshot against the mock and the owner's rubric. |
| `first-use-judge` | sonnet | If a person with no context can finish one task from the screens in order. |
| `coherence-judge` | sonnet | If the surfaces of one feature feel like one product. |

## Skills

| Skill | When it runs | What it writes |
| --- | --- | --- |
| `planning-qa` | A feature has a `design.md` and an `issue.md`, and its build has not started or has just started. | `qa/<slug>.spec.ts` from `qa skeleton`, with the expected values from the spec and the seed, and `qa/<slug>.scenarios.md`, one seed record for each state. |
| `running-qa` | A feature's build is done or changed, and the owner has not looked at it yet. | Fixes for the defects that the checks and judges find, the judge verdicts in `.qa/cache`, and `.qa/runs/<id>/report.html`. |
| `ratcheting-qa` | The owner reports a defect that they found by hand in a feature that went through QA. | One catch (an adapter option, a spec assertion or a kit rule) that fails on the current code, the code fix, and one row in `qa-catches.md` from `qa ledger`. |

The templates for an adopter are in `templates/`: the adapter `qa.config.ts`, with one comment for each option, and the scenario list `scenarios.md`.

## Add the kit to a project

1. Add `@feature-qa/kit` to the project. The kit is not published to npm. Add it as a `file:` link (for example `"@feature-qa/kit": "file:../claude-feature-qa/packages/qa-kit"`) or as a workspace. It needs `@playwright/test` as a peer dependency. The package exports its TypeScript source (`.ts` files), not JavaScript. Your test runner must transpile it. Playwright and Vitest do this. The project must have `@playwright/test` installed. The kit loads it from the project folder (the current directory), not from its own folder. So a `file:` link does not load a second copy of Playwright. Run Playwright from the project root. The kit works in a project with or without `"type": "module"` in `package.json`.
2. Write one adapter file. In it, export `defineQaConfig({...})`. Give the base URL, the routes, the scenarios and the access matrix. Give the roles, each with a `signIn(page)` function. The role name `anonymous` is reserved for the signed-out visitor, so do not use it. You can also give `designSystem`, `copy`, `a11y` and `ignore`. See "Adapter options".
3. Call `ensureQaRunId()` at the top of `playwright.config.ts`. Or set `QA_RUN_ID` yourself. Then all workers write to one run directory.
4. In your specs, use `const test = createQaTest(config, { serverLog })`. `serverLog` is optional. It returns the server log text for the leak scan. In each test, call `qa.step(name, { state, criteria, mock })` after each state. `mock` is the path to the mock region (PNG or HTML), relative to the project root. A judge compares the screenshot with it.
5. Add `.qa/` to `.gitignore`.

Each `qa.step` writes `.qa/runs/<run id>/steps/*.json` and a screenshot. The verdict cache is in `.qa/cache`.
A step captures first: it waits for the web fonts, takes the screenshot with animations stopped, and reads the text, the accessible names, the title and the ARIA snapshot. Then it runs the page checks, because the checks hover, focus, press keys and resize the page.
The step collects the visible elements once. The text capture and every page check read that one collection. The checks that only read the page run first. The focus, hover and reflow rules run last, because they change the page.
Each step record has `timings`: the milliseconds of each part of the step (`screenshot`, `collect`, `checks`, `checks.axe`, `checks.interaction.hover` and so on). `qa timings` gives the median, p95 and max of each part over a run.
A `fail` finding fails the test. A `warn` finding is only recorded. The test goes on after a finding, so one run shows every problem.
After each test, the fixture writes one more record, `after-test`. It holds the smoke and leak findings of the whole test. Its `timings` give the time of the watchers: `after-test.watch` (the set-up), `after-test.settle` (the wait for late CSP reports, at least 100 ms), `after-test.leaks` and `after-test.ignore`.

### Sign in once for each person

Each test signs in again by default. `reuseSignIn(page, key, signIn, { landing })` signs in once for each `key` (for example a role) in a worker, and the later tests start from that session.

- With a saved session, the helper adds it to the browser context and opens `landing`. When the page stays on `landing` with a status below 400, `signIn` does not run.
- Otherwise the helper takes the saved session out of the context and runs `signIn`. It saves the session only when `signIn` ends on `landing`. So a sign-in that ends on another page, for example "your access has ended", runs each time.
- A test that signs out or ends the session on the server calls `forgetSignIn(key)`. An app that checks a session only in its token accepts an ended session until the token expires.
- The smoke and leak watchers of a test see the sign-in pages only when that test signs in. So a defect on the sign-in pages shows once for each person, not once for each test.

## Profiles

`qaProjects()` makes 14 Playwright projects. It makes each browser at 375, 768, 1280 and 1440 pixels wide. It also makes dark mode, reduced motion and 200% text once for each browser at 375.

```ts
import { defineConfig } from "@playwright/test";
import { ensureQaRunId, qaProjects } from "@feature-qa/kit";
ensureQaRunId();
export default defineConfig({ projects: qaProjects({ browsers: ["chromium", "webkit"] }) });
```

The 200% text profile sets the test option `qaTextScale` to 2. The fixture then doubles the root font size. The layout rule `off-scale-type` accepts the size or the size divided by 2.

### Snapshot profiles

`qaProjects({ profilesAs: "snapshots" })` makes 4 projects, not 14: each browser at 375 and 1280 pixels wide. The journeys run only in these 4 projects.
At each `qa.step`, the fixture also takes each other profile as a snapshot of the state that the journey reached. The 768 snapshot goes to the 375 project. The 1440 snapshot goes to the 1280 project. Dark mode, reduced motion and 200% text go to the 375 project.
For each snapshot, the fixture sets the viewport, the colour scheme, the motion setting or the root font size. It takes the screenshot and runs the checks that only read the page: smoke, layout, copy, conformance, axe-core and forced colours. The 200% text snapshot also runs the reflow rule. Then the fixture puts the page back.
A snapshot writes its own step record, under the project name that the 14-project mode gives it (for example `chromium-phone-dark`). So the report, the judges and the visual baselines work as before. A `fail` finding in a snapshot fails the journey test. Its message starts with the snapshot name, for example `[chromium-tablet]`.
`journeyViewports` sets the journey viewports.

What a snapshot does not do:

- The test's own assertions run only in the journey projects. A spec branch that runs only at 768 or 1440 pixels does not run.
- The focus and hover rules run only in the journey projects. They do not run in dark mode, with reduced motion or at 200% text.
- A page that sets its layout from the window size once, at load, does not lay out again for a snapshot. A page that uses CSS media queries or listens for `resize` and `matchMedia` changes does.

Content stress (long names, accents) comes from the seed data. Add a scenario with long and accented values.

## Adapter options

- `designSystem.componentMarker`: a CSS selector for a design-system component root. It must match the control components (buttons, links, inputs), not page containers such as a card or a layout. A control passes `not-a-component` when it matches the marker, or when its nearest marked ancestor is at most 2 levels up and holds no other control (a component wrapper).
- `designSystem.componentAttribute`: the attribute that holds the component name (default `data-slot`). A `variantAttribute` value with a colon is read as `<component>:<variant>`. A value with no colon holds the variant only, and the conformance check reads it as `<componentAttribute value>:<variant>`. Then `maxVariants` applies to the component.
- `actions`: the primary actions, each with `route`, an optional `role`, a `selector` and a `label`. Call `qa.step(name, { actionsAs: "<role>" })` to click them after the page checks. The actions run in order on one page, so an earlier action can change the page for a later one. The `ignore` list applies to the action findings too.
- `copy.caseRule` (`"sentence"` or `"title"`), `copy.properNouns` and `copy.rulesFile`: `caseRule` turns on the `case-drift` rule. `properNouns` lists words and phrases that keep their capitals. `rulesFile` is the path to the project's copy rules. The copy judge reads it.
- `a11y.exclude`: CSS selectors that axe-core does not scan.
- `preflight`: an async function that checks that the run can start, for example that the seed database is clean. It returns a message when the run must not start, and nothing when it can. Call `runPreflight(config)` from the Playwright `globalSetup` file (`export default () => runPreflight(config)`). A message stops the run before the first test, with one line: `qa preflight: <message>`. Playwright starts the `webServer` before `globalSetup`, so the build runs first.
- `ignore`: a list of known findings to drop. Each entry has `check`, and optional `rule`, `selector` and `route`. A finding is dropped when it matches every field that is set. `selector` matches the finding element or an ancestor of it. Each entry must have a `reason`. `defineQaConfig` refuses an entry with no reason. The ignore list applies to `qa.step`, to the `after-test` record and to `runPageChecks`.

A control is an element that is natively interactive (`a[href]`, `button`, `input`, `select`, `textarea`, `summary`) or that has a widget role (for example `button`, `link`, `checkbox`, `tab`, `option`, `slider`, `combobox`, `textbox`). A `tabindex` alone does not make a control. The interaction and conformance checks use this one definition (`INTERACTIVE_SELECTOR`).

## Privacy

Step records hold page text and screenshots. Keep `.qa/` on your machine. Never commit it.
Playwright's own failure screenshots and traces also hold page content. Keep them local too.
Never commit or upload them for a project that has real personal data.
Leak findings mask the value: they show the first 2 characters only.
Never run the kit against a hosted production system. Use fake data in a local or test environment.
Eval runs use the signed-in Claude account. To bill them to an API key, put the key in a git-ignored `evals/.env` and set `EVAL_USE_API_KEY=1` when you run `evals/run.sh`. Never commit the key file.

## Known limits

- An `ignore` entry with a `route` does not match the findings of the after-test record from the smoke and leak watchers. Those findings have no route. Use `check` and `rule` to drop them.
- The focus rule presses Shift once for each step before it focuses the controls. An app that acts on Shift sees this key press.
- The focus and hover rules finish each CSS transition before they read the page (`Animation.finish()`). An animation that repeats forever is not finished.
- The hover rule skips an element when another element covers its centre.
- The `server-log` leak rule reads the log lines that the server writes while a test runs. When tests run in parallel against one server, a leak can show on the wrong test. Run the leak scan with one worker to find the test.
- `reflow-skipped` (`warn`): the viewport has no fixed size, so the reflow rule did not run.

## Access check

The access check opens each route as each role and as a signed-out visitor. It compares the result with the adapter's matrix. A missing cell means `deny`.

- The default test for "denied" is `defaultIsDenied`. A route is denied when the status is 401, 403 or 404, when it redirects to another path, or when there is no response.
- A soft deny counts as allowed. A soft deny is a 200 response that shows an "access denied" page.
- To catch a soft deny, pass `isDenied` in the options. Call the exported `defaultIsDenied` inside it, and add a text check on the page.
- A route whose allowed result is a redirect counts as denied by default. Pass `isDenied` for that case too.
- A probe that cannot run is a `fail` (`probe-error`).
- Each role signs in once, and the later probes start from that session (`reuseSignIn`, default `true`). A probe can end the session on the server, so a result from a reused session counts only when it is the expected result. An expected allow counts. An expected deny counts only when the role can still open a witness route in the same browser context after the probe. A witness route is a route that the matrix allows for the role and that the signed-out visitor could not open in this run. Every other result runs again with a fresh sign-in, so each finding comes from a fresh sign-in. The signed-out visitor goes first.
- Set `reuseSignIn: false` to sign in again for every probe.

## Checks

Rules marked `warn` record a finding but do not fail the test. All other rules are `fail`.
Rules marked "no planted defect" have no defect in the fixture. The reason follows the rule.

### smoke

The server answers, the stylesheets load, and the page has no errors.

- `console-error`: the page wrote a console error.
- `page-error`: the page threw an uncaught exception. No planted defect: the fixture has no such defect.
- `asset-failed`: a stylesheet or a script answered with a status of 400 or more, or its request failed. A request that the browser cancelled (for example by a navigation) does not count.
- `csp-violation`: the page raised a CSP violation. A violation of a report-only policy is `warn`. No planted defect: its own spec proves it with a routed CSP page, and the fixture sends no CSP.
- `action-missing`: a declared action is not on the page.
- `dead-action`: a declared action did not change the page in 2 seconds.
- `action-not-clickable`: a declared action did not take a click in 2 seconds, because it is hidden, disabled or covered.
- `unstyled`: the body font is the browser default. The check reads the default from a blank frame, so it works in each browser.
- `teardown-error`: the after-test scan threw. No planted defect: no page can cause it.

### layout

- `horizontal-overflow`: the page scrolls sideways.
- `clipped-text`: overflow hides part of a text.
- `misaligned-sibling`: items in a list or stack do not share one left edge (2px tolerance). Absolute and fixed boxes are out of the flow, so they do not count.
- `off-scale-type`: a font size and weight pair is not in the adapter's type scale. In the 200% text profile, the rule accepts the size or the size divided by 2.
- `overlap`: two visible controls overlap by more than 2px. A control inside another control does not count. A fixed or sticky box moves with the scroll, and so does each control in it. So two controls count only when they are in the same scroll layer: both in the normal flow, or both in one fixed or sticky box. A control inside a modal (a `dialog` element, `role="dialog"` or `aria-modal="true"`) and a control outside it do not count, because the modal sits over the page.

### interaction

- `pointer-cursor`: an enabled control does not show the pointer cursor. Text-entry inputs, `textarea`, and the roles `textbox`, `searchbox`, `listbox`, `tablist`, `gridcell` and `treeitem` are not checked.
- `focus-visible`: a control shows no visible focus style. The check presses a key and then focuses each control by script, so it works in WebKit, which does not Tab to buttons and links by default. One script in the page does every control. Before each read it waits one task and finishes the CSS transitions, so a ring that a framework adds from state, or that fades in, counts.
- `focus-unreachable` (`warn`): the page has controls, but none took focus, so the focus rule did not run. No planted defect: `interaction.spec.ts` proves it.
- `hover-shift`: hover changes the size or position of a box. The check moves the pointer to the centre of each control and each list or table row that holds a control. Before each read it waits one frame and finishes the CSS transitions, so it needs no fixed wait. One read gives the box of each element in view with the pointer away. An element out of view gets a read that scrolls it into view, and that read also gives the box of each later element that the scroll brings into view.
- `escape-closes`: Escape does not close a dialog or popover that the action opened. A dialog that was open before the action does not count. The check waits up to 1 second for an exit animation.
- `escape-nothing-open` (`warn`): the action opened nothing, so the Escape rule did not run. No planted defect: `interaction.spec.ts` proves it.

### a11y

- `axe-<rule>`: an axe-core violation with WCAG 2.2 AA tags. Serious and critical violations are `fail`. Other violations are `warn`. The planted defect is `axe-button-name`. When every frame of the page has the page's origin, axe-core runs once in the page. A page with a cross-origin frame gets the slower scan that also reads that frame.
- `reflow`: the page does not reflow at 320 CSS px. The a11y page check runs it. It resizes the viewport and restores it, and it does not reload the page.
- `reflow-skipped` (`warn`): the viewport has no fixed size, so the reflow rule did not run. No planted defect: `a11y.spec.ts` proves it.
- `forced-colors`: an enabled control has no text, icon or border, so it disappears in forced-colours mode. The rule reads computed styles and does not emulate the mode, so it works in WebKit too.

### copy

The rules `doubled-punctuation`, `leaked-identifier` and `banned-term` scan the page text, the button names and every accessible name.

- `doubled-punctuation`: a text has doubled punctuation.
- `label-echo`: a value repeats its label prefix.
- `leaked-identifier`: a UUID, snake_case name or long camelCase name shows as text.
- `banned-term`: the text uses a term that the adapter bans.
- `button-length` (`warn`): a button label is longer than the adapter's limit.
- `case-drift`: a label does not follow the adapter's case rule (`copy.caseRule`). Labels are the names of buttons, tabs, menu items and options, and the text of h2 to h6, th, label and legend. h1, links and row headers (`th scope="row"`) are not labels, because they often hold record data. `copy.properNouns` keep their capitals. A heading or a table header can hold record data, for example a person's name. Add such words to `copy.properNouns`.
- `mixed-empty-values`: one page uses more than one word for an empty value. Only values count: a `dd`, a `td`, or the text after "Label:". Free text such as a paragraph that says "None" does not count.

### conformance

- `not-a-component`: an interactive element is not a design-system component.
- `too-many-variants`: a component type has more variants than the adapter allows.
- `root-attribute`: a required root attribute is missing.

### leaks

Known seed values must not appear in these places. Values shorter than 4 characters are ignored. Values match on word boundaries.
A phone value also matches with other separators (space, dash, dot, brackets) and with a country code in place of the leading 0 (`+44`, `0044`, `%2B44`).

- `url`: a seed value is in a URL. The scan reads each query parameter and the raw query string.
- `title`: a seed value is in the page title. The watch reads the title at each load and navigation, and at each `qa.step`.
- `storage`: a seed value is in `localStorage` or `sessionStorage`.
- `third-party`: a request to another origin carries a seed value.
- `server-log`: the server log holds a seed value.
- `cookie`: a cookie holds a seed value. The scan reads HttpOnly cookies too.

### access

- `denied-but-allowed`: a role opened a route that the matrix denies.
- `allowed-but-denied` (`warn`): a role could not open a route that the matrix allows. No planted defect: `access.spec.ts` proves it.
- `probe-error`: a probe threw. No planted defect: `access.spec.ts` proves it.

### coverage

The coverage check is not a page check. It compares the steps of a run with the states table and the acceptance criteria of the spec.

- `state-not-reached`: no step reaches a state.
- `criterion-without-test`: no step tests a criterion.

The coverage check has no planted defect. Its unit tests prove it.

### visual

The visual check is not a page check. It compares the step screenshots of a run with approved baselines, pixel by pixel, in a browser canvas.

- `new-baseline` (`warn`): a step has no approved baseline.
- `changed` (`warn`): more than 0.1% of the pixels of a step differ from the baseline. A different image size counts as fully changed.

Both rules are warnings only. A visual change goes to a judge or to the owner. It never fails a run.

`approveBaselines` copies the screenshots of a run to `qa-baselines/` (`defaultBaselineDir`). Commit this folder. It holds fake data only. Screenshots differ between machines because of fonts. Compare a run only with baselines from the same machine or the same CI image.

The visual check has no planted defect. `visual.spec.ts` proves it.

## The qa command

`qa` runs the judge queue and the visual check. Each subcommand prints JSON to stdout.

- `qa latest`: print the run directory that changed last.
- `qa pending --judges copy,hierarchy [--run <dir>] [--rules <file>] [--rubric <text>] [--task <text>]`: write one input file for each judge task, and print the tasks that have no cached verdict. The judges are `copy`, `hierarchy`, `first-use` and `coherence`. It prints absolute paths. It exits 2 when the `--rules` file cannot be read. The hierarchy rubric is the fixed default ("Can I scan this, and do I know what the question is?") unless you give `--rubric`.
- `qa record <verdicts.json>... [--run <dir>]`: check each verdict file and store its verdicts in the cache. It records each file on its own. It refuses a file that has one key twice. It stores nothing from a file when one record in it is bad, or when a key has no input in the run. It still records the good files. When a file is bad, it names the file and exits 2.
- `qa visual [--run <dir>] [--baselines <dir>]`: compare the screenshots with the baselines. It uses Chromium. When Chromium does not start, it starts it again as one process (`--single-process --no-zygote`). Some sandboxes stop the helper processes of Chromium.
- `qa approve [--run <dir>] [--baselines <dir>] [step ids...]`: copy the screenshots to the baselines.
- `qa report [--run <dir>]`: write `<run>/report.html` and print its path, the status, the status line (`summary`), the owner list and the number of pending judge tasks. It exits 1 when the run is blocked. A run that is not fully judged exits 0.
- `qa skeleton --design <design.md> --issue <issue.md> --feature <name> --config <import path> --out <file>`: write a Playwright spec with one `test.fixme` for each row of the States table and each item of the interaction test plan. It exits 2 when the design has no States table, or when the out file exists.
- `qa coverage --design <design.md> --issue <issue.md> [--run <dir>]`: print the states and criteria that no step reached or proved. It exits 1 when it prints one. It exits 2 when `issue.md` gives no criteria, for example when the "## Acceptance criteria" heading is missing. The criterion ids `AC1`, `AC2`... follow the order in `issue.md`, so a reorder changes them. Only a bullet at the start of a line is a criterion. An indented sub-bullet is not.
- `qa ledger --what <text> --check <check or test path> [--file qa-catches.md] [--date YYYY-MM-DD]`: add one row to the QA catches ledger. It creates the file when it is missing.
- `qa timings [--run <dir>]`: print one row for each part of a step: the number of steps, and the median, p95, max and total milliseconds. The rows are in order of total time. `total` is the sum of the top-level parts of each step. The `after-test` records add no `total`.
- `qa compare <runA> <runB>`: print the findings that differ between two runs. A finding is keyed by profile, test, step, check and rule, element and severity. The output lists the findings that only run B has (`added`), the findings that only run A has (`removed`), the findings with a different count (`changed`), and the steps that only one run has. It exits 1 when anything differs. Use it to show that a change to the kit or to the run keeps every catch: an added finding is a defect until a fresh run in the old mode shows it too.

The report is one static page with inline CSS and no script. It stays in `.qa/`. For each step it shows the screenshot, the mock, the findings, the judge verdicts and the visual status. The "For you" list at the top holds only `fail` verdicts from the hierarchy, first-use and coherence judges, `⊘` (cannot-judge) verdicts, taste items and visual changes. A run is blocked when a finding or a verdict is `fail`.

The status line has one of four values:

- "Blocked: fix the failures below before the owner looks." A check or the copy judge failed.
- "Blocked: N items need your decision." Only the hierarchy, first-use or coherence judges failed. The agent does not change a design for them, so the owner decides.
- "Not fully judged: N tasks." Nothing blocks, but N judge tasks have no verdict.
- "Ready for the owner."

`--run` defaults to the latest run. The cache is `.qa/cache`. The baselines are `qa-baselines/`.

Exit codes: 0 done, 1 a blocking result, 2 a usage error or a bad verdict file.

The copy judge reads the text only, so the same text at two widths gives one task. The other step judges give one task for each step. The feature judges give one task for all steps of one project. They see the steps in the order that the run wrote them (the `seq` of each step record).

The hierarchy judge gives one task for each step in each Playwright project. Many profiles multiply its cost: 14 profiles give 14 tasks for one step. Judge on one browser profile: run `npx playwright test --project <profile>`, then run `qa pending` on that run.

The verdict cache and the q3 eval cache are bound to one machine. A step hash includes the screenshot bytes, and these depend on the fonts and the browser build. On another machine the keys change and the judges run again.

The key of a task covers all inputs of the judge. The copy key covers the text and the content of the rules file. The hierarchy key covers the step hash, the rubric and the bytes of the mock. The feature keys cover the step hashes (in id order, so the order of parallel workers does not change the key) and the task text. A change to one of them gives a new task. A stored `cannot-judge` verdict is shown in the report, and `qa pending` lists its task again.

The flow: run the specs. Run `qa pending` once with all four judges: `--rules` goes only to the copy judge, and `--task` goes only to the feature judges. Give each pending input file to its judge, and dispatch the judges at the same time. Run `qa record` once with all the verdict files. Run `qa report`.

Node strips the types of `src/cli.ts`, and it does this only for files outside `node_modules`. The command runs when the kit is a workspace or a `file:` link (a symlink). A published package needs a build step first.

## Add a check

Do all of these in one commit:

1. Write the rule in `packages/qa-kit/src/checks/`. It returns findings. It never throws for a defect.
2. Add a planted defect to `fixtures/lettings-app/defects.mjs`, switched on by `?defect=<id>`. Set `alsoFails` for any allowed side effect.
3. Add the rule id to the `RULES` list in `packages/qa-kit/test/unit/registry.test.ts`.
4. Check `packages/qa-kit/test/e2e/matrix.spec.ts`. It runs each defect and needs the check to report a `fail` on it, with no other check failing except those in `alsoFails`. Add a matrix entry if the new check needs one.
5. Change this README.
6. Run `npm test`.

If a rule cannot have a planted defect, add it to `NO_DEFECT_YET` in the registry test with the reason, and name the spec that proves it.

## Evals

The plugin evals run Claude Code on a small copy of a project and grade what it does. Each skill comes after a failing eval case.
To run a case, the cost limit, the sandbox facts and the RED baseline, see `evals/README.md`.

## Licence

MIT. See `LICENSE`.
