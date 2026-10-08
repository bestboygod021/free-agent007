/** M153 contracts for product E2E flow orchestration and failure evidence. */

export type M153Scenario = "signup_to_pr" | "local_run" | "connector_to_release" | "approval_to_deploy";
export type M153StepStatus = "pending" | "running" | "passed" | "failed" | "skipped";
export type M153RunState = "planned" | "running" | "passed" | "failed" | "contained";

export interface M153E2EFlowPlan {
  organizationId: string;
  flowId: string;
  scenario: M153Scenario;
  stepsHash: string;
  testDataHash: string;
  localFallback: boolean;
  tenantIsolationVerified: boolean;
  approvalPresent: boolean;
  noRawSecrets: boolean;
  deterministic: boolean;
  cleanupPlanHash: string;
}

export interface M153FlowStep {
  organizationId: string;
  flowId: string;
  stepId: string;
  order: number;
  action: string;
  status: M153StepStatus;
  evidenceHash: string;
  deterministic: boolean;
  noSideEffects: boolean;
  tenantMatch: boolean;
  timeoutMs: number;
}

export interface M153FlowRun {
  organizationId: string;
  flowId: string;
  runId: string;
  state: M153RunState;
  stepCount: number;
  passedSteps: number;
  failedSteps: number;
  artifactsHash: string;
  correlationId: string;
  cleanupComplete: boolean;
  customerImpactRedacted: boolean;
}

export interface M153FailureEvidence {
  organizationId: string;
  flowId: string;
  runId: string;
  failedAtStepId: string;
  reasonHash: string;
  containmentHash: string;
  rollbackHash: string;
  observedAt: number;
  customerImpactRedacted: boolean;
  secretsPurged: boolean;
  retryBounded: boolean;
}

export interface M153E2EDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  auditHash: string;
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(values: Array<readonly [string, string]>, reasons: string[]): void {
  for (const [value, label] of values) if (!value.trim()) reasons.push(`${label} is required`);
}

export function validateM153Plan(plan: M153E2EFlowPlan): M153E2EDecision {
  const reasons: string[] = [];
  required([[plan.organizationId, "organizationId"], [plan.flowId, "flowId"], [plan.stepsHash, "stepsHash"], [plan.testDataHash, "testDataHash"], [plan.cleanupPlanHash, "cleanupPlanHash"]], reasons);
  if (!plan.localFallback || !plan.tenantIsolationVerified || !plan.approvalPresent || !plan.noRawSecrets || !plan.deterministic) reasons.push("E2E plan needs fallback, tenant, approval, no-secret and deterministic evidence");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ plan, reasons })) };
}

export function validateM153Step(step: M153FlowStep): M153E2EDecision {
  const reasons: string[] = [];
  required([[step.organizationId, "organizationId"], [step.flowId, "flowId"], [step.stepId, "stepId"], [step.action, "action"], [step.evidenceHash, "evidenceHash"]], reasons);
  if (!Number.isInteger(step.order) || step.order < 1) reasons.push("step order must be positive");
  if (!step.deterministic || !step.noSideEffects || !step.tenantMatch) reasons.push("step needs deterministic, no-side-effect and tenant evidence");
  if (!Number.isInteger(step.timeoutMs) || step.timeoutMs < 1 || step.timeoutMs > 3_600_000) reasons.push("step timeout is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ step, reasons })) };
}

export function decideM153FlowRun(run: M153FlowRun): M153E2EDecision {
  const reasons: string[] = [];
  required([[run.organizationId, "organizationId"], [run.flowId, "flowId"], [run.runId, "runId"], [run.artifactsHash, "artifactsHash"], [run.correlationId, "correlationId"]], reasons);
  if (![run.stepCount, run.passedSteps, run.failedSteps].every((value) => Number.isInteger(value) && value >= 0)) reasons.push("flow counts must be non-negative integers");
  if (run.passedSteps + run.failedSteps > run.stepCount) reasons.push("passed and failed steps exceed step count");
  if (run.state === "passed" && run.failedSteps > 0) reasons.push("passed flow cannot contain failed steps");
  if (!run.cleanupComplete || !run.customerImpactRedacted) reasons.push("flow needs cleanup and customer-impact redaction");
  return { allowed: reasons.length === 0, reasons, requiresApproval: run.state === "passed", auditHash: hash(JSON.stringify({ run, reasons })) };
}

export function validateM153Failure(evidence: M153FailureEvidence): M153E2EDecision {
  const reasons: string[] = [];
  required([[evidence.organizationId, "organizationId"], [evidence.flowId, "flowId"], [evidence.runId, "runId"], [evidence.failedAtStepId, "failedAtStepId"], [evidence.reasonHash, "reasonHash"], [evidence.containmentHash, "containmentHash"], [evidence.rollbackHash, "rollbackHash"]], reasons);
  if (!Number.isFinite(evidence.observedAt) || !evidence.customerImpactRedacted || !evidence.secretsPurged || !evidence.retryBounded) reasons.push("failure evidence needs time, redaction, secret purge and bounded retry");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
