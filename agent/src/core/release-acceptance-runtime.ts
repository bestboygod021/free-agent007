/** M148 contracts for E2E acceptance, release gates, readiness and go/no-go. */

export type M148GateStatus = "pass" | "fail" | "waived";
export type M148BlockerSeverity = "none" | "high" | "critical";

export interface M148AcceptancePlan {
  organizationId: string;
  releaseId: string;
  version: string;
  scope: string;
  testMatrixHash: string;
  securityEvidenceHash: string;
  accessibilityEvidenceHash: string;
  e2eEvidenceHash: string;
  rollbackEvidenceHash: string;
  approvalPresent: boolean;
  localFallback: boolean;
  tenantMigrationReady: boolean;
}

export interface M148GateResult {
  organizationId: string;
  releaseId: string;
  gateId: string;
  name: string;
  status: M148GateStatus;
  evidenceHash: string;
  blocking: boolean;
  severity: M148BlockerSeverity;
  ownerReference: string;
  deterministic: boolean;
}

export interface M148GoNoGoDecision {
  organizationId: string;
  releaseId: string;
  canaryPercent: number;
  openBlockers: number;
  errorBudgetAvailable: boolean;
  rollbackReady: boolean;
  approvalPresent: boolean;
  tenantMigrationReady: boolean;
  supportRunbookReady: boolean;
  localFallback: boolean;
}

export interface M148ReadinessReview {
  organizationId: string;
  releaseId: string;
  reviewerReference: string;
  checksHash: string;
  observedAt: number;
  independentReview: boolean;
  productionEvidence: boolean;
  exceptionsExpired: boolean;
  rollbackReference: string;
}

export interface M148ReleaseDecision {
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

export function validateM148AcceptancePlan(plan: M148AcceptancePlan): M148ReleaseDecision {
  const reasons: string[] = [];
  required([[plan.organizationId, "organizationId"], [plan.releaseId, "releaseId"], [plan.version, "version"], [plan.scope, "scope"], [plan.testMatrixHash, "testMatrixHash"], [plan.securityEvidenceHash, "securityEvidenceHash"], [plan.accessibilityEvidenceHash, "accessibilityEvidenceHash"], [plan.e2eEvidenceHash, "e2eEvidenceHash"], [plan.rollbackEvidenceHash, "rollbackEvidenceHash"]], reasons);
  if (!plan.approvalPresent || !plan.localFallback || !plan.tenantMigrationReady) reasons.push("acceptance plan needs approval, local fallback and tenant migration readiness");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ plan, reasons })) };
}

export function validateM148GateResult(gate: M148GateResult): M148ReleaseDecision {
  const reasons: string[] = [];
  required([[gate.organizationId, "organizationId"], [gate.releaseId, "releaseId"], [gate.gateId, "gateId"], [gate.name, "name"], [gate.evidenceHash, "evidenceHash"], [gate.ownerReference, "ownerReference"]], reasons);
  if (!gate.deterministic) reasons.push("release gate must be deterministic");
  if (gate.status === "pass" && gate.blocking) reasons.push("passing gate cannot remain blocking");
  if (gate.status === "waived" && (gate.severity === "critical" || !gate.blocking)) reasons.push("only an explicit non-critical blocker can be waived");
  return { allowed: reasons.length === 0, reasons, requiresApproval: gate.status === "waived", auditHash: hash(JSON.stringify({ gate, reasons })) };
}

export function decideM148GoNoGo(decision: M148GoNoGoDecision): M148ReleaseDecision {
  const reasons: string[] = [];
  required([[decision.organizationId, "organizationId"], [decision.releaseId, "releaseId"]], reasons);
  if (!Number.isFinite(decision.canaryPercent) || decision.canaryPercent < 0 || decision.canaryPercent > 100) reasons.push("canary percent must be between zero and one hundred");
  if (decision.openBlockers > 0 || !decision.errorBudgetAvailable || !decision.rollbackReady || !decision.approvalPresent || !decision.tenantMigrationReady || !decision.supportRunbookReady || !decision.localFallback) reasons.push("release readiness gates are not closed");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ decision, reasons })) };
}

export function validateM148ReadinessReview(review: M148ReadinessReview): M148ReleaseDecision {
  const reasons: string[] = [];
  required([[review.organizationId, "organizationId"], [review.releaseId, "releaseId"], [review.reviewerReference, "reviewerReference"], [review.checksHash, "checksHash"], [review.rollbackReference, "rollbackReference"]], reasons);
  if (!Number.isFinite(review.observedAt) || !review.independentReview || !review.productionEvidence || !review.exceptionsExpired) reasons.push("readiness review needs independent production evidence and closed exceptions");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ review, reasons })) };
}
