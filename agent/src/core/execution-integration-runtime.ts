/** M66 contracts for sandbox, workspace patch and test-run integration evidence. */

export type ExecutionNetworkPolicy = "none" | "allowlisted" | "egress_proxy";
export type ExecutionState = "queued" | "running" | "passed" | "failed" | "cleaned";

export interface SandboxExecutionRequest {
  organizationId: string;
  jobId: string;
  sandboxId: string;
  imageDigest: string;
  commandHash: string;
  allowedPaths: string[];
  networkPolicy: ExecutionNetworkPolicy;
  cpuMs: number;
  memoryMb: number;
  timeoutMs: number;
  untrustedCode: true;
  approvalPresent: boolean;
}

export interface WorkspacePatchRequest {
  organizationId: string;
  workspaceId: string;
  baseSnapshotHash: string;
  patchHash: string;
  changedPaths: string[];
  allowedPaths: string[];
  atomic: boolean;
  approvalPresent: boolean;
}

export interface TestRunEvidence {
  organizationId: string;
  jobId: string;
  runnerId: string;
  commandHash: string;
  resultHash: string;
  exitCode: number;
  durationMs: number;
  testsPassed: number;
  testsFailed: number;
  artifactHash: string;
  observedAt: number;
}

export interface CleanupEvidence {
  organizationId: string;
  sandboxId: string;
  workspaceId?: string;
  state: ExecutionState;
  deletedPaths: string[];
  deletedAt: number;
  resourceProbeHash: string;
  noResidualProcess: boolean;
}

export interface ExecutionDecision {
  allowed: boolean;
  reasons: string[];
  retryable: boolean;
  auditHash: string;
}

export class ExecutionIntegrationContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionIntegrationContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new ExecutionIntegrationContractError(`${label} is required`);
}

export function validateSandboxExecution(request: SandboxExecutionRequest): ExecutionDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.jobId, "jobId"], [request.sandboxId, "sandboxId"], [request.imageDigest, "imageDigest"], [request.commandHash, "commandHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!request.untrustedCode) reasons.push("execution boundary must explicitly mark code as untrusted");
  if (request.allowedPaths.length === 0 || request.allowedPaths.some((path) => path.startsWith("/") || path.includes(".."))) reasons.push("sandbox allowed paths are invalid");
  if (!Number.isInteger(request.cpuMs) || request.cpuMs < 1 || !Number.isInteger(request.memoryMb) || request.memoryMb < 16 || !Number.isInteger(request.timeoutMs) || request.timeoutMs < 100) reasons.push("sandbox resource limits are invalid");
  if (request.networkPolicy !== "none" && !request.approvalPresent) reasons.push("network-enabled sandbox requires approval");
  return { allowed: reasons.length === 0, reasons, retryable: true, auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function decideWorkspacePatch(request: WorkspacePatchRequest): ExecutionDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.workspaceId, "workspaceId"], [request.baseSnapshotHash, "baseSnapshotHash"], [request.patchHash, "patchHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (request.changedPaths.length === 0) reasons.push("workspace patch must change at least one path");
  if (request.changedPaths.some((path) => path.startsWith("/") || path.includes("..") || !request.allowedPaths.some((allowed) => path === allowed || path.startsWith(`${allowed}/`)))) reasons.push("workspace patch exceeds allowed paths");
  if (!request.atomic) reasons.push("workspace patch must be atomic");
  if (!request.approvalPresent) reasons.push("workspace patch requires approval");
  return { allowed: reasons.length === 0, reasons, retryable: false, auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateTestRunEvidence(evidence: TestRunEvidence): ExecutionDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.jobId, "jobId"], [evidence.runnerId, "runnerId"], [evidence.commandHash, "commandHash"], [evidence.resultHash, "resultHash"], [evidence.artifactHash, "artifactHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(evidence.exitCode) || evidence.exitCode < 0) reasons.push("test exit code is invalid");
  if (!Number.isFinite(evidence.durationMs) || evidence.durationMs < 0 || !Number.isInteger(evidence.testsPassed) || evidence.testsPassed < 0 || !Number.isInteger(evidence.testsFailed) || evidence.testsFailed < 0) reasons.push("test metrics are invalid");
  if (evidence.exitCode === 0 && evidence.testsFailed > 0) reasons.push("passing exit code contradicts failed tests");
  if (!Number.isFinite(evidence.observedAt)) reasons.push("test evidence timestamp is invalid");
  return { allowed: reasons.length === 0, reasons, retryable: evidence.exitCode !== 0, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function validateCleanupEvidence(cleanup: CleanupEvidence, now: number): ExecutionDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[cleanup.organizationId, "organizationId"], [cleanup.sandboxId, "sandboxId"], [cleanup.resourceProbeHash, "resourceProbeHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (cleanup.state !== "cleaned") reasons.push("cleanup evidence must be in cleaned state");
  if (!cleanup.noResidualProcess) reasons.push("cleanup found a residual process");
  if (!Number.isFinite(cleanup.deletedAt) || cleanup.deletedAt > now) reasons.push("cleanup timestamp is invalid");
  return { allowed: reasons.length === 0, reasons, retryable: false, auditHash: hash(JSON.stringify({ cleanup, now, reasons })) };
}
