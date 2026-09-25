/** M76 contracts for workspace/VFS guards, sandbox execution and cleanup evidence. */

export type ExecutionRuntime = "node" | "python" | "go" | "rust" | "java" | "php";
export type ExecutionNetworkMode = "none" | "allowlisted" | "local_only";
export type ExecutionOutcome = "passed" | "failed" | "timed_out" | "blocked";

export interface ExecutionSandboxRequest {
  organizationId: string;
  projectId: string;
  jobId: string;
  runtime: ExecutionRuntime;
  workspaceSnapshotHash: string;
  allowedPaths: string[];
  networkMode: ExecutionNetworkMode;
  allowedDomains: string[];
  cpuSeconds: number;
  memoryMb: number;
  timeoutMs: number;
  untrustedCode: boolean;
  approvalPresent: boolean;
}

export interface WorkspacePatchEvidence {
  organizationId: string;
  projectId: string;
  jobId: string;
  baseSnapshotHash: string;
  patchHash: string;
  touchedPaths: string[];
  allowedPaths: string[];
  atomic: boolean;
  reverted: boolean;
  conflictChecked: boolean;
}

export interface ExecutionTestEvidence {
  organizationId: string;
  jobId: string;
  runner: string;
  commandHash: string;
  exitCode: number;
  outcome: ExecutionOutcome;
  testCount: number;
  failedTestCount: number;
  artifactHash: string;
  outputRedacted: boolean;
}

export interface SandboxCleanupEvidence {
  organizationId: string;
  jobId: string;
  filesystemClean: boolean;
  processClean: boolean;
  volumeClean: boolean;
  secretLeaseRevoked: boolean;
  cleanupHash: string;
}

export interface ExecutionFabricDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  auditHash: string;
}

export class ExecutionFabricContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionFabricContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function nonEmpty(value: string, label: string, reasons: string[]): void {
  if (!value.trim()) reasons.push(`${label} is required`);
}

function safeRelativePath(value: string): boolean {
  return value.length > 0 && !value.startsWith("/") && !value.split("/").includes("..") && !value.includes("\\") && !value.includes("\0");
}

export function validateExecutionSandbox(request: ExecutionSandboxRequest): ExecutionFabricDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.projectId, "projectId"], [request.jobId, "jobId"], [request.workspaceSnapshotHash, "workspaceSnapshotHash"]] as const) nonEmpty(value, label, reasons);
  if (request.allowedPaths.length === 0 || request.allowedPaths.some((path) => !safeRelativePath(path))) reasons.push("sandbox allowed paths must be safe relative paths");
  if (request.networkMode === "allowlisted" && request.allowedDomains.length === 0) reasons.push("allowlisted network mode needs domains");
  if (request.networkMode !== "allowlisted" && request.allowedDomains.length > 0) reasons.push("domains require allowlisted network mode");
  if (!Number.isInteger(request.cpuSeconds) || request.cpuSeconds < 1 || request.cpuSeconds > 3600) reasons.push("CPU limit is outside bounds");
  if (!Number.isInteger(request.memoryMb) || request.memoryMb < 64 || request.memoryMb > 16_384) reasons.push("memory limit is outside bounds");
  if (!Number.isInteger(request.timeoutMs) || request.timeoutMs < 1000 || request.timeoutMs > 3_600_000) reasons.push("timeout is outside bounds");
  if (request.untrustedCode && request.networkMode !== "none" && request.networkMode !== "allowlisted") reasons.push("untrusted code needs explicit network boundary");
  if (request.untrustedCode && !request.approvalPresent) reasons.push("untrusted execution requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.untrustedCode, auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateWorkspacePatch(patch: WorkspacePatchEvidence): ExecutionFabricDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[patch.organizationId, "organizationId"], [patch.projectId, "projectId"], [patch.jobId, "jobId"], [patch.baseSnapshotHash, "baseSnapshotHash"], [patch.patchHash, "patchHash"]] as const) nonEmpty(value, label, reasons);
  if (patch.touchedPaths.length === 0 || patch.touchedPaths.some((path) => !safeRelativePath(path))) reasons.push("patch contains an unsafe path");
  const allowed = new Set(patch.allowedPaths);
  if (patch.touchedPaths.some((path) => ![...allowed].some((root) => path === root || path.startsWith(`${root}/`)))) reasons.push("patch touches a path outside allowed paths");
  if (!patch.atomic) reasons.push("workspace patch must be atomic");
  if (!patch.conflictChecked) reasons.push("workspace patch requires conflict check");
  return { allowed: reasons.length === 0, reasons, requiresApproval: !patch.reverted, auditHash: hash(JSON.stringify({ patch, reasons })) };
}

export function decideExecutionTestResult(evidence: ExecutionTestEvidence): ExecutionFabricDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.jobId, "jobId"], [evidence.runner, "runner"], [evidence.commandHash, "commandHash"], [evidence.artifactHash, "artifactHash"]] as const) nonEmpty(value, label, reasons);
  if (!Number.isInteger(evidence.exitCode)) reasons.push("test runner exit code is invalid");
  if (!Number.isInteger(evidence.testCount) || evidence.testCount < 0 || !Number.isInteger(evidence.failedTestCount) || evidence.failedTestCount < 0 || evidence.failedTestCount > evidence.testCount) reasons.push("test counts are invalid");
  if ((evidence.outcome === "passed") !== (evidence.exitCode === 0 && evidence.failedTestCount === 0)) reasons.push("test outcome does not match evidence");
  if (!evidence.outputRedacted) reasons.push("test output must be redacted");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function validateSandboxCleanup(evidence: SandboxCleanupEvidence): ExecutionFabricDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.jobId, "jobId"], [evidence.cleanupHash, "cleanupHash"]] as const) nonEmpty(value, label, reasons);
  if (!evidence.filesystemClean || !evidence.processClean || !evidence.volumeClean || !evidence.secretLeaseRevoked) reasons.push("sandbox cleanup is incomplete");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
