/** M190 fail-closed contracts for outbound egress and destination governance. */

export type M190ComputeMode = "local" | "free" | "byok" | "hosted";
export type M190DataClass = "public" | "internal" | "confidential" | "restricted";

export interface M190EgressPolicy {
  organizationId: string;
  policyId: string;
  mode: M190ComputeMode;
  destinationPattern: string;
  allowedSchemes: string[];
  allowedPorts: number[];
  allowedDataClasses: M190DataClass[];
  approvalPresent: boolean;
  userConsentPresent: boolean;
  dlpRequired: boolean;
  expiresAt: number;
  tenantBound: boolean;
}

export interface M190EgressRequest {
  organizationId: string;
  policyId: string;
  requestId: string;
  destination: string;
  scheme: string;
  port: number;
  dataClass: M190DataClass;
  purposeHash: string;
  estimatedBytes: number;
  dnsPinned: boolean;
  tlsVerified: boolean;
  dlpPassed: boolean;
  consentPresent: boolean;
  tenantMatch: boolean;
}

export interface M190CredentialLease {
  organizationId: string;
  leaseId: string;
  destinationHash: string;
  credentialReference: string;
  scopes: string[];
  issuedAt: number;
  expiresAt: number;
  rotated: boolean;
  revoked: boolean;
  approvalPresent: boolean;
  tenantMatch: boolean;
}

export interface M190NetworkEvidence {
  organizationId: string;
  requestId: string;
  destination: string;
  resolvedIps: string[];
  certificateHash: string;
  bytesSent: number;
  bytesReceived: number;
  redacted: boolean;
  policyHash: string;
  dlpPassed: boolean;
  tenantMatch: boolean;
}

export interface M190EgressDecision {
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

export function validateM190Policy(policy: M190EgressPolicy, now: number): M190EgressDecision {
  const reasons: string[] = [];
  required([[policy.organizationId, "organizationId"], [policy.policyId, "policyId"], [policy.destinationPattern, "destinationPattern"]], reasons);
  if (policy.allowedSchemes.length === 0 || policy.allowedPorts.length === 0 || policy.allowedDataClasses.length === 0 || policy.allowedSchemes.some((scheme) => !scheme.trim()) || policy.allowedPorts.some((port) => !Number.isInteger(port) || port < 1 || port > 65_535) || !Number.isFinite(policy.expiresAt) || policy.expiresAt <= now || !policy.tenantBound) reasons.push("egress policy needs bounded schemes, ports, data classes and tenant expiry");
  if (policy.mode !== "local" && (!policy.approvalPresent || !policy.userConsentPresent)) reasons.push("non-local egress needs explicit approval and user consent");
  return { allowed: reasons.length === 0, reasons, requiresApproval: policy.mode !== "local", auditHash: hash(JSON.stringify({ policy, now, reasons })) };
}

export function decideM190Egress(request: M190EgressRequest): M190EgressDecision {
  const reasons: string[] = [];
  required([[request.organizationId, "organizationId"], [request.policyId, "policyId"], [request.requestId, "requestId"], [request.destination, "destination"], [request.scheme, "scheme"], [request.purposeHash, "purposeHash"]], reasons);
  if (!Number.isInteger(request.port) || request.port < 1 || request.port > 65_535 || !Number.isInteger(request.estimatedBytes) || request.estimatedBytes < 0 || !request.dnsPinned || !request.tlsVerified || !request.dlpPassed || !request.consentPresent || !request.tenantMatch) reasons.push("egress request needs bounded network, TLS, DLP, consent and tenant proof");
  if (request.dataClass === "restricted" && !request.dlpPassed) reasons.push("restricted data requires DLP approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateM190CredentialLease(lease: M190CredentialLease, now: number): M190EgressDecision {
  const reasons: string[] = [];
  required([[lease.organizationId, "organizationId"], [lease.leaseId, "leaseId"], [lease.destinationHash, "destinationHash"], [lease.credentialReference, "credentialReference"]], reasons);
  if (lease.scopes.length === 0 || lease.scopes.some((scope) => !scope.trim()) || !Number.isFinite(lease.issuedAt) || !Number.isFinite(lease.expiresAt) || lease.expiresAt <= lease.issuedAt || lease.expiresAt <= now || !lease.rotated || lease.revoked || !lease.approvalPresent || !lease.tenantMatch) reasons.push("credential lease needs scoped rotation, freshness, approval and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ lease, now, reasons })) };
}

export function validateM190NetworkEvidence(evidence: M190NetworkEvidence): M190EgressDecision {
  const reasons: string[] = [];
  required([[evidence.organizationId, "organizationId"], [evidence.requestId, "requestId"], [evidence.destination, "destination"], [evidence.certificateHash, "certificateHash"], [evidence.policyHash, "policyHash"]], reasons);
  if (evidence.resolvedIps.length === 0 || !Number.isInteger(evidence.bytesSent) || evidence.bytesSent < 0 || !Number.isInteger(evidence.bytesReceived) || evidence.bytesReceived < 0 || !evidence.redacted || !evidence.dlpPassed || !evidence.tenantMatch) reasons.push("network evidence needs IP, byte, redaction, DLP and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
