/** M129 contracts for versioned API evolution, errors, stream resume and migration. */

export type M129Protocol = "rest" | "sse" | "webhook" | "cli";
export type M129Lifecycle = "experimental" | "stable" | "deprecated";
export type M129ErrorClass = "validation" | "authentication" | "authorization" | "rate_limit" | "conflict" | "internal";

export interface M129ApiContract {
  organizationId: string;
  apiId: string;
  protocol: M129Protocol;
  version: string;
  operation: string;
  lifecycle: M129Lifecycle;
  requestSchemaHash: string;
  responseSchemaHash: string;
  tenantScoped: boolean;
  documented: boolean;
  backwardsCompatible: boolean;
  compatibilityWindowDays: number;
  deprecationDate?: number;
}

export interface M129ErrorEnvelope {
  organizationId: string;
  errorId: string;
  code: string;
  class: M129ErrorClass;
  httpStatus: number;
  retryable: boolean;
  publicMessage: string;
  internalDetailHash: string;
  correlationId: string;
  redacted: boolean;
}

export interface M129StreamResumeRequest {
  organizationId: string;
  streamId: string;
  lastEventId: string;
  protocolVersion: string;
  tenantMatch: boolean;
  cursorExpired: boolean;
  replayLimit: number;
  eventsRedacted: boolean;
  terminalEventSeen: boolean;
}

export interface M129MigrationPlan {
  organizationId: string;
  apiId: string;
  fromVersion: string;
  toVersion: string;
  breakingChanges: boolean;
  compatibilityWindowDays: number;
  migrationGuideHash: string;
  consumerTestHash: string;
  rollbackTested: boolean;
  approvalPresent: boolean;
  noSilentBreakingChange: boolean;
}

export interface M129ApiDecision {
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

export function validateM129ApiContract(contract: M129ApiContract): M129ApiDecision {
  const reasons: string[] = [];
  required([[contract.organizationId, "organizationId"], [contract.apiId, "apiId"], [contract.version, "version"], [contract.operation, "operation"], [contract.requestSchemaHash, "requestSchemaHash"], [contract.responseSchemaHash, "responseSchemaHash"]], reasons);
  if (!contract.tenantScoped || !contract.documented) reasons.push("API needs documentation and an explicit tenant boundary");
  if (!Number.isInteger(contract.compatibilityWindowDays) || contract.compatibilityWindowDays < 0) reasons.push("compatibility window must be non-negative");
  if (contract.lifecycle === "deprecated" && !Number.isFinite(contract.deprecationDate)) reasons.push("deprecated API needs a deprecation date");
  if (contract.protocol === "sse" && contract.operation !== "stream") reasons.push("SSE contract operation must be stream");
  return { allowed: reasons.length === 0, reasons, requiresApproval: contract.lifecycle !== "experimental", auditHash: hash(JSON.stringify({ contract, reasons })) };
}

export function validateM129Error(error: M129ErrorEnvelope): M129ApiDecision {
  const reasons: string[] = [];
  required([[error.organizationId, "organizationId"], [error.errorId, "errorId"], [error.code, "code"], [error.publicMessage, "publicMessage"], [error.internalDetailHash, "internalDetailHash"], [error.correlationId, "correlationId"]], reasons);
  if (!Number.isInteger(error.httpStatus) || error.httpStatus < 400 || error.httpStatus > 599) reasons.push("error HTTP status must be between 400 and 599");
  if (error.class === "validation" && error.retryable) reasons.push("validation errors must not be retried automatically");
  if (error.class === "rate_limit" && !error.retryable) reasons.push("rate-limit errors need retry or explicit hold semantics");
  if (!error.redacted) reasons.push("public error must be redacted");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ error, reasons })) };
}

export function decideM129StreamResume(request: M129StreamResumeRequest): M129ApiDecision {
  const reasons: string[] = [];
  required([[request.organizationId, "organizationId"], [request.streamId, "streamId"], [request.lastEventId, "lastEventId"], [request.protocolVersion, "protocolVersion"]], reasons);
  if (!request.tenantMatch) reasons.push("stream resume crosses tenant boundary");
  if (request.cursorExpired) reasons.push("stream cursor expired; fresh snapshot is required");
  if (!request.eventsRedacted) reasons.push("replayed events must be redacted");
  if (!Number.isInteger(request.replayLimit) || request.replayLimit < 1 || request.replayLimit > 1000) reasons.push("replay limit must be between one and one thousand");
  if (request.terminalEventSeen) reasons.push("terminal stream cannot resume");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function decideM129Migration(plan: M129MigrationPlan): M129ApiDecision {
  const reasons: string[] = [];
  required([[plan.organizationId, "organizationId"], [plan.apiId, "apiId"], [plan.fromVersion, "fromVersion"], [plan.toVersion, "toVersion"], [plan.migrationGuideHash, "migrationGuideHash"], [plan.consumerTestHash, "consumerTestHash"]], reasons);
  if (plan.fromVersion === plan.toVersion) reasons.push("migration must change API version");
  if (!Number.isInteger(plan.compatibilityWindowDays) || plan.compatibilityWindowDays < 0) reasons.push("migration compatibility window is invalid");
  if (plan.breakingChanges && plan.compatibilityWindowDays < 1) reasons.push("breaking API needs a compatibility window");
  if (!plan.rollbackTested || !plan.noSilentBreakingChange) reasons.push("migration needs rollback and explicit breaking-change evidence");
  if (plan.breakingChanges && !plan.approvalPresent) reasons.push("breaking migration needs approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: plan.breakingChanges, auditHash: hash(JSON.stringify({ plan, reasons })) };
}
