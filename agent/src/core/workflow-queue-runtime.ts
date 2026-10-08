/** M100 contracts for durable workflow scheduling, worker leases and trigger safety. */

export type WorkflowTriggerKind = "event" | "cron" | "manual" | "webhook";
export type WorkflowJobState = "queued" | "leased" | "retryable" | "dead_letter" | "completed";

export interface WorkflowTriggerContract {
  organizationId: string;
  triggerId: string;
  workflowId: string;
  kind: WorkflowTriggerKind;
  eventType: string;
  schedule?: string;
  sourceAllowlisted: boolean;
  consentPresent: boolean;
  enabled: boolean;
  dedupeKey: string;
  maxConcurrency: number;
  payloadSchemaHash: string;
}

export interface DurableWorkflowJob {
  organizationId: string;
  jobId: string;
  workflowId: string;
  triggerId: string;
  state: WorkflowJobState;
  payloadHash: string;
  idempotencyKey: string;
  attempt: number;
  maxAttempts: number;
  leaseOwnerHash?: string;
  leaseExpiresAt?: number;
  notBefore: number;
  priority: number;
  traceId: string;
}

export interface WorkflowRetryDecisionRequest {
  organizationId: string;
  jobId: string;
  attempt: number;
  maxAttempts: number;
  errorClass: "rate_limit" | "transient" | "timeout" | "validation" | "policy";
  retryAfterMs?: number;
  idempotent: boolean;
  sideEffectCommitted: boolean;
}

export interface WorkflowDeadLetterEvidence {
  organizationId: string;
  jobId: string;
  finalAttempt: number;
  failureHash: string;
  payloadRedacted: boolean;
  replayRequiresApproval: boolean;
  operatorHash?: string;
}

export interface WorkflowQueueDecision {
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

export function validateWorkflowTrigger(trigger: WorkflowTriggerContract): WorkflowQueueDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[trigger.organizationId, "organizationId"], [trigger.triggerId, "triggerId"], [trigger.workflowId, "workflowId"], [trigger.eventType, "eventType"], [trigger.dedupeKey, "dedupeKey"], [trigger.payloadSchemaHash, "payloadSchemaHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (trigger.kind === "cron" && !trigger.schedule?.trim()) reasons.push("cron trigger requires a schedule");
  if (trigger.kind !== "cron" && trigger.schedule) reasons.push("only cron triggers may define a schedule");
  if (!trigger.sourceAllowlisted || !trigger.consentPresent || !trigger.enabled) reasons.push("trigger source, consent and enabled evidence are required");
  if (!Number.isInteger(trigger.maxConcurrency) || trigger.maxConcurrency < 1 || trigger.maxConcurrency > 32) reasons.push("trigger concurrency must be between one and thirty-two");
  return { allowed: reasons.length === 0, reasons, requiresApproval: trigger.kind === "webhook", auditHash: hash(JSON.stringify({ trigger, reasons })) };
}

export function decideWorkflowJobLease(job: DurableWorkflowJob, now = Date.now()): WorkflowQueueDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[job.organizationId, "organizationId"], [job.jobId, "jobId"], [job.workflowId, "workflowId"], [job.triggerId, "triggerId"], [job.payloadHash, "payloadHash"], [job.idempotencyKey, "idempotencyKey"], [job.traceId, "traceId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (job.state !== "queued" && job.state !== "retryable") reasons.push("only queued or retryable jobs can be leased");
  if (!Number.isInteger(job.attempt) || job.attempt < 0 || job.attempt >= job.maxAttempts) reasons.push("job attempt is outside its retry budget");
  if (!Number.isInteger(job.maxAttempts) || job.maxAttempts < 1 || job.maxAttempts > 10) reasons.push("maxAttempts must be between one and ten");
  if (!Number.isFinite(job.notBefore) || job.notBefore > now) reasons.push("job is not ready to run");
  if (job.leaseExpiresAt !== undefined && job.leaseExpiresAt > now) reasons.push("job already has an active lease");
  if (job.state === "leased" && !job.leaseOwnerHash) reasons.push("leased job requires an owner hash");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ job, reasons })) };
}

export function decideWorkflowRetry(request: WorkflowRetryDecisionRequest): WorkflowQueueDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.jobId, "jobId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(request.attempt) || request.attempt < 1) reasons.push("attempt must be positive after a failure");
  if (!Number.isInteger(request.maxAttempts) || request.attempt > request.maxAttempts) reasons.push("retry budget is exhausted");
  if (request.errorClass === "validation" || request.errorClass === "policy") reasons.push("validation and policy failures are not retryable");
  if (!request.idempotent && request.sideEffectCommitted) reasons.push("non-idempotent committed side effect cannot be automatically retried");
  if (request.errorClass === "rate_limit" && (!Number.isFinite(request.retryAfterMs) || request.retryAfterMs! < 0)) reasons.push("rate-limit retry requires a valid Retry-After delay");
  return { allowed: reasons.length === 0, reasons, requiresApproval: !request.idempotent, auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateWorkflowDeadLetter(evidence: WorkflowDeadLetterEvidence): WorkflowQueueDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.jobId, "jobId"], [evidence.failureHash, "failureHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(evidence.finalAttempt) || evidence.finalAttempt < 1) reasons.push("dead-letter attempt must be positive");
  if (!evidence.payloadRedacted) reasons.push("dead-letter payload must be redacted");
  if (evidence.replayRequiresApproval && !evidence.operatorHash) reasons.push("approved replay needs an operator hash");
  return { allowed: reasons.length === 0, reasons, requiresApproval: evidence.replayRequiresApproval, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
