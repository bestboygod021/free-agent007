/**
 * Prints the fully composed system prompt for one agent under a chosen compute
 * mode, so a prompt change can be eyeballed in review exactly as the runtime
 * will send it.
 *
 *   npx tsx scripts/show-prompt.ts --list
 *   npx tsx scripts/show-prompt.ts coding-agent
 *   npx tsx scripts/show-prompt.ts coding-agent --mode local --privacy confidential
 */
import { resolveMode, type ComputeMode } from "../src/core/compute-mode.js";
import { composeAll, composePrompt, listPromptFiles } from "../src/core/prompt-library.js";
import { promptVarsForMode } from "../src/core/prompt-vars.js";
import type { PrivacyLevel } from "../src/core/types.js";

const args = process.argv.slice(2);

function flag(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
}

const mode = (flag("mode") ?? "free") as ComputeMode;
const privacy = (flag("privacy") ?? "private") as PrivacyLevel;

const positional: string[] = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i] ?? "";
  if (a === "--mode" || a === "--privacy") {
    i += 1;
    continue;
  }
  if (a.startsWith("--")) continue;
  positional.push(a);
}
const target = positional[0];

if (target === "--list" || target === undefined) {
  const profile = resolveMode(mode);
  console.log(`# compute mode: ${profile.labelFa}\n`);
  for (const f of listPromptFiles()) {
    const p = composePrompt(f, promptVarsForMode(mode, { privacyLevel: privacy }));
    console.log(
      `${p.meta.id.padEnd(24)} v${p.meta.version}  ${p.text.split("\n").length} lines  ${f}`,
    );
  }
  process.exit(0);
}

const vars = promptVarsForMode(mode, { privacyLevel: privacy });
const match = composeAll(vars).find(
  (p) => p.meta.id === target || p.sourceFile.includes(target as string),
);

if (!match) {
  console.error(`no prompt with id or filename containing "${target}"`);
  process.exit(1);
}

console.log(`# ${match.meta.id} v${match.meta.version} (${match.sourceFile})`);
console.log(`# compute mode: ${vars.computeMode} — ${vars.computeModeLabelFa}`);
console.log(`# privacy level: ${vars.privacyLevel}`);
console.log(`# fragments: ${match.fragments.join(", ")}`);
console.log(`# output schema: ${match.meta.outputSchema}`);
console.log(`# ${match.text.split("\n").length} lines, ${match.text.length} chars\n`);
console.log(match.text);
