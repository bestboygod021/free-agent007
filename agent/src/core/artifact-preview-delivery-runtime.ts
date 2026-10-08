/** M106 contracts for artifact lifecycle, preview environments and signed delivery. */

export type ArtifactKind = "source" | "build" | "test" | "sbom" | "preview";
export type PreviewState = "planned" | "ready" | "expired" | "revoked";
export type ArtifactDeliveryMode = "download" | "preview" | "deploy";

export interface ArtifactLifecycleContract {
  organizationId: string;
  artifactId: string;
  kind: ArtifactKind;
  digest: string;
  sizeBytes: number;
  mediaType: string;
  sourceRunId: string;
  provenanceHash: string;
  signatureHash: string;
  retentionUntil: number;
  secretsScanned: boolean;
  tenantScoped: boolean;
  revoked: boolean;
}

export interface PreviewEnvironmentContract {
  organizationId: string;
  previewId: string;
  artifactDigest: string;
  state: PreviewState;
  hostname: string;
  tlsConfigured: boolean;
  tenantIsolationPassed: boolean;
  networkAllowlist: string[];
  expiresAt: number;
  portBound: boolean;
  cleanupEvidenceHash?: string;
}

export interface ArtifactDeliveryRequest {
  organizationId: string;
  artifactId: string;
  mode: ArtifactDeliveryMode;
  recipientHash: string;
  signedUrlHash: string;
  expiresAt: number;
  approvalPresent: boolean;
  downloadLimit: number;
  accessLogged: boolean;
  revoked: boolean;
}

export interface ArtifactRollbackEvidence {
  organizationId: string;
  deploymentId: string;
  previousDigest: string;
  failedDigest: string;
  reasonHash: string;
  backupAvailable: boolean;
  smokeTestPassed: boolean;
  rollbackExitCode: number;
  operatorHash: string;
}

export interface ArtifactDeliveryDecision {
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

export function validateM106Artifact(artifact: ArtifactLifecycleContract, now = Date.now()): ArtifactDeliveryDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[artifact.organizationId, "organizationId"], [artifact.artifactId, "artifactId"], [artifact.digest, "digest"], [artifact.mediaType, "mediaType"], [artifact.sourceRunId, "sourceRunId"], [artifact.provenanceHash, "provenanceHash"], [artifact.signatureHash, "signatureHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(artifact.sizeBytes) || artifact.sizeBytes < 0) reasons.push("artifact size is invalid");
  if (!Number.isFinite(artifact.retentionUntil) || artifact.retentionUntil <= now) reasons.push("artifact retention has expired");
  if (!artifact.secretsScanned || !artifact.tenantScoped) reasons.push("artifact needs secret scan and tenant scope evidence");
  if (artifact.revoked) reasons.push("artifact is revoked");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ artifact, reasons })) };
}

export function decideM106Preview(preview: PreviewEnvironmentContract, now = Date.now()): ArtifactDeliveryDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[preview.organizationId, "organizationId"], [preview.previewId, "previewId"], [preview.artifactDigest, "artifactDigest"], [preview.hostname, "hostname"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (preview.state !== "ready") reasons.push("preview is not ready");
  if (!preview.hostname.endsWith(".preview.local") && !preview.hostname.endsWith(".preview.example")) reasons.push("preview hostname is outside the preview namespace");
  if (!preview.tlsConfigured || !preview.tenantIsolationPassed || !preview.portBound) reasons.push("preview TLS, tenant and port evidence is incomplete");
  if (preview.networkAllowlist.length === 0) reasons.push("preview needs an explicit network allowlist");
  if (!Number.isFinite(preview.expiresAt) || preview.expiresAt <= now) reasons.push("preview has expired");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ preview, reasons })) };
}

export function decideM106Delivery(request: ArtifactDeliveryRequest, now = Date.now()): ArtifactDeliveryDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.artifactId, "artifactId"], [request.recipientHash, "recipientHash"], [request.signedUrlHash, "signedUrlHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(request.expiresAt) || request.expiresAt <= now) reasons.push("signed delivery URL has expired");
  if (!Number.isInteger(request.downloadLimit) || request.downloadLimit < 1) reasons.push("delivery download limit must be positive");
  if (!request.accessLogged || request.revoked) reasons.push("delivery must be logged and not revoked");
  if (request.mode === "deploy" && !request.approvalPresent) reasons.push("artifact deployment requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.mode === "deploy", auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateM106RollbackEvidence(evidence: ArtifactRollbackEvidence): ArtifactDeliveryDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.deploymentId, "deploymentId"], [evidence.previousDigest, "previousDigest"], [evidence.failedDigest, "failedDigest"], [evidence.reasonHash, "reasonHash"], [evidence.operatorHash, "operatorHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (evidence.previousDigest === evidence.failedDigest) reasons.push("rollback must target a different artifact");
  if (!evidence.backupAvailable || !evidence.smokeTestPassed || evidence.rollbackExitCode !== 0) reasons.push("rollback evidence is incomplete");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
