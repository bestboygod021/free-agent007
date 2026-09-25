/** M206 fail-closed contracts for region-bound processing and transfer decisions. */

export interface M206ProcessingRequest {
  organizationId: string;
  requestId: string;
  dataClass: string;
  subjectRegion: string;
  processingRegion: string;
  providerRegion: string;
  residencyPolicyHash: string;
  transferBasis: string;
  consentPresent: boolean;
  encryptedInTransit: boolean;
  encryptedAtRest: boolean;
  tenantBound: boolean;
}

export interface M206PlacementDecision {
  organizationId: string;
  placementId: string;
  requestId: string;
  allowedRegions: string[];
  selectedRegion: string;
  policyMatch: boolean;
  noCrossBoundary: boolean;
  providerDeclared: boolean;
  fallbackIsLocal: boolean;
  tenantMatch: boolean;
}

export interface M206TransferRequest {
  organizationId: string;
  transferId: string;
  sourceRegion: string;
  targetRegion: string;
  dataClass: string;
  legalBasisHash: string;
  safeguardsHash: string;
  approvalPresent: boolean;
  userVisible: boolean;
  minimized: boolean;
  tenantMatch: boolean;
}

export interface M206DeletionEvidence {
  organizationId: string;
  deletionId: string;
  subjectHash: string;
  regions: string[];
  stores: string[];
  evidenceHash: string;
  completedAt: number;
  residualCopies: number;
  legalHoldPresent: boolean;
  tenantMatch: boolean;
}

export interface M206ResidencyDecision {
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

export function validateM206Request(request: M206ProcessingRequest): M206ResidencyDecision {
  const reasons: string[] = [];
  required([[request.organizationId, "organizationId"], [request.requestId, "requestId"], [request.dataClass, "dataClass"], [request.subjectRegion, "subjectRegion"], [request.processingRegion, "processingRegion"], [request.providerRegion, "providerRegion"], [request.residencyPolicyHash, "residencyPolicyHash"], [request.transferBasis, "transferBasis"]], reasons);
  if (!request.consentPresent || !request.encryptedInTransit || !request.encryptedAtRest || !request.tenantBound) reasons.push("processing needs consent, transport/storage encryption and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function decideM206Placement(placement: M206PlacementDecision): M206ResidencyDecision {
  const reasons: string[] = [];
  required([[placement.organizationId, "organizationId"], [placement.placementId, "placementId"], [placement.requestId, "requestId"], [placement.selectedRegion, "selectedRegion"]], reasons);
  if (placement.allowedRegions.length === 0 || placement.allowedRegions.some((region) => !region.trim()) || !placement.allowedRegions.includes(placement.selectedRegion) || !placement.policyMatch || !placement.noCrossBoundary || !placement.providerDeclared || !placement.fallbackIsLocal || !placement.tenantMatch) reasons.push("placement needs an allowed declared region, policy match, boundary proof, local fallback and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ placement, reasons })) };
}

export function decideM206Transfer(transfer: M206TransferRequest): M206ResidencyDecision {
  const reasons: string[] = [];
  required([[transfer.organizationId, "organizationId"], [transfer.transferId, "transferId"], [transfer.sourceRegion, "sourceRegion"], [transfer.targetRegion, "targetRegion"], [transfer.dataClass, "dataClass"], [transfer.legalBasisHash, "legalBasisHash"], [transfer.safeguardsHash, "safeguardsHash"]], reasons);
  if (transfer.sourceRegion === transfer.targetRegion || !transfer.approvalPresent || !transfer.userVisible || !transfer.minimized || !transfer.tenantMatch) reasons.push("cross-region transfer needs distinct regions, legal approval, user visibility, minimization and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ transfer, reasons })) };
}

export function validateM206Deletion(evidence: M206DeletionEvidence): M206ResidencyDecision {
  const reasons: string[] = [];
  required([[evidence.organizationId, "organizationId"], [evidence.deletionId, "deletionId"], [evidence.subjectHash, "subjectHash"], [evidence.evidenceHash, "evidenceHash"]], reasons);
  if (evidence.regions.length === 0 || evidence.stores.length === 0 || evidence.regions.some((region) => !region.trim()) || evidence.stores.some((store) => !store.trim()) || !Number.isFinite(evidence.completedAt) || !Number.isInteger(evidence.residualCopies) || evidence.residualCopies !== 0 || evidence.legalHoldPresent || !evidence.tenantMatch) reasons.push("residency deletion needs region/store coverage, completion, zero residual copies and no legal hold");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
