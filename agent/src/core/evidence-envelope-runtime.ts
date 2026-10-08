/** M194 fail-closed contracts for runtime evidence envelopes and claim verification. */

export interface M194EvidenceEnvelope {
  organizationId: string;
  evidenceId: string;
  claimId: string;
  claimType: string;
  runId: string;
  inputHash: string;
  outputHash: string;
  traceHash: string;
  testEvidenceHash: string;
  policyHash: string;
  createdAt: number;
  expiresAt: number;
  signerId: string;
  redacted: boolean;
  tenantBound: boolean;
}

export interface M194ClaimVerification {
  organizationId: string;
  claimId: string;
  claimType: string;
  requiredEvidenceIds: string[];
  suppliedEvidenceIds: string[];
  contradictionHashes: string[];
  freshnessAt: number;
  signerVerified: boolean;
  policySatisfied: boolean;
  tenantMatch: boolean;
}

export interface M194ReplayProof {
  organizationId: string;
  claimId: string;
  replayId: string;
  inputHash: string;
  expectedOutputHash: string;
  replayedOutputHash: string;
  traceHash: string;
  outputMatches: boolean;
  deterministic: boolean;
  sandboxed: boolean;
  tenantMatch: boolean;
}

export interface M194Disclosure {
  organizationId: string;
  disclosureId: string;
  claimHash: string;
  evidenceHash: string;
  userVisible: boolean;
  noFalseGuarantee: boolean;
  redacted: boolean;
  approved: boolean;
  tenantMatch: boolean;
}

export interface M194EvidenceDecision {
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

export function validateM194Envelope(envelope: M194EvidenceEnvelope, now: number): M194EvidenceDecision {
  const reasons: string[] = [];
  required([[envelope.organizationId, "organizationId"], [envelope.evidenceId, "evidenceId"], [envelope.claimId, "claimId"], [envelope.claimType, "claimType"], [envelope.runId, "runId"], [envelope.inputHash, "inputHash"], [envelope.outputHash, "outputHash"], [envelope.traceHash, "traceHash"], [envelope.testEvidenceHash, "testEvidenceHash"], [envelope.policyHash, "policyHash"], [envelope.signerId, "signerId"]], reasons);
  if (!Number.isFinite(envelope.createdAt) || !Number.isFinite(envelope.expiresAt) || envelope.expiresAt <= envelope.createdAt || envelope.expiresAt <= now || !envelope.redacted || !envelope.tenantBound) reasons.push("evidence envelope needs bounded freshness, redaction and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ envelope, now, reasons })) };
}

export function decideM194Claim(verification: M194ClaimVerification, now: number): M194EvidenceDecision {
  const reasons: string[] = [];
  required([[verification.organizationId, "organizationId"], [verification.claimId, "claimId"], [verification.claimType, "claimType"]], reasons);
  if (verification.requiredEvidenceIds.length === 0 || verification.requiredEvidenceIds.some((id) => !id.trim()) || verification.suppliedEvidenceIds.length < verification.requiredEvidenceIds.length || verification.requiredEvidenceIds.some((id) => !verification.suppliedEvidenceIds.includes(id)) || verification.contradictionHashes.length > 0 || !Number.isFinite(verification.freshnessAt) || verification.freshnessAt <= now || !verification.signerVerified || !verification.policySatisfied || !verification.tenantMatch) reasons.push("claim evidence is incomplete, stale, contradictory or unverified");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ verification, now, reasons })) };
}

export function validateM194Replay(proof: M194ReplayProof): M194EvidenceDecision {
  const reasons: string[] = [];
  required([[proof.organizationId, "organizationId"], [proof.claimId, "claimId"], [proof.replayId, "replayId"], [proof.inputHash, "inputHash"], [proof.expectedOutputHash, "expectedOutputHash"], [proof.replayedOutputHash, "replayedOutputHash"], [proof.traceHash, "traceHash"]], reasons);
  if (!proof.outputMatches || proof.expectedOutputHash !== proof.replayedOutputHash || !proof.deterministic || !proof.sandboxed || !proof.tenantMatch) reasons.push("replay output, determinism, sandbox or tenant proof failed");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ proof, reasons })) };
}

export function decideM194Disclosure(disclosure: M194Disclosure): M194EvidenceDecision {
  const reasons: string[] = [];
  required([[disclosure.organizationId, "organizationId"], [disclosure.disclosureId, "disclosureId"], [disclosure.claimHash, "claimHash"], [disclosure.evidenceHash, "evidenceHash"]], reasons);
  if (!disclosure.userVisible || !disclosure.noFalseGuarantee || !disclosure.redacted || !disclosure.approved || !disclosure.tenantMatch) reasons.push("claim disclosure needs visibility, honest language, redaction and approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ disclosure, reasons })) };
}
