/** Durable control-plane contracts for commands, events and API idempotency. No persistence or HTTP server lives here. */

export type ControlCommandType = "create_run" | "cancel_run" | "approve" | "retry" | "policy_change";
export type ControlEventType = "run.created" | "run.cancelled" | "approval.requested" | "approval.granted" | "policy.changed";

export interface ControlCommand {
  commandId: string;
  organizationId: string;
  actorId: string;
  type: ControlCommandType;
  contractVersion: string;
  idempotencyKey: string;
  payloadHash: string;
  issuedAt: number;
}

export interface ControlEvent {
  eventId: string;
  organizationId: string;
  aggregateId: string;
  sequence: number;
  type: ControlEventType;
  payloadHash: string;
  occurredAt: number;
  parentEventId?: string;
}

export interface ControlPlanePolicy {
  organizationId: string;
  allowedCommandTypes: ControlCommandType[];
  allowedEventTypes: ControlEventType[];
  maxClockSkewMs: number;
}

export interface ControlDecision {
  allowed: boolean;
  reasons: string[];
  idempotencyKey: string;
  decisionHash: string;
}

export class ControlPlaneContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ControlPlaneContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new ControlPlaneContractError(`${label} is required`);
}

export function decideControlCommand(command: ControlCommand, policy: ControlPlanePolicy, now: number): ControlDecision {
  for (const [value, label] of [[command.commandId, "commandId"], [command.organizationId, "organizationId"], [command.actorId, "actorId"], [command.contractVersion, "contractVersion"], [command.idempotencyKey, "idempotencyKey"], [command.payloadHash, "payloadHash"]] as const) required(value, label);
  if (!Number.isFinite(now) || !Number.isFinite(command.issuedAt) || now < command.issuedAt - policy.maxClockSkewMs) throw new ControlPlaneContractError("command is from the future");
  const reasons: string[] = [];
  if (command.organizationId !== policy.organizationId) reasons.push("command tenant mismatch");
  if (!policy.allowedCommandTypes.includes(command.type)) reasons.push("command type is not allowed");
  const body = { commandId: command.commandId, organizationId: command.organizationId, type: command.type, idempotencyKey: command.idempotencyKey, reasons };
  return { allowed: reasons.length === 0, reasons, idempotencyKey: command.idempotencyKey, decisionHash: hash(JSON.stringify(body)) };
}

export function planEventAppend(existing: readonly ControlEvent[], event: ControlEvent, policy: ControlPlanePolicy): ControlDecision {
  required(event.eventId, "eventId");
  required(event.organizationId, "organizationId");
  required(event.aggregateId, "aggregateId");
  required(event.payloadHash, "payloadHash");
  if (!Number.isInteger(event.sequence) || event.sequence < 1) throw new ControlPlaneContractError("event sequence must be positive");
  const reasons: string[] = [];
  if (event.organizationId !== policy.organizationId) reasons.push("event tenant mismatch");
  if (!policy.allowedEventTypes.includes(event.type)) reasons.push("event type is not allowed");
  const aggregateEvents = existing.filter((candidate) => candidate.organizationId === event.organizationId && candidate.aggregateId === event.aggregateId);
  const expectedSequence = (aggregateEvents.at(-1)?.sequence ?? 0) + 1;
  if (event.sequence !== expectedSequence) reasons.push(`event sequence must be ${expectedSequence}`);
  if (existing.some((candidate) => candidate.eventId === event.eventId)) reasons.push("event id already exists");
  return { allowed: reasons.length === 0, reasons, idempotencyKey: `event:${event.organizationId}:${event.aggregateId}:${event.sequence}`, decisionHash: hash(JSON.stringify({ event, reasons })) };
}
