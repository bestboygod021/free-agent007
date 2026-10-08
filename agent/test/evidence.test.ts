import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { auditCompletionClaim, type CompletionClaim } from "../src/core/evidence.js";

const good = JSON.parse(
  readFileSync(new URL("../examples/completion-report.completed.json", import.meta.url), "utf8"),
) as CompletionClaim;

const unverified = JSON.parse(
  readFileSync(new URL("../examples/completion-report.unverified.json", import.meta.url), "utf8"),
) as CompletionClaim;

describe("evidence rule", () => {
  it("accepts a claim backed by passing commands and tests", () => {
    const a = auditCompletionClaim(good);
    expect(a.violations).toEqual([]);
    expect(a.accepted).toBe(true);
    expect(a.repairable).toBe(false);
  });

  it("rejects a prose-only completion claim", () => {
    const a = auditCompletionClaim(unverified);
    expect(a.accepted).toBe(false);
    expect(a.repairable).toBe(true);
    expect(a.violations.join(" | ")).toMatch(/no command was executed/);
    expect(a.violations.join(" | ")).toMatch(/no file changed/);
    expect(a.violations.join(" | ")).toMatch(/no test result/);
  });

  it("rejects a completion claim that hides a failing command", () => {
    const a = auditCompletionClaim({
      ...good,
      commandsExecuted: [
        { command: "pnpm lint", exitCode: 0 },
        { command: "pnpm vitest run", exitCode: 1, logsRef: "logs/x.txt" },
      ],
    });
    expect(a.accepted).toBe(false);
    expect(a.violations.join(" | ")).toMatch(/exited non-zero/);
  });

  it("rejects a completion claim that hides a failing test", () => {
    const a = auditCompletionClaim({
      ...good,
      tests: [...good.tests, { name: "cross-tenant access is rejected", passed: false }],
    });
    expect(a.accepted).toBe(false);
    expect(a.violations.join(" | ")).toMatch(/test\(s\) failed/);
  });

  it("rejects a completion claim with an unresolved critical security finding", () => {
    const a = auditCompletionClaim({
      ...good,
      securityReview: [
        {
          severity: "critical",
          description: "SQL injection in the catalog search endpoint",
        },
      ],
    });
    expect(a.accepted).toBe(false);
    expect(a.violations.join(" | ")).toMatch(/critical\/high security/);
  });

  it("accepts a blocked report only when it explains itself", () => {
    const bare = auditCompletionClaim({
      ...good,
      taskStatus: "blocked",
      failureReason: undefined,
      nextAction: undefined,
    });
    expect(bare.accepted).toBe(false);

    const explained = auditCompletionClaim({
      ...good,
      taskStatus: "blocked",
      failureReason: "Payment provider test key was not provided.",
      nextAction: "Ask the user to create a test-mode key and re-run task_integration_payment.",
    });
    expect(explained.accepted).toBe(true);
  });

  it("rejects a task whose acceptance criteria are empty", () => {
    const a = auditCompletionClaim({ ...good, acceptanceCriteria: [] });
    expect(a.accepted).toBe(false);
    expect(a.violations.join(" | ")).toMatch(/not decidable/);
  });
});
