/** M50 contracts for capability negotiation and normalized cross-platform actions. */

import type { ConnectedPlatform } from "./platform-connection-runtime.js";

export type PlatformOperation = "repository_read" | "issue_read" | "issue_write" | "message_read" | "message_send" | "document_read" | "document_write" | "file_read" | "file_write" | "webhook_subscribe";
export type CapabilityRisk = "read" | "write" | "admin";

export interface ConnectorCapabilityManifest {
  platform: ConnectedPlatform;
  adapterId: string;
  adapterVersion: string;
  supportedOperations: readonly PlatformOperation[];
  operationScopes: Record<string, string[]>;
  riskByOperation: Record<string, CapabilityRisk>;
  sandboxed: boolean;
  source: "built_in" | "reviewed_plugin" | "local";
}

export interface CapabilityNegotiationRequest {
  organizationId: string;
  connectionId: string;
  platform: ConnectedPlatform;
  requestedOperations: PlatformOperation[];
  grantedScopes: string[];
  manifest: ConnectorCapabilityManifest;
  userConsentPresent: boolean;
}

export interface UnifiedPlatformAction {
  organizationId: string;
  userId: string;
  connectionId: string;
  platform: ConnectedPlatform;
  operation: PlatformOperation;
  resourceReference: string;
  idempotencyKey: string;
  approvalPresent: boolean;
  egressConsent: boolean;
}

export interface UnifiedConnectorDecision {
  allowed: boolean;
  reasons: string[];
  normalizedOperation: PlatformOperation;
  auditHash: string;
}

export class UnifiedConnectorContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnifiedConnectorContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new UnifiedConnectorContractError(`${label} is required`);
}

export function validateConnectorCapabilityManifest(manifest: ConnectorCapabilityManifest): UnifiedConnectorDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[manifest.adapterId, "adapterId"], [manifest.adapterVersion, "adapterVersion"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (manifest.supportedOperations.length === 0 || new Set(manifest.supportedOperations).size !== manifest.supportedOperations.length) reasons.push("supported operations must be non-empty and unique");
  for (const operation of manifest.supportedOperations) {
    if (!manifest.operationScopes[operation] || manifest.operationScopes[operation].length === 0) reasons.push(`operation scope is missing: ${operation}`);
    if (!manifest.riskByOperation[operation]) reasons.push(`operation risk is missing: ${operation}`);
  }
  if (!manifest.sandboxed && manifest.source === "reviewed_plugin") reasons.push("reviewed plugin must execute in a sandbox");
  return { allowed: reasons.length === 0, reasons, normalizedOperation: manifest.supportedOperations[0] ?? "repository_read", auditHash: hash(JSON.stringify({ manifest, reasons })) };
}

export function negotiateConnectorCapabilities(request: CapabilityNegotiationRequest): UnifiedConnectorDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.connectionId, "connectionId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (request.platform !== request.manifest.platform) reasons.push("connection platform does not match adapter manifest");
  for (const operation of request.requestedOperations) {
    if (!request.manifest.supportedOperations.includes(operation)) reasons.push(`operation is not supported: ${operation}`);
    for (const scope of request.manifest.operationScopes[operation] ?? []) if (!request.grantedScopes.includes(scope)) reasons.push(`scope is not granted for ${operation}: ${scope}`);
  }
  if (!request.userConsentPresent) reasons.push("capability negotiation requires user consent");
  return { allowed: reasons.length === 0, reasons, normalizedOperation: request.requestedOperations[0] ?? "repository_read", auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function decideUnifiedPlatformAction(action: UnifiedPlatformAction, manifest: ConnectorCapabilityManifest): UnifiedConnectorDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[action.organizationId, "organizationId"], [action.userId, "userId"], [action.connectionId, "connectionId"], [action.resourceReference, "resourceReference"], [action.idempotencyKey, "idempotencyKey"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (action.platform !== manifest.platform) reasons.push("action platform does not match adapter");
  if (!manifest.supportedOperations.includes(action.operation)) reasons.push("operation is not supported by adapter");
  const risk = manifest.riskByOperation[action.operation];
  if (risk === "write" || risk === "admin") {
    if (!action.approvalPresent) reasons.push("write or admin operation requires approval");
    if (!action.egressConsent) reasons.push("external platform action requires egress consent");
  }
  return { allowed: reasons.length === 0, reasons, normalizedOperation: action.operation, auditHash: hash(JSON.stringify({ action, manifest, reasons })) };
}

export function mapPlatformResource(platform: ConnectedPlatform, operation: PlatformOperation, externalId: string): UnifiedConnectorDecision {
  required(externalId, "externalId");
  const reasons: string[] = [];
  if (platform === "custom" && !externalId.startsWith("custom:")) reasons.push("custom platform resource must use an opaque custom reference");
  return { allowed: reasons.length === 0, reasons, normalizedOperation: operation, auditHash: hash(JSON.stringify({ platform, operation, externalId, reasons })) };
}
