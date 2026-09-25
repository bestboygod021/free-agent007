import { readFileSync, writeFileSync } from "node:fs";
import { loadGapRegister, injectGapTables, validateRegister } from "../src/core/gap-register.js";

const DOC = "docs/16-gap-analysis.md";

const register = loadGapRegister();
const problems = validateRegister(register);
if (problems.length > 0) {
  console.error("gap register is malformed:");
  for (const p of problems) console.error(`  ${p.gapId}: ${p.problem}`);
  process.exit(1);
}

const before = readFileSync(DOC, "utf8");
const after = injectGapTables(before, register);

if (before === after) {
  console.log(`${DOC} is already in sync (${register.gaps.length} gaps).`);
} else {
  writeFileSync(DOC, after, "utf8");
  console.log(`${DOC} regenerated from ${register.gaps.length} gaps.`);
}
