/**
 * Machine-readable register for the 100 upgrade designs.
 *
 * This is intentionally separate from the gap register. The gap register says
 * what the existing design has not yet built; this register says what the next
 * 100 upgrades are supposed to mean, how they are accepted, and which ones
 * have actually started implementation.
 */

import { existsSync, readFileSync } from "node:fs";

export type UpgradePriority = "P0" | "P1" | "P2";
export type UpgradeImplementationStatus = "not_started" | "in_progress" | "done_tested";
export type UpgradeStatus = "designed_only" | "scaffolded" | "partial" | "done_tested";

export interface UpgradeProposal {
  id: string;
  number: number;
  category: string;
  priority: UpgradePriority;
  titleFa: string;
  /** The purpose of the proposal. */
  goal: string;
  /** The concrete failure or missing capability this proposal addresses. */
  problem: string;
  design: string;
  inputs: string[];
  outputs: string[];
  interfaceOrSchema: string[];
  implementationLocation: string[];
  dependencies: string[];
  safety: string[];
  securityThreats: string[];
  testsRequired: string[];
  acceptance: string[];
  definitionOfDone: string[];
  designStatus: "complete";
  /** Legacy implementation vocabulary retained for backwards-compatible reports. */
  implementationStatus: UpgradeImplementationStatus;
  /** Canonical status vocabulary used by the 100-proposal contract. */
  status: UpgradeStatus;
  codeEvidence: string[];
}

export interface UpgradeRegister {
  $id: string;
  version: string;
  generatedAt: string;
  titleFa: string;
  statusVocabulary: Record<string, string>;
  proposals: UpgradeProposal[];
}

const ROOT_URL = new URL("../../", import.meta.url);
const REGISTER_URL = new URL("../../docs/upgrade-register.json", import.meta.url);

export function loadUpgradeRegister(): UpgradeRegister {
  return JSON.parse(readFileSync(REGISTER_URL, "utf8")) as UpgradeRegister;
}

export interface UpgradeRegisterProblem {
  id: string;
  problem: string;
}

/**
 * Validate the design inventory and its implementation claims.
 * A path in codeEvidence must exist; this is the important anti-fiction rule.
 */
export function validateUpgradeRegister(register: UpgradeRegister): UpgradeRegisterProblem[] {
  const problems: UpgradeRegisterProblem[] = [];
  if (register.proposals.length !== 100) {
    problems.push({ id: "REGISTER", problem: `expected 100 proposals, got ${register.proposals.length}` });
  }
  const ids = new Set<string>();
  const numbers = new Set<number>();
  const requiredStatusKeys = ["designed_only", "scaffolded", "partial", "done_tested"];
  for (const key of requiredStatusKeys) {
    if (!register.statusVocabulary[key]) {
      problems.push({ id: "REGISTER", problem: `missing status vocabulary ${key}` });
    }
  }
  for (const proposal of register.proposals) {
    if (!/^UP-\d{3}$/.test(proposal.id)) {
      problems.push({ id: proposal.id, problem: "id must match UP-NNN" });
    }
    if (ids.has(proposal.id)) problems.push({ id: proposal.id, problem: "duplicate id" });
    ids.add(proposal.id);
    if (numbers.has(proposal.number)) problems.push({ id: proposal.id, problem: "duplicate number" });
    numbers.add(proposal.number);
    if (proposal.number < 1 || proposal.number > 100) {
      problems.push({ id: proposal.id, problem: "number must be between 1 and 100" });
    }
    if (!/^P[012]$/.test(proposal.priority)) {
      problems.push({ id: proposal.id, problem: `unknown priority ${proposal.priority}` });
    }
    if (proposal.designStatus !== "complete") {
      problems.push({ id: proposal.id, problem: "designStatus is not complete" });
    }
    if (!["designed_only", "scaffolded", "partial", "done_tested"].includes(proposal.status)) {
      problems.push({ id: proposal.id, problem: `unknown canonical status ${proposal.status}` });
    }
    const expectedStatus: Record<UpgradeImplementationStatus, UpgradeStatus> = {
      not_started: "designed_only",
      in_progress: "partial",
      done_tested: "done_tested",
    };
    if (proposal.status !== expectedStatus[proposal.implementationStatus]) {
      problems.push({ id: proposal.id, problem: "canonical status disagrees with implementationStatus" });
    }
    if (proposal.goal.trim().length < 12 || proposal.problem.trim().length < 12) {
      problems.push({ id: proposal.id, problem: "goal and problem must contain useful text" });
    }
    for (const [field, values] of [
      ["inputs", proposal.inputs],
      ["outputs", proposal.outputs],
      ["interfaceOrSchema", proposal.interfaceOrSchema],
      ["implementationLocation", proposal.implementationLocation],
      ["safety", proposal.safety],
      ["securityThreats", proposal.securityThreats],
      ["testsRequired", proposal.testsRequired],
      ["acceptance", proposal.acceptance],
      ["definitionOfDone", proposal.definitionOfDone],
    ] as const) {
      if (values.length === 0 || values.some((value) => value.trim().length < 8)) {
        problems.push({ id: proposal.id, problem: `${field} must contain useful text` });
      }
    }
    for (const dependency of proposal.dependencies) {
      if (!/^UP-\d{3}$/.test(dependency)) {
        problems.push({ id: proposal.id, problem: `invalid dependency ${dependency}` });
      }
    }
    for (const path of proposal.codeEvidence) {
      if (!existsSync(new URL(path, ROOT_URL))) {
        problems.push({ id: proposal.id, problem: `codeEvidence does not exist: ${path}` });
      }
    }
    if (proposal.implementationStatus === "done_tested" && proposal.codeEvidence.length === 0) {
      problems.push({ id: proposal.id, problem: "done_tested requires codeEvidence" });
    }
  }
  for (let number = 1; number <= 100; number += 1) {
    if (!numbers.has(number)) problems.push({ id: "REGISTER", problem: `missing number ${number}` });
  }
  for (const proposal of register.proposals) {
    for (const dependency of proposal.dependencies) {
      if (!ids.has(dependency)) problems.push({ id: proposal.id, problem: `unknown dependency ${dependency}` });
    }
  }
  return problems;
}

export interface UpgradeSummary {
  total: number;
  byPriority: Record<UpgradePriority, number>;
  byImplementationStatus: Record<UpgradeImplementationStatus, number>;
  byCategory: Array<{ category: string; total: number; inProgress: number }>;
}

export function summarizeUpgrades(register: UpgradeRegister): UpgradeSummary {
  const byPriority = { P0: 0, P1: 0, P2: 0 };
  const byImplementationStatus = { not_started: 0, in_progress: 0, done_tested: 0 };
  const categories = new Map<string, { total: number; inProgress: number }>();
  for (const proposal of register.proposals) {
    byPriority[proposal.priority] += 1;
    byImplementationStatus[proposal.implementationStatus] += 1;
    const current = categories.get(proposal.category) ?? { total: 0, inProgress: 0 };
    current.total += 1;
    if (proposal.implementationStatus === "in_progress") current.inProgress += 1;
    categories.set(proposal.category, current);
  }
  return {
    total: register.proposals.length,
    byPriority,
    byImplementationStatus,
    byCategory: [...categories.entries()].map(([category, counts]) => ({ category, ...counts })),
  };
}

export function findUpgrade(register: UpgradeRegister, id: string): UpgradeProposal | undefined {
  return register.proposals.find((proposal) => proposal.id === id);
}
