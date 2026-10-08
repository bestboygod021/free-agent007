/**
 * Evidence rule.
 *
 * The single most important anti-hallucination control in the platform:
 *
 *   A model may not declare success. Only a verified tool result may.
 *
 * Every completion report is passed through `auditCompletionClaim`. If the
 * agent says "completed" but there is no passing command, no passing test, or
 * no changed file, the claim is rejected and the task is moved back to REPAIR
 * (or BLOCKED when the repair budget is gone). The UI shows the violation
 * verbatim, so the user is never told "done" on the strength of prose.
 */

export interface ExecutedCommand {
  command: string;
  exitCode: number;
  /** where the captured output lives (object storage key or sandbox path) */
  logsRef?: string;
  durationMs?: number;
}

export interface TestResult {
  name: string;
  passed: boolean;
  skipped?: boolean;
}

export type CompletionStatus = "completed" | "blocked" | "failed";

export interface CompletionClaim {
  taskStatus: CompletionStatus;
  summary: string;
  acceptanceCriteria: string[];
  filesChanged: string[];
  commandsExecuted: ExecutedCommand[];
  tests: TestResult[];
  /** required when taskStatus is blocked or failed */
  failureReason?: string;
  /** required when taskStatus is blocked or failed */
  nextAction?: string;
  securityReview?: Array<{ severity: string; description: string }>;
  knownLimitations?: string[];
}

export interface ClaimAudit {
  accepted: boolean;
  violations: string[];
  /** true when the run should be pushed back into REPAIR */
  repairable: boolean;
}

const CRITICAL_FINDINGS = new Set(["critical", "high"]);

export function auditCompletionClaim(claim: CompletionClaim): ClaimAudit {
  const violations: string[] = [];

  if (claim.taskStatus === "completed") {
    if (claim.filesChanged.length === 0) {
      violations.push("claim says completed but no file changed");
    }
    if (claim.commandsExecuted.length === 0) {
      violations.push("claim says completed but no command was executed and verified");
    }
    const failing = claim.commandsExecuted.filter((c) => c.exitCode !== 0);
    if (failing.length > 0) {
      violations.push(
        `claim says completed but ${failing.length} command(s) exited non-zero: ${failing
          .map((f) => `${f.command} (exit ${f.exitCode})`)
          .join("; ")}`,
      );
    }
    if (claim.tests.length === 0) {
      violations.push("claim says completed but no test result was reported");
    }
    const failedTests = claim.tests.filter((t) => !t.passed && !t.skipped);
    if (failedTests.length > 0) {
      violations.push(
        `claim says completed but ${failedTests.length} test(s) failed: ${failedTests
          .map((t) => t.name)
          .join(", ")}`,
      );
    }
    if (claim.acceptanceCriteria.length === 0) {
      violations.push("task has no acceptance criteria; completion is not decidable");
    }
    const blocking = (claim.securityReview ?? []).filter((f) =>
      CRITICAL_FINDINGS.has(f.severity.toLowerCase()),
    );
    if (blocking.length > 0) {
      violations.push(
        `claim says completed but ${blocking.length} unresolved critical/high security finding(s) remain`,
      );
    }
  }

  if (claim.taskStatus === "blocked" || claim.taskStatus === "failed") {
    if (!claim.failureReason || claim.failureReason.trim().length === 0) {
      violations.push(`${claim.taskStatus} requires a failureReason`);
    }
    if (!claim.nextAction || claim.nextAction.trim().length === 0) {
      violations.push(`${claim.taskStatus} requires a nextAction for the human`);
    }
  }

  if (claim.summary.trim().length === 0) {
    violations.push("summary must not be empty");
  }

  return {
    accepted: violations.length === 0,
    violations,
    repairable: claim.taskStatus === "completed" && violations.length > 0,
  };
}
