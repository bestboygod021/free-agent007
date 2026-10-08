/** M196 fail-closed contracts for plugin capability sandbox and extension certification. */

export interface M196PluginManifest {
  organizationId: string;
  pluginId: string;
  publisherId: string;
  artifactDigest: string;
  apiVersion: string;
  entrypoint: string;
  capabilities: string[];
  permissions: string[];
  license: string;
  signed: boolean;
  attestationHash: string;
  sandboxed: boolean;
  noNetwork: boolean;
  noSecrets: boolean;
  tenantBound: boolean;
}

export interface M196ExecutionRequest {
  organizationId: string;
  pluginId: string;
  executionId: string;
  inputHash: string;
  requestedCapability: string;
  targetReference: string;
  timeoutSeconds: number;
  sandboxed: boolean;
  networkAllowed: boolean;
  secretAccess: boolean;
  approvalPresent: boolean;
  tenantMatch: boolean;
}

export interface M196Certification {
  organizationId: string;
  pluginId: string;
  certificationId: string;
  apiCompatible: boolean;
  licenseAllowed: boolean;
  staticScanHash: string;
  behaviorTestHash: string;
  permissionReviewHash: string;
  publisherVerified: boolean;
  expiresAt: number;
  approved: boolean;
  tenantMatch: boolean;
}

export interface M196Revocation {
  organizationId: string;
  pluginId: string;
  revocationId: string;
  reasonHash: string;
  artifactDigest: string;
  revokedAt: number;
  propagated: boolean;
  blocked: boolean;
  approvalPresent: boolean;
  tenantMatch: boolean;
}

export interface M196PluginDecision {
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

export function validateM196Manifest(manifest: M196PluginManifest): M196PluginDecision {
  const reasons: string[] = [];
  required([[manifest.organizationId, "organizationId"], [manifest.pluginId, "pluginId"], [manifest.publisherId, "publisherId"], [manifest.artifactDigest, "artifactDigest"], [manifest.apiVersion, "apiVersion"], [manifest.entrypoint, "entrypoint"], [manifest.license, "license"], [manifest.attestationHash, "attestationHash"]], reasons);
  if (manifest.capabilities.length === 0 || manifest.permissions.length === 0 || manifest.capabilities.some((item) => !item.trim()) || manifest.permissions.some((item) => !item.trim()) || !manifest.signed || !manifest.sandboxed || !manifest.noNetwork || !manifest.noSecrets || !manifest.tenantBound) reasons.push("plugin manifest needs explicit capability/permission, signature, sandbox and no-network/no-secret gates");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ manifest, reasons })) };
}

export function decideM196Execution(request: M196ExecutionRequest): M196PluginDecision {
  const reasons: string[] = [];
  required([[request.organizationId, "organizationId"], [request.pluginId, "pluginId"], [request.executionId, "executionId"], [request.inputHash, "inputHash"], [request.requestedCapability, "requestedCapability"], [request.targetReference, "targetReference"]], reasons);
  if (!Number.isInteger(request.timeoutSeconds) || request.timeoutSeconds < 1 || request.timeoutSeconds > 900 || !request.sandboxed || request.networkAllowed || request.secretAccess || !request.approvalPresent || !request.tenantMatch) reasons.push("plugin execution needs bounded timeout, sandbox, no network/secrets, approval and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateM196Certification(certification: M196Certification, now: number): M196PluginDecision {
  const reasons: string[] = [];
  required([[certification.organizationId, "organizationId"], [certification.pluginId, "pluginId"], [certification.certificationId, "certificationId"], [certification.staticScanHash, "staticScanHash"], [certification.behaviorTestHash, "behaviorTestHash"], [certification.permissionReviewHash, "permissionReviewHash"]], reasons);
  if (!certification.apiCompatible || !certification.licenseAllowed || !certification.publisherVerified || !Number.isFinite(certification.expiresAt) || certification.expiresAt <= now || !certification.approved || !certification.tenantMatch) reasons.push("plugin certification needs API, license, publisher, freshness and approval proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ certification, now, reasons })) };
}

export function decideM196Revocation(revocation: M196Revocation): M196PluginDecision {
  const reasons: string[] = [];
  required([[revocation.organizationId, "organizationId"], [revocation.pluginId, "pluginId"], [revocation.revocationId, "revocationId"], [revocation.reasonHash, "reasonHash"], [revocation.artifactDigest, "artifactDigest"]], reasons);
  if (!Number.isFinite(revocation.revokedAt) || !revocation.propagated || !revocation.blocked || !revocation.approvalPresent || !revocation.tenantMatch) reasons.push("plugin revocation needs timestamp, propagation, block, approval and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ revocation, reasons })) };
}
