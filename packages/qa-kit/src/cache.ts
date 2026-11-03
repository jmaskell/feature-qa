import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface Verdict {
  judge: string;
  judgeVersion: string;
  verdict: "pass" | "fail" | "cannot-judge";
  reason: string;
  taste?: string[];
  model?: string;
}

/** Make the cache key. JSON keeps the three parts apart, so "a"+"bc" and "ab"+"c" give different keys. */
export function verdictKey(stepHash: string, judge: string, judgeVersion: string): string {
  return createHash("sha256").update(JSON.stringify([stepHash, judge, judgeVersion])).digest("hex");
}

function fileFor(cacheDir: string, key: string): string {
  if (!/^[\w.-]+$/.test(key) || key.startsWith(".")) throw new Error("cache key must use letters, digits, dot, dash or underscore only");
  return join(cacheDir, `${key}.json`);
}

/** Read a stored verdict. Return null when there is none, or when the file is not valid JSON. */
export async function getVerdict(cacheDir: string, key: string): Promise<Verdict | null> {
  try {
    return JSON.parse(await readFile(fileFor(cacheDir, key), "utf8")) as Verdict;
  } catch (error) {
    if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Store a verdict. The write goes to a temporary file first, so a reader never sees half a file. */
export async function putVerdict(cacheDir: string, key: string, v: Verdict): Promise<void> {
  const file = fileFor(cacheDir, key);
  await mkdir(cacheDir, { recursive: true });
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(tmp, JSON.stringify(v, null, 2));
  await rename(tmp, file);
}
