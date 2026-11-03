---
type: tool_used
tool: Bash
input_match: '"command"\s*:\s*"(?:(?:[^"\\]|\\.)*(?:&&|;)\s*)?npm run qa(?![\w:-])|"command"\s*:\s*"(?:[^"\\]|\\.)*playwright test (?:-c|--config)[ =](?:\./)?playwright\.qa\.config\.ts'
min: 1
---
The agent runs the QA specs through the project's QA command, not the e2e suite of `playwright.config.ts`.
The command starts with `npm run qa` (also after `&&` or `;`), or it runs `playwright test -c playwright.qa.config.ts`. A `grep` or `cat` that names `npm run qa` does not match.
