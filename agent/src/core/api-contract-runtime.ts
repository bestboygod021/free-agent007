/** M104 contracts for versioned API surfaces, error taxonomy, SSE reconnect and rate limits. */

export type ApiProtocol = "rest" | "sse" | "webhook" | "cli";
export type ApiLifecycle = "experimental" | "stable" | "deprecated";
export type ApiErrorClass = "validation" | "authentication" | "authorization" | "rate_limit" | "conflict" | "internal";

export interface ApiVersionContract {
  organizationId: string;
  apiId: string;
  protocol: ApiProtocol;
  version: string;
  operation: string;
  lifecycle: ApiLifecycle;
  requestSchemaHash: string;
  responseSchemaHash: string;
  compatibilityWindowDays: number;
  deprecationDate?: number;
  documented: boolean;
  tenantScoped: boolean;
}

export interface ApiErrorContract {
  organizationId: string;
  errorId: string;
  code: string;
  class: ApiErrorClass;
  httpStatus: number;
  retryable: boolean;
  publicMessage: string;
  internalDetailHash: string;
  correlationId: string;
  secretRedacted: boolean;
}

export interface SseReconnectRequest {
  organizationId: string;
  streamId: string;
  lastEventId: string;
  protocolVersion: string;
  tenantMatch: boolean;
  cursorExpired: boolean;
  eventsRedacted: boolean;
  replayLimit: number;
  terminalEventSeen: boolean;
}

export interface ApiRateLimitEvidence {
  organizationId: string;
  subjectHash: string;
  bucket: "user" | "organization" | "ip" | "connector";
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterMs?: number;
  headersEmitted: boolean;
  requestCost: number;
}

export interface ApiContractDecision {
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

export function validateM104ApiVersion(contract: ApiVersionContract): ApiContractDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[contract.organizationId, "organizationId"], [contract.apiId, "apiId"], [contract.version, "version"], [contract.operation, "operation"], [contract.requestSchemaHash, "requestSchemaHash"], [contract.responseSchemaHash, "responseSchemaHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(contract.compatibilityWindowDays) || contract.compatibilityWindowDays < 0) reasons.push("compatibility window must be non-negative");
  if (contract.lifecycle === "deprecated" && !Number.isFinite(contract.deprecationDate)) reasons.push("deprecated API needs a deprecation date");
  if (!contract.documented || !contract.tenantScoped) reasons.push("API needs documentation and an explicit tenant boundary");
  if (contract.protocol === "sse" && contract.operation !== "stream") reasons.push("SSE contract operation must be stream");
  return { allowed: reasons.length === 0, reasons, requiresApproval: contract.lifecycle !== "experimental", auditHash: hash(JSON.stringify({ contract, reasons })) };
}

export function validateM104ApiError(error: ApiErrorContract): ApiContractDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[error.organizationId, "organizationId"], [error.errorId, "errorId"], [error.code, "code"], [error.publicMessage, "publicMessage"], [error.internalDetailHash, "internalDetailHash"], [error.correlationId, "correlationId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(error.httpStatus) || error.httpStatus < 400 || error.httpStatus > 599) reasons.push("error HTTP status must be four hundred through five hundred ninety-nine");
  if (error.class === "rate_limit" && !error.retryable) reasons.push("rate limit errors must be retryable or explicitly held");
  if (error.class === "validation" && error.retryable) reasons.push("validation errors must not be retried automatically");
  if (!error.secretRedacted) reasons.push("public error must be secret-redacted");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ error, reasons })) };
}

export function decideM104SseReconnect(request: SseReconnectRequest): ApiContractDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.streamId, "streamId"], [request.lastEventId, "lastEventId"], [request.protocolVersion, "protocolVersion"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!request.tenantMatch) reasons.push("SSE reconnect crosses tenant boundary");
  if (request.cursorExpired) reasons.push("SSE cursor has expired and needs a fresh snapshot");
  if (!request.eventsRedacted) reasons.push("replayed events must be redacted");
  if (!Number.isInteger(request.replayLimit) || request.replayLimit < 1 || request.replayLimit > 1000) reasons.push("replay limit must be between one and one thousand");
  if (request.terminalEventSeen) reasons.push("terminal stream cannot reconnect");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function decideM104RateLimit(evidence: ApiRateLimitEvidence): ApiContractDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.subjectHash, "subjectHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(evidence.limit) || evidence.limit < 1) reasons.push("rate limit must be positive");
  if (!Number.isInteger(evidence.remaining) || evidence.remaining < 0 || evidence.remaining > evidence.limit) reasons.push("remaining quota is invalid");
  if (!Number.isFinite(evidence.resetAt)) reasons.push("resetAt is required");
  if (!Number.isInteger(evidence.requestCost) || evidence.requestCost < 1) reasons.push("request cost must be positive");
  if (evidence.remaining === 0 && (!evidence.headersEmitted || !Number.isFinite(evidence.retryAfterMs))) reasons.push("exhausted bucket needs rate-limit headers and Retry-After");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
