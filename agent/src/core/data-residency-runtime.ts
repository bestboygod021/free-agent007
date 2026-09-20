/** M159 fail-closed contracts for data residency and cross-border transfer. */

export type M159Region = "us-west" | "us-east" | "eu-central" | "ap-southeast" | "local";
export type M159Classification = "public" | "internal" | "confidential" | "restricted";

export interface M159ResidencyPolicy {
  organizationId: string;
  policyId: string;
  allowedRegions: M159Region[];
  defaultRegion: M159Region;
  classifications: M159Classification[];
  crossBorderAllowed: boolean;
  approvalPresent: boolean;
  legalBasisHash: string;
  tenantScoped: boolean;
  effectiveAt: number;
}

export interface M159Placement {
  organizationId: string;
  placementId: string;
  datasetReference: string;
  classification: M159Classification;
  requestedRegion: M159Region;
  policyId: string;
  encrypted: boolean;
  tenantBound: boolean;
  retentionPolicyHash: string;
  approvalPresent: boolean;
}

export interface M159Transfer {
  organizationId: string;
  transferId: string;
  datasetReference: string;
  sourceRegion: M159Region;
  destinationRegion: M159Region;
  classification: M159Classification;
  purpose: string;
  legalBasisHash: string;
  destinationApproved: boolean;
  encryptedInTransit: boolean;
  redacted: boolean;
  tenantMatch: boolean;
}

export interface M159Deletion {
  organizationId: string;
  deletionId: string;
  datasetReference: string;
  regions: M159Region[];
  proofHash: string;
  legalHold: boolean;
  approvalPresent: boolean;
  replicasEnumerated: boolean;
  completedAt?: number;
}

export interface M159ResidencyDecision {
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

export function validateM159Policy(policy: M159ResidencyPolicy): M159ResidencyDecision {
  const reasons: string[] = [];
  required([[policy.organizationId, "organizationId"], [policy.policyId, "policyId"], [policy.legalBasisHash, "legalBasisHash"]], reasons);
  if (policy.allowedRegions.length === 0 || !policy.allowedRegions.includes(policy.defaultRegion)) reasons.push("default region must be allowed");
  if (policy.classifications.length === 0) reasons.push("policy needs classifications");
  if (!policy.approvalPresent || !policy.tenantScoped || !Number.isFinite(policy.effectiveAt)) reasons.push("policy needs approval, tenant scope and effective time");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ policy, reasons })) };
}

export function decideM159Placement(placement: M159Placement, policy: M159ResidencyPolicy): M159ResidencyDecision {
  const reasons: string[] = [];
  required([[placement.organizationId, "organizationId"], [placement.placementId, "placementId"], [placement.datasetReference, "datasetReference"], [placement.policyId, "policyId"], [placement.retentionPolicyHash, "retentionPolicyHash"]], reasons);
  if (placement.organizationId !== policy.organizationId || placement.policyId !== policy.policyId) reasons.push("placement does not match policy tenant");
  if (!policy.allowedRegions.includes(placement.requestedRegion)) reasons.push("requested region is not allowed");
  if (!policy.classifications.includes(placement.classification)) reasons.push("classification is not covered");
  if (!placement.encrypted || !placement.tenantBound || !placement.approvalPresent) reasons.push("placement needs encryption, tenant binding and approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ placement, policyId: policy.policyId, reasons })) };
}

export function validateM159Transfer(transfer: M159Transfer, policy: M159ResidencyPolicy): M159ResidencyDecision {
  const reasons: string[] = [];
  required([[transfer.organizationId, "organizationId"], [transfer.transferId, "transferId"], [transfer.datasetReference, "datasetReference"], [transfer.purpose, "purpose"], [transfer.legalBasisHash, "legalBasisHash"]], reasons);
  if (transfer.organizationId !== policy.organizationId || transfer.legalBasisHash !== policy.legalBasisHash) reasons.push("transfer policy binding is invalid");
  if (!policy.crossBorderAllowed && transfer.sourceRegion !== transfer.destinationRegion) reasons.push("cross-border transfer is prohibited");
  if (!policy.allowedRegions.includes(transfer.destinationRegion) || !transfer.destinationApproved) reasons.push("destination region is not approved");
  if (!transfer.encryptedInTransit || !transfer.redacted || !transfer.tenantMatch) reasons.push("transfer needs encryption, redaction and tenant match");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ transfer, policyId: policy.policyId, reasons })) };
}

export function decideM159Deletion(deletion: M159Deletion): M159ResidencyDecision {
  const reasons: string[] = [];
  required([[deletion.organizationId, "organizationId"], [deletion.deletionId, "deletionId"], [deletion.datasetReference, "datasetReference"], [deletion.proofHash, "proofHash"]], reasons);
  if (deletion.regions.length === 0 || !deletion.replicasEnumerated) reasons.push("all replicas and regions must be enumerated");
  if (deletion.legalHold) reasons.push("deletion is blocked by legal hold");
  if (!deletion.approvalPresent) reasons.push("deletion needs approval");
  if (deletion.completedAt !== undefined && !Number.isFinite(deletion.completedAt)) reasons.push("completedAt is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ deletion, reasons })) };
}
