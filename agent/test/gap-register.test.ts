import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  loadGapRegister,
  validateRegister,
  renderGapTables,
  injectGapTables,
  summarize,
  GAPS_START,
  GAPS_END,
} from "../src/core/gap-register.js";

const REPO_ROOT = new URL("../", import.meta.url);
const DOC_PATH = new URL("docs/16-gap-analysis.md", REPO_ROOT);
const register = loadGapRegister();
const doc = readFileSync(DOC_PATH, "utf8");

describe("gap register structure", () => {
  it("is a non-trivial audit, not a placeholder", () => {
    expect(register.gaps.length).toBeGreaterThanOrEqual(90);
    expect(Object.keys(register.areas).length).toBeGreaterThanOrEqual(10);
  });

  it("has no malformed entries", () => {
    expect(validateRegister(register)).toEqual([]);
  });

  it("uses only vocabulary values", () => {
    const statuses = Object.keys(register.statusVocabulary);
    const severities = Object.keys(register.severityVocabulary);
    for (const gap of register.gaps) {
      expect(statuses).toContain(gap.status);
      expect(severities).toContain(gap.severity);
      expect(register.areas[gap.area]).toBeDefined();
    }
  });

  it("carries a consequence and a closure action for every gap", () => {
    for (const gap of register.gaps) {
      expect(gap.why.length, `${gap.id} why`).toBeGreaterThanOrEqual(20);
      expect(gap.closure.length, `${gap.id} closure`).toBeGreaterThanOrEqual(10);
      expect(gap.title.endsWith(".")).toBe(false);
    }
  });

  it("assigns a real milestone to every blocker", () => {
    for (const gap of register.gaps) {
      if (gap.severity !== "blocker") continue;
      expect(["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M119", "M120", "M121", "M122", "M123", "M124", "M125", "M126", "M127", "M128", "M129", "M130", "M131", "M132", "M133", "M134", "M135", "M136", "M137", "M138", "M139", "M140", "M141", "M142", "M143", "M144", "M145", "M146", "M147", "M148", "M149", "M150", "M151", "M152", "M153", "M159", "M160", "M161", "M162", "M163", "M164", "M165", "M166", "M167", "M168", "M169", "M170", "M171", "M172", "M173", "M179", "M180", "M181", "M182", "M183", "M184", "M185", "M186", "M187", "M188", "M189", "M190", "M191", "M192", "M193", "M194", "M195", "M196", "M197", "M198", "M199", "M200", "M201", "M202", "M203", "M204", "M205", "M206", "M207", "M208"]).toContain(gap.milestone);
    }
  });
});

