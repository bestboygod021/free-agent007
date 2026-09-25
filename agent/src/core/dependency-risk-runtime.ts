/** M187 fail-closed contracts for dependency risk and vulnerability response. */

export type M187DependencyKind = "direct" | "transitive";
export type M187ResponseAction = "patch" | "quarantine" | "accept_risk" | "remove";

export interface M187Dependency {
  organizationId: string;
  dependencyId: string;
  packageName: string;
  version: string;
  digest: string;
  lockHash: string;
  license: string;
  kind: M187DependencyKind;
  vulnerabilityScanHash: string;
  licenseAllowed: boolean;
  approved: boolean;
  tenantBound: boolean;
}

export interface M187Advisory {
  organizationId: string;
  advisoryId: string;
  dependencyId: string;
  severity: "low" | "medium" | "high" | "critical";
  cveReference: string;
  affectedRange: string;
  fixedVersion: string;
  exploitabilityHash: string;
  evidenceHash: string;
  active: boolean;
  tenantMatch: boolean;
}

export interface M187UpdateRequest {
  organizationId: string;
  dependencyId: string;
  updateId: string;
  fromVersion: string;
  toVersion: string;
  newDigest: string;
  diffHash: string;
  testEvidenceHash: string;
  licenseAllowed: boolean;
  rollbackVersion: string;
  approvalPresent: boolean;
  tenantMatch: boolean;
}

export interface M187Response {
  organizationId: string;
  responseId: string;
  dependencyId: string;
  action: M187ResponseAction;
  reasonHash: string;
  severity: "low" | "medium" | "high" | "critical";
  approvalPresent: boolean;
  bounded: boolean;
  evidenceHash: string;
  noProductionMutation: boolean;
  tenantMatch: boolean;
}

export interface M187DependencyDecision {
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

export function validateM187Dependency(dependency: M187Dependency): M187DependencyDecision {
  const reasons: string[] = [];
  required([[dependency.organizationId, "organizationId"], [dependency.dependencyId, "dependencyId"], [dependency.packageName, "packageName"], [dependency.version, "version"], [dependency.digest, "digest"], [dependency.lockHash, "lockHash"], [dependency.license, "license"], [dependency.vulnerabilityScanHash, "vulnerabilityScanHash"]], reasons);
  if (dependency.kind !== "direct" && dependency.kind !== "transitive" || !dependency.licenseAllowed || !dependency.approved || !dependency.tenantBound) reasons.push("dependency license, approval or tenant gate failed");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ dependency, reasons })) };
}

export function decideM187Advisory(advisory: M187Advisory): M187DependencyDecision {
  const reasons: string[] = [];
  required([[advisory.organizationId, "organizationId"], [advisory.advisoryId, "advisoryId"], [advisory.dependencyId, "dependencyId"], [advisory.cveReference, "cveReference"], [advisory.affectedRange, "affectedRange"], [advisory.fixedVersion, "fixedVersion"], [advisory.exploitabilityHash, "exploitabilityHash"], [advisory.evidenceHash, "evidenceHash"]], reasons);
  if (!advisory.active || !advisory.tenantMatch) reasons.push("advisory must be active and tenant-bound");
  return { allowed: reasons.length === 0, reasons, requiresApproval: advisory.severity === "high" || advisory.severity === "critical", auditHash: hash(JSON.stringify({ advisory, reasons })) };
}

export function validateM187Update(update: M187UpdateRequest): M187DependencyDecision {
  const reasons: string[] = [];
  required([[update.organizationId, "organizationId"], [update.dependencyId, "dependencyId"], [update.updateId, "updateId"], [update.fromVersion, "fromVersion"], [update.toVersion, "toVersion"], [update.newDigest, "newDigest"], [update.diffHash, "diffHash"], [update.testEvidenceHash, "testEvidenceHash"], [update.rollbackVersion, "rollbackVersion"]], reasons);
  if (update.fromVersion === update.toVersion || !update.licenseAllowed || !update.approvalPresent || !update.tenantMatch) reasons.push("dependency update needs changed version, license, approval and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ update, reasons })) };
}

export function decideM187Response(response: M187Response): M187DependencyDecision {
  const reasons: string[] = [];
  required([[response.organizationId, "organizationId"], [response.responseId, "responseId"], [response.dependencyId, "dependencyId"], [response.reasonHash, "reasonHash"], [response.evidenceHash, "evidenceHash"]], reasons);
  if (!response.approvalPresent || !response.bounded || !response.noProductionMutation || !response.tenantMatch) reasons.push("vulnerability response needs approval, bound, no-production mutation and tenant proof");
  if ((response.severity === "high" || response.severity === "critical") && response.action === "accept_risk") reasons.push("high-severity risk cannot be silently accepted");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ response, reasons })) };
}
