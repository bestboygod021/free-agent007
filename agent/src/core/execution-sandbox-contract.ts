/** M30 contracts for sandbox execution, workspace isolation and test results. */

export type NetworkMode = "none" | "allowlist";
export type PatchOperation = "create" | "modify" | "delete";

export interface SandboxSpec {
  runId: string;
  organizationId: string;
  imageDigest: string;
  allowedPaths: string[];
  networkMode: NetworkMode;
  allowedDomains: string[];
  cpuMillis: number;
  memoryMb: number;
  timeoutMs: number;
  inheritCredentials: boolean;
  hostMounts: string[];
}

export interface SandboxDecision {
  allowed: boolean;
  reasons: string[];
  hostMountsAllowed: false;
  credentialsInherited: false;
  network: { mode: NetworkMode; domains: string[] };
  decisionHash: string;
}

export interface WorkspaceFileChange {
  path: string;
  operation: PatchOperation;
  beforeHash?: string;
  afterHash?: string;
}

export interface WorkspacePatchPlan {
  runId: string;
  baseRevision: string;
  changes: WorkspaceFileChange[];
  protectedPaths: string[];
  maxFiles: number;
}

export interface PatchDecision {
  allowed: boolean;
  reasons: string[];
  atomic: true;
  rollbackRequired: true;
  decisionHash: string;
}

export interface TestRunInput {
  runner: "vitest" | "pytest" | "go" | "cargo" | "unknown";
  exitCode: number;
  signal?: string;
  passed: number;
  failed: number;
  skipped: number;
  logHash: string;
}

export interface NormalizedTestRun {
  status: "passed" | "failed" | "cancelled";
  runner: TestRunInput["runner"];
  passed: number;
  failed: number;
  skipped: number;
  logHash: string;
  evidenceComplete: boolean;
}

export interface CleanupPlan {
  runId: string;
  processes: string[];
  volumes: string[];
  workspacePath: string;
  mustVerifyEmpty: true;
  planHash: string;
}

export class ExecutionSandboxContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionSandboxContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function unsafePath(path: string): boolean {
  return path.startsWith("/") || path.includes("..") || path.includes("\\");
}

export function decideSandbox(spec: SandboxSpec): SandboxDecision {
  const reasons: string[] = [];
  if (!spec.runId.trim() || !spec.organizationId.trim() || !spec.imageDigest.startsWith("sha256:")) reasons.push("run, tenant and pinned image digest are required");
  if (spec.allowedPaths.length === 0 || spec.allowedPaths.some(unsafePath)) reasons.push("allowed paths must be non-empty and workspace-relative");
  if (spec.hostMounts.length > 0) reasons.push("host mounts are forbidden");
  if (spec.inheritCredentials) reasons.push("credential inheritance is forbidden");
  if (spec.networkMode === "none" && spec.allowedDomains.length > 0) reasons.push("domains cannot be declared when network is disabled");
  if (spec.networkMode === "allowlist" && spec.allowedDomains.some((domain) => !domain.includes(".") || domain.startsWith("*"))) reasons.push("network domains must be explicit allowlist entries");
  if (!Number.isInteger(spec.cpuMillis) || spec.cpuMillis < 50 || !Number.isInteger(spec.memoryMb) || spec.memoryMb < 64 || !Number.isInteger(spec.timeoutMs) || spec.timeoutMs < 1000) reasons.push("resource limits are invalid");
  return { allowed: reasons.length === 0, reasons, hostMountsAllowed: false, credentialsInherited: false, network: { mode: spec.networkMode, domains: [...spec.allowedDomains] }, decisionHash: hash(JSON.stringify({ spec, reasons })) };
}

export function validatePatchPlan(plan: WorkspacePatchPlan): PatchDecision {
  const reasons: string[] = [];
  if (!plan.runId.trim() || !plan.baseRevision.trim()) reasons.push("run and base revision are required");
  if (plan.changes.length === 0 || plan.changes.length > plan.maxFiles) reasons.push("patch file count exceeds configured bounds");
  const protectedPaths = new Set(plan.protectedPaths);
  const seen = new Set<string>();
  for (const change of plan.changes) {
    if (unsafePath(change.path)) reasons.push(`unsafe path: ${change.path}`);
    if (seen.has(change.path)) reasons.push(`duplicate path: ${change.path}`);
    seen.add(change.path);
    if (protectedPaths.has(change.path)) reasons.push(`protected path: ${change.path}`);
    if (change.operation !== "create" && !change.beforeHash) reasons.push(`before hash is required for ${change.path}`);
    if (change.operation !== "delete" && !change.afterHash) reasons.push(`after hash is required for ${change.path}`);
  }
  return { allowed: reasons.length === 0, reasons, atomic: true, rollbackRequired: true, decisionHash: hash(JSON.stringify({ plan, reasons })) };
}

export function normalizeTestRun(input: TestRunInput): NormalizedTestRun {
  if (input.passed < 0 || input.failed < 0 || input.skipped < 0 || !input.logHash.trim()) throw new ExecutionSandboxContractError("test result is invalid");
  const status = input.signal ? "cancelled" : input.exitCode === 0 && input.failed === 0 ? "passed" : "failed";
  return { status, runner: input.runner, passed: input.passed, failed: input.failed, skipped: input.skipped, logHash: input.logHash, evidenceComplete: input.signal === undefined && input.exitCode >= 0 };
}

export function planSandboxCleanup(runId: string, processes: string[], volumes: string[], workspacePath: string): CleanupPlan {
  if (!runId.trim() || !workspacePath.trim() || unsafePath(workspacePath)) throw new ExecutionSandboxContractError("cleanup identity or workspace path is invalid");
  return { runId, processes: [...processes], volumes: [...volumes], workspacePath, mustVerifyEmpty: true, planHash: hash(JSON.stringify({ runId, processes, volumes, workspacePath })) };
}