describe("gap register references", () => {
  const mentioned = register.gaps
    .map((g) => `${g.why} ${g.closure}`)
    .join(" ");

  const cited = new Set(
    (mentioned.match(
      /\b(?:docs|src|schema|examples|prompts|test|scripts|prisma|apps|packages|ui|infrastructure|connectors)\/[A-Za-z0-9_.\-/]+/g,
    ) ?? []).map((p) => p.replace(/[.,)]+$/, "")),
  );

  const existsIn = (path: string) =>
    existsSync(new URL(path, REPO_ROOT)) || existsSync(new URL(`${path}/`, REPO_ROOT));

  it("cite paths that either exist or are declared as closure targets", () => {
    expect(cited.size).toBeGreaterThan(30);
    const planned = new Set(register.plannedPaths);
    for (const path of cited) {
      expect(
        existsIn(path) || planned.has(path),
        `register cites "${path}", which neither exists nor is listed in plannedPaths`,
      ).toBe(true);
    }
  });

  it("keeps plannedPaths honest — a path that appeared must leave the list", () => {
    for (const path of register.plannedPaths) {
      expect(
        existsIn(path),
        `"${path}" now exists: build it in, then close its gap and drop it from plannedPaths`,
      ).toBe(false);
    }
  });

  it("has no dangling planned path that nothing cites", () => {
    for (const path of register.plannedPaths) {
      expect(cited.has(path), `plannedPaths declares "${path}" but no gap mentions it`).toBe(true);
    }
  });

  it("claims about the working tree are true", () => {
    const count = (dir: string, suffix: string) =>
      readdirSync(new URL(dir, REPO_ROOT)).filter((f) => f.endsWith(suffix)).length;

    const baseline = register.baseline;
    const num = (key: string): number => {
      const value = baseline[key];
      if (typeof value !== "number") {
        throw new Error(`baseline.${key} is not a number (got ${typeof value})`);
      }
      return value;
    };

    expect(count("docs", ".md")).toBe(num("docs"));
    // prompts/ holds 13 agent files plus a README.md that is not an agent
    expect(count("prompts", ".md") - 1).toBe(num("prompts"));
    expect(count("prompts/fragments", ".md")).toBe(num("fragments"));
    expect(count("schema", ".json")).toBe(num("schemas"));
    expect(count("examples", ".json")).toBe(num("examples"));
    expect(count("src/core", ".ts")).toBe(num("coreModules"));
    expect(count("test", ".ts")).toBe(num("testFiles"));
    // apps/playground is a live observation console over the deterministic
    // core, not product code. It is counted so the claim stays checkable.
    const appFiles = readdirSync(new URL("apps/playground/public/", REPO_ROOT)).length + 1 + readdirSync(new URL("apps/api/", REPO_ROOT)).length;
    expect(appFiles).toBe(num("appCode"));

    // A reference API slice now exists; production auth, persistence, web and worker remain open.
    expect(existsSync(new URL("apps/api/", REPO_ROOT))).toBe(true);
    expect(existsSync(new URL("openapi.yaml", REPO_ROOT))).toBe(true);
    for (const dir of ["apps/web", "packages", "ui", "connectors", "infrastructure"]) {
      expect(existsSync(new URL(`${dir}/`, REPO_ROOT)), `${dir} appeared`).toBe(false);
    }
    expect(existsSync(new URL("prisma/migrations/", REPO_ROOT))).toBe(true);
    expect(existsSync(new URL(".github/workflows/", REPO_ROOT))).toBe(false);
  });
});

describe("gap analysis document", () => {
  it("has the generated-block markers", () => {
    expect(doc).toContain(GAPS_START);
    expect(doc).toContain(GAPS_END);
    expect(doc.indexOf(GAPS_START)).toBeLessThan(doc.indexOf(GAPS_END));
  });

  it("is in sync with the register (run: npx tsx scripts/render-gaps.ts)", () => {
    expect(doc).toBe(injectGapTables(doc, register));
  });

  it("renders one row per gap", () => {
    const tables = renderGapTables(register);
    for (const gap of register.gaps) {
      expect(tables).toContain(`\`${gap.id}\``);
    }
    const rowCount = (tables.match(/^\| `GAP-/gm) ?? []).length;
    expect(rowCount).toBe(register.gaps.length);
  });

  it("renders every area as a section", () => {
    const tables = renderGapTables(register);
    for (const label of Object.values(register.areas)) {
      expect(tables).toContain(`## ${label}`);
    }
  });

  it("is linked from the docs index", () => {
    const index = readFileSync(new URL("docs/README.md", REPO_ROOT), "utf8");
    expect(index).toContain("16-gap-analysis.md");
  });
});

describe("gap register summary", () => {
  it("totals are consistent", () => {
    const s = summarize(register);
    expect(s.total).toBe(register.gaps.length);
    const statusTotal = Object.values(s.byStatus).reduce((a, b) => a + b, 0);
    const severityTotal = Object.values(s.bySeverity).reduce((a, b) => a + b, 0);
    const areaTotal = s.byArea.reduce((a, b) => a + b.count, 0);
    const milestoneTotal = Object.values(s.byMilestone).reduce((a, b) => a + b, 0);
    expect(statusTotal).toBe(s.total);
    expect(severityTotal).toBe(s.total);
    expect(areaTotal).toBe(s.total);
    expect(milestoneTotal).toBe(s.total);
  });

  it("counts blockers per area against the raw list", () => {
    const s = summarize(register);
    for (const a of s.byArea) {
      const expected = register.gaps.filter(
        (g) => g.area === a.area && g.severity === "blocker",
      ).length;
      expect(a.blockers).toBe(expected);
    }
  });
});
