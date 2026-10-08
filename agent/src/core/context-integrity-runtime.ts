/** M169 fail-closed contracts for context provenance and prompt-injection firewalls. */

export type M169SourceTrust = "system" | "approved" | "user" | "external" | "untrusted";
export type M169ContextState = "assembled" | "scanned" | "quarantined" | "admitted";

export interface M169ContextEnvelope {
  organizationId: string;
  contextId: string;
  runId: string;
  sourceIds: string[];
  sourceHashes: string[];
  trustLevels: M169SourceTrust[];
  assembledHash: string;
  policyHash: string;
  tokenCount: number;
  maxTokens: number;
  state: M169ContextState;
  tenantBound: boolean;
  redacted: boolean;
  untrustedSeparated: boolean;
}

export interface M169SourceRecord {
  organizationId: string;
  sourceId: string;
  locatorHash: string;
  contentHash: string;
  trust: M169SourceTrust;
  fetchedAt: number;
  expiresAt: number;
  citationRequired: boolean;
  tenantMatch: boolean;
  externalContent: boolean;
}

export interface M169InjectionScan {
  organizationId: string;
  contextId: string;
  scanId: string;
  instructionOverride: boolean;
  secretRequest: boolean;
  toolTargetManipulation: boolean;
  suspiciousMarkup: boolean;
  evidenceHash: string;
  blocked: boolean;
  redacted: boolean;
  tenantMatch: boolean;
}

export interface M169Citation {
  organizationId: string;
  contextId: string;
  citationId: string;
  sourceId: string;
  claimHash: string;
  sourceContentHash: string;
  position: number;
  citationRequired: boolean;
  sourceTrusted: boolean;
  tenantMatch: boolean;
}

export interface M169ContextDecision {
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

export function validateM169Context(envelope: M169ContextEnvelope): M169ContextDecision {
  const reasons: string[] = [];
  required([[envelope.organizationId, "organizationId"], [envelope.contextId, "contextId"], [envelope.runId, "runId"], [envelope.assembledHash, "assembledHash"], [envelope.policyHash, "policyHash"]], reasons);
  if (envelope.sourceIds.length === 0 || envelope.sourceIds.length !== envelope.sourceHashes.length || envelope.sourceIds.length !== envelope.trustLevels.length) reasons.push("source provenance arrays must align");
  if (!Number.isInteger(envelope.tokenCount) || !Number.isInteger(envelope.maxTokens) || envelope.tokenCount < 0 || envelope.tokenCount > envelope.maxTokens || envelope.maxTokens < 1) reasons.push("context token budget is invalid");
  if (envelope.state !== "scanned" && envelope.state !== "admitted") reasons.push("context is not scanned");
  if (!envelope.tenantBound || !envelope.redacted || !envelope.untrustedSeparated) reasons.push("context needs tenant, redaction and untrusted-source separation");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ envelope, reasons })) };
}

export function decideM169Source(source: M169SourceRecord, now: number): M169ContextDecision {
  const reasons: string[] = [];
  required([[source.organizationId, "organizationId"], [source.sourceId, "sourceId"], [source.locatorHash, "locatorHash"], [source.contentHash, "contentHash"]], reasons);
  if (!Number.isFinite(source.fetchedAt) || !Number.isFinite(source.expiresAt) || source.expiresAt <= source.fetchedAt || source.expiresAt <= now) reasons.push("source freshness is invalid");
  if (!source.tenantMatch) reasons.push("source tenant does not match");
  if (source.externalContent && source.trust === "system") reasons.push("external content cannot be system-trusted");
  return { allowed: reasons.length === 0, reasons, requiresApproval: source.trust === "external", auditHash: hash(JSON.stringify({ source, now, reasons })) };
}

export function validateM169InjectionScan(scan: M169InjectionScan): M169ContextDecision {
  const reasons: string[] = [];
  required([[scan.organizationId, "organizationId"], [scan.contextId, "contextId"], [scan.scanId, "scanId"], [scan.evidenceHash, "evidenceHash"]], reasons);
  if (scan.instructionOverride || scan.secretRequest || scan.toolTargetManipulation || scan.suspiciousMarkup) reasons.push("injection scan found a blocking signal");
  if (!scan.blocked || !scan.redacted || !scan.tenantMatch) reasons.push("blocking scan needs blocked, redacted and tenant evidence");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ scan, reasons })) };
}

export function decideM169Citation(citation: M169Citation): M169ContextDecision {
  const reasons: string[] = [];
  required([[citation.organizationId, "organizationId"], [citation.contextId, "contextId"], [citation.citationId, "citationId"], [citation.sourceId, "sourceId"], [citation.claimHash, "claimHash"], [citation.sourceContentHash, "sourceContentHash"]], reasons);
  if (!Number.isInteger(citation.position) || citation.position < 0) reasons.push("citation position is invalid");
  if (citation.citationRequired && !citation.sourceTrusted) reasons.push("required citation needs trusted source evidence");
  if (!citation.tenantMatch) reasons.push("citation tenant does not match");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ citation, reasons })) };
}
