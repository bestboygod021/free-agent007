/** M176 fail-closed contracts for agent-to-agent protocol interoperability. */

export type M176AgentTrust = "local" | "approved" | "external" | "untrusted";
export type M176MessageState = "offered" | "accepted" | "rejected" | "expired";

export interface M176AgentManifest {
  organizationId: string;
  agentId: string;
  protocolVersion: string;
  capabilities: string[];
  issuerHash: string;
  endpointHash: string;
  inputSchemaHash: string;
  outputSchemaHash: string;
  trust: M176AgentTrust;
  expiresAt: number;
  approved: boolean;
  sandboxed: boolean;
  tenantBound: boolean;
  noTransitiveDelegation: boolean;
}

export interface M176Message {
  organizationId: string;
  messageId: string;
  conversationId: string;
  senderAgentId: string;
  receiverAgentId: string;
  capability: string;
  payloadHash: string;
  nonce: string;
  correlationId: string;
  signatureHash: string;
  issuedAt: number;
  expiresAt: number;
  state: M176MessageState;
  redacted: boolean;
  tenantMatch: boolean;
}

export interface M176Response {
  organizationId: string;
  messageId: string;
  responseId: string;
  outputHash: string;
  evidenceHash: string;
  schemaValid: boolean;
  capabilityMatched: boolean;
  idempotencyKey: string;
  state: "accepted" | "rejected";
  tenantMatch: boolean;
  redacted: boolean;
}

export interface M176Handoff {
  organizationId: string;
  handoffId: string;
  senderAgentId: string;
  receiverAgentId: string;
  contextHash: string;
  capability: string;
  approvalPresent: boolean;
  bounded: boolean;
  noSecrets: boolean;
  expiresAt: number;
  operatorReference: string;
}

export interface M176ProtocolDecision {
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

export function validateM176Manifest(manifest: M176AgentManifest, now: number): M176ProtocolDecision {
  const reasons: string[] = [];
  required([[manifest.organizationId, "organizationId"], [manifest.agentId, "agentId"], [manifest.protocolVersion, "protocolVersion"], [manifest.issuerHash, "issuerHash"], [manifest.endpointHash, "endpointHash"], [manifest.inputSchemaHash, "inputSchemaHash"], [manifest.outputSchemaHash, "outputSchemaHash"]], reasons);
  if (manifest.capabilities.length === 0 || manifest.capabilities.some((capability) => !capability.trim())) reasons.push("agent capabilities are required");
  if (!Number.isFinite(manifest.expiresAt) || manifest.expiresAt <= now) reasons.push("agent manifest is expired");
  if (manifest.trust === "untrusted" || !manifest.approved || !manifest.sandboxed || !manifest.tenantBound || !manifest.noTransitiveDelegation) reasons.push("agent trust, sandbox and delegation gates failed");
  return { allowed: reasons.length === 0, reasons, requiresApproval: manifest.trust === "external", auditHash: hash(JSON.stringify({ manifest, now, reasons })) };
}

export function decideM176Message(message: M176Message, now: number): M176ProtocolDecision {
  const reasons: string[] = [];
  required([[message.organizationId, "organizationId"], [message.messageId, "messageId"], [message.conversationId, "conversationId"], [message.senderAgentId, "senderAgentId"], [message.receiverAgentId, "receiverAgentId"], [message.capability, "capability"], [message.payloadHash, "payloadHash"], [message.nonce, "nonce"], [message.correlationId, "correlationId"], [message.signatureHash, "signatureHash"]], reasons);
  if (message.senderAgentId === message.receiverAgentId || !Number.isFinite(message.issuedAt) || !Number.isFinite(message.expiresAt) || message.expiresAt <= message.issuedAt || message.expiresAt <= now) reasons.push("message identity or expiry is invalid");
  if (message.state !== "offered" && message.state !== "accepted") reasons.push("message is not admissible");
  if (!message.redacted || !message.tenantMatch) reasons.push("message must be redacted and tenant-bound");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ message, now, reasons })) };
}

export function validateM176Response(response: M176Response): M176ProtocolDecision {
  const reasons: string[] = [];
  required([[response.organizationId, "organizationId"], [response.messageId, "messageId"], [response.responseId, "responseId"], [response.outputHash, "outputHash"], [response.evidenceHash, "evidenceHash"], [response.idempotencyKey, "idempotencyKey"]], reasons);
  if (response.state !== "accepted" || !response.schemaValid || !response.capabilityMatched || !response.tenantMatch || !response.redacted) reasons.push("response contract, capability or tenant gate failed");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ response, reasons })) };
}

export function decideM176Handoff(handoff: M176Handoff, now: number): M176ProtocolDecision {
  const reasons: string[] = [];
  required([[handoff.organizationId, "organizationId"], [handoff.handoffId, "handoffId"], [handoff.senderAgentId, "senderAgentId"], [handoff.receiverAgentId, "receiverAgentId"], [handoff.contextHash, "contextHash"], [handoff.capability, "capability"], [handoff.operatorReference, "operatorReference"]], reasons);
  if (handoff.senderAgentId === handoff.receiverAgentId || !handoff.approvalPresent || !handoff.bounded || !handoff.noSecrets || !Number.isFinite(handoff.expiresAt) || handoff.expiresAt <= now) reasons.push("handoff needs distinct agents, approval, bound, no-secrets and expiry");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ handoff, now, reasons })) };
}
