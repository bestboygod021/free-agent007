/** M80 contracts for prompt injection detection, output trust and structured-output fallback. */

export type PromptSafetySource = "user" | "issue" | "readme" | "webpage" | "model_output" | "tool_output";
export type PromptSafetyAction = "allow" | "sanitize" | "block" | "human_review";

export interface PromptSafetyPolicy {
  organizationId: string;
  policyId: string;
  injectionBlockThreshold: number;
  secretBlockThreshold: number;
  tenantLeakBlockThreshold: number;
  canaryTokenHash: string;
  classifierVersion: string;
  approved: boolean;
}

export interface PromptIngressRecord {
  organizationId: string;
  runId: string;
  source: PromptSafetySource;
  contentHash: string;
  injectionScore: number;
  credentialPatternFound: boolean;
  canaryTriggered: boolean;
  requestedAction: "read" | "write" | "execute" | "egress";
  policyId: string;
  humanReviewed: boolean;
}

export interface ModelOutputTrustRecord {
  organizationId: string;
  runId: string;
  outputHash: string;
  schemaHash: string;
  structuredValid: boolean;
  repairAttempts: number;
  secretScanPassed: boolean;
  tenantIsolationPassed: boolean;
  citationEvidenceHash?: string;
}

export interface StructuredOutputFallback {
  organizationId: string;
  runId: string;
  modelReference: string;
  supportsStructuredOutput: boolean;
  grammarAvailable: boolean;
  rawOutputHash: string;
  repairAttempts: number;
  repairedSchemaHash?: string;
  validationPassed: boolean;
  localFallbackAvailable: boolean;
}

export interface PromptSafetyDecision {
  allowed: boolean;
  action: PromptSafetyAction;
  reasons: string[];
  auditHash: string;
}

export class PromptSafetyContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromptSafetyContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new PromptSafetyContractError(`${label} is required`);
}

export function validatePromptSafetyPolicy(policy: PromptSafetyPolicy): PromptSafetyDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[policy.organizationId, "organizationId"], [policy.policyId, "policyId"], [policy.canaryTokenHash, "canaryTokenHash"], [policy.classifierVersion, "classifierVersion"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  for (const [value, label] of [[policy.injectionBlockThreshold, "injectionBlockThreshold"], [policy.secretBlockThreshold, "secretBlockThreshold"], [policy.tenantLeakBlockThreshold, "tenantLeakBlockThreshold"]] as const) if (!Number.isFinite(value) || value < 0 || value > 1) reasons.push(`${label} must be between 0 and 1`);
  if (!policy.approved) reasons.push("prompt safety policy requires approval");
  return { allowed: reasons.length === 0, action: reasons.length === 0 ? "allow" : "block", reasons, auditHash: hash(JSON.stringify({ policy, reasons })) };
}

export function decidePromptIngress(record: PromptIngressRecord, policy: PromptSafetyPolicy): PromptSafetyDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[record.organizationId, "organizationId"], [record.runId, "runId"], [record.contentHash, "contentHash"], [record.policyId, "policyId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (record.organizationId !== policy.organizationId || record.policyId !== policy.policyId) reasons.push("prompt safety policy crosses organization boundary");
  if (!Number.isFinite(record.injectionScore) || record.injectionScore < 0 || record.injectionScore > 1) reasons.push("injection score is invalid");
  if (record.injectionScore >= policy.injectionBlockThreshold) reasons.push("prompt injection score crossed block threshold");
  if (record.credentialPatternFound) reasons.push("credential-like content requires redaction");
  if (record.canaryTriggered) reasons.push("canary token was triggered");
  if (["write", "execute", "egress"].includes(record.requestedAction) && !record.humanReviewed && record.source !== "user") reasons.push("untrusted side effect requires human review");
  const action: PromptSafetyAction = reasons.length === 0 ? "allow" : record.humanReviewed ? "sanitize" : "block";
  return { allowed: reasons.length === 0, action, reasons, auditHash: hash(JSON.stringify({ record, policy: policy.policyId, reasons })) };
}

export function decideModelOutputTrust(record: ModelOutputTrustRecord): PromptSafetyDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[record.organizationId, "organizationId"], [record.runId, "runId"], [record.outputHash, "outputHash"], [record.schemaHash, "schemaHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!record.structuredValid) reasons.push("model output does not satisfy the declared schema");
  if (!Number.isInteger(record.repairAttempts) || record.repairAttempts < 0 || record.repairAttempts > 3) reasons.push("repair attempts exceed safe bounds");
  if (!record.secretScanPassed) reasons.push("model output secret scan failed");
  if (!record.tenantIsolationPassed) reasons.push("model output tenant isolation failed");
  return { allowed: reasons.length === 0, action: reasons.length === 0 ? "allow" : "human_review", reasons, auditHash: hash(JSON.stringify({ record, reasons })) };
}

export function decideStructuredOutputFallback(fallback: StructuredOutputFallback): PromptSafetyDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[fallback.organizationId, "organizationId"], [fallback.runId, "runId"], [fallback.modelReference, "modelReference"], [fallback.rawOutputHash, "rawOutputHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!fallback.supportsStructuredOutput && !fallback.grammarAvailable && fallback.repairAttempts > 3) reasons.push("repair loop is bounded to three attempts");
  if (!Number.isInteger(fallback.repairAttempts) || fallback.repairAttempts < 0 || fallback.repairAttempts > 3) reasons.push("repair attempts are invalid");
  if (!fallback.validationPassed) reasons.push("fallback output validation failed");
  if (!fallback.supportsStructuredOutput && !fallback.grammarAvailable && !fallback.localFallbackAvailable) reasons.push("no honest local/fallback path exists");
  return { allowed: reasons.length === 0, action: reasons.length === 0 ? "allow" : "human_review", reasons, auditHash: hash(JSON.stringify({ fallback, reasons })) };
}
