import { describe, expect, it } from "vitest";

import {
  findUpgrade,
  loadUpgradeRegister,
  summarizeUpgrades,
  validateUpgradeRegister,
} from "../src/core/upgrade-register.js";

const register = loadUpgradeRegister();

describe("100-upgrade design register", () => {
  it("contains exactly 100 complete designs", () => {
    expect(register.proposals).toHaveLength(100);
    expect(validateUpgradeRegister(register)).toEqual([]);
    expect(register.proposals.every((proposal) => proposal.designStatus === "complete")).toBe(true);
  });

  it("has unique IDs and consecutive numbers", () => {
    expect(new Set(register.proposals.map((proposal) => proposal.id)).size).toBe(100);
    expect(register.proposals.map((proposal) => proposal.number)).toEqual(
      Array.from({ length: 100 }, (_, index) => index + 1),
    );
  });

  it("does not claim unimplemented work as done", () => {
    const summary = summarizeUpgrades(register);
    expect(summary.byImplementationStatus.done_tested).toBe(0);
    expect(summary.byImplementationStatus.in_progress).toBeGreaterThanOrEqual(4);
    expect(summary.byPriority.P0).toBeGreaterThan(20);
    expect(summary.byCategory.length).toBeGreaterThanOrEqual(8);
  });

  it("finds the real benchmark and the three first implementation anchors", () => {
    expect(findUpgrade(register, "UP-012")?.implementationStatus).toBe("in_progress");
    expect(findUpgrade(register, "UP-012")?.codeEvidence).toContain("src/core/benchmark-runner.ts");
    expect(findUpgrade(register, "UP-041")?.codeEvidence).toContain("src/core/checkpoint-store.ts");
    expect(findUpgrade(register, "UP-051")?.codeEvidence).toContain("src/core/usage-ledger.ts");
  });

  it("has an executable design contract for every proposal", () => {
    for (const proposal of register.proposals) {
      expect(proposal.goal.length, proposal.id).toBeGreaterThan(12);
      expect(proposal.problem.length, proposal.id).toBeGreaterThan(12);
      expect(proposal.interfaceOrSchema.length, proposal.id).toBeGreaterThan(0);
      expect(proposal.implementationLocation.length, proposal.id).toBeGreaterThan(0);
      expect(proposal.securityThreats.length, proposal.id).toBeGreaterThan(0);
      expect(proposal.testsRequired.length, proposal.id).toBeGreaterThan(0);
      expect(proposal.definitionOfDone.length, proposal.id).toBeGreaterThan(0);
    }
  });

  it("uses the canonical four-state status vocabulary", () => {
    expect(Object.keys(register.statusVocabulary)).toEqual([
      "designed_only",
      "scaffolded",
      "partial",
      "done_tested",
      "implementationStatus",
    ]);
    expect(new Set(register.proposals.map((proposal) => proposal.status))).toEqual(
      new Set(["partial"]),
    );
  });

  it("has safety and acceptance text for every proposal", () => {
    for (const proposal of register.proposals) {
      expect(proposal.safety.join(" ").length, proposal.id).toBeGreaterThan(8);
      expect(proposal.securityThreats.join(" ").length, proposal.id).toBeGreaterThan(8);
      expect(proposal.acceptance.join(" ").length, proposal.id).toBeGreaterThan(8);
    }
  });
});
