/** M90 contracts for durable entities, event storage, migrations and governed search. */

export type DurableEntityState = "active" | "soft_deleted" | "archived";
export type DurableMigrationAction = "dry_run" | "apply" | "rollback";
export type DurableSearchDataset = "project" | "run" | "event" | "artifact";

export interface DurableEntityEnvelope {
  organizationId: string;
  entityId: string;
  entityType: string;
  version: number;
  state: DurableEntityState;
  payloadHash: string;
  createdAt: number;
  updatedAt: number;
  piiRedacted: boolean;
  idempotencyKey: string;
}

export interface DurableEventRecord {
  organizationId: string;
  eventId: string;
  entityId: string;
  eventType: string;
  sequence: number;
  payloadHash: string;
  previousEventHash?: string;
  retentionClass: "short" | "standard" | "audit";
  appendedAt: number;
  appendOnly: boolean;
}

export interface DurableMigrationRequest {
  organizationId: string;
  migrationId: string;
  fromVersion: string;
  toVersion: string;
  action: DurableMigrationAction;
  dryRunPassed: boolean;
  backupHash: string;
  lockAcquired: boolean;
  approvalPresent: boolean;
}

export interface DurableSearchRequest {
  organizationId: string;
  requesterId: string;
  dataset: DurableSearchDataset;
  queryHash: string;
  projectId?: string;
  runId?: string;
  maxResults: number;
  aclChecked: boolean;
  tenantScoped: boolean;
  exportRequested: boolean;
}

export interface DurableDataDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  auditHash: string;
}

export class DurableDataPlaneContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DurableDataPlaneContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

export function validateDurableEntity(entity: DurableEntityEnvelope): DurableDataDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[entity.organizationId, "organizationId"], [entity.entityId, "entityId"], [entity.entityType, "entityType"], [entity.payloadHash, "payloadHash"], [entity.idempotencyKey, "idempotencyKey"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isSafeInteger(entity.version) || entity.version < 1) reasons.push("entity version is invalid");
  if (!Number.isFinite(entity.createdAt) || !Number.isFinite(entity.updatedAt) || entity.updatedAt < entity.createdAt) reasons.push("entity timestamps are invalid");
  if (!entity.piiRedacted) reasons.push("durable entity payload must be redacted");
  return { allowed: reasons.length === 0, reasons, requiresApproval: entity.state !== "active", auditHash: hash(JSON.stringify({ entity, reasons })) };
}

export function validateDurableEvent(event: DurableEventRecord): DurableDataDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[event.organizationId, "organizationId"], [event.eventId, "eventId"], [event.entityId, "entityId"], [event.eventType, "eventType"], [event.payloadHash, "payloadHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 0) reasons.push("event sequence is invalid");
  if (!event.appendOnly) reasons.push("event store must be append-only");
  if (!Number.isFinite(event.appendedAt)) reasons.push("event timestamp is invalid");
  if (event.retentionClass === "audit" && !event.previousEventHash) reasons.push("audit event needs chain predecessor hash");
  return { allowed: reasons.length === 0, reasons, requiresApproval: event.retentionClass === "audit", auditHash: hash(JSON.stringify({ event, reasons })) };
}

export function decideDurableMigration(request: DurableMigrationRequest): DurableDataDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.migrationId, "migrationId"], [request.fromVersion, "fromVersion"], [request.toVersion, "toVersion"], [request.backupHash, "backupHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (request.fromVersion === request.toVersion) reasons.push("migration must change version");
  if (!request.dryRunPassed) reasons.push("migration dry-run must pass");
  if (!request.lockAcquired) reasons.push("migration lock is required");
  if (request.action !== "dry_run" && !request.approvalPresent) reasons.push("migration apply/rollback requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.action !== "dry_run", auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function decideDurableSearch(request: DurableSearchRequest): DurableDataDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.requesterId, "requesterId"], [request.queryHash, "queryHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isSafeInteger(request.maxResults) || request.maxResults < 1 || request.maxResults > 10_000) reasons.push("search result limit is outside bounds");
  if (!request.aclChecked || !request.tenantScoped) reasons.push("search requires ACL and tenant scope");
  if (request.exportRequested) reasons.push("search export requires a separate approval boundary");
  if (request.dataset === "run" && !request.runId) reasons.push("run search requires run id");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.exportRequested, auditHash: hash(JSON.stringify({ request, reasons })) };
}
