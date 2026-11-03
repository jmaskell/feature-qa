#!/usr/bin/env node
// Repo checks for the plugin: skill and agent frontmatter, word limits, portability, README tables, plugin.json.
import { realpathSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

// Add words that name private projects to scripts/banned-words.local.txt, one word on each line. Git ignores that file.
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
  const local = await readFile(join(root, "scripts", "banned-words.local.txt"), "utf8").catch(() => "");
  const banned = [...BANNED, ...local.split(/\r?\n/).map((w) => w.trim()).filter(Boolean)];
  for (const dir of ["skills", "agents", "templates"]) {
    for (const file of await filesUnder(join(root, dir))) {
      const lines = (await readFile(file, "utf8")).split(/\r?\n/);
      lines.forEach((line, i) => {
        if (line.includes("portability-allow")) return;
        for (const word of banned) {
          if (new RegExp(`(?<![\\w.])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w])`, "i").test(line)) {
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

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const problems = await checkPlugin(process.cwd());
  for (const p of problems) console.error(p);
  if (problems.length === 0) console.log("PASS: plugin check");
  process.exitCode = problems.length === 0 ? 0 : 1;
}
