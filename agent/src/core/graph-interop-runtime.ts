/** M184 fail-closed contracts for graph-engine compatibility and state interop. */

export type M184GraphEngine = "internal" | "langgraph" | "external";
export type M184AdapterState = "registered" | "verified" | "revoked";

export interface M184GraphAdapter {
  organizationId: string;
  adapterId: string;
  engine: M184GraphEngine;
  protocolVersion: string;
  graphHash: string;
  stateSchemaHash: string;
  checkpointFormat: string;
  transitionPolicyHash: string;
  state: M184AdapterState;
  deterministic: boolean;
  supportsResume: boolean;
  sandboxed: boolean;
  approved: boolean;
  tenantBound: boolean;
}

export interface M184StateHandoff {
  organizationId: string;
  handoffId: string;
  adapterId: string;
  sourceEngine: M184GraphEngine;
  targetEngine: M184GraphEngine;
  sequence: number;
  stateHash: string;
  checkpointHash: string;
  capability: string;
  issuedAt: number;
  expiresAt: number;
  noSecrets: boolean;
  approvalPresent: boolean;
  tenantMatch: boolean;
}

export interface M184NodeBinding {
  organizationId: string;
  adapterId: string;
  nodeId: string;
  inputSchemaHash: string;
  outputSchemaHash: string;
  allowedTools: string[];
  policyHash: string;
  sandboxed: boolean;
  noTransitiveTools: boolean;
  tenantMatch: boolean;
}

export interface M184Compatibility {
  organizationId: string;
  adapterId: string;
  compatibilityId: string;
  internalVersion: string;
  externalVersion: string;
  migrationHash: string;
  backwardsCompatible: boolean;
  replayable: boolean;
  approvalPresent: boolean;
  evidenceHash: string;
  tenantMatch: boolean;
}

export interface M184InteropDecision {
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

export function validateM184Adapter(adapter: M184GraphAdapter): M184InteropDecision {
  const reasons: string[] = [];
  required([[adapter.organizationId, "organizationId"], [adapter.adapterId, "adapterId"], [adapter.protocolVersion, "protocolVersion"], [adapter.graphHash, "graphHash"], [adapter.stateSchemaHash, "stateSchemaHash"], [adapter.checkpointFormat, "checkpointFormat"], [adapter.transitionPolicyHash, "transitionPolicyHash"]], reasons);
  if (adapter.state === "revoked") reasons.push("revoked adapter cannot be used");
  if (adapter.engine !== "internal" && adapter.state !== "verified") reasons.push("external adapter must be verified before use");
  if (adapter.state === "verified" && (!adapter.approved || !adapter.deterministic || !adapter.supportsResume || !adapter.sandboxed || !adapter.tenantBound)) reasons.push("verified adapter needs approval, deterministic resume, sandbox and tenant gates");
  return { allowed: reasons.length === 0, reasons, requiresApproval: adapter.engine !== "internal", auditHash: hash(JSON.stringify({ adapter, reasons })) };
}

export function decideM184StateHandoff(handoff: M184StateHandoff, now: number): M184InteropDecision {
  const reasons: string[] = [];
  required([[handoff.organizationId, "organizationId"], [handoff.handoffId, "handoffId"], [handoff.adapterId, "adapterId"], [handoff.stateHash, "stateHash"], [handoff.checkpointHash, "checkpointHash"], [handoff.capability, "capability"]], reasons);
  if (handoff.sourceEngine === handoff.targetEngine || !Number.isInteger(handoff.sequence) || handoff.sequence < 0 || !Number.isFinite(handoff.issuedAt) || !Number.isFinite(handoff.expiresAt) || handoff.expiresAt <= handoff.issuedAt || handoff.expiresAt <= now) reasons.push("state handoff identity, sequence or expiry is invalid");
  if (!handoff.noSecrets || !handoff.approvalPresent || !handoff.tenantMatch) reasons.push("handoff needs no-secrets, approval and tenant evidence");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ handoff, now, reasons })) };
}

export function validateM184NodeBinding(binding: M184NodeBinding): M184InteropDecision {
  const reasons: string[] = [];
  required([[binding.organizationId, "organizationId"], [binding.adapterId, "adapterId"], [binding.nodeId, "nodeId"], [binding.inputSchemaHash, "inputSchemaHash"], [binding.outputSchemaHash, "outputSchemaHash"], [binding.policyHash, "policyHash"]], reasons);
  if (binding.allowedTools.length === 0 || binding.allowedTools.some((tool) => !tool.trim()) || !binding.sandboxed || !binding.noTransitiveTools || !binding.tenantMatch) reasons.push("node binding needs explicit tools, sandbox, no-transitive-tools and tenant gates");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ binding, reasons })) };
}

export function decideM184Compatibility(compatibility: M184Compatibility): M184InteropDecision {
  const reasons: string[] = [];
  required([[compatibility.organizationId, "organizationId"], [compatibility.adapterId, "adapterId"], [compatibility.compatibilityId, "compatibilityId"], [compatibility.internalVersion, "internalVersion"], [compatibility.externalVersion, "externalVersion"], [compatibility.migrationHash, "migrationHash"], [compatibility.evidenceHash, "evidenceHash"]], reasons);
  if (!compatibility.backwardsCompatible || !compatibility.replayable || !compatibility.approvalPresent || !compatibility.tenantMatch) reasons.push("engine compatibility needs migration, replay, approval and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ compatibility, reasons })) };
}
