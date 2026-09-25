/** M161 fail-closed contracts for workload identity and service-account leases. */

export type M161IdentityKind = "service" | "worker" | "connector" | "cli";
export type M161LeaseState = "active" | "expired" | "revoked";

export interface M161WorkloadIdentity {
  organizationId: string;
  identityId: string;
  kind: M161IdentityKind;
  subjectReference: string;
  issuerReference: string;
  audience: string;
  scopes: string[];
  state: M161LeaseState;
  tenantBound: boolean;
  proofHash: string;
  approvalPresent: boolean;
  humanOwned: boolean;
}

export interface M161CredentialLease {
  organizationId: string;
  identityId: string;
  leaseId: string;
  credentialReference: string;
  issuedAt: number;
  expiresAt: number;
  scopes: string[];
  state: M161LeaseState;
  rawCredentialStored: boolean;
  renewable: boolean;
  idempotencyKey: string;
}

export interface M161Binding {
  organizationId: string;
  bindingId: string;
  identityId: string;
  resourceReference: string;
  actions: string[];
  conditionsHash: string;
  tenantMatch: boolean;
  leastPrivilege: boolean;
  approvalPresent: boolean;
  expiresAt: number;
}

export interface M161Rotation {
  organizationId: string;
  identityId: string;
  oldLeaseId: string;
  newLeaseId: string;
  reasonHash: string;
  oldRevoked: boolean;
  overlapSeconds: number;
  evidenceHash: string;
}

export interface M161IdentityDecision {
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

export function validateM161Identity(identity: M161WorkloadIdentity): M161IdentityDecision {
  const reasons: string[] = [];
  required([[identity.organizationId, "organizationId"], [identity.identityId, "identityId"], [identity.subjectReference, "subjectReference"], [identity.issuerReference, "issuerReference"], [identity.audience, "audience"], [identity.proofHash, "proofHash"]], reasons);
  if (identity.scopes.length === 0 || identity.scopes.some((scope) => !scope.trim())) reasons.push("identity scopes are required");
  if (identity.state !== "active" || !identity.tenantBound || !identity.approvalPresent || !identity.humanOwned) reasons.push("identity needs active proof, tenant binding, ownership and approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ identity, reasons })) };
}

export function decideM161Lease(lease: M161CredentialLease, now: number): M161IdentityDecision {
  const reasons: string[] = [];
  required([[lease.organizationId, "organizationId"], [lease.identityId, "identityId"], [lease.leaseId, "leaseId"], [lease.credentialReference, "credentialReference"], [lease.idempotencyKey, "idempotencyKey"]], reasons);
  if (!Number.isFinite(lease.issuedAt) || !Number.isFinite(lease.expiresAt) || lease.expiresAt <= lease.issuedAt || lease.expiresAt <= now) reasons.push("lease lifetime is invalid");
  if (lease.expiresAt - lease.issuedAt > 3_600_000) reasons.push("lease exceeds one hour");
  if (lease.scopes.length === 0 || lease.rawCredentialStored || lease.state !== "active") reasons.push("lease must be active, scoped and opaque");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ lease, now, reasons })) };
}

export function validateM161Binding(binding: M161Binding, now: number): M161IdentityDecision {
  const reasons: string[] = [];
  required([[binding.organizationId, "organizationId"], [binding.bindingId, "bindingId"], [binding.identityId, "identityId"], [binding.resourceReference, "resourceReference"], [binding.conditionsHash, "conditionsHash"]], reasons);
  if (binding.actions.length === 0 || binding.actions.some((action) => !action.trim())) reasons.push("binding actions are required");
  if (!binding.tenantMatch || !binding.leastPrivilege || !binding.approvalPresent || binding.expiresAt <= now) reasons.push("binding needs tenant, least-privilege, approval and future expiry");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ binding, now, reasons })) };
}

export function decideM161Rotation(rotation: M161Rotation): M161IdentityDecision {
  const reasons: string[] = [];
  required([[rotation.organizationId, "organizationId"], [rotation.identityId, "identityId"], [rotation.oldLeaseId, "oldLeaseId"], [rotation.newLeaseId, "newLeaseId"], [rotation.reasonHash, "reasonHash"], [rotation.evidenceHash, "evidenceHash"]], reasons);
  if (rotation.oldLeaseId === rotation.newLeaseId || !rotation.oldRevoked) reasons.push("rotation must issue and revoke distinct leases");
  if (!Number.isInteger(rotation.overlapSeconds) || rotation.overlapSeconds < 0 || rotation.overlapSeconds > 300) reasons.push("overlap is outside bounds");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ rotation, reasons })) };
}
