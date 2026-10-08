/** Monotonic organization policy compilation and change planning. No policy is applied here. */

export type GovernanceMode = "free" | "paid" | "local";
export type EgressPolicy = "none" | "approved" | "allowed";
export type ApprovalClass = "none" | "standard" | "elevated" | "critical";

export interface OrganizationPolicy {
  policyId: string;
  organizationId: string;
  version: string;
  allowedModes: GovernanceMode[];
  egress: EgressPolicy;
  maxAutonomyLevel: number;
  deniedCapabilities: string[];
  requiredApproval: ApprovalClass;
  policyHash: string;
  signedBy: string;
}

export interface GovernanceRequest {
  organizationId: string;
  mode: GovernanceMode;
  egressRequested: boolean;
  autonomyLevel: number;
  capability: string;
  approvalClass: ApprovalClass;
}

export interface GovernanceDecision {
  allowed: boolean;
  reasons: string[];
  effectivePolicyHash: string;
  requiresApproval: boolean;
}

export interface PolicyChangePlan {
  allowed: boolean;
  requiresApproval: true;
  changedFields: string[];
  reasons: string[];
  planHash: string;
}

export class OrganizationGovernanceContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationGovernanceContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

const egressRank: Record<EgressPolicy, number> = { none: 0, approved: 1, allowed: 2 };
const approvalRank: Record<ApprovalClass, number> = { none: 0, standard: 1, elevated: 2, critical: 3 };

function required(value: string, label: string): void {
  if (!value.trim()) throw new OrganizationGovernanceContractError(`${label} is required`);
}

export function compileEffectivePolicy(parent: OrganizationPolicy, child: OrganizationPolicy): OrganizationPolicy {
  if (parent.organizationId !== child.organizationId) throw new OrganizationGovernanceContractError("policy tenant mismatch");
  if (egressRank[child.egress] > egressRank[parent.egress]) throw new OrganizationGovernanceContractError("child policy cannot widen egress");
  if (child.maxAutonomyLevel > parent.maxAutonomyLevel) throw new OrganizationGovernanceContractError("child policy cannot widen autonomy");
  const allowedModes = parent.allowedModes.filter((mode) => child.allowedModes.includes(mode));
  const deniedCapabilities = [...new Set([...parent.deniedCapabilities, ...child.deniedCapabilities])].sort();
  const effectiveBody = { parent: parent.policyHash, child: child.policyHash, allowedModes, egress: child.egress, maxAutonomyLevel: child.maxAutonomyLevel, deniedCapabilities, requiredApproval: approvalRank[child.requiredApproval] >= approvalRank[parent.requiredApproval] ? child.requiredApproval : parent.requiredApproval };
  return { ...child, allowedModes, deniedCapabilities, egress: child.egress, maxAutonomyLevel: child.maxAutonomyLevel, requiredApproval: effectiveBody.requiredApproval, policyHash: hash(JSON.stringify(effectiveBody)) };
}

export function decideGovernance(policy: OrganizationPolicy, request: GovernanceRequest): GovernanceDecision {
  required(policy.policyId, "policyId");
  required(policy.organizationId, "organizationId");
  required(policy.policyHash, "policyHash");
  const reasons: string[] = [];
  if (policy.organizationId !== request.organizationId) reasons.push("request tenant mismatch");
  if (!policy.allowedModes.includes(request.mode)) reasons.push("compute mode is not allowed");
  if (request.egressRequested && policy.egress === "none") reasons.push("egress is denied by organization policy");
  if (request.egressRequested && policy.egress === "approved" && request.approvalClass === "none") reasons.push("egress requires approval");
  if (!Number.isInteger(request.autonomyLevel) || request.autonomyLevel < 0 || request.autonomyLevel > policy.maxAutonomyLevel) reasons.push("autonomy level exceeds policy");
  if (policy.deniedCapabilities.includes(request.capability)) reasons.push(`capability denied: ${request.capability}`);
  const requiresApproval = approvalRank[request.approvalClass] < approvalRank[policy.requiredApproval] || (request.egressRequested && policy.egress === "approved");
  return { allowed: reasons.length === 0, reasons, effectivePolicyHash: policy.policyHash, requiresApproval };
}

export function planPolicyChange(current: OrganizationPolicy, proposed: OrganizationPolicy): PolicyChangePlan {
  if (current.organizationId !== proposed.organizationId) throw new OrganizationGovernanceContractError("policy tenant mismatch");
  const changedFields: string[] = [];
  if (JSON.stringify(current.allowedModes) !== JSON.stringify(proposed.allowedModes)) changedFields.push("allowedModes");
  if (current.egress !== proposed.egress) changedFields.push("egress");
  if (current.maxAutonomyLevel !== proposed.maxAutonomyLevel) changedFields.push("maxAutonomyLevel");
  if (JSON.stringify(current.deniedCapabilities) !== JSON.stringify(proposed.deniedCapabilities)) changedFields.push("deniedCapabilities");
  if (current.requiredApproval !== proposed.requiredApproval) changedFields.push("requiredApproval");
  const reasons: string[] = [];
  if (egressRank[proposed.egress] > egressRank[current.egress]) reasons.push("policy change widens egress");
  if (proposed.maxAutonomyLevel > current.maxAutonomyLevel) reasons.push("policy change widens autonomy");
  if (approvalRank[proposed.requiredApproval] < approvalRank[current.requiredApproval]) reasons.push("policy change lowers approval requirement");
  const body = { current: current.policyHash, proposed: proposed.policyHash, changedFields, reasons };
  return { allowed: reasons.length === 0, requiresApproval: true, changedFields, reasons, planHash: hash(JSON.stringify(body)) };
}
