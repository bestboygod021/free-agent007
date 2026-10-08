/** M72 contracts for signed extensions, plugin permissions and marketplace review. */

export type ExtensionRuntime = "sandbox" | "wasm" | "container" | "remote";
export type ExtensionState = "submitted" | "reviewed" | "listed" | "installed" | "revoked";
export type ExtensionRisk = "low" | "medium" | "high";

export interface ExtensionManifest {
  organizationId: string;
  extensionId: string;
  version: string;
  displayName: string;
  runtime: ExtensionRuntime;
  entrypointHash: string;
  packageHash: string;
  requestedPermissions: string[];
  allowedDomains: string[];
  risk: ExtensionRisk;
  signerReference: string;
  sandboxed: boolean;
  source: "built_in" | "reviewed_upload" | "community";
}

export interface ExtensionReview {
  organizationId: string;
  extensionId: string;
  version: string;
  reviewerId: string;
  license: string;
  securityScanHash: string;
  dependencyScanHash: string;
  approved: boolean;
  reviewedAt: number;
}

export interface ExtensionInstallation {
  organizationId: string;
  userId: string;
  extensionId: string;
  version: string;
  grantedPermissions: string[];
  egressConsent: boolean;
  approvalPresent: boolean;
  state: ExtensionState;
}

export interface ExtensionSecurityEvidence {
  organizationId: string;
  extensionId: string;
  version: string;
  checksumVerified: boolean;
  signatureVerified: boolean;
  sandboxProbePassed: boolean;
  networkProbePassed: boolean;
  secretScanPassed: boolean;
  artifactHash: string;
}

export interface ExtensionMarketplaceDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  auditHash: string;
}

export class ExtensionMarketplaceContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtensionMarketplaceContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new ExtensionMarketplaceContractError(`${label} is required`);
}

export function validateExtensionManifest(manifest: ExtensionManifest): ExtensionMarketplaceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[manifest.organizationId, "organizationId"], [manifest.extensionId, "extensionId"], [manifest.version, "version"], [manifest.displayName, "displayName"], [manifest.entrypointHash, "entrypointHash"], [manifest.packageHash, "packageHash"], [manifest.signerReference, "signerReference"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (manifest.requestedPermissions.length === 0 || new Set(manifest.requestedPermissions).size !== manifest.requestedPermissions.length) reasons.push("extension permissions must be non-empty and unique");
  if (manifest.source !== "built_in" && !manifest.sandboxed) reasons.push("uploaded/community extension must be sandboxed");
  if (manifest.runtime === "remote" && manifest.allowedDomains.length === 0) reasons.push("remote extension needs allowed domains");
  if (/password|secret|token|api[_-]?key/i.test(manifest.signerReference)) reasons.push("signer reference must be opaque");
  if (manifest.risk === "high" && manifest.source === "community") reasons.push("high-risk community extension requires curated source");
  return { allowed: reasons.length === 0, reasons, requiresApproval: manifest.risk !== "low", auditHash: hash(JSON.stringify({ manifest, reasons })) };
}

export function decideExtensionReview(review: ExtensionReview, manifest: ExtensionManifest): ExtensionMarketplaceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[review.organizationId, "organizationId"], [review.extensionId, "extensionId"], [review.version, "version"], [review.reviewerId, "reviewerId"], [review.license, "license"], [review.securityScanHash, "securityScanHash"], [review.dependencyScanHash, "dependencyScanHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (review.organizationId !== manifest.organizationId) reasons.push("review crosses organization boundary");
  if (review.extensionId !== manifest.extensionId || review.version !== manifest.version) reasons.push("review does not match extension manifest");
  if (!review.approved) reasons.push("extension review is not approved");
  if (!Number.isFinite(review.reviewedAt)) reasons.push("reviewedAt must be finite");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ review, manifest, reasons })) };
}

export function decideExtensionInstallation(installation: ExtensionInstallation, manifest: ExtensionManifest, evidence: ExtensionSecurityEvidence): ExtensionMarketplaceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[installation.organizationId, "organizationId"], [installation.userId, "userId"], [installation.extensionId, "extensionId"], [installation.version, "version"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (installation.organizationId !== manifest.organizationId || evidence.organizationId !== manifest.organizationId) reasons.push("extension operation crosses organization boundary");
  if (installation.extensionId !== manifest.extensionId || installation.version !== manifest.version) reasons.push("installation target does not match manifest");
  if (installation.grantedPermissions.some((permission) => !manifest.requestedPermissions.includes(permission))) reasons.push("installation grants undeclared permission");
  if (installation.grantedPermissions.some((permission) => permission.startsWith("network:") && !installation.egressConsent)) reasons.push("network permission requires egress consent");
  if (!installation.approvalPresent) reasons.push("extension installation requires approval");
  if (!evidence.checksumVerified || !evidence.signatureVerified || !evidence.sandboxProbePassed || !evidence.secretScanPassed) reasons.push("extension security evidence is incomplete");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ installation, manifest, evidence, reasons })) };
}

export function validateExtensionSecurityEvidence(evidence: ExtensionSecurityEvidence): ExtensionMarketplaceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.extensionId, "extensionId"], [evidence.version, "version"], [evidence.artifactHash, "artifactHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!evidence.checksumVerified || !evidence.signatureVerified) reasons.push("extension checksum/signature is not verified");
  if (!evidence.sandboxProbePassed) reasons.push("extension sandbox probe failed");
  if (!evidence.secretScanPassed) reasons.push("extension secret scan failed");
  if (!evidence.networkProbePassed) reasons.push("extension network probe failed");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
