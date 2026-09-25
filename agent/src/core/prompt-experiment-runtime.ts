/** M174 fail-closed contracts for prompt experimentation and rollback. */

export type M174ExperimentState = "draft" | "running" | "paused" | "completed" | "rolled_back";
export type M174MetricDirection = "maximize" | "minimize";

export interface M174PromptVariant {
  organizationId: string;
  experimentId: string;
  variantId: string;
  promptHash: string;
  policyHash: string;
  modelScope: string;
  allocationBps: number;
  metricName: string;
  metricDirection: M174MetricDirection;
  state: M174ExperimentState;
  approved: boolean;
  reversible: boolean;
  noRawSecrets: boolean;
  tenantBound: boolean;
}

export interface M174Assignment {
  organizationId: string;
  experimentId: string;
  assignmentId: string;
  subjectHash: string;
  variantId: string;
  deterministicSeed: number;
  assignedAt: number;
  expiresAt: number;
  holdout: boolean;
  tenantMatch: boolean;
}

export interface M174Result {
  organizationId: string;
  experimentId: string;
  assignmentId: string;
  resultId: string;
  metricName: string;
  score: number;
  evidenceHash: string;
  valid: boolean;
  redacted: boolean;
  tenantMatch: boolean;
}

export interface M174Rollback {
  organizationId: string;
  experimentId: string;
  rollbackId: string;
  fromVariantId: string;
  toVariantId: string;
  reasonHash: string;
  approvalPresent: boolean;
  bounded: boolean;
  noDataLoss: boolean;
  operatorReference: string;
}

export interface M174ExperimentDecision {
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

export function validateM174Variant(variant: M174PromptVariant): M174ExperimentDecision {
  const reasons: string[] = [];
  required([[variant.organizationId, "organizationId"], [variant.experimentId, "experimentId"], [variant.variantId, "variantId"], [variant.promptHash, "promptHash"], [variant.policyHash, "policyHash"], [variant.modelScope, "modelScope"], [variant.metricName, "metricName"]], reasons);
  if (!Number.isInteger(variant.allocationBps) || variant.allocationBps < 0 || variant.allocationBps > 10_000) reasons.push("allocation must be between 0 and 10000 basis points");
  if (variant.metricDirection !== "maximize" && variant.metricDirection !== "minimize") reasons.push("metric direction is invalid");
  if (variant.state === "running" && (!variant.approved || !variant.reversible)) reasons.push("running variant needs approval and rollback");
  if (!variant.noRawSecrets || !variant.tenantBound) reasons.push("variant needs secret and tenant boundaries");
  return { allowed: reasons.length === 0, reasons, requiresApproval: variant.state === "running", auditHash: hash(JSON.stringify({ variant, reasons })) };
}

export function decideM174Assignment(assignment: M174Assignment, now: number): M174ExperimentDecision {
  const reasons: string[] = [];
  required([[assignment.organizationId, "organizationId"], [assignment.experimentId, "experimentId"], [assignment.assignmentId, "assignmentId"], [assignment.subjectHash, "subjectHash"], [assignment.variantId, "variantId"]], reasons);
  if (!Number.isInteger(assignment.deterministicSeed) || !Number.isFinite(assignment.assignedAt) || !Number.isFinite(assignment.expiresAt) || assignment.expiresAt <= assignment.assignedAt || assignment.expiresAt <= now) reasons.push("assignment time or seed is invalid");
  if (!assignment.tenantMatch) reasons.push("assignment tenant does not match");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ assignment, now, reasons })) };
}

export function validateM174Result(result: M174Result): M174ExperimentDecision {
  const reasons: string[] = [];
  required([[result.organizationId, "organizationId"], [result.experimentId, "experimentId"], [result.assignmentId, "assignmentId"], [result.resultId, "resultId"], [result.metricName, "metricName"], [result.evidenceHash, "evidenceHash"]], reasons);
  if (!Number.isFinite(result.score) || result.score < 0 || result.score > 1 || !result.valid || !result.redacted || !result.tenantMatch) reasons.push("result score or evidence is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ result, reasons })) };
}

export function decideM174Rollback(rollback: M174Rollback): M174ExperimentDecision {
  const reasons: string[] = [];
  required([[rollback.organizationId, "organizationId"], [rollback.experimentId, "experimentId"], [rollback.rollbackId, "rollbackId"], [rollback.fromVariantId, "fromVariantId"], [rollback.toVariantId, "toVariantId"], [rollback.reasonHash, "reasonHash"], [rollback.operatorReference, "operatorReference"]], reasons);
  if (rollback.fromVariantId === rollback.toVariantId || !rollback.approvalPresent || !rollback.bounded || !rollback.noDataLoss) reasons.push("rollback needs distinct target, approval, bound and no-data-loss proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ rollback, reasons })) };
}
