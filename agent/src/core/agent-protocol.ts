/** Signed-envelope checks for agent interoperability. This module does not send or execute messages. */

export type AgentProtocol = "a2a" | "mcp";

export interface AgentMessage {
  messageId: string;
  protocol: AgentProtocol;
  organizationId: string;
  senderAgentId: string;
  recipientAgentId: string;
  capability: string;
  scope: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
  payloadHash: string;
  signature: string;
}

export interface AgentProtocolPolicy {
  organizationId: string;
  allowedProtocols: AgentProtocol[];
  allowedCapabilities: string[];
  allowedScopes: string[];
  deniedCapabilities: string[];
  maxTtlMs: number;
  trustedSenders: string[];
}

export interface ProtocolDecision {
  allowed: boolean;
  reasons: string[];
  messageId: string;
  decisionHash: string;
}

export class AgentProtocolContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentProtocolContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new AgentProtocolContractError(`${label} is required`);
}

export function validateAgentMessage(message: AgentMessage, policy: AgentProtocolPolicy, now: number): void {
  for (const [value, label] of [[message.messageId, "messageId"], [message.organizationId, "organizationId"], [message.senderAgentId, "senderAgentId"], [message.recipientAgentId, "recipientAgentId"], [message.capability, "capability"], [message.scope, "scope"], [message.nonce, "nonce"], [message.payloadHash, "payloadHash"], [message.signature, "signature"]] as const) required(value, label);
  if (message.organizationId !== policy.organizationId) throw new AgentProtocolContractError("message and policy tenant mismatch");
  if (!policy.allowedProtocols.includes(message.protocol)) throw new AgentProtocolContractError("protocol is not allowed");
  if (!Number.isFinite(now) || !Number.isFinite(message.issuedAt) || !Number.isFinite(message.expiresAt) || message.expiresAt <= message.issuedAt) throw new AgentProtocolContractError("invalid message timestamps");
  if (message.expiresAt - message.issuedAt > policy.maxTtlMs) throw new AgentProtocolContractError("message TTL exceeds policy");
  if (now < message.issuedAt || now >= message.expiresAt) throw new AgentProtocolContractError("message is outside its validity window");
  if (!policy.allowedCapabilities.includes(message.capability) || policy.deniedCapabilities.includes(message.capability)) throw new AgentProtocolContractError("capability is not allowed");
  if (!policy.allowedScopes.includes(message.scope)) throw new AgentProtocolContractError("scope is not allowed");
  if (!policy.trustedSenders.includes(message.senderAgentId)) throw new AgentProtocolContractError("sender is not trusted");
  if (message.senderAgentId === message.recipientAgentId) throw new AgentProtocolContractError("sender and recipient must differ");
}

export function decideAgentMessage(message: AgentMessage, policy: AgentProtocolPolicy, now: number, signatureVerifier: (message: AgentMessage) => boolean): ProtocolDecision {
  const reasons: string[] = [];
  try { validateAgentMessage(message, policy, now); } catch (error) { reasons.push(error instanceof Error ? error.message : "invalid message"); }
  try { if (!signatureVerifier(message)) reasons.push("signature verification failed"); } catch { reasons.push("signature verification failed"); }
  const body = { messageId: message.messageId, organizationId: message.organizationId, capability: message.capability, scope: message.scope, reasons };
  return { allowed: reasons.length === 0, reasons, messageId: message.messageId, decisionHash: hash(JSON.stringify(body)) };
}

export class ReplayWindow {
  private readonly seen = new Map<string, number>();

  accept(message: AgentMessage, now: number): boolean {
    const key = `${message.senderAgentId}:${message.nonce}`;
    const prior = this.seen.get(key);
    if (prior !== undefined && prior >= now) return false;
    this.seen.set(key, message.expiresAt);
    for (const [seenKey, expiresAt] of this.seen) if (expiresAt <= now) this.seen.delete(seenKey);
    return true;
  }
}
