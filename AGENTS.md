# Agent rules for claude-feature-qa

## Rules

- Nothing in `packages/qa-kit` names a project, a brand, a design system or an identity provider. Project facts come only from the `QaConfig` adapter.
- `packages/qa-kit` has two runtime dependencies at most: `@axe-core/playwright`, and `@playwright/test` as a peer dependency.
- `fixtures/lettings-app` has no npm dependencies. It uses `node:http` only.
- Every fixture value is fake. Emails end in `@example.test`. Phones use the UK drama range `07700 900xxx`.
- Each check is red on its planted defect and green on the clean app. A check without a planted defect is not merged.
- A new check needs a planted defect and a matrix entry in the same commit.
- A check returns findings. It never throws for a defect. It throws only for a broken call (for example, no page).
- Change the README in the same commit as the behaviour that it describes.
- Run `npm test` before every commit.
- Markdown and code comments use Simplified Technical English: one idea in one sentence, active voice, plain words.
- Commit messages end with a `Co-Authored-By:` line that names the model.
- Personal data stays on the machine. Never run a check against a hosted production system.
