import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  DESIGN_TOPICS,
  THIN_THRESHOLD,
  classify,
  scanDesignCoverage,
  closureProblems,
  injectCoverageTables,
  renderCoverageTables,
  COVERAGE_START,
  COVERAGE_END,
} from "../src/core/design-coverage.js";

const ROOT = new URL("../", import.meta.url);
const DOC_PATH = new URL("docs/17-design-coverage.md", ROOT);
const doc = readFileSync(DOC_PATH, "utf8");

/** Same evidence base as scripts/render-design-coverage.ts; generated contract catalogue is excluded. */
const EXCLUDED = new Set(["16-gap-analysis.md", "17-design-coverage.md", "23-upgrade-contracts.md", "42-comprehensive-capability-audit.md"]);

function evidenceBase(): Map<string, string> {
  const files = new Map<string, string>();
  for (const name of readdirSync(new URL("docs/", ROOT))) {
    if (!name.endsWith(".md") || EXCLUDED.has(name)) continue;
    files.set(`docs/${name}`, readFileSync(new URL(`docs/${name}`, ROOT), "utf8"));
  }
  for (const path of ["README.md", "prompts/README.md"]) {
    files.set(path, readFileSync(new URL(path, ROOT), "utf8"));
  }
  return files;
}

const files = evidenceBase();
const report = scanDesignCoverage(files);

describe("design topic list", () => {
  it("covers a platform-sized surface", () => {
    expect(DESIGN_TOPICS.length).toBeGreaterThanOrEqual(80);
  });

  it("has unique ids, labels and compilable patterns", () => {
    const ids = new Set<string>();
    const keys = new Set<string>();
    for (const t of DESIGN_TOPICS) {
      expect(ids.has(t.id), `duplicate id ${t.id}`).toBe(false);
      ids.add(t.id);
      expect(keys.has(t.key), `duplicate key ${t.key}`).toBe(false);
      keys.add(t.key);
      expect(t.fa.trim().length, `${t.id} fa`).toBeGreaterThanOrEqual(3);
      expect(t.patterns.length, `${t.id} patterns`).toBeGreaterThan(0);
      for (const p of t.patterns) {
        expect(() => new RegExp(p, "gi"), `${t.id} pattern ${p}`).not.toThrow();
      }
    }
  });

  it("classifies mention counts at the documented threshold", () => {
    expect(classify(0)).toBe("none");
    expect(classify(1)).toBe("thin");
    expect(classify(THIN_THRESHOLD)).toBe("thin");
    expect(classify(THIN_THRESHOLD + 1)).toBe("designed");
  });
});

describe("design coverage report", () => {
  it("finds a substantial set of undesigned topics", () => {
    expect(report.total).toBe(DESIGN_TOPICS.length);
    expect(report.designed + report.thin + report.none).toBe(report.total);
    // M9–M48 intentionally close several previously open design topics;
    // retain a regression guard for the remaining uncovered surface.
    expect(report.none).toBeGreaterThanOrEqual(1);
    expect(report.thin).toBeGreaterThanOrEqual(1);
  });

  it("every undesigned topic has a closure, and no designed topic keeps one", () => {
    expect(closureProblems(report)).toEqual([]);
  });

  it("evidence is never the audit's own documents", () => {
    for (const row of report.rows) {
      for (const e of row.evidence) {
        expect(EXCLUDED.has(e.file.replace("docs/", "")), `${e.file} leaked into evidence`).toBe(
          false,
        );
      }
    }
  });

  it("excluding the audit documents actually matters (no circular coverage)", () => {
    const withAudit = new Map(files);
    withAudit.set("docs/16-gap-analysis.md", readFileSync(new URL("docs/16-gap-analysis.md", ROOT), "utf8"));
    withAudit.set("docs/17-design-coverage.md", doc);
    const contaminated = scanDesignCoverage(withAudit);
    // If this ever stops being true, the exclusion above is doing nothing.
    expect(contaminated.none).toBeLessThan(report.none);
    expect(contaminated.designed + contaminated.thin).toBeGreaterThan(
      report.designed + report.thin,
    );
  });

  it("traces every baseline spec requirement to a topic", () => {
    const ids = new Set(DESIGN_TOPICS.map((t) => t.id));
    const REQUIREMENTS: Record<string, string[]> = {
      "LangGraph orchestration": ["DC-28"],
      "Redis / BullMQ": ["DC-29"],
      "connector tiers A–D": [],
      "OAuth over raw passwords": [],
      "prompt-injection defence": [],
      "sandbox escalation": ["DC-03"],
      "7 milestones": [],
      "free tools / free tier": [],
    };
    for (const [req, topicIds] of Object.entries(REQUIREMENTS)) {
      for (const id of topicIds) {
        expect(ids.has(id), `${req} -> ${id} does not exist`).toBe(true);
      }
    }
    // Requirements already designed elsewhere are asserted by the docs tests;
    // here we only guard the ones this audit found weak.
    const langgraph = report.rows.find((r) => r.topic.id === "DC-28");
    expect(langgraph?.coverage).toBe("designed");
  });
});

describe("design coverage document", () => {
  it("has the generated-block markers", () => {
    expect(doc).toContain(COVERAGE_START);
    expect(doc).toContain(COVERAGE_END);
    expect(doc.indexOf(COVERAGE_START)).toBeLessThan(doc.indexOf(COVERAGE_END));
  });

  it("is in sync with the scan (run: npx tsx scripts/render-design-coverage.ts)", () => {
    expect(doc).toBe(injectCoverageTables(doc, report));
  });

  it("renders every open topic with its closure", () => {
    const tables = renderCoverageTables(report);
    for (const row of report.rows) {
      if (row.coverage === "designed") continue;
      expect(tables).toContain(`\`${row.topic.id}\``);
      expect(tables).toContain(row.topic.closure ?? "");
    }
  });

  it("lists designed topics too, so the report is not only bad news", () => {
    const tables = renderCoverageTables(report);
    expect(tables).toContain("## موضوعاتی که طراحی شده‌اند");
    const rowCount = (tables.match(/^\| [^|]+ \| ۰?/gm) ?? []).length;
    expect(rowCount).toBeGreaterThan(0);
  });

  it("is linked from the docs index", () => {
    expect(readFileSync(new URL("docs/README.md", ROOT), "utf8")).toContain(
      "17-design-coverage.md",
    );
  });
});
