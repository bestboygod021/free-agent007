/** M177 fail-closed contracts for prompt cache integrity and privacy. */

export type M177CacheSensitivity = "public" | "tenant" | "sensitive";
export type M177CacheState = "candidate" | "active" | "expired" | "purged";

export interface M177CacheEntry {
  organizationId: string;
  namespace: string;
  entryId: string;
  promptHash: string;
  responseHash: string;
  modelHash: string;
  policyHash: string;
  tenantScope: string;
  sensitivity: M177CacheSensitivity;
  state: M177CacheState;
  encrypted: boolean;
  redacted: boolean;
  consentPresent: boolean;
  createdAt: number;
  expiresAt: number;
  noRawPrompt: boolean;
}

export interface M177Lookup {
  organizationId: string;
  namespace: string;
  lookupId: string;
  promptHash: string;
  modelHash: string;
  policyHash: string;
  tenantScope: string;
  now: number;
  hit: boolean;
  allowed: boolean;
  crossTenant: boolean;
  poisoningScanPassed: boolean;
}

export interface M177Write {
  organizationId: string;
  namespace: string;
  writeId: string;
  promptHash: string;
  responseHash: string;
  modelHash: string;
  policyHash: string;
  tenantScope: string;
  sensitivity: M177CacheSensitivity;
  encrypted: boolean;
  redacted: boolean;
  consentPresent: boolean;
  retentionSeconds: number;
  noRawPrompt: boolean;
}

export interface M177Purge {
  organizationId: string;
  namespace: string;
  purgeId: string;
  entryId: string;
  reasonHash: string;
  approvalPresent: boolean;
  allReplicasPurged: boolean;
  bounded: boolean;
  evidenceHash: string;
}

export interface M177CacheDecision {
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

export function validateM177Entry(entry: M177CacheEntry, now: number): M177CacheDecision {
  const reasons: string[] = [];
  required([[entry.organizationId, "organizationId"], [entry.namespace, "namespace"], [entry.entryId, "entryId"], [entry.promptHash, "promptHash"], [entry.responseHash, "responseHash"], [entry.modelHash, "modelHash"], [entry.policyHash, "policyHash"], [entry.tenantScope, "tenantScope"]], reasons);
  if (!Number.isFinite(entry.createdAt) || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= entry.createdAt || entry.expiresAt <= now) reasons.push("cache entry freshness is invalid");
  if (entry.state === "active" && (!entry.encrypted || !entry.redacted || !entry.consentPresent || !entry.noRawPrompt)) reasons.push("active cache needs encryption, redaction, consent and no-raw-prompt proof");
  if (entry.sensitivity === "sensitive") reasons.push("sensitive prompts are not cacheable by default");
  return { allowed: reasons.length === 0, reasons, requiresApproval: entry.sensitivity === "tenant", auditHash: hash(JSON.stringify({ entry, now, reasons })) };
}

export function decideM177Lookup(lookup: M177Lookup): M177CacheDecision {
  const reasons: string[] = [];
  required([[lookup.organizationId, "organizationId"], [lookup.namespace, "namespace"], [lookup.lookupId, "lookupId"], [lookup.promptHash, "promptHash"], [lookup.modelHash, "modelHash"], [lookup.policyHash, "policyHash"], [lookup.tenantScope, "tenantScope"]], reasons);
  if (!Number.isFinite(lookup.now) || !lookup.allowed || lookup.crossTenant || !lookup.poisoningScanPassed) reasons.push("cache lookup is not admitted");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ lookup, reasons })) };
}

export function validateM177Write(write: M177Write): M177CacheDecision {
  const reasons: string[] = [];
  required([[write.organizationId, "organizationId"], [write.namespace, "namespace"], [write.writeId, "writeId"], [write.promptHash, "promptHash"], [write.responseHash, "responseHash"], [write.modelHash, "modelHash"], [write.policyHash, "policyHash"], [write.tenantScope, "tenantScope"]], reasons);
  if (!write.encrypted || !write.redacted || !write.consentPresent || !write.noRawPrompt || !Number.isInteger(write.retentionSeconds) || write.retentionSeconds < 1 || write.retentionSeconds > 31_536_000) reasons.push("cache write needs encryption, consent, redaction and bounded retention");
  if (write.sensitivity === "sensitive") reasons.push("sensitive prompt caching is denied");
  return { allowed: reasons.length === 0, reasons, requiresApproval: write.sensitivity === "tenant", auditHash: hash(JSON.stringify({ write, reasons })) };
}

export function decideM177Purge(purge: M177Purge): M177CacheDecision {
  const reasons: string[] = [];
  required([[purge.organizationId, "organizationId"], [purge.namespace, "namespace"], [purge.purgeId, "purgeId"], [purge.entryId, "entryId"], [purge.reasonHash, "reasonHash"], [purge.evidenceHash, "evidenceHash"]], reasons);
  if (!purge.approvalPresent || !purge.allReplicasPurged || !purge.bounded) reasons.push("purge needs approval, replica evidence and bound");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ purge, reasons })) };
}
