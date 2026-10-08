import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { clearTools, listTools } from '../../services/agent-tools.js';
import { registerBuiltinTools } from '../../services/agent-tools-builtin.js';
import { registerGitTools } from '../../services/agent-tools-git.js';
import { registerCodeTools } from '../../services/agent-tools-code.js';
import { registerDataTools } from '../../services/agent-tools-data.js';
import { registerWebTools } from '../../services/agent-tools-web.js';
import { registerForgeTools } from '../../services/agent-tools-forge.js';
import { registerRenameTools } from '../../services/agent-tools-rename.js';

/**
 * The README describes the tool roster. This checks it against the registry.
 *
 * Written after finding the README claiming "Nineteen tools" in one paragraph
 * and "21 audited tools" in three others, while the registry held 23. Nobody
 * had lied; the number was updated in the places someone remembered. A
 * document that describes a registry should be checked against that registry,
 * or it decays into a description of what the project used to be.
 *
 * This deliberately does not assert a hardcoded count in two places. The
 * registry is the fact and the README is the claim, so the test compares them
 * rather than pinning both to a third number that would also need updating.
 */

const README = path.join(import.meta.dirname, '../../../../README.md');

/**
 * Just the roster table.
 *
 * The rest of the README discusses tool names that are deliberately not real:
 * the section on naming uses `code.usages.find` as an example of a name that
 * would be misclassified. Matching backticked names across the whole document
 * cannot tell a roster entry from a cautionary one.
 */
function rosterTable(readme: string): string {
  const start = readme.indexOf('| Area | Tools | Notes |');
  expect(start).toBeGreaterThan(-1);
  const end = readme.indexOf('\n\n', start);
  return readme.slice(start, end === -1 ? undefined : end);
}

function registerEveryTool(): void {
  clearTools();
  registerBuiltinTools();
  registerGitTools();
  registerCodeTools();
  registerDataTools();
  registerWebTools();
  registerForgeTools();
  registerRenameTools();
}

describe('the README tool roster matches the registry', () => {
  let names: string[];
  let readme: string;

  beforeAll(() => {
    registerEveryTool();
    names = listTools()
      .map((tool) => tool.name)
      .sort();
    readme = readFileSync(README, 'utf8');
  });

  it('agrees on how many tools there are, everywhere it says so', () => {
    // Every "N tools" and "N audited tools" in the README, wherever it appears.
    const claimed = [...readme.matchAll(/\b(\d+)\s+(?:audited\s+)?tools\b/g)].map((m) =>
      Number(m[1]),
    );

    // If this is empty the README stopped stating a count and the test has
    // quietly stopped testing anything.
    expect(claimed.length).toBeGreaterThanOrEqual(3);
    for (const count of claimed) {
      expect(count).toBe(names.length);
    }
  });

  it('names every registered tool in the roster table', () => {
    const missing = names.filter((name) => !rosterTable(readme).includes(`\`${name}\``));
    expect(missing).toEqual([]);
  });

  /**
   * The other direction. Renaming a tool and leaving the old name in the
   * table documents a tool that cannot be called, which is worse than
   * documenting none: a caller gets a registration error for something the
   * README promised.
   */
  it('does not document a tool that is not registered', () => {
    const documented = [
      ...rosterTable(readme).matchAll(/`((?:fs|git|code|data|web|sandbox)\.[a-z_.]+)`/g),
    ].map((m) => m[1]!);
    const unknown = [...new Set(documented)].filter((name) => !names.includes(name));
    expect(unknown).toEqual([]);
  });

  /**
   * A tool the driver never offers is a tool no run can use. Read-only tools
   * are listed by name in `agent-driver.ts`, so a new one is invisible until
   * it is added there — which is the step that is easy to forget, because
   * everything else about the tool works.
   *
   * Scoped to `data.*` on purpose. That list is a curated offer, not
   * "everything that happens to be readable": `code.rename.preview.read` is a
   * read and is deliberately absent, because previewing a refactor during
   * intake is noise. Data tools are different — a phase that can read a file
   * but cannot query a spreadsheet next to it will read the spreadsheet as
   * text and do arithmetic in the model, which is the failure these tools
   * exist to prevent.
   */
  it('offers every data tool to the read-only phases', async () => {
    const driver = readFileSync(
      path.join(import.meta.dirname, '../../services/agent-driver.ts'),
      'utf8',
    );
    const readOnlyBlock = /const READ_ONLY_TOOLS = \[([\s\S]*?)\] as const;/.exec(driver)?.[1];
    expect(readOnlyBlock).toBeDefined();

    const offered = [...readOnlyBlock!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
    const dataTools = names.filter((name) => name.startsWith('data.'));
    expect(dataTools.length).toBeGreaterThan(0);
    const notOffered = dataTools.filter((name) => !offered.includes(name));
    expect(notOffered).toEqual([]);
  });
});
