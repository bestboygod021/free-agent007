/** M95 contracts for dependency provenance, artifact attestation, secret leases and injection guards. */

export type SupplyChainDependencyKind = "runtime" | "dev" | "container" | "model" | "plugin";
export type SupplyChainArtifactKind = "source" | "package" | "container" | "model" | "sbom";
export type SupplyChainInjectionSurface = "prompt" | "dependency" | "artifact" | "tool_output";

export interface SupplyChainDependencyRecord {
  organizationId: string;
  dependencyId: string;
  name: string;
  version: string;
  kind: SupplyChainDependencyKind;
  sourceUrl: string;
  integrityHash: string;
  license: string;
  vulnerabilityScanPassed: boolean;
  licenseScanPassed: boolean;
  allowlisted: boolean;
}

export interface SupplyChainArtifactAttestation {
  organizationId: string;
  artifactId: string;
  kind: SupplyChainArtifactKind;
  digest: string;
  sbomHash: string;
  provenanceHash: string;
  signerReference: string;
  signatureVerified: boolean;
  buildReproducible: boolean;
  vulnerabilityScanPassed: boolean;
  approvalPresent: boolean;
}

export interface SupplyChainSecretLease {
  organizationId: string;
  leaseId: string;
  secretReference: string;
  scope: string;
  issuedAt: number;
  expiresAt: number;
  revoked: boolean;
  injectedIntoSandbox: boolean;
  zeroPersistence: boolean;
}

export interface SupplyChainInjectionGuard {
  organizationId: string;
  guardId: string;
  surface: SupplyChainInjectionSurface;
  inputHash: string;
  classifierVersion: string;
  injectionScore: number;
  blocked: boolean;
  canaryTriggered: boolean;
  humanReviewPresent: boolean;
}

export interface SupplyChainSecurityDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  auditHash: string;
}

export class SupplyChainSecurityContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupplyChainSecurityContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

export function validateSupplyChainDependency(dependency: SupplyChainDependencyRecord): SupplyChainSecurityDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[dependency.organizationId, "organizationId"], [dependency.dependencyId, "dependencyId"], [dependency.name, "name"], [dependency.version, "version"], [dependency.sourceUrl, "sourceUrl"], [dependency.integrityHash, "integrityHash"], [dependency.license, "license"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!dependency.sourceUrl.startsWith("https://") && !dependency.sourceUrl.startsWith("registry:")) reasons.push("dependency source must be HTTPS or reviewed registry reference");
  if (!dependency.vulnerabilityScanPassed || !dependency.licenseScanPassed || !dependency.allowlisted) reasons.push("dependency supply-chain checks are incomplete");
  return { allowed: reasons.length === 0, reasons, requiresApproval: dependency.kind === "runtime" || dependency.kind === "container", auditHash: hash(JSON.stringify({ dependency, reasons })) };
}

export function decideSupplyChainArtifact(attestation: SupplyChainArtifactAttestation): SupplyChainSecurityDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[attestation.organizationId, "organizationId"], [attestation.artifactId, "artifactId"], [attestation.digest, "digest"], [attestation.sbomHash, "sbomHash"], [attestation.provenanceHash, "provenanceHash"], [attestation.signerReference, "signerReference"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!attestation.signatureVerified || !attestation.vulnerabilityScanPassed || !attestation.buildReproducible) reasons.push("artifact attestation is incomplete");
  if (/password|secret|token|api[_-]?key/i.test(attestation.signerReference)) reasons.push("signer reference must be opaque");
  if (!attestation.approvalPresent) reasons.push("artifact activation requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ attestation, reasons })) };
}

export function validateSupplyChainSecretLease(lease: SupplyChainSecretLease, now: number): SupplyChainSecurityDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[lease.organizationId, "organizationId"], [lease.leaseId, "leaseId"], [lease.secretReference, "secretReference"], [lease.scope, "scope"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (/password|secret|token|api[_-]?key/i.test(lease.secretReference)) reasons.push("secret lease reference must be opaque");
  if (!Number.isFinite(lease.issuedAt) || !Number.isFinite(lease.expiresAt) || lease.expiresAt <= lease.issuedAt || lease.expiresAt <= now) reasons.push("secret lease is invalid or expired");
  if (lease.revoked || !lease.zeroPersistence) reasons.push("secret lease must be active and zero-persistence");
  if (lease.injectedIntoSandbox) reasons.push("secret lease cannot be injected into untrusted sandbox");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ lease, now, reasons })) };
}

export function decideSupplyChainInjectionGuard(guard: SupplyChainInjectionGuard): SupplyChainSecurityDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[guard.organizationId, "organizationId"], [guard.guardId, "guardId"], [guard.inputHash, "inputHash"], [guard.classifierVersion, "classifierVersion"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(guard.injectionScore) || guard.injectionScore < 0 || guard.injectionScore > 1) reasons.push("injection score is invalid");
  if (guard.injectionScore >= 0.8 && !guard.blocked) reasons.push("high injection score must be blocked");
  if (guard.canaryTriggered && !guard.humanReviewPresent) reasons.push("canary trigger needs human review");
  return { allowed: reasons.length === 0, reasons, requiresApproval: guard.surface !== "dependency", auditHash: hash(JSON.stringify({ guard, reasons })) };
}
