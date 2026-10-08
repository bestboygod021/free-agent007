/** M168 fail-closed contracts for signed outbound webhooks and callback delivery. */

export type M168EndpointState = "pending" | "verified" | "disabled" | "revoked";
export type M168DeliveryState = "queued" | "delivered" | "retrying" | "dead";

export interface M168Endpoint {
  organizationId: string;
  endpointId: string;
  url: string;
  eventTypes: string[];
  state: M168EndpointState;
  secretReference: string;
  signatureAlgorithm: "hmac-sha256";
  verificationHash: string;
  approvalPresent: boolean;
  tenantBound: boolean;
  tlsVerified: boolean;
  allowlistVerified: boolean;
}

export interface M168Delivery {
  organizationId: string;
  endpointId: string;
  deliveryId: string;
  eventId: string;
  eventType: string;
  payloadHash: string;
  signatureHash: string;
  attempt: number;
  maxAttempts: number;
  state: M168DeliveryState;
  idempotencyKey: string;
  nextAttemptAt: number;
  redacted: boolean;
  tenantMatch: boolean;
}

export interface M168Response {
  deliveryId: string;
  statusCode: number;
  responseHash: string;
  receivedAt: number;
  signatureAccepted: boolean;
  replayDetected: boolean;
  retryAfterSeconds?: number;
}

export interface M168ReplayRequest {
  organizationId: string;
  endpointId: string;
  deliveryId: string;
  replayId: string;
  operatorReference: string;
  reasonHash: string;
  approvalPresent: boolean;
  bounded: boolean;
  redacted: boolean;
}

export interface M168WebhookDecision {
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

export function validateM168Endpoint(endpoint: M168Endpoint): M168WebhookDecision {
  const reasons: string[] = [];
  required([[endpoint.organizationId, "organizationId"], [endpoint.endpointId, "endpointId"], [endpoint.url, "url"], [endpoint.secretReference, "secretReference"], [endpoint.verificationHash, "verificationHash"]], reasons);
  if (!endpoint.url.startsWith("https://")) reasons.push("webhook endpoint must use HTTPS");
  if (endpoint.eventTypes.length === 0 || endpoint.eventTypes.some((event) => !event.trim())) reasons.push("event types are required");
  if (endpoint.state !== "verified" || endpoint.signatureAlgorithm !== "hmac-sha256" || !endpoint.approvalPresent || !endpoint.tenantBound || !endpoint.tlsVerified || !endpoint.allowlistVerified) reasons.push("endpoint needs verification, signature, approval, tenant and TLS gates");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ endpoint, reasons })) };
}

export function decideM168Delivery(delivery: M168Delivery, now: number): M168WebhookDecision {
  const reasons: string[] = [];
  required([[delivery.organizationId, "organizationId"], [delivery.endpointId, "endpointId"], [delivery.deliveryId, "deliveryId"], [delivery.eventId, "eventId"], [delivery.eventType, "eventType"], [delivery.payloadHash, "payloadHash"], [delivery.signatureHash, "signatureHash"], [delivery.idempotencyKey, "idempotencyKey"]], reasons);
  if (!Number.isInteger(delivery.attempt) || delivery.attempt < 1 || delivery.attempt > delivery.maxAttempts) reasons.push("delivery attempt is outside bound");
  if (!Number.isInteger(delivery.maxAttempts) || delivery.maxAttempts < 1 || delivery.maxAttempts > 10) reasons.push("max attempts are invalid");
  if (!Number.isFinite(delivery.nextAttemptAt) || delivery.nextAttemptAt < now) reasons.push("next attempt is in the past");
  if (!delivery.redacted || !delivery.tenantMatch) reasons.push("delivery must be redacted and tenant-bound");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ delivery, now, reasons })) };
}

export function validateM168Response(response: M168Response): M168WebhookDecision {
  const reasons: string[] = [];
  required([[response.deliveryId, "deliveryId"], [response.responseHash, "responseHash"]], reasons);
  if (!Number.isInteger(response.statusCode) || response.statusCode < 100 || response.statusCode > 599) reasons.push("status code is invalid");
  if (!Number.isFinite(response.receivedAt) || !response.signatureAccepted || response.replayDetected) reasons.push("response signature or replay gate failed");
  if (response.statusCode >= 500 && (!response.retryAfterSeconds || response.retryAfterSeconds < 1)) reasons.push("server failure needs retry-after");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ response, reasons })) };
}

export function decideM168Replay(replay: M168ReplayRequest): M168WebhookDecision {
  const reasons: string[] = [];
  required([[replay.organizationId, "organizationId"], [replay.endpointId, "endpointId"], [replay.deliveryId, "deliveryId"], [replay.replayId, "replayId"], [replay.operatorReference, "operatorReference"], [replay.reasonHash, "reasonHash"]], reasons);
  if (!replay.approvalPresent || !replay.bounded || !replay.redacted) reasons.push("replay needs approval, bound and redaction");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ replay, reasons })) };
}
