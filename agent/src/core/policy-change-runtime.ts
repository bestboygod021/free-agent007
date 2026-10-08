/** M208 fail-closed contracts for governed policy change, canary promotion and rollback. */

export type M208Risk = "low" | "medium" | "high" | "critical";

export interface M208PolicyChange {
  organizationId: string;
  changeId: string;
  policyId: string;
  currentPolicyHash: string;
  proposedPolicyHash: string;
  diffHash: string;
  reasonHash: string;
  testsHash: string;
  rollbackPlanHash: string;
  requestedByHash: string;
  risk: M208Risk;
  separationOfDuties: boolean;
  tenantBound: boolean;
}

export interface M208PromotionDecision {
  organizationId: string;
  promotionId: string;
  changeId: string;
  policyHash: string;
  canaryScope: string[];
  evidenceHash: string;
  approverHash: string;
  signatureHash: string;
  testsPassed: boolean;
  approvalPresent: boolean;
  canaryPassed: boolean;
  expiryAt: number;
  tenantMatch: boolean;
}

export interface M208RollbackDecision {
  organizationId: string;
  rollbackId: string;
  policyId: string;
  activePolicyHash: string;
  targetPolicyHash: string;
  reasonHash: string;
  evidenceHash: string;
  approvalPresent: boolean;
  propagationConfirmed: boolean;
  blockedUntilReview: boolean;
  tenantMatch: boolean;
}

export interface M208RollbackEvidence {
  organizationId: string;
  evidenceId: string;
  policyId: string;
  expectedPolicyHash: string;
  observedPolicyHash: string;
  targets: string[];
  observedAt: number;
  noDrift: boolean;
  noStaleTarget: boolean;
  tenantMatch: boolean;
}

export interface M208PolicyDecision {
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

export function validateM208Change(change: M208PolicyChange): M208PolicyDecision {
  const reasons: string[] = [];
  required([[change.organizationId, "organizationId"], [change.changeId, "changeId"], [change.policyId, "policyId"], [change.currentPolicyHash, "currentPolicyHash"], [change.proposedPolicyHash, "proposedPolicyHash"], [change.diffHash, "diffHash"], [change.reasonHash, "reasonHash"], [change.testsHash, "testsHash"], [change.rollbackPlanHash, "rollbackPlanHash"], [change.requestedByHash, "requestedByHash"]], reasons);
  if (change.currentPolicyHash === change.proposedPolicyHash || !change.separationOfDuties || !change.tenantBound || change.risk === "critical" && !change.rollbackPlanHash) reasons.push("policy change needs an actual diff, separation of duties, rollback plan and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ change, reasons })) };
}

export function decideM208Promotion(promotion: M208PromotionDecision, now: number): M208PolicyDecision {
  const reasons: string[] = [];
  required([[promotion.organizationId, "organizationId"], [promotion.promotionId, "promotionId"], [promotion.changeId, "changeId"], [promotion.policyHash, "policyHash"], [promotion.evidenceHash, "evidenceHash"], [promotion.approverHash, "approverHash"], [promotion.signatureHash, "signatureHash"]], reasons);
  if (promotion.canaryScope.length === 0 || promotion.canaryScope.some((target) => !target.trim()) || !promotion.testsPassed || !promotion.approvalPresent || !promotion.canaryPassed || !Number.isFinite(promotion.expiryAt) || promotion.expiryAt <= now || !promotion.tenantMatch) reasons.push("promotion needs bounded canary, tests, signed approval, live expiry and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ promotion, now, reasons })) };
}

export function decideM208Rollback(rollback: M208RollbackDecision): M208PolicyDecision {
  const reasons: string[] = [];
  required([[rollback.organizationId, "organizationId"], [rollback.rollbackId, "rollbackId"], [rollback.policyId, "policyId"], [rollback.activePolicyHash, "activePolicyHash"], [rollback.targetPolicyHash, "targetPolicyHash"], [rollback.reasonHash, "reasonHash"], [rollback.evidenceHash, "evidenceHash"]], reasons);
  if (rollback.activePolicyHash === rollback.targetPolicyHash || !rollback.approvalPresent || !rollback.propagationConfirmed || !rollback.blockedUntilReview || !rollback.tenantMatch) reasons.push("rollback needs a distinct target, approval, propagation evidence and review block");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ rollback, reasons })) };
}

export function validateM208RollbackEvidence(evidence: M208RollbackEvidence): M208PolicyDecision {
  const reasons: string[] = [];
  required([[evidence.organizationId, "organizationId"], [evidence.evidenceId, "evidenceId"], [evidence.policyId, "policyId"], [evidence.expectedPolicyHash, "expectedPolicyHash"], [evidence.observedPolicyHash, "observedPolicyHash"]], reasons);
  if (evidence.targets.length === 0 || evidence.targets.some((target) => !target.trim()) || !Number.isFinite(evidence.observedAt) || !evidence.noDrift || !evidence.noStaleTarget || !evidence.tenantMatch) reasons.push("rollback evidence needs target coverage, observation time, no drift and no stale target");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
