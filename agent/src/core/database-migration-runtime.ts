/** M150 contracts for migration plans, expand/contract changes and RLS-aware runs. */

export type M150MigrationKind = "expand" | "contract" | "backfill";
export type M150ChangeOperation = "add_column" | "add_index" | "rename_column" | "drop_column" | "backfill";
export type M150RunState = "planned" | "running" | "succeeded" | "failed" | "rolled_back";

export interface M150MigrationPlan {
  organizationId: string;
  migrationId: string;
  version: string;
  fromSchemaHash: string;
  toSchemaHash: string;
  kind: M150MigrationKind;
  stepsHash: string;
  dryRun: boolean;
  approvalPresent: boolean;
  noClobber: boolean;
  rollbackPlanHash: string;
  tenantScoped: boolean;
}

export interface M150SchemaChange {
  organizationId: string;
  migrationId: string;
  tableName: string;
  operation: M150ChangeOperation;
  columnName?: string;
  backwardCompatible: boolean;
  destructive: boolean;
  lockRisk: "low" | "medium" | "high";
  tenantScoped: boolean;
  onlineSafe: boolean;
}

export interface M150MigrationRun {
  organizationId: string;
  migrationId: string;
  runId: string;
  state: M150RunState;
  checksum: string;
  startedAt: number;
  completedAt?: number;
  exitCode?: number;
  lockAcquired: boolean;
  rowCount: number;
  transactionBound: boolean;
  rollbackReady: boolean;
}

export interface M150RlsMigrationCheck {
  organizationId: string;
  migrationId: string;
  tableName: string;
  tenantColumn: string;
  rlsEnabled: boolean;
  defaultDeny: boolean;
  policyHash: string;
  probeHash: string;
  noLeak: boolean;
  rollbackTested: boolean;
}

export interface M150MigrationDecision {
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

export function validateM150Plan(plan: M150MigrationPlan): M150MigrationDecision {
  const reasons: string[] = [];
  required([[plan.organizationId, "organizationId"], [plan.migrationId, "migrationId"], [plan.version, "version"], [plan.fromSchemaHash, "fromSchemaHash"], [plan.toSchemaHash, "toSchemaHash"], [plan.stepsHash, "stepsHash"], [plan.rollbackPlanHash, "rollbackPlanHash"]], reasons);
  if (plan.fromSchemaHash === plan.toSchemaHash) reasons.push("migration must change schema hash");
  if (!plan.noClobber || !plan.tenantScoped || !plan.rollbackPlanHash) reasons.push("migration needs no-clobber, tenant scope and rollback");
  if (!plan.dryRun && !plan.approvalPresent) reasons.push("apply migration needs approval");
  if (plan.kind === "contract" && plan.dryRun === false && !plan.approvalPresent) reasons.push("contract migration needs approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: !plan.dryRun, auditHash: hash(JSON.stringify({ plan, reasons })) };
}

export function validateM150Change(change: M150SchemaChange): M150MigrationDecision {
  const reasons: string[] = [];
  required([[change.organizationId, "organizationId"], [change.migrationId, "migrationId"], [change.tableName, "tableName"]], reasons);
  if (change.operation !== "add_index" && !change.columnName?.trim()) reasons.push("schema change needs column name");
  if (!change.tenantScoped) reasons.push("schema change must declare tenant scope");
  if (change.destructive && (change.backwardCompatible || change.onlineSafe)) reasons.push("destructive change cannot claim backward or online safety");
  if (change.lockRisk === "high" && change.onlineSafe) reasons.push("high lock risk cannot be online safe");
  return { allowed: reasons.length === 0, reasons, requiresApproval: change.destructive || change.lockRisk === "high", auditHash: hash(JSON.stringify({ change, reasons })) };
}

export function decideM150Run(run: M150MigrationRun, now: number): M150MigrationDecision {
  const reasons: string[] = [];
  required([[run.organizationId, "organizationId"], [run.migrationId, "migrationId"], [run.runId, "runId"], [run.checksum, "checksum"]], reasons);
  if (!Number.isFinite(run.startedAt) || run.startedAt > now) reasons.push("migration start time is invalid");
  if (run.completedAt !== undefined && (!Number.isFinite(run.completedAt) || run.completedAt < run.startedAt)) reasons.push("migration completion time is invalid");
  if (!Number.isInteger(run.rowCount) || run.rowCount < 0) reasons.push("rowCount must be non-negative");
  if (!run.lockAcquired || !run.transactionBound || !run.rollbackReady) reasons.push("migration needs lock, transaction and rollback evidence");
  if (run.state === "succeeded" && run.exitCode !== 0) reasons.push("succeeded migration must have zero exit code");
  if (run.state === "failed" && run.exitCode === undefined) reasons.push("failed migration needs exit code");
  return { allowed: reasons.length === 0, reasons, requiresApproval: run.state === "succeeded", auditHash: hash(JSON.stringify({ run, now, reasons })) };
}

export function validateM150RlsCheck(check: M150RlsMigrationCheck): M150MigrationDecision {
  const reasons: string[] = [];
  required([[check.organizationId, "organizationId"], [check.migrationId, "migrationId"], [check.tableName, "tableName"], [check.tenantColumn, "tenantColumn"], [check.policyHash, "policyHash"], [check.probeHash, "probeHash"]], reasons);
  if (!check.rlsEnabled || !check.defaultDeny || !check.noLeak || !check.rollbackTested) reasons.push("migration RLS check needs RLS, default deny, no-leak and rollback evidence");
  if (check.tenantColumn.includes(" ") || check.tenantColumn.includes(";")) reasons.push("tenant column must be a safe identifier");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ check, reasons })) };
}
