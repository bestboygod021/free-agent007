/** M142 contracts for artifact lifecycle, preview isolation, delivery and cleanup. */

export type M142Delivery = "signed_url" | "local_mount" | "inline_redacted";
export type M142MediaType = "text" | "image" | "archive" | "binary";

export interface M142ArtifactRecord {
  organizationId: string;
  artifactId: string;
  runId: string;
  digest: string;
  mediaType: M142MediaType;
  sizeBytes: number;
  createdAt: number;
  expiresAt: number;
  retentionDays: number;
  encrypted: boolean;
  signed: boolean;
  tenantBound: boolean;
  rawSecretsScanned: boolean;
}

export interface M142PreviewRequest {
  organizationId: string;
  artifactId: string;
  previewId: string;
  allowedPath: string;
  origin: string;
  requestedAt: number;
  expiresAt: number;
  tenantMatch: boolean;
  readOnly: boolean;
  authzVerified: boolean;
  sandboxed: boolean;
}

export interface M142ArtifactDelivery {
  organizationId: string;
  artifactId: string;
  deliveryId: string;
  method: M142Delivery;
  contentHash: string;
  redacted: boolean;
  oneTime: boolean;
  issuedAt: number;
  expiresAt: number;
  originBound: boolean;
}

export interface M142CleanupEvidence {
  organizationId: string;
  artifactId: string;
  deleteAfter: number;
  deletedAt: number;
  verificationHash: string;
  storageTargets: string[];
  storageTargetsCleared: boolean;
  signedUrlsRevoked: boolean;
  tenantBound: boolean;
}

export interface M142ArtifactDecision {
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

export function validateM142Artifact(record: M142ArtifactRecord, now: number): M142ArtifactDecision {
  const reasons: string[] = [];
  required([[record.organizationId, "organizationId"], [record.artifactId, "artifactId"], [record.runId, "runId"], [record.digest, "digest"]], reasons);
  if (!Number.isInteger(record.sizeBytes) || record.sizeBytes < 0 || record.sizeBytes > 1_000_000_000) reasons.push("artifact size is outside the bounded limit");
  if (!Number.isFinite(record.createdAt) || !Number.isFinite(record.expiresAt) || record.expiresAt <= record.createdAt || record.expiresAt <= now) reasons.push("artifact lifetime is invalid");
  if (!Number.isInteger(record.retentionDays) || record.retentionDays < 1 || record.retentionDays > 3650) reasons.push("retention days must be between one and 3650");
  if (!record.encrypted || !record.signed || !record.tenantBound || !record.rawSecretsScanned) reasons.push("artifact needs encryption, signature, tenant and secret-scan evidence");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ record, now, reasons })) };
}

export function decideM142Preview(request: M142PreviewRequest, now: number): M142ArtifactDecision {
  const reasons: string[] = [];
  required([[request.organizationId, "organizationId"], [request.artifactId, "artifactId"], [request.previewId, "previewId"], [request.allowedPath, "allowedPath"], [request.origin, "origin"]], reasons);
  if (request.allowedPath.includes("..") || request.allowedPath.startsWith("/")) reasons.push("preview path must stay within the allowed root");
  if (!Number.isFinite(request.requestedAt) || !Number.isFinite(request.expiresAt) || request.expiresAt <= request.requestedAt || request.expiresAt <= now) reasons.push("preview lifetime is invalid");
  if (!request.tenantMatch || !request.readOnly || !request.authzVerified || !request.sandboxed) reasons.push("preview needs tenant, read-only, authz and sandbox evidence");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ request, now, reasons })) };
}

export function validateM142Delivery(delivery: M142ArtifactDelivery, now: number): M142ArtifactDecision {
  const reasons: string[] = [];
  required([[delivery.organizationId, "organizationId"], [delivery.artifactId, "artifactId"], [delivery.deliveryId, "deliveryId"], [delivery.contentHash, "contentHash"]], reasons);
  if (!Number.isFinite(delivery.issuedAt) || !Number.isFinite(delivery.expiresAt) || delivery.expiresAt <= delivery.issuedAt || delivery.expiresAt <= now) reasons.push("delivery lifetime is invalid");
  if (!delivery.redacted || !delivery.oneTime || !delivery.originBound) reasons.push("delivery needs redaction, one-time use and origin binding");
  if (delivery.method === "inline_redacted" && !delivery.redacted) reasons.push("inline delivery must be redacted");
  return { allowed: reasons.length === 0, reasons, requiresApproval: delivery.method === "signed_url", auditHash: hash(JSON.stringify({ delivery, now, reasons })) };
}

export function validateM142Cleanup(evidence: M142CleanupEvidence): M142ArtifactDecision {
  const reasons: string[] = [];
  required([[evidence.organizationId, "organizationId"], [evidence.artifactId, "artifactId"], [evidence.verificationHash, "verificationHash"]], reasons);
  if (evidence.storageTargets.length === 0) reasons.push("cleanup needs storage target evidence");
  if (!Number.isFinite(evidence.deleteAfter) || !Number.isFinite(evidence.deletedAt) || evidence.deletedAt < evidence.deleteAfter) reasons.push("cleanup timestamps are invalid");
  if (!evidence.storageTargetsCleared || !evidence.signedUrlsRevoked || !evidence.tenantBound) reasons.push("cleanup needs target clearing, URL revocation and tenant evidence");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
