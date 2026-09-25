/** M164 fail-closed contracts for structured model output, repair and safety scanning. */

export type M164OutputState = "received" | "validated" | "rejected" | "repaired";
export type M164RepairReason = "schema" | "truncation" | "refusal" | "unsafe";

export interface M164OutputContract {
  organizationId: string;
  contractId: string;
  schemaHash: string;
  requiredFields: string[];
  maxBytes: number;
  allowedContentTypes: string[];
  deterministic: boolean;
  tenantBound: boolean;
  approvalPresent: boolean;
  version: number;
}

export interface M164ModelResponse {
  organizationId: string;
  responseId: string;
  contractId: string;
  modelReference: string;
  outputHash: string;
  state: M164OutputState;
  contentType: string;
  byteLength: number;
  fieldsPresent: string[];
  redacted: boolean;
  tenantMatch: boolean;
  refusalObserved: boolean;
}

export interface M164RepairAttempt {
  organizationId: string;
  responseId: string;
  repairId: string;
  reason: M164RepairReason;
  attempt: number;
  maxAttempts: number;
  inputHash: string;
  outputHash?: string;
  schemaHash: string;
  noNewAuthority: boolean;
  approvalPresent: boolean;
}

export interface M164SafetyScan {
  organizationId: string;
  responseId: string;
  scanId: string;
  secretLeak: boolean;
  crossTenantData: boolean;
  promptInjection: boolean;
  unsafeAction: boolean;
  evidenceHash: string;
  redacted: boolean;
  blocked: boolean;
  tenantMatch: boolean;
}

export interface M164OutputDecision {
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

export function validateM164Contract(contract: M164OutputContract): M164OutputDecision {
  const reasons: string[] = [];
  required([[contract.organizationId, "organizationId"], [contract.contractId, "contractId"], [contract.schemaHash, "schemaHash"]], reasons);
  if (contract.requiredFields.length === 0 || contract.requiredFields.some((field) => !field.trim())) reasons.push("required fields are invalid");
  if (!Number.isInteger(contract.maxBytes) || contract.maxBytes < 1 || contract.maxBytes > 10_000_000) reasons.push("max bytes are outside bounds");
  if (contract.allowedContentTypes.length === 0 || contract.allowedContentTypes.some((type) => !type.trim())) reasons.push("content types are required");
  if (!contract.deterministic || !contract.tenantBound || !contract.approvalPresent || !Number.isInteger(contract.version) || contract.version < 1) reasons.push("contract needs determinism, tenant scope, approval and version");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ contract, reasons })) };
}

export function decideM164Response(response: M164ModelResponse, contract: M164OutputContract): M164OutputDecision {
  const reasons: string[] = [];
  required([[response.organizationId, "organizationId"], [response.responseId, "responseId"], [response.contractId, "contractId"], [response.modelReference, "modelReference"], [response.outputHash, "outputHash"]], reasons);
  if (response.organizationId !== contract.organizationId || response.contractId !== contract.contractId) reasons.push("response does not match contract");
  if (response.state !== "validated" && response.state !== "repaired") reasons.push("response is not validated");
  if (!contract.allowedContentTypes.includes(response.contentType) || response.byteLength < 0 || response.byteLength > contract.maxBytes) reasons.push("response content is outside contract");
  for (const field of contract.requiredFields) if (!response.fieldsPresent.includes(field)) reasons.push(`missing required field ${field}`);
  if (!response.redacted || !response.tenantMatch || response.refusalObserved) reasons.push("response safety or refusal gate failed");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ response, contractId: contract.contractId, reasons })) };
}

export function decideM164Repair(repair: M164RepairAttempt): M164OutputDecision {
  const reasons: string[] = [];
  required([[repair.organizationId, "organizationId"], [repair.responseId, "responseId"], [repair.repairId, "repairId"], [repair.inputHash, "inputHash"], [repair.schemaHash, "schemaHash"]], reasons);
  if (!Number.isInteger(repair.attempt) || repair.attempt < 1 || repair.attempt > repair.maxAttempts) reasons.push("repair attempt exceeds bound");
  if (!Number.isInteger(repair.maxAttempts) || repair.maxAttempts < 1 || repair.maxAttempts > 3) reasons.push("max repairs are outside bound");
  if (repair.attempt > 1 && !repair.outputHash) reasons.push("repair output needs hash");
  if (!repair.noNewAuthority || !repair.approvalPresent) reasons.push("repair must not add authority and needs approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ repair, reasons })) };
}

export function validateM164SafetyScan(scan: M164SafetyScan): M164OutputDecision {
  const reasons: string[] = [];
  required([[scan.organizationId, "organizationId"], [scan.responseId, "responseId"], [scan.scanId, "scanId"], [scan.evidenceHash, "evidenceHash"]], reasons);
  if (scan.secretLeak || scan.crossTenantData || scan.promptInjection || scan.unsafeAction) reasons.push("safety scan found a blocking signal");
  if (!scan.redacted || !scan.blocked || !scan.tenantMatch) reasons.push("blocking scan must be redacted, blocked and tenant-bound");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ scan, reasons })) };
}
