/** M165 fail-closed contracts for agent delegation and capability tokens. */

export type M165DelegationState = "issued" | "accepted" | "completed" | "revoked" | "expired";
export type M165Capability = "read_context" | "write_patch" | "run_test" | "request_approval";

export interface M165Delegation {
  organizationId: string;
  delegationId: string;
  parentAgentReference: string;
  childAgentReference: string;
  taskReference: string;
  inputHash: string;
  outputContractHash: string;
  capabilities: M165Capability[];
  issuedAt: number;
  expiresAt: number;
  state: M165DelegationState;
  tenantBound: boolean;
  approvalPresent: boolean;
  noTransitiveEscalation: boolean;
}

export interface M165CapabilityToken {
  organizationId: string;
  tokenId: string;
  delegationId: string;
  capability: M165Capability;
  resourceReference: string;
  conditionsHash: string;
  issuedAt: number;
  expiresAt: number;
  singleUse: boolean;
  used: boolean;
  revoked: boolean;
}

export interface M165DelegationResult {
  organizationId: string;
  delegationId: string;
  resultId: string;
  outputHash: string;
  evidenceHash: string;
  state: "accepted" | "rejected";
  contractMatch: boolean;
  capabilitiesUsed: M165Capability[];
  tenantMatch: boolean;
  redacted: boolean;
}

export interface M165Revocation {
  organizationId: string;
  delegationId: string;
  revocationId: string;
  reasonHash: string;
  revokedAt: number;
  descendantsEnumerated: boolean;
  evidenceHash: string;
  operatorReference: string;
}

export interface M165DelegationDecision {
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

export function validateM165Delegation(delegation: M165Delegation, now: number): M165DelegationDecision {
  const reasons: string[] = [];
  required([[delegation.organizationId, "organizationId"], [delegation.delegationId, "delegationId"], [delegation.parentAgentReference, "parentAgentReference"], [delegation.childAgentReference, "childAgentReference"], [delegation.taskReference, "taskReference"], [delegation.inputHash, "inputHash"], [delegation.outputContractHash, "outputContractHash"]], reasons);
  if (delegation.parentAgentReference === delegation.childAgentReference) reasons.push("parent and child agents must differ");
  if (delegation.capabilities.length === 0 || delegation.capabilities.some((capability) => !capability)) reasons.push("delegation needs capabilities");
  if (!Number.isFinite(delegation.issuedAt) || !Number.isFinite(delegation.expiresAt) || delegation.expiresAt <= delegation.issuedAt || delegation.expiresAt <= now) reasons.push("delegation lifetime is invalid");
  if (delegation.state !== "issued" || !delegation.tenantBound || !delegation.approvalPresent || !delegation.noTransitiveEscalation) reasons.push("delegation needs issued state, tenant scope, approval and no escalation");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ delegation, now, reasons })) };
}

export function decideM165Token(token: M165CapabilityToken, now: number): M165DelegationDecision {
  const reasons: string[] = [];
  required([[token.organizationId, "organizationId"], [token.tokenId, "tokenId"], [token.delegationId, "delegationId"], [token.resourceReference, "resourceReference"], [token.conditionsHash, "conditionsHash"]], reasons);
  if (!Number.isFinite(token.issuedAt) || !Number.isFinite(token.expiresAt) || token.expiresAt <= token.issuedAt || token.expiresAt <= now) reasons.push("capability token lifetime is invalid");
  if (token.revoked || (token.singleUse && token.used)) reasons.push("capability token is unavailable");
  if (token.capability === "write_patch" && token.resourceReference.includes("main")) reasons.push("delegated patch cannot target main");
  return { allowed: reasons.length === 0, reasons, requiresApproval: token.capability === "write_patch", auditHash: hash(JSON.stringify({ token, now, reasons })) };
}

export function validateM165Result(result: M165DelegationResult): M165DelegationDecision {
  const reasons: string[] = [];
  required([[result.organizationId, "organizationId"], [result.delegationId, "delegationId"], [result.resultId, "resultId"], [result.outputHash, "outputHash"], [result.evidenceHash, "evidenceHash"]], reasons);
  if (result.capabilitiesUsed.length === 0 || !result.contractMatch || !result.tenantMatch || !result.redacted) reasons.push("result needs contract, tenant and redaction proof");
  if (result.state === "accepted" && result.capabilitiesUsed.includes("write_patch") && !result.evidenceHash) reasons.push("patch result needs evidence");
  return { allowed: reasons.length === 0, reasons, requiresApproval: result.capabilitiesUsed.includes("write_patch"), auditHash: hash(JSON.stringify({ result, reasons })) };
}

export function decideM165Revocation(revocation: M165Revocation): M165DelegationDecision {
  const reasons: string[] = [];
  required([[revocation.organizationId, "organizationId"], [revocation.delegationId, "delegationId"], [revocation.revocationId, "revocationId"], [revocation.reasonHash, "reasonHash"], [revocation.evidenceHash, "evidenceHash"], [revocation.operatorReference, "operatorReference"]], reasons);
  if (!Number.isFinite(revocation.revokedAt) || !revocation.descendantsEnumerated) reasons.push("revocation needs timestamp and descendant enumeration");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ revocation, reasons })) };
}
