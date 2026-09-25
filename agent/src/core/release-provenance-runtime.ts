/** M189 fail-closed contracts for release provenance and promotion evidence. */

export type M189ReleaseStage = "build" | "canary" | "production" | "rolled_back";

export interface M189ReleaseManifest {
  organizationId: string;
  releaseId: string;
  artifactDigest: string;
  sourceCommit: string;
  buildRecipeHash: string;
  sbomHash: string;
  attestationHash: string;
  signerId: string;
  target: string;
  approved: boolean;
  reproducible: boolean;
  secretsScanPassed: boolean;
  testsPassed: boolean;
  tenantBound: boolean;
}

export interface M189Promotion {
  organizationId: string;
  releaseId: string;
  promotionId: string;
  fromStage: M189ReleaseStage;
  toStage: M189ReleaseStage;
  artifactDigest: string;
  smokeEvidenceHash: string;
  policyHash: string;
  rollbackDigest: string;
  approvalPresent: boolean;
  canaryPercent: number;
  bounded: boolean;
  tenantMatch: boolean;
}

export interface M189Attestation {
  organizationId: string;
  attestationId: string;
  subjectDigest: string;
  predicateType: string;
  issuer: string;
  issuedAt: number;
  expiresAt: number;
  signatureVerified: boolean;
  trustedBuilder: boolean;
  sourceMatch: boolean;
  sbomMatch: boolean;
  tenantMatch: boolean;
}

export interface M189Rollback {
  organizationId: string;
  rollbackId: string;
  releaseId: string;
  failedDigest: string;
  rollbackDigest: string;
  reasonHash: string;
  healthEvidenceHash: string;
  approvalPresent: boolean;
  bounded: boolean;
  noForwardMutation: boolean;
  tenantMatch: boolean;
}

export interface M189ReleaseDecision {
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

export function validateM189Manifest(manifest: M189ReleaseManifest): M189ReleaseDecision {
  const reasons: string[] = [];
  required([[manifest.organizationId, "organizationId"], [manifest.releaseId, "releaseId"], [manifest.artifactDigest, "artifactDigest"], [manifest.sourceCommit, "sourceCommit"], [manifest.buildRecipeHash, "buildRecipeHash"], [manifest.sbomHash, "sbomHash"], [manifest.attestationHash, "attestationHash"], [manifest.signerId, "signerId"], [manifest.target, "target"]], reasons);
  if (!manifest.approved || !manifest.reproducible || !manifest.secretsScanPassed || !manifest.testsPassed || !manifest.tenantBound) reasons.push("release manifest needs approval, reproducibility, security, test and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ manifest, reasons })) };
}

export function decideM189Promotion(promotion: M189Promotion): M189ReleaseDecision {
  const reasons: string[] = [];
  required([[promotion.organizationId, "organizationId"], [promotion.releaseId, "releaseId"], [promotion.promotionId, "promotionId"], [promotion.artifactDigest, "artifactDigest"], [promotion.smokeEvidenceHash, "smokeEvidenceHash"], [promotion.policyHash, "policyHash"], [promotion.rollbackDigest, "rollbackDigest"]], reasons);
  if (promotion.fromStage === promotion.toStage || promotion.toStage === "build" || !Number.isFinite(promotion.canaryPercent) || promotion.canaryPercent < 0 || promotion.canaryPercent > 100 || !promotion.approvalPresent || !promotion.bounded || !promotion.tenantMatch) reasons.push("promotion stage, canary bound, approval or tenant proof failed");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ promotion, reasons })) };
}

export function validateM189Attestation(attestation: M189Attestation, now: number): M189ReleaseDecision {
  const reasons: string[] = [];
  required([[attestation.organizationId, "organizationId"], [attestation.attestationId, "attestationId"], [attestation.subjectDigest, "subjectDigest"], [attestation.predicateType, "predicateType"], [attestation.issuer, "issuer"]], reasons);
  if (!Number.isFinite(attestation.issuedAt) || !Number.isFinite(attestation.expiresAt) || attestation.expiresAt <= attestation.issuedAt || attestation.expiresAt <= now || !attestation.signatureVerified || !attestation.trustedBuilder || !attestation.sourceMatch || !attestation.sbomMatch || !attestation.tenantMatch) reasons.push("attestation signature, builder, source, SBOM or expiry proof failed");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ attestation, now, reasons })) };
}

export function decideM189Rollback(rollback: M189Rollback): M189ReleaseDecision {
  const reasons: string[] = [];
  required([[rollback.organizationId, "organizationId"], [rollback.rollbackId, "rollbackId"], [rollback.releaseId, "releaseId"], [rollback.failedDigest, "failedDigest"], [rollback.rollbackDigest, "rollbackDigest"], [rollback.reasonHash, "reasonHash"], [rollback.healthEvidenceHash, "healthEvidenceHash"]], reasons);
  if (rollback.failedDigest === rollback.rollbackDigest || !rollback.approvalPresent || !rollback.bounded || !rollback.noForwardMutation || !rollback.tenantMatch) reasons.push("rollback needs a distinct target, approval, bound and no-forward-mutation proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ rollback, reasons })) };
}
