/** M178 fail-closed contracts for deployment adapters and release-target boundaries. */

export type M178TargetEnvironment = "local" | "preview" | "staging" | "production";
export type M178DeploymentState = "planned" | "approved" | "executing" | "succeeded" | "failed" | "rolled_back";

export interface M178DeploymentPlan {
  organizationId: string;
  deploymentId: string;
  artifactDigest: string;
  releaseManifestHash: string;
  adapterId: string;
  targetEnvironment: M178TargetEnvironment;
  targetReference: string;
  state: M178DeploymentState;
  approvalPresent: boolean;
  protectedTarget: boolean;
  noMainMutation: boolean;
  rollbackDigest: string;
  smokeEvidenceHash: string;
  tenantBound: boolean;
  sandboxVerified: boolean;
}

export interface M178AdapterRequest {
  organizationId: string;
  deploymentId: string;
  adapterId: string;
  targetEnvironment: M178TargetEnvironment;
  artifactDigest: string;
  idempotencyKey: string;
  preflightHash: string;
  egressPolicyHash: string;
  timeoutMs: number;
  redacted: boolean;
  tenantMatch: boolean;
}

export interface M178AdapterResult {
  organizationId: string;
  deploymentId: string;
  adapterId: string;
  state: "succeeded" | "failed";
  deployedDigest: string;
  evidenceHash: string;
  smokePassed: boolean;
  targetMatched: boolean;
  rollbackAvailable: boolean;
  tenantMatch: boolean;
}

export interface M178Rollback {
  organizationId: string;
  deploymentId: string;
  rollbackId: string;
  targetEnvironment: M178TargetEnvironment;
  fromDigest: string;
  toDigest: string;
  reasonHash: string;
  approvalPresent: boolean;
  bounded: boolean;
  evidenceHash: string;
  operatorReference: string;
}

export interface M178DeploymentDecision {
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

export function validateM178Plan(plan: M178DeploymentPlan): M178DeploymentDecision {
  const reasons: string[] = [];
  required([[plan.organizationId, "organizationId"], [plan.deploymentId, "deploymentId"], [plan.artifactDigest, "artifactDigest"], [plan.releaseManifestHash, "releaseManifestHash"], [plan.adapterId, "adapterId"], [plan.targetReference, "targetReference"], [plan.rollbackDigest, "rollbackDigest"], [plan.smokeEvidenceHash, "smokeEvidenceHash"]], reasons);
  if (plan.targetEnvironment === "production" && !plan.approvalPresent) reasons.push("production deployment needs approval");
  if (plan.protectedTarget || !plan.noMainMutation || !plan.tenantBound || !plan.sandboxVerified) reasons.push("protected target, main, tenant or sandbox gate failed");
  if (plan.state === "approved" && !plan.approvalPresent) reasons.push("approved state needs approval evidence");
  return { allowed: reasons.length === 0, reasons, requiresApproval: plan.targetEnvironment === "production", auditHash: hash(JSON.stringify({ plan, reasons })) };
}

export function decideM178AdapterRequest(request: M178AdapterRequest): M178DeploymentDecision {
  const reasons: string[] = [];
  required([[request.organizationId, "organizationId"], [request.deploymentId, "deploymentId"], [request.adapterId, "adapterId"], [request.artifactDigest, "artifactDigest"], [request.idempotencyKey, "idempotencyKey"], [request.preflightHash, "preflightHash"], [request.egressPolicyHash, "egressPolicyHash"]], reasons);
  if (!Number.isInteger(request.timeoutMs) || request.timeoutMs < 1 || request.timeoutMs > 900_000) reasons.push("adapter timeout is outside bound");
  if (!request.redacted || !request.tenantMatch) reasons.push("adapter request must be redacted and tenant-bound");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.targetEnvironment === "production", auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateM178AdapterResult(result: M178AdapterResult): M178DeploymentDecision {
  const reasons: string[] = [];
  required([[result.organizationId, "organizationId"], [result.deploymentId, "deploymentId"], [result.adapterId, "adapterId"], [result.deployedDigest, "deployedDigest"], [result.evidenceHash, "evidenceHash"]], reasons);
  if (result.state !== "succeeded" || !result.smokePassed || !result.targetMatched || !result.rollbackAvailable || !result.tenantMatch) reasons.push("deployment result lacks target, smoke, rollback or tenant evidence");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ result, reasons })) };
}

export function decideM178Rollback(rollback: M178Rollback): M178DeploymentDecision {
  const reasons: string[] = [];
  required([[rollback.organizationId, "organizationId"], [rollback.deploymentId, "deploymentId"], [rollback.rollbackId, "rollbackId"], [rollback.fromDigest, "fromDigest"], [rollback.toDigest, "toDigest"], [rollback.reasonHash, "reasonHash"], [rollback.evidenceHash, "evidenceHash"], [rollback.operatorReference, "operatorReference"]], reasons);
  if (rollback.fromDigest === rollback.toDigest || !rollback.approvalPresent || !rollback.bounded) reasons.push("rollback needs distinct digest, approval and bound");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ rollback, reasons })) };
}
