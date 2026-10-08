/** M198 fail-closed contracts for model catalog freshness and capability disclosure. */

export type M198ModelMode = "local" | "free" | "byok" | "hosted";

export interface M198ModelRecord {
  organizationId: string;
  modelId: string;
  providerId: string;
  mode: M198ModelMode;
  capabilityClaims: string[];
  modelCardHash: string;
  license: string;
  dataPolicyHash: string;
  quotaRemaining: number;
  observedAt: number;
  expiresAt: number;
  verified: boolean;
  freeTierDisclosed: boolean;
  tenantBound: boolean;
}

export interface M198DiscoveryEvidence {
  organizationId: string;
  modelId: string;
  discoveryId: string;
  sourceHash: string;
  endpointReference: string;
  observedAt: number;
  modelCardHash: string;
  freeTierEvidenceHash: string;
  provenanceHash: string;
  redacted: boolean;
  approved: boolean;
  tenantMatch: boolean;
}

export interface M198ActivationDecision {
  organizationId: string;
  modelId: string;
  activationId: string;
  requestedCapability: string;
  modelFresh: boolean;
  capabilityProven: boolean;
  healthProven: boolean;
  budgetAvailable: boolean;
  consentPresent: boolean;
  fallbackMode: M198ModelMode;
  disclosurePresent: boolean;
  tenantMatch: boolean;
}

export interface M198Retirement {
  organizationId: string;
  modelId: string;
  retirementId: string;
  reasonHash: string;
  replacementModelId: string;
  migrationEvidenceHash: string;
  userDisclosed: boolean;
  trafficStopped: boolean;
  rollbackAvailable: boolean;
  approvalPresent: boolean;
  tenantMatch: boolean;
}

export interface M198CatalogDecision {
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

export function validateM198Model(record: M198ModelRecord, now: number): M198CatalogDecision {
  const reasons: string[] = [];
  required([[record.organizationId, "organizationId"], [record.modelId, "modelId"], [record.providerId, "providerId"], [record.modelCardHash, "modelCardHash"], [record.license, "license"], [record.dataPolicyHash, "dataPolicyHash"]], reasons);
  if (record.capabilityClaims.length === 0 || record.capabilityClaims.some((claim) => !claim.trim()) || !Number.isInteger(record.quotaRemaining) || record.quotaRemaining < 0 || !Number.isFinite(record.observedAt) || !Number.isFinite(record.expiresAt) || record.expiresAt <= record.observedAt || record.expiresAt <= now || !record.verified || !record.freeTierDisclosed || !record.tenantBound) reasons.push("model catalog record needs claims, quota, freshness, verification, disclosure and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: record.mode === "hosted", auditHash: hash(JSON.stringify({ record, now, reasons })) };
}

export function validateM198Discovery(evidence: M198DiscoveryEvidence, now: number): M198CatalogDecision {
  const reasons: string[] = [];
  required([[evidence.organizationId, "organizationId"], [evidence.modelId, "modelId"], [evidence.discoveryId, "discoveryId"], [evidence.sourceHash, "sourceHash"], [evidence.endpointReference, "endpointReference"], [evidence.modelCardHash, "modelCardHash"], [evidence.freeTierEvidenceHash, "freeTierEvidenceHash"], [evidence.provenanceHash, "provenanceHash"]], reasons);
  if (!Number.isFinite(evidence.observedAt) || evidence.observedAt > now || !evidence.redacted || !evidence.approved || !evidence.tenantMatch) reasons.push("model discovery needs bounded observation, provenance, redaction, approval and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ evidence, now, reasons })) };
}

export function decideM198Activation(activation: M198ActivationDecision): M198CatalogDecision {
  const reasons: string[] = [];
  required([[activation.organizationId, "organizationId"], [activation.modelId, "modelId"], [activation.activationId, "activationId"], [activation.requestedCapability, "requestedCapability"]], reasons);
  if (!activation.modelFresh || !activation.capabilityProven || !activation.healthProven || !activation.budgetAvailable || !activation.consentPresent || !activation.disclosurePresent || !activation.tenantMatch) reasons.push("model activation needs fresh card, capability, health, budget, consent, disclosure and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: activation.fallbackMode === "hosted", auditHash: hash(JSON.stringify({ activation, reasons })) };
}

export function decideM198Retirement(retirement: M198Retirement): M198CatalogDecision {
  const reasons: string[] = [];
  required([[retirement.organizationId, "organizationId"], [retirement.modelId, "modelId"], [retirement.retirementId, "retirementId"], [retirement.reasonHash, "reasonHash"], [retirement.replacementModelId, "replacementModelId"], [retirement.migrationEvidenceHash, "migrationEvidenceHash"]], reasons);
  if (!retirement.userDisclosed || !retirement.trafficStopped || !retirement.rollbackAvailable || !retirement.approvalPresent || !retirement.tenantMatch) reasons.push("model retirement needs disclosure, stopped traffic, rollback, approval and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ retirement, reasons })) };
}
