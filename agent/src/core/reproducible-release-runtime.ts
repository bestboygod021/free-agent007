/** M167 fail-closed contracts for reproducible builds and release manifests. */

export type M167BuildState = "planned" | "running" | "succeeded" | "failed";
export type M167Promotion = "candidate" | "canary" | "approved" | "rejected";

export interface M167BuildPlan {
  organizationId: string;
  buildId: string;
  sourceRevision: string;
  lockfileHash: string;
  toolchainDigest: string;
  buildConfigHash: string;
  artifactKind: "container" | "package" | "static";
  reproducible: boolean;
  sandboxed: boolean;
  noNetworkBuild: boolean;
  approvalPresent: boolean;
  tenantBound: boolean;
}

export interface M167BuildResult {
  organizationId: string;
  buildId: string;
  resultId: string;
  state: M167BuildState;
  artifactDigest: string;
  sbomHash: string;
  provenanceHash: string;
  sourceRevision: string;
  toolchainDigest: string;
  exitCode: number;
  testsPassed: boolean;
  secretsScanPassed: boolean;
  licenseScanPassed: boolean;
  reproducibilityHash: string;
}

export interface M167ReleaseManifest {
  organizationId: string;
  releaseId: string;
  artifactDigest: string;
  sourceRevision: string;
  sbomHash: string;
  provenanceHash: string;
  signatureReference: string;
  vulnerabilityScanPassed: boolean;
  policyScanPassed: boolean;
  rollbackArtifactDigest: string;
  promotion: M167Promotion;
  approvalPresent: boolean;
  noClobber: boolean;
}

export interface M167PromotionDecision {
  organizationId: string;
  releaseId: string;
  decisionId: string;
  targetEnvironment: "local" | "preview" | "staging" | "production";
  smokeEvidenceHash: string;
  canaryEvidenceHash: string;
  rollbackReady: boolean;
  operatorReference: string;
  approved: boolean;
  expiresAt: number;
}

export interface M167ReleaseDecision {
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

export function validateM167BuildPlan(plan: M167BuildPlan): M167ReleaseDecision {
  const reasons: string[] = [];
  required([[plan.organizationId, "organizationId"], [plan.buildId, "buildId"], [plan.sourceRevision, "sourceRevision"], [plan.lockfileHash, "lockfileHash"], [plan.toolchainDigest, "toolchainDigest"], [plan.buildConfigHash, "buildConfigHash"]], reasons);
  if (!plan.reproducible || !plan.sandboxed || !plan.noNetworkBuild || !plan.approvalPresent || !plan.tenantBound) reasons.push("build needs reproducibility, sandbox, no-network, approval and tenant scope");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ plan, reasons })) };
}

export function decideM167Build(result: M167BuildResult, plan: M167BuildPlan): M167ReleaseDecision {
  const reasons: string[] = [];
  required([[result.organizationId, "organizationId"], [result.buildId, "buildId"], [result.resultId, "resultId"], [result.artifactDigest, "artifactDigest"], [result.sbomHash, "sbomHash"], [result.provenanceHash, "provenanceHash"], [result.reproducibilityHash, "reproducibilityHash"]], reasons);
  if (result.organizationId !== plan.organizationId || result.buildId !== plan.buildId || result.sourceRevision !== plan.sourceRevision || result.toolchainDigest !== plan.toolchainDigest) reasons.push("build result does not match plan");
  if (result.state !== "succeeded" || result.exitCode !== 0 || !result.testsPassed || !result.secretsScanPassed || !result.licenseScanPassed) reasons.push("build evidence is incomplete");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ result, buildId: plan.buildId, reasons })) };
}

export function validateM167Manifest(manifest: M167ReleaseManifest): M167ReleaseDecision {
  const reasons: string[] = [];
  required([[manifest.organizationId, "organizationId"], [manifest.releaseId, "releaseId"], [manifest.artifactDigest, "artifactDigest"], [manifest.sourceRevision, "sourceRevision"], [manifest.sbomHash, "sbomHash"], [manifest.provenanceHash, "provenanceHash"], [manifest.signatureReference, "signatureReference"], [manifest.rollbackArtifactDigest, "rollbackArtifactDigest"]], reasons);
  if (!manifest.vulnerabilityScanPassed || !manifest.policyScanPassed || !manifest.approvalPresent || !manifest.noClobber) reasons.push("release admission scans, approval and no-clobber are required");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ manifest, reasons })) };
}

export function decideM167Promotion(decision: M167PromotionDecision, now: number): M167ReleaseDecision {
  const reasons: string[] = [];
  required([[decision.organizationId, "organizationId"], [decision.releaseId, "releaseId"], [decision.decisionId, "decisionId"], [decision.smokeEvidenceHash, "smokeEvidenceHash"], [decision.canaryEvidenceHash, "canaryEvidenceHash"], [decision.operatorReference, "operatorReference"]], reasons);
  if (!decision.approved || !decision.rollbackReady || decision.expiresAt <= now) reasons.push("promotion needs approval, rollback and future expiry");
  if (decision.targetEnvironment === "production" && !decision.approved) reasons.push("production promotion requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: decision.targetEnvironment === "production", auditHash: hash(JSON.stringify({ decision, now, reasons })) };
}
