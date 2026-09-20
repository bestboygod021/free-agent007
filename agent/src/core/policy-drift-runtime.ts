/** M136 contracts for signed policy distribution, enforcement and configuration drift. */

export type M136FailMode = "deny" | "read_only" | "safe_default";
export type M136TargetKind = "workspace" | "connector" | "runner" | "tenant";
export type M136DriftClass = "missing" | "stale" | "tampered" | "unauthorized";

export interface M136PolicyBundle {
  organizationId: string;
  policyId: string;
  version: string;
  bundleDigest: string;
  rulesHash: string;
  signerReference: string;
  issuedAt: number;
  expiresAt: number;
  targetKinds: M136TargetKind[];
  failMode: M136FailMode;
  approvalPresent: boolean;
  tenantScoped: boolean;
  noRawSecrets: boolean;
}

export interface M136PolicyTarget {
  organizationId: string;
  targetId: string;
  targetKind: M136TargetKind;
  expectedPolicyId: string;
  expectedVersion: string;
  observedPolicyId: string;
  observedVersion: string;
  lastAppliedDigest: string;
  enforcementActive: boolean;
  tenantMatch: boolean;
  lastCheckedAt: number;
}

export interface M136DriftFinding {
  organizationId: string;
  findingId: string;
  targetId: string;
  expectedDigest: string;
  observedDigest: string;
  driftClass: M136DriftClass;
  firstSeenAt: number;
  remediationAllowed: boolean;
  approvalPresent: boolean;
  failClosed: boolean;
  evidenceHash: string;
}

export interface M136PolicyException {
  organizationId: string;
  exceptionId: string;
  policyId: string;
  targetId: string;
  reasonHash: string;
  approverReference: string;
  issuedAt: number;
  expiresAt: number;
  rollbackPlanHash: string;
  compensatingControlHash: string;
  noPrivilegeExpansion: boolean;
}

export interface M136PolicyDecision {
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

export function validateM136PolicyBundle(bundle: M136PolicyBundle, now: number): M136PolicyDecision {
  const reasons: string[] = [];
  required([[bundle.organizationId, "organizationId"], [bundle.policyId, "policyId"], [bundle.version, "version"], [bundle.bundleDigest, "bundleDigest"], [bundle.rulesHash, "rulesHash"], [bundle.signerReference, "signerReference"]], reasons);
  if (bundle.targetKinds.length === 0) reasons.push("policy must target at least one target kind");
  if (!Number.isFinite(bundle.issuedAt) || !Number.isFinite(bundle.expiresAt) || bundle.expiresAt <= bundle.issuedAt || bundle.expiresAt <= now) reasons.push("policy bundle lifetime is invalid");
  if (!bundle.approvalPresent || !bundle.tenantScoped || !bundle.noRawSecrets) reasons.push("policy needs approval, tenant scope and no-raw-secret evidence");
  if (bundle.failMode !== "deny" && bundle.failMode !== "read_only" && bundle.failMode !== "safe_default") reasons.push("invalid fail mode");
  if (/secret|password|token|private/i.test(bundle.signerReference)) reasons.push("signer reference must be opaque");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ bundle, now, reasons })) };
}

export function decideM136Distribution(bundle: M136PolicyBundle, target: M136PolicyTarget, now: number): M136PolicyDecision {
  const reasons: string[] = [];
  const bundleDecision = validateM136PolicyBundle(bundle, now);
  reasons.push(...bundleDecision.reasons);
  required([[target.organizationId, "target.organizationId"], [target.targetId, "target.targetId"], [target.expectedPolicyId, "expectedPolicyId"], [target.expectedVersion, "expectedVersion"]], reasons);
  if (bundle.organizationId !== target.organizationId) reasons.push("policy and target organizations do not match");
  if (!bundle.targetKinds.includes(target.targetKind)) reasons.push("policy does not target this target kind");
  if (target.expectedPolicyId !== bundle.policyId || target.expectedVersion !== bundle.version) reasons.push("target expectation does not match bundle");
  if (!target.tenantMatch || !target.enforcementActive) reasons.push("distribution needs tenant match and active enforcement");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ bundle, target, now, reasons })) };
}

export function decideM136Drift(finding: M136DriftFinding): M136PolicyDecision {
  const reasons: string[] = [];
  required([[finding.organizationId, "organizationId"], [finding.findingId, "findingId"], [finding.targetId, "targetId"], [finding.expectedDigest, "expectedDigest"], [finding.observedDigest, "observedDigest"], [finding.evidenceHash, "evidenceHash"]], reasons);
  if (finding.expectedDigest === finding.observedDigest) reasons.push("finding must represent a real digest drift");
  if (!finding.failClosed) reasons.push("drift must fail closed");
  if (finding.remediationAllowed && !finding.approvalPresent) reasons.push("remediation needs approval");
  if (!Number.isFinite(finding.firstSeenAt)) reasons.push("firstSeenAt is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: finding.remediationAllowed, auditHash: hash(JSON.stringify({ finding, reasons })) };
}

export function validateM136Exception(exception: M136PolicyException, now: number): M136PolicyDecision {
  const reasons: string[] = [];
  required([[exception.organizationId, "organizationId"], [exception.exceptionId, "exceptionId"], [exception.policyId, "policyId"], [exception.targetId, "targetId"], [exception.reasonHash, "reasonHash"], [exception.approverReference, "approverReference"], [exception.rollbackPlanHash, "rollbackPlanHash"], [exception.compensatingControlHash, "compensatingControlHash"]], reasons);
  if (!Number.isFinite(exception.issuedAt) || !Number.isFinite(exception.expiresAt) || exception.expiresAt <= exception.issuedAt || exception.expiresAt <= now) reasons.push("policy exception must be time-bounded");
  if (!exception.noPrivilegeExpansion) reasons.push("exception cannot expand privilege");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ exception, now, reasons })) };
}
