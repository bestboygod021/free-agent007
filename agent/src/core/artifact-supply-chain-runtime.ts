/** M130 contracts for artifact admission, SBOM/attestation, secret leases and egress. */

export type M130Runtime = "sandbox" | "microvm" | "builtin";
export type M130SourceTrust = "local" | "ci" | "signed_registry" | "untrusted";

export interface M130ArtifactManifest {
  organizationId: string;
  artifactId: string;
  version: string;
  packageDigest: string;
  signatureHash: string;
  sbomHash: string;
  attestationHash: string;
  provenanceHash: string;
  license: string;
  runtime: M130Runtime;
  capabilities: string[];
  sourceTrust: M130SourceTrust;
  sandboxed: boolean;
}

export interface M130SupplyChainPolicy {
  organizationId: string;
  allowedLicenses: readonly string[];
  deniedCapabilities: readonly string[];
  requireSignature: boolean;
  requireSbom: boolean;
  requireAttestation: boolean;
  allowedSourceTrust: readonly M130SourceTrust[];
  reviewed: boolean;
}

export interface M130SecretLease {
  organizationId: string;
  leaseId: string;
  reference: string;
  scopeHash: string;
  issuedAt: number;
  expiresAt: number;
  sandboxed: boolean;
  revoked: boolean;
  oneShot: boolean;
}

export interface M130EgressInspection {
  organizationId: string;
  artifactId: string;
  destinationDomain: string;
  contentHash: string;
  allowlisted: boolean;
  dlpPassed: boolean;
  outputRedacted: boolean;
  approvalPresent: boolean;
  userConsent: boolean;
}

export interface M130SupplyChainDecision {
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

export function validateM130Artifact(manifest: M130ArtifactManifest, policy: M130SupplyChainPolicy): M130SupplyChainDecision {
  const reasons: string[] = [];
  required([[manifest.organizationId, "organizationId"], [manifest.artifactId, "artifactId"], [manifest.version, "version"], [manifest.packageDigest, "packageDigest"], [manifest.provenanceHash, "provenanceHash"]], reasons);
  if (manifest.organizationId !== policy.organizationId) reasons.push("artifact and policy organizations do not match");
  if (policy.requireSignature && !manifest.signatureHash.trim()) reasons.push("artifact signature is required");
  if (policy.requireSbom && !manifest.sbomHash.trim()) reasons.push("SBOM hash is required");
  if (policy.requireAttestation && !manifest.attestationHash.trim()) reasons.push("artifact attestation is required");
  if (!policy.allowedLicenses.includes(manifest.license)) reasons.push("artifact license is not allowed");
  if (!policy.allowedSourceTrust.includes(manifest.sourceTrust) || manifest.sourceTrust === "untrusted") reasons.push("artifact source trust is not allowed");
  for (const capability of manifest.capabilities) if (policy.deniedCapabilities.includes(capability)) reasons.push(`denied capability: ${capability}`);
  if (manifest.runtime !== "builtin" && !manifest.sandboxed) reasons.push("non-builtin artifact must be sandboxed");
  if (!policy.reviewed) reasons.push("supply-chain policy needs review");
  return { allowed: reasons.length === 0, reasons, requiresApproval: manifest.sourceTrust === "signed_registry", auditHash: hash(JSON.stringify({ manifest, policy: policy.organizationId, reasons })) };
}

export function decideM130Admission(manifest: M130ArtifactManifest, policy: M130SupplyChainPolicy): M130SupplyChainDecision {
  const decision = validateM130Artifact(manifest, policy);
  const reasons = [...decision.reasons];
  if (manifest.runtime === "builtin" && manifest.sourceTrust === "untrusted") reasons.push("untrusted artifact cannot use builtin runtime");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ manifest, reasons })) };
}

export function validateM130SecretLease(lease: M130SecretLease, now: number): M130SupplyChainDecision {
  const reasons: string[] = [];
  required([[lease.organizationId, "organizationId"], [lease.leaseId, "leaseId"], [lease.reference, "reference"], [lease.scopeHash, "scopeHash"]], reasons);
  if (!Number.isFinite(lease.issuedAt) || !Number.isFinite(lease.expiresAt) || lease.expiresAt <= lease.issuedAt || lease.expiresAt <= now) reasons.push("secret lease must be valid and unexpired");
  if (lease.revoked) reasons.push("secret lease is revoked");
  if (!lease.sandboxed) reasons.push("secret lease must be sandbox-bound");
  if (/password|secret|token|api[_-]?key/i.test(lease.reference)) reasons.push("secret lease reference must be opaque");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ lease, reasons })) };
}

export function decideM130Egress(inspection: M130EgressInspection): M130SupplyChainDecision {
  const reasons: string[] = [];
  required([[inspection.organizationId, "organizationId"], [inspection.artifactId, "artifactId"], [inspection.destinationDomain, "destinationDomain"], [inspection.contentHash, "contentHash"]], reasons);
  if (!inspection.allowlisted || !inspection.dlpPassed || !inspection.outputRedacted) reasons.push("egress needs allowlist, DLP and redaction evidence");
  if (!inspection.userConsent) reasons.push("external egress needs user consent");
  if (!inspection.approvalPresent) reasons.push("external egress needs approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ inspection, reasons })) };
}
