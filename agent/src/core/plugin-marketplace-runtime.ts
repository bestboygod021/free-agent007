/** M111 contracts for governed plugins, extension permissions and marketplace installation. */

export type M111PluginKind = "tool" | "connector" | "agent" | "ui";
export type M111PluginLifecycle = "submitted" | "verified" | "listed" | "revoked";

export interface M111PluginManifestContract {
  organizationId: string;
  pluginId: string;
  version: string;
  kind: M111PluginKind;
  packageDigest: string;
  manifestHash: string;
  signatureHash: string;
  publisherHash: string;
  requestedPermissions: string[];
  allowedHosts: string[];
  sandboxRequired: boolean;
  sourceReviewHash: string;
  lifecycle: M111PluginLifecycle;
}

export interface M111PluginAttestationEvidence {
  organizationId: string;
  pluginId: string;
  version: string;
  sbomHash: string;
  dependencyScanHash: string;
  licenseReviewHash: string;
  injectionScanHash: string;
  secretScanPassed: boolean;
  dependencyScanPassed: boolean;
  reproducibleBuild: boolean;
  untrustedCodeSandboxed: boolean;
}

export interface M111PluginInstallRequest {
  organizationId: string;
  pluginId: string;
  version: string;
  grantedPermissions: string[];
  grantedHosts: string[];
  approvalPresent: boolean;
  tenantIsolationPassed: boolean;
  licenseAccepted: boolean;
  consentRecorded: boolean;
  rollbackPlanHash: string;
  idempotencyKey: string;
}

export interface M111PluginInvocationRequest {
  organizationId: string;
  pluginId: string;
  operation: string;
  permissionRequired: string;
  host?: string;
  inputHash: string;
  outputRedacted: boolean;
  approvalPresent: boolean;
  sandboxed: boolean;
  timeoutMs: number;
}

export interface M111PluginDecision {
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

export function validateM111PluginManifest(manifest: M111PluginManifestContract): M111PluginDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[manifest.organizationId, "organizationId"], [manifest.pluginId, "pluginId"], [manifest.version, "version"], [manifest.packageDigest, "packageDigest"], [manifest.manifestHash, "manifestHash"], [manifest.signatureHash, "signatureHash"], [manifest.publisherHash, "publisherHash"], [manifest.sourceReviewHash, "sourceReviewHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (manifest.requestedPermissions.length === 0) reasons.push("plugin must declare permissions");
  if (manifest.allowedHosts.some((host) => !host.includes(".") || host.startsWith("*"))) reasons.push("plugin hosts must be explicit and non-wildcard");
  if (!manifest.sandboxRequired) reasons.push("untrusted plugin must run in a sandbox");
  if (manifest.lifecycle === "listed" && !manifest.sourceReviewHash) reasons.push("listed plugin needs source review");
  if (manifest.lifecycle === "revoked") reasons.push("revoked plugin cannot be installed");
  return { allowed: reasons.length === 0, reasons, requiresApproval: manifest.lifecycle === "listed", auditHash: hash(JSON.stringify({ manifest, reasons })) };
}

export function validateM111PluginAttestation(evidence: M111PluginAttestationEvidence): M111PluginDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.pluginId, "pluginId"], [evidence.version, "version"], [evidence.sbomHash, "sbomHash"], [evidence.dependencyScanHash, "dependencyScanHash"], [evidence.licenseReviewHash, "licenseReviewHash"], [evidence.injectionScanHash, "injectionScanHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!evidence.secretScanPassed || !evidence.dependencyScanPassed || !evidence.reproducibleBuild || !evidence.untrustedCodeSandboxed) reasons.push("plugin attestation is incomplete");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function decideM111PluginInstall(request: M111PluginInstallRequest, declaredPermissions: string[], declaredHosts: string[]): M111PluginDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.pluginId, "pluginId"], [request.version, "version"], [request.rollbackPlanHash, "rollbackPlanHash"], [request.idempotencyKey, "idempotencyKey"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (request.grantedPermissions.some((permission) => !declaredPermissions.includes(permission))) reasons.push("granted plugin permission exceeds manifest");
  if (request.grantedHosts.some((host) => !declaredHosts.includes(host))) reasons.push("granted plugin host exceeds manifest");
  if (!request.approvalPresent || !request.tenantIsolationPassed || !request.licenseAccepted || !request.consentRecorded) reasons.push("plugin installation approval, isolation, license and consent evidence is incomplete");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function decideM111PluginInvocation(request: M111PluginInvocationRequest, grantedPermissions: string[], grantedHosts: string[]): M111PluginDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.pluginId, "pluginId"], [request.operation, "operation"], [request.permissionRequired, "permissionRequired"], [request.inputHash, "inputHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!grantedPermissions.includes(request.permissionRequired)) reasons.push("plugin invocation permission is not granted");
  if (request.host && !grantedHosts.includes(request.host)) reasons.push("plugin invocation host is not granted");
  if (!request.outputRedacted || !request.sandboxed) reasons.push("plugin invocation must be sandboxed and redacted");
  if (!Number.isInteger(request.timeoutMs) || request.timeoutMs < 1 || request.timeoutMs > 120_000) reasons.push("plugin timeout must be bounded");
  if (request.permissionRequired !== "read" && !request.approvalPresent) reasons.push("mutating plugin invocation requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.permissionRequired !== "read", auditHash: hash(JSON.stringify({ request, reasons })) };
}
