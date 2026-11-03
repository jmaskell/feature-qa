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
