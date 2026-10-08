/** M134 contracts for tenant-scoped export, portable manifests and controlled import. */

export type M134Format = "jsonl" | "ndjson" | "tar";
export type M134ConflictPolicy = "fail" | "skip" | "merge_review";
export type M134Scope = "workspace" | "runs" | "settings" | "audit_evidence";

export interface M134ExportRequest {
  organizationId: string;
  exportId: string;
  scopes: M134Scope[];
  format: M134Format;
  schemaVersion: string;
  redactionPolicyHash: string;
  userConsent: boolean;
  approvalPresent: boolean;
  legalHoldPresent: boolean;
  includeSecrets: false;
  expiresAt: number;
  tenantBound: boolean;
}

export interface M134ExportManifest {
  organizationId: string;
  exportId: string;
  schemaVersion: string;
  format: M134Format;
  itemCount: number;
  byteCount: number;
  rootHash: string;
  checksum: string;
  encryptionKeyReference: string;
  createdAt: number;
  expiresAt: number;
  redactionPolicyHash: string;
  tenantBound: boolean;
  rawSecretsStored: false;
}

export interface M134ImportPlan {
  organizationId: string;
  importId: string;
  sourceManifestHash: string;
  sourceOrganizationId: string;
  targetOrganizationId: string;
  sourceSchemaVersion: string;
  targetSchemaVersion: string;
  schemaCompatible: boolean;
  mappingHash: string;
  conflictPolicy: M134ConflictPolicy;
  dryRun: boolean;
  approvalPresent: boolean;
  secretsAbsent: boolean;
  tenantIsolationVerified: boolean;
  rollbackPlanHash: string;
}

export interface M134PortabilityDecision {
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

export function validateM134ExportRequest(request: M134ExportRequest, now: number): M134PortabilityDecision {
  const reasons: string[] = [];
  required([[request.organizationId, "organizationId"], [request.exportId, "exportId"], [request.schemaVersion, "schemaVersion"], [request.redactionPolicyHash, "redactionPolicyHash"]], reasons);
  if (request.scopes.length === 0) reasons.push("export must declare at least one scope");
  if (!request.userConsent || !request.approvalPresent) reasons.push("export needs user consent and approval");
  if (request.legalHoldPresent && request.scopes.includes("audit_evidence")) reasons.push("legal hold blocks audit evidence export");
  if (request.includeSecrets !== false) reasons.push("export must never include secrets");
  if (!request.tenantBound) reasons.push("export must be tenant-bound");
  if (!Number.isFinite(request.expiresAt) || request.expiresAt <= now) reasons.push("export expiry is invalid or elapsed");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ request, now, reasons })) };
}

export function validateM134ExportManifest(manifest: M134ExportManifest, now: number): M134PortabilityDecision {
  const reasons: string[] = [];
  required([[manifest.organizationId, "organizationId"], [manifest.exportId, "exportId"], [manifest.schemaVersion, "schemaVersion"], [manifest.rootHash, "rootHash"], [manifest.checksum, "checksum"], [manifest.encryptionKeyReference, "encryptionKeyReference"], [manifest.redactionPolicyHash, "redactionPolicyHash"]], reasons);
  if (!Number.isInteger(manifest.itemCount) || manifest.itemCount < 0 || !Number.isInteger(manifest.byteCount) || manifest.byteCount < 0) reasons.push("manifest counts must be non-negative integers");
  if (!Number.isFinite(manifest.createdAt) || !Number.isFinite(manifest.expiresAt) || manifest.expiresAt <= manifest.createdAt || manifest.expiresAt <= now) reasons.push("manifest lifetime is invalid");
  if (!manifest.tenantBound || manifest.rawSecretsStored !== false) reasons.push("manifest must be tenant-bound and contain no raw secrets");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ manifest, now, reasons })) };
}

export function decideM134ImportPlan(plan: M134ImportPlan): M134PortabilityDecision {
  const reasons: string[] = [];
  required([[plan.organizationId, "organizationId"], [plan.importId, "importId"], [plan.sourceManifestHash, "sourceManifestHash"], [plan.sourceOrganizationId, "sourceOrganizationId"], [plan.targetOrganizationId, "targetOrganizationId"], [plan.sourceSchemaVersion, "sourceSchemaVersion"], [plan.targetSchemaVersion, "targetSchemaVersion"], [plan.mappingHash, "mappingHash"], [plan.rollbackPlanHash, "rollbackPlanHash"]], reasons);
  if (plan.organizationId !== plan.targetOrganizationId) reasons.push("import owner must equal target organization");
  if (plan.sourceOrganizationId === plan.targetOrganizationId) reasons.push("import must explicitly declare a cross-tenant migration boundary");
  if (!plan.schemaCompatible || !plan.secretsAbsent || !plan.tenantIsolationVerified) reasons.push("import needs schema, secret and tenant-isolation evidence");
  if (plan.conflictPolicy === "merge_review" && !plan.approvalPresent) reasons.push("merge review import needs approval");
  if (!plan.dryRun) reasons.push("first import execution must be a dry run");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ plan, reasons })) };
}

export function decideM134Portability(plan: M134ImportPlan, manifest: M134ExportManifest, now: number): M134PortabilityDecision {
  const importDecision = decideM134ImportPlan(plan);
  const manifestDecision = validateM134ExportManifest(manifest, now);
  const reasons = [...importDecision.reasons, ...manifestDecision.reasons];
  if (manifest.organizationId !== plan.sourceOrganizationId) reasons.push("manifest source does not match import source");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ plan, manifest, now, reasons })) };
}
