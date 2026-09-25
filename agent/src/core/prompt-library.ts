import { readFileSync, readdirSync, existsSync } from "node:fs";

/**
 * Prompt library loader.
 *
 * A prompt is a versioned artifact on disk, not a string in a source file. This
 * module parses the front matter, resolves `{{include: ...}}` fragments, and
 * hands the runtime a final system prompt plus metadata the model router and
 * the audit log both need.
 *
 * Keeping prompts as files means: they are diffable, reviewable, versionable,
 * and testable — and nobody can quietly change an agent's behaviour from inside
 * application code.
 */

export interface PromptMeta {
  id: string;
  version: string;
  role: string;
  modelTaskType: string;
  outputSchema: string;
  outputShape?: "object" | "array-of-items";
  temperature?: number;
  maxAttempts?: number;
  includes?: string[];
}

export interface ComposedPrompt {
  meta: PromptMeta;
  text: string;
  /** resolved fragment paths, for the audit log */
  fragments: string[];
  sourceFile: string;
  /** the variables that were substituted, for reproducibility */
  vars: PromptVars;
}

/**
 * Runtime variables. The compute mode is the important one: switching it must
 * change what every agent is told, not only which provider answers.
 */
export interface PromptVars {
  computeMode: string;
  computeModeLabelFa: string;
  computeModeSummaryFa: string;
  modelLocality: string;
  allowCloudEgress: string;
  maxCostPerRun: string;
  perRunTokenBudget: string;
  hardStopTokens: string;
  maxRepairAttempts: string;
  maxParallelTasks: string;
  qualityGates: string;
  disabledCapabilities: string;
  warningsFa: string;
  privacyLevel: string;
}

export const REQUIRED_VARS: readonly (keyof PromptVars)[] = [
  "computeMode",
  "computeModeLabelFa",
  "computeModeSummaryFa",
  "modelLocality",
  "allowCloudEgress",
  "maxCostPerRun",
  "perRunTokenBudget",
  "hardStopTokens",
  "maxRepairAttempts",
  "maxParallelTasks",
  "qualityGates",
  "disabledCapabilities",
  "warningsFa",
  "privacyLevel",
];

const PROMPTS_DIR = new URL("../../prompts/", import.meta.url);

const REQUIRED_META: readonly (keyof PromptMeta)[] = [
  "id",
  "version",
  "role",
  "modelTaskType",
  "outputSchema",
];

export function promptsDir(): URL {
  return PROMPTS_DIR;
}

export function listPromptFiles(): string[] {
  return readdirSync(PROMPTS_DIR)
    .filter((f) => /^\d\d-.+\.md$/.test(f))
    .sort();
}

export function readPromptFile(fileName: string): string {
  return readFileSync(new URL(fileName, PROMPTS_DIR), "utf8");
}

/**
 * Minimal YAML-subset front matter parser: `key: value` and `key:\n  - item`.
 * Deliberately tiny — prompts must not depend on a YAML library to be loaded.
 */
export function parseFrontMatter(raw: string): { meta: Record<string, unknown>; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m || !m[1]) return { meta: {}, body: raw };

  const meta: Record<string, unknown> = {};
  const lines = m[1].split(/\r?\n/);
  let currentKey: string | null = null;

  for (const line of lines) {
    if (/^\s*#/.test(line) || line.trim().length === 0) continue;
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && currentKey) {
      const arr = meta[currentKey];
      if (Array.isArray(arr)) arr.push(strip(item[1] ?? ""));
      continue;
    }
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1] as string;
    const value = kv[2] ?? "";
    if (value.trim().length === 0) {
      meta[key] = [];
      currentKey = key;
      continue;
    }
    meta[key] = coerce(strip(value));
    currentKey = null;
  }

  return { meta, body: raw.slice(m[0].length) };
}

function strip(s: string): string {
  return s.trim().replace(/^["']|["']$/g, "");
}

function coerce(s: string): unknown {
  if (/^\d+$/.test(s)) return Number(s);
  if (/^\d+\.\d+$/.test(s)) return Number(s);
  if (s === "true") return true;
  if (s === "false") return false;
  return s;
}

export function validateMeta(meta: Record<string, unknown>): string[] {
  const problems: string[] = [];
  for (const key of REQUIRED_META) {
    if (meta[key] === undefined || meta[key] === "") {
      problems.push(`missing required front matter key: ${String(key)}`);
    }
  }
  const version = meta.version;
  if (typeof version === "string" && !/^\d+\.\d+\.\d+$/.test(version)) {
    problems.push(`version "${version}" is not semver`);
  }
  const shape = meta.outputShape;
  if (shape !== undefined && shape !== "object" && shape !== "array-of-items") {
    problems.push(`outputShape "${String(shape)}" is not one of object | array-of-items`);
  }
  if (meta.includes !== undefined && !Array.isArray(meta.includes)) {
    problems.push("includes must be a list");
  }
  return problems;
}

const INCLUDE_RE = /\{\{include:\s*([^}\s]+)\s*\}\}/g;
const VAR_RE = /\{\{var:\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** Substitute `{{var:key}}`. An unknown key is an error, never an empty string. */
export function resolveVars(text: string, vars: PromptVars): string {
  return text.replace(VAR_RE, (full, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) {
      throw new Error(`prompt references unknown variable "{{var:${key}}}"`);
    }
    return String(vars[key as keyof PromptVars]);
  });
}

/**
 * Resolve `{{include: fragments/x.md}}` placeholders. Recursion is capped so a
 * fragment cannot pull itself in.
 */
export function resolveIncludes(body: string, maxDepth = 4): { text: string; fragments: string[] } {
  const fragments: string[] = [];

  const walk = (input: string, depth: number): string => {
    if (depth > maxDepth) {
      throw new Error("fragment include depth exceeded");
    }
    return input.replace(INCLUDE_RE, (_full, rel: string) => {
      fragments.push(rel);
      const url = new URL(rel, PROMPTS_DIR);
      if (!existsSync(url)) {
        throw new Error(`missing fragment referenced by a prompt: ${rel}`);
      }
      return walk(readFileSync(url, "utf8").trim(), depth + 1);
    });
  };

  return { text: walk(body, 0).trim(), fragments };
}

export function composePrompt(fileName: string, vars: PromptVars): ComposedPrompt {
  const raw = readPromptFile(fileName);
  const { meta, body } = parseFrontMatter(raw);
  const problems = validateMeta(meta);
  if (problems.length > 0) {
    throw new Error(`invalid prompt front matter in ${fileName}: ${problems.join("; ")}`);
  }
  const included = resolveIncludes(body);
  const text = resolveVars(included.text, vars).trim();

  const leftover = text.match(VAR_RE);
  if (leftover) {
    throw new Error(`unresolved prompt variable in ${fileName}: ${leftover[0]}`);
  }

  return {
    meta: meta as unknown as PromptMeta,
    text,
    fragments: included.fragments,
    sourceFile: fileName,
    vars,
  };
}

export function composeAll(vars: PromptVars): ComposedPrompt[] {
  return listPromptFiles().map((f) => composePrompt(f, vars));
}
