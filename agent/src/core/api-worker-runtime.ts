/** M85 contracts for public API boundaries, worker leases, streams and job completion. */

export type ApiWorkerMethod = "GET" | "POST" | "PATCH" | "DELETE";
export type ApiWorkerTransport = "rest" | "trpc" | "sse" | "websocket";
export type WorkerJobState = "leased" | "running" | "succeeded" | "failed" | "retryable" | "dead_letter";

export interface PublicApiRequestContract {
  organizationId: string;
  requestId: string;
  route: string;
  method: ApiWorkerMethod;
  transport: ApiWorkerTransport;
  schemaHash: string;
  tenantHeaderPresent: boolean;
  authContextHash: string;
  idempotencyKey?: string;
  bodyHash?: string;
  localMode: boolean;
}

export interface WorkerLeaseContract {
  organizationId: string;
  jobId: string;
  workerId: string;
  leaseId: string;
  attempt: number;
  leasedAt: number;
  expiresAt: number;
  heartbeatAt: number;
  state: WorkerJobState;
  fencingToken: number;
}

export interface StreamSessionContract {
  organizationId: string;
  sessionId: string;
  runId: string;
  transport: "sse" | "websocket";
  cursor: number;
  resumeTokenHash: string;
  heartbeatAt: number;
  lastClientAck: number;
  outputRedacted: boolean;
  reconnectAllowed: boolean;
}

export interface JobCompletionEvidence {
  organizationId: string;
  jobId: string;
  attempt: number;
  state: "succeeded" | "failed" | "retryable";
  exitCode: number;
  outputHash: string;
  artifactHash?: string;
  errorClass?: string;
  cleanupPassed: boolean;
  secretScanPassed: boolean;
  acknowledged: boolean;
}

export interface ApiWorkerDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  auditHash: string;
}

export class ApiWorkerContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiWorkerContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

export function validatePublicApiRequest(request: PublicApiRequestContract): ApiWorkerDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.requestId, "requestId"], [request.route, "route"], [request.schemaHash, "schemaHash"], [request.authContextHash, "authContextHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!request.route.startsWith("/api/")) reasons.push("public route must use /api prefix");
  if (!request.tenantHeaderPresent) reasons.push("tenant header is required");
  if (["POST", "PATCH", "DELETE"].includes(request.method) && !request.idempotencyKey) reasons.push("mutating request requires idempotency key");
  if (["POST", "PATCH", "DELETE"].includes(request.method) && !request.bodyHash) reasons.push("mutating request requires body hash");
  if (request.transport === "websocket") reasons.push("websocket is not a declared public API transport");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.method !== "GET", auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateWorkerLease(lease: WorkerLeaseContract, now: number): ApiWorkerDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[lease.organizationId, "organizationId"], [lease.jobId, "jobId"], [lease.workerId, "workerId"], [lease.leaseId, "leaseId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isSafeInteger(lease.attempt) || lease.attempt < 1 || lease.attempt > 20) reasons.push("worker attempt is outside bounds");
  if (!Number.isSafeInteger(lease.fencingToken) || lease.fencingToken < 1) reasons.push("fencing token is invalid");
  if (!Number.isFinite(lease.leasedAt) || !Number.isFinite(lease.expiresAt) || lease.expiresAt <= lease.leasedAt) reasons.push("lease timestamps are invalid");
  if (lease.expiresAt <= now) reasons.push("worker lease is expired");
  if (lease.heartbeatAt < lease.leasedAt || lease.heartbeatAt > lease.expiresAt) reasons.push("heartbeat is outside lease interval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ lease, now, reasons })) };
}

export function decideApiStreamSession(session: StreamSessionContract, now: number): ApiWorkerDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[session.organizationId, "organizationId"], [session.sessionId, "sessionId"], [session.runId, "runId"], [session.resumeTokenHash, "resumeTokenHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isSafeInteger(session.cursor) || session.cursor < 0 || !Number.isSafeInteger(session.lastClientAck) || session.lastClientAck < 0 || session.lastClientAck > session.cursor) reasons.push("stream cursor/ack is invalid");
  if (!Number.isFinite(session.heartbeatAt) || session.heartbeatAt > now) reasons.push("stream heartbeat is invalid");
  if (!session.outputRedacted) reasons.push("stream output must be redacted");
  if (!session.reconnectAllowed) reasons.push("stream resume must be explicitly allowed");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ session, now, reasons })) };
}

export function validateJobCompletionEvidence(evidence: JobCompletionEvidence): ApiWorkerDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.jobId, "jobId"], [evidence.outputHash, "outputHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isSafeInteger(evidence.attempt) || evidence.attempt < 1) reasons.push("job attempt is invalid");
  if (evidence.state === "succeeded" && evidence.exitCode !== 0) reasons.push("successful job must have zero exit code");
  if (evidence.state !== "succeeded" && !evidence.errorClass) reasons.push("failed/retryable job needs error class");
  if (evidence.state === "succeeded" && !evidence.artifactHash) reasons.push("successful job needs artifact hash");
  if (!evidence.cleanupPassed || !evidence.secretScanPassed || !evidence.acknowledged) reasons.push("completion evidence is incomplete");
  return { allowed: reasons.length === 0, reasons, requiresApproval: evidence.state === "succeeded", auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
