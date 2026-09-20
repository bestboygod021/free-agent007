/** Worktree, patch, license, secret-scan and artifact-attestation planning. No git mutation occurs here. */

export interface WorktreePlan {
  runId: string;
  repositoryId: string;
  baseRevision: string;
  isolatedPath: string;
  protectedBranch: boolean;
  cleanupRequired: true;
}

export interface PatchFile {
  path: string;
  beforeHash: string;
  afterHash: string;
  operation: "create" | "modify" | "delete";
}

export interface PatchPlan {
  patchId: string;
  runId: string;
  files: PatchFile[];
  atomic: true;
  requiresApproval: true;
}

export interface ArtifactAttestation {
  artifactId: string;
  digest: string;
  sourceRevision: string;
  buildPlanHash: string;
  testEvidenceHash: string;
  signer: string;
}

export interface DeliveryDecision {
  allowed: boolean;
  reasons: string[];
  decisionHash: string;
}

export class DeliveryTrustContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeliveryTrustContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new DeliveryTrustContractError(`${label} is required`);
}

export function planWorktree(input: Omit<WorktreePlan, "cleanupRequired">): WorktreePlan {
  for (const [value, label] of [[input.runId, "runId"], [input.repositoryId, "repositoryId"], [input.baseRevision, "baseRevision"], [input.isolatedPath, "isolatedPath"]] as const) required(value, label);
  if (input.isolatedPath.startsWith("/") || input.isolatedPath.includes("..")) throw new DeliveryTrustContractError("worktree path must be logical and isolated");
  return { ...structuredClone(input), cleanupRequired: true };
}

export function planPatch(input: Omit<PatchPlan, "atomic" | "requiresApproval">): PatchPlan {
  required(input.patchId, "patchId");
  required(input.runId, "runId");
  const paths = new Set<string>();
  for (const file of input.files) {
    required(file.path, "patch path");
    if (file.path.startsWith("/") || file.path.split("/").includes("..")) throw new DeliveryTrustContractError("patch path traversal");
    if (paths.has(file.path)) throw new DeliveryTrustContractError(`duplicate patch path: ${file.path}`);
    paths.add(file.path);
  }
  return { ...structuredClone(input), atomic: true, requiresApproval: true };
}

export function scanLicenses(licenses: readonly string[], allowedLicenses: readonly string[]): DeliveryDecision {
  const reasons = licenses.filter((license) => !allowedLicenses.includes(license)).map((license) => `license is not allowed: ${license}`);
  return { allowed: reasons.length === 0, reasons, decisionHash: hash(JSON.stringify({ licenses, reasons })) };
}

export function scanGitSecrets(contents: readonly string[]): DeliveryDecision {
  const reasons = contents.flatMap((content, index) => /-----BEGIN [^-]*PRIVATE KEY-----|(?:password|api[_-]?key|access[_-]?token|secret)\s*[:=]/i.test(content) ? [`secret-like content in file ${index}`] : []);
  return { allowed: reasons.length === 0, reasons, decisionHash: hash(JSON.stringify({ reasons })) };
}

export function verifyAttestation(attestation: ArtifactAttestation): DeliveryDecision {
  for (const [value, label] of [[attestation.artifactId, "artifactId"], [attestation.digest, "digest"], [attestation.sourceRevision, "sourceRevision"], [attestation.buildPlanHash, "buildPlanHash"], [attestation.testEvidenceHash, "testEvidenceHash"], [attestation.signer, "signer"]] as const) required(value, label);
  return { allowed: true, reasons: [], decisionHash: hash(JSON.stringify(attestation)) };
}
