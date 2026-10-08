/** M119 contracts for tenant-safe transactions, RLS evidence, migrations and outbox delivery. */

export type M119TransactionMode = "read" | "write" | "serializable";
export type M119MigrationAction = "plan" | "apply" | "rollback";

export interface M119TransactionEnvelope {
  organizationId: string;
  transactionId: string;
  mode: M119TransactionMode;
  actorHash: string;
  requestId: string;
  idempotencyKey: string;
  isolationLevel: "read_committed" | "repeatable_read" | "serializable";
  tenantBound: boolean;
  startedAt: number;
  committedAt?: number;
  rolledBack: boolean;
  writeSetHash?: string;
}

export interface M119RlsEvidence {
  organizationId: string;
  probeId: string;
  tableName: string;
  actorTenant: string;
  targetTenant: string;
  policyName: string;
  selectDenied: boolean;
  insertDenied: boolean;
  updateDenied: boolean;
  deleteDenied: boolean;
  parameterBound: boolean;
  evidenceHash: string;
}

export interface M119MigrationRequest {
  organizationId: string;
  migrationId: string;
  fromVersion: string;
  toVersion: string;
  action: M119MigrationAction;
  dryRunPassed: boolean;
  backupHash: string;
  lockName: string;
  approvalPresent: boolean;
  downMigrationTested: boolean;
  noClobber: boolean;
}

export interface M119OutboxRecord {
  organizationId: string;
  outboxId: string;
  aggregateId: string;
  eventType: string;
  payloadHash: string;
  transactionId: string;
  idempotencyKey: string;
  attempts: number;
  published: boolean;
  payloadRedacted: boolean;
  createdAt: number;
}

export interface M119DurableDecision {
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

export function validateM119Transaction(tx: M119TransactionEnvelope): M119DurableDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[tx.organizationId, "organizationId"], [tx.transactionId, "transactionId"], [tx.actorHash, "actorHash"], [tx.requestId, "requestId"], [tx.idempotencyKey, "idempotencyKey"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!tx.tenantBound) reasons.push("transaction must be tenant-bound");
  if (!Number.isFinite(tx.startedAt)) reasons.push("transaction start time is invalid");
  if (tx.mode !== "read" && !tx.writeSetHash) reasons.push("write transaction needs a write-set hash");
  if (tx.committedAt !== undefined && tx.committedAt < tx.startedAt) reasons.push("commit time precedes transaction start");
  if (tx.rolledBack && tx.committedAt !== undefined) reasons.push("rolled-back transaction cannot be committed");
  if (tx.mode === "serializable" && tx.isolationLevel !== "serializable") reasons.push("serializable transaction needs serializable isolation");
  return { allowed: reasons.length === 0, reasons, requiresApproval: tx.mode !== "read", auditHash: hash(JSON.stringify({ tx, reasons })) };
}

export function validateM119RlsEvidence(evidence: M119RlsEvidence): M119DurableDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.probeId, "probeId"], [evidence.tableName, "tableName"], [evidence.actorTenant, "actorTenant"], [evidence.targetTenant, "targetTenant"], [evidence.policyName, "policyName"], [evidence.evidenceHash, "evidenceHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (evidence.actorTenant === evidence.targetTenant) reasons.push("RLS probe needs distinct actor and target tenants");
  if (!evidence.selectDenied || !evidence.insertDenied || !evidence.updateDenied || !evidence.deleteDenied || !evidence.parameterBound) reasons.push("RLS probe did not prove deny and parameter binding");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function decideM119Migration(request: M119MigrationRequest): M119DurableDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.migrationId, "migrationId"], [request.fromVersion, "fromVersion"], [request.toVersion, "toVersion"], [request.backupHash, "backupHash"], [request.lockName, "lockName"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (request.fromVersion === request.toVersion) reasons.push("migration must change schema version");
  if (!request.dryRunPassed || !request.noClobber) reasons.push("migration needs dry-run and no-clobber evidence");
  if (request.action !== "plan" && !request.approvalPresent) reasons.push("migration apply/rollback needs approval");
  if (request.action === "rollback" && !request.downMigrationTested) reasons.push("rollback needs tested down migration");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.action !== "plan", auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateM119Outbox(record: M119OutboxRecord): M119DurableDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[record.organizationId, "organizationId"], [record.outboxId, "outboxId"], [record.aggregateId, "aggregateId"], [record.eventType, "eventType"], [record.payloadHash, "payloadHash"], [record.transactionId, "transactionId"], [record.idempotencyKey, "idempotencyKey"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(record.attempts) || record.attempts < 0 || record.attempts > 10) reasons.push("outbox attempts must be bounded");
  if (!record.payloadRedacted) reasons.push("outbox payload must be redacted");
  if (!Number.isFinite(record.createdAt)) reasons.push("outbox createdAt is invalid");
  if (record.published && record.attempts === 0) reasons.push("published outbox needs a delivery attempt");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ record, reasons })) };
}
