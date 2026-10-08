/** M205 fail-closed contracts for capability attestation and trust-bound activation. */

export interface M205Attestation {
  organizationId: string;
  attestationId: string;
  subjectHash: string;
  capability: string;
  artifactHash: string;
  issuerHash: string;
  signatureHash: string;
  environmentHash: string;
  policyHash: string;
  issuedAt: number;
  expiresAt: number;
  revocationChecked: boolean;
  tenantBound: boolean;
}

export interface M205Activation {
  organizationId: string;
  activationId: string;
  attestationId: string;
  capability: string;
  requestedScope: string[];
  approvedScope: string[];
  attestationValid: boolean;
  policyMatch: boolean;
  allowNetwork: boolean;
  secretFree: boolean;
  approvalPresent: boolean;
  tenantMatch: boolean;
}

export interface M205Revocation {
  organizationId: string;
  revocationId: string;
  attestationId: string;
  reasonHash: string;
  revokedAt: number;
  propagatedTargets: string[];
  blocked: boolean;
  noReactivation: boolean;
  tenantMatch: boolean;
}

export interface M205VerificationEvidence {
  organizationId: string;
  verificationId: string;
  attestationId: string;
  observedArtifactHash: string;
  observedEnvironmentHash: string;
  verifierHash: string;
  verifiedAt: number;
  signatureValid: boolean;
  artifactMatch: boolean;
  environmentMatch: boolean;
  noUnexpectedPermission: boolean;
  tenantMatch: boolean;
}

export interface M205TrustDecision {
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

export function validateM205Attestation(attestation: M205Attestation, now: number): M205TrustDecision {
  const reasons: string[] = [];
  required([[attestation.organizationId, "organizationId"], [attestation.attestationId, "attestationId"], [attestation.subjectHash, "subjectHash"], [attestation.capability, "capability"], [attestation.artifactHash, "artifactHash"], [attestation.issuerHash, "issuerHash"], [attestation.signatureHash, "signatureHash"], [attestation.environmentHash, "environmentHash"], [attestation.policyHash, "policyHash"]], reasons);
  if (!Number.isFinite(attestation.issuedAt) || !Number.isFinite(attestation.expiresAt) || attestation.expiresAt <= now || attestation.expiresAt <= attestation.issuedAt || !attestation.revocationChecked || !attestation.tenantBound) reasons.push("attestation needs bounded validity, revocation check and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ attestation, now, reasons })) };
}

export function decideM205Activation(activation: M205Activation): M205TrustDecision {
  const reasons: string[] = [];
  required([[activation.organizationId, "organizationId"], [activation.activationId, "activationId"], [activation.attestationId, "attestationId"], [activation.capability, "capability"]], reasons);
  if (activation.requestedScope.length === 0 || activation.requestedScope.some((item) => !item.trim()) || activation.approvedScope.length === 0 || activation.approvedScope.some((item) => !item.trim()) || activation.requestedScope.some((item) => !activation.approvedScope.includes(item)) || !activation.attestationValid || !activation.policyMatch || activation.allowNetwork || !activation.secretFree || !activation.approvalPresent || !activation.tenantMatch) reasons.push("activation needs bounded approved scope, valid attestation, policy match, secret-free default, approval and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ activation, reasons })) };
}

export function decideM205Revocation(revocation: M205Revocation): M205TrustDecision {
  const reasons: string[] = [];
  required([[revocation.organizationId, "organizationId"], [revocation.revocationId, "revocationId"], [revocation.attestationId, "attestationId"], [revocation.reasonHash, "reasonHash"]], reasons);
  if (!Number.isFinite(revocation.revokedAt) || revocation.propagatedTargets.length === 0 || revocation.propagatedTargets.some((target) => !target.trim()) || !revocation.blocked || !revocation.noReactivation || !revocation.tenantMatch) reasons.push("revocation needs propagation, immediate block, no reactivation and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ revocation, reasons })) };
}

export function validateM205Verification(evidence: M205VerificationEvidence): M205TrustDecision {
  const reasons: string[] = [];
  required([[evidence.organizationId, "organizationId"], [evidence.verificationId, "verificationId"], [evidence.attestationId, "attestationId"], [evidence.observedArtifactHash, "observedArtifactHash"], [evidence.observedEnvironmentHash, "observedEnvironmentHash"], [evidence.verifierHash, "verifierHash"]], reasons);
  if (!Number.isFinite(evidence.verifiedAt) || !evidence.signatureValid || !evidence.artifactMatch || !evidence.environmentMatch || !evidence.noUnexpectedPermission || !evidence.tenantMatch) reasons.push("verification needs signature, artifact, environment and permission proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
