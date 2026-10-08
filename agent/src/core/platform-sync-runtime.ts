/** M52 contracts for webhook ingestion, cursors, delivery and cross-platform conflicts. */

import type { ConnectedPlatform } from "./platform-connection-runtime.js";

export type SyncEventKind = "repository_changed" | "issue_changed" | "message_received" | "document_changed" | "file_changed";
export type ConflictResolution = "source_wins" | "target_wins" | "manual_review" | "merge_preview";

export interface PlatformInboundEvent {
  organizationId: string;
  connectionId: string;
  platform: ConnectedPlatform;
  providerEventId: string;
  eventKind: SyncEventKind;
  payloadHash: string;
  signatureVerified: boolean;
  receivedAt: number;
  cursor: string;
  deliveryAttempt: number;
  replayed: boolean;
}

export interface PlatformSyncCursor {
  organizationId: string;
  connectionId: string;
  platform: ConnectedPlatform;
  cursor: string;
  lastProviderEventId: string;
  updatedAt: number;
  monotonic: boolean;
}

export interface PlatformConflict {
  organizationId: string;
  conflictId: string;
  sourceVersion: string;
  targetVersion: string;
  sourceHash: string;
  targetHash: string;
  resolution: ConflictResolution;
  approvalPresent: boolean;
}

export interface PlatformOutboundDelivery {
  organizationId: string;
  connectionId: string;
  platform: ConnectedPlatform;
  deliveryId: string;
  eventHash: string;
  idempotencyKey: string;
  attempt: number;
  maxAttempts: number;
  retryAfterMs?: number;
  egressConsent: boolean;
}

export interface PlatformSyncDecision {
  allowed: boolean;
  reasons: string[];
  deduplicated: boolean;
  auditHash: string;
}

export class PlatformSyncContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformSyncContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new PlatformSyncContractError(`${label} is required`);
}

export function decidePlatformInboundEvent(event: PlatformInboundEvent): PlatformSyncDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[event.organizationId, "organizationId"], [event.connectionId, "connectionId"], [event.providerEventId, "providerEventId"], [event.payloadHash, "payloadHash"], [event.cursor, "cursor"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!event.signatureVerified) reasons.push("inbound platform event signature is not verified");
  if (!Number.isFinite(event.receivedAt)) reasons.push("receivedAt must be finite");
  if (!Number.isInteger(event.deliveryAttempt) || event.deliveryAttempt < 1 || event.deliveryAttempt > 8) reasons.push("delivery attempt is outside bounds");
  return { allowed: reasons.length === 0, reasons, deduplicated: event.replayed, auditHash: hash(JSON.stringify({ event, reasons })) };
}

export function advancePlatformCursor(previous: PlatformSyncCursor, next: PlatformSyncCursor): PlatformSyncDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[next.organizationId, "organizationId"], [next.connectionId, "connectionId"], [next.cursor, "cursor"], [next.lastProviderEventId, "lastProviderEventId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (previous.organizationId !== next.organizationId || previous.connectionId !== next.connectionId) reasons.push("sync cursor scope cannot change");
  if (!next.monotonic) reasons.push("sync cursor must be monotonic");
  if (Number.isFinite(previous.updatedAt) && next.updatedAt < previous.updatedAt) reasons.push("sync cursor timestamp cannot move backwards");
  return { allowed: reasons.length === 0, reasons, deduplicated: false, auditHash: hash(JSON.stringify({ previous, next, reasons })) };
}

export function resolvePlatformConflict(conflict: PlatformConflict): PlatformSyncDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[conflict.organizationId, "organizationId"], [conflict.conflictId, "conflictId"], [conflict.sourceVersion, "sourceVersion"], [conflict.targetVersion, "targetVersion"], [conflict.sourceHash, "sourceHash"], [conflict.targetHash, "targetHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (conflict.resolution === "manual_review" && !conflict.approvalPresent) reasons.push("manual conflict resolution requires approval");
  if (conflict.sourceHash === conflict.targetHash) reasons.push("identical versions do not constitute a conflict");
  return { allowed: reasons.length === 0, reasons, deduplicated: false, auditHash: hash(JSON.stringify({ conflict, reasons })) };
}

export function validatePlatformOutboundDelivery(delivery: PlatformOutboundDelivery): PlatformSyncDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[delivery.organizationId, "organizationId"], [delivery.connectionId, "connectionId"], [delivery.deliveryId, "deliveryId"], [delivery.eventHash, "eventHash"], [delivery.idempotencyKey, "idempotencyKey"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(delivery.attempt) || delivery.attempt < 1 || delivery.attempt > delivery.maxAttempts) reasons.push("delivery attempt is invalid");
  if (!Number.isInteger(delivery.maxAttempts) || delivery.maxAttempts < 1 || delivery.maxAttempts > 8) reasons.push("max attempts are outside bounds");
  if (delivery.retryAfterMs !== undefined && (!Number.isInteger(delivery.retryAfterMs) || delivery.retryAfterMs < 0)) reasons.push("Retry-After is invalid");
  if (!delivery.egressConsent) reasons.push("outbound platform delivery requires egress consent");
  return { allowed: reasons.length === 0, reasons, deduplicated: false, auditHash: hash(JSON.stringify({ delivery, reasons })) };
}
