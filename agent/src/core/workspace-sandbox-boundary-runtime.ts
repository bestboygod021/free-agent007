/** M146 contracts for workspace snapshots, safe file operations and sandbox budgets. */

export type M146FileAction = "read" | "write" | "delete" | "rename";
export type M146NetworkMode = "none" | "allowlisted" | "local_only";

export interface M146WorkspaceSnapshot {
  organizationId: string;
  workspaceId: string;
  snapshotId: string;
  rootHash: string;
  fileCount: number;
  totalBytes: number;
  allowedPaths: string[];
  diffHash: string;
  immutable: boolean;
  tenantBound: boolean;
}

export interface M146FileOperation {
  organizationId: string;
  operationId: string;
  workspaceId: string;
  path: string;
  action: M146FileAction;
  bytes: number;
  allowedPath: boolean;
  tenantMatch: boolean;
  sandboxed: boolean;
  noSymlinkEscape: boolean;
  approvalPresent: boolean;
  contentHash: string;
}

export interface M146SandboxBudget {
  organizationId: string;
  executionId: string;
  cpuMs: number;
  memoryMb: number;
  diskMb: number;
  timeoutMs: number;
  processLimit: number;
  networkMode: M146NetworkMode;
  tenantMatch: boolean;
  sandboxed: boolean;
  approvalPresent: boolean;
}

export interface M146DiffApplyPlan {
  organizationId: string;
  workspaceId: string;
  diffHash: string;
  additions: number;
  deletions: number;
  allowedPaths: boolean;
  approvalPresent: boolean;
  dryRun: boolean;
  rollbackHash: string;
  snapshotId: string;
  noClobber: boolean;
}

export interface M146WorkspaceDecision {
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

export function validateM146Snapshot(snapshot: M146WorkspaceSnapshot): M146WorkspaceDecision {
  const reasons: string[] = [];
  required([[snapshot.organizationId, "organizationId"], [snapshot.workspaceId, "workspaceId"], [snapshot.snapshotId, "snapshotId"], [snapshot.rootHash, "rootHash"], [snapshot.diffHash, "diffHash"]], reasons);
  if (![snapshot.fileCount, snapshot.totalBytes].every((value) => Number.isInteger(value) && value >= 0)) reasons.push("snapshot counts must be non-negative integers");
  if (snapshot.allowedPaths.length === 0 || !snapshot.immutable || !snapshot.tenantBound) reasons.push("snapshot needs allowed paths, immutability and tenant binding");
  if (snapshot.allowedPaths.some((path) => path.includes("..") || path.startsWith("/"))) reasons.push("snapshot paths must be workspace-relative");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ snapshot, reasons })) };
}

export function decideM146FileOperation(operation: M146FileOperation): M146WorkspaceDecision {
  const reasons: string[] = [];
  required([[operation.organizationId, "organizationId"], [operation.operationId, "operationId"], [operation.workspaceId, "workspaceId"], [operation.path, "path"], [operation.contentHash, "contentHash"]], reasons);
  if (!operation.allowedPath || !operation.tenantMatch || !operation.sandboxed || !operation.noSymlinkEscape) reasons.push("file operation needs path, tenant, sandbox and symlink evidence");
  if (!Number.isInteger(operation.bytes) || operation.bytes < 0 || operation.bytes > 100_000_000) reasons.push("file operation bytes exceed bounded limit");
  if (operation.path.includes("..") || operation.path.startsWith("/")) reasons.push("file operation path must be relative");
  if (operation.action === "delete" && !operation.approvalPresent) reasons.push("delete operation needs approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: operation.action === "delete", auditHash: hash(JSON.stringify({ operation, reasons })) };
}

export function validateM146SandboxBudget(budget: M146SandboxBudget): M146WorkspaceDecision {
  const reasons: string[] = [];
  required([[budget.organizationId, "organizationId"], [budget.executionId, "executionId"]], reasons);
  if (![budget.cpuMs, budget.memoryMb, budget.diskMb, budget.timeoutMs, budget.processLimit].every((value) => Number.isInteger(value) && value > 0)) reasons.push("sandbox budgets must be positive integers");
  if (budget.cpuMs > 3_600_000 || budget.memoryMb > 65_536 || budget.diskMb > 1_000_000 || budget.timeoutMs > 3_600_000 || budget.processLimit > 1000) reasons.push("sandbox budget exceeds maximum");
  if (!budget.sandboxed || !budget.tenantMatch || !budget.approvalPresent) reasons.push("sandbox budget needs sandbox, tenant and approval evidence");
  if (budget.networkMode === "allowlisted" && !budget.approvalPresent) reasons.push("allowlisted network needs approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ budget, reasons })) };
}

export function decideM146DiffApply(plan: M146DiffApplyPlan): M146WorkspaceDecision {
  const reasons: string[] = [];
  required([[plan.organizationId, "organizationId"], [plan.workspaceId, "workspaceId"], [plan.diffHash, "diffHash"], [plan.rollbackHash, "rollbackHash"], [plan.snapshotId, "snapshotId"]], reasons);
  if (![plan.additions, plan.deletions].every((value) => Number.isInteger(value) && value >= 0)) reasons.push("diff counts must be non-negative integers");
  if (!plan.allowedPaths || !plan.noClobber || !plan.rollbackHash) reasons.push("diff needs allowed paths, no-clobber and rollback");
  if (!plan.dryRun && !plan.approvalPresent) reasons.push("apply requires approval after dry-run");
  return { allowed: reasons.length === 0, reasons, requiresApproval: !plan.dryRun, auditHash: hash(JSON.stringify({ plan, reasons })) };
}
