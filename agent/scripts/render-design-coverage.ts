import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  scanDesignCoverage,
  closureProblems,
  injectCoverageTables,
} from "../src/core/design-coverage.js";

const DOC = "docs/17-design-coverage.md";

/**
 * Evidence base: the design documents themselves.
 *
 * The audit's own documents and the generated contract catalogue are deliberately
 * excluded — otherwise docs 16/17/23 would count as "coverage" of the very topics
 * they report or mechanically enumerate, and the numbers would be circular.
 */
const EXCLUDED = new Set(["16-gap-analysis.md", "17-design-coverage.md", "23-upgrade-contracts.md", "42-comprehensive-capability-audit.md"]);

const files = new Map<string, string>();
for (const name of readdirSync("docs")) {
  if (!name.endsWith(".md") || EXCLUDED.has(name)) continue;
  files.set(`docs/${name}`, readFileSync(`docs/${name}`, "utf8"));
}
for (const path of ["README.md", "prompts/README.md"]) {
  files.set(path, readFileSync(path, "utf8"));
}

const report = scanDesignCoverage(files);

const problems = closureProblems(report);
if (problems.length > 0) {
  console.error("design-coverage list is stale:");
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

const before = readFileSync(DOC, "utf8");
const after = injectCoverageTables(before, report);

console.log(
  `scanned ${files.size} files: ${report.designed} designed, ${report.thin} thin, ${report.none} none`,
);

if (before === after) {
  console.log(`${DOC} is already in sync.`);
} else {
  writeFileSync(DOC, after, "utf8");
  console.log(`${DOC} regenerated.`);
}
