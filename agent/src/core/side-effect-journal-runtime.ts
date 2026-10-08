/** M200 fail-closed contracts for side-effect journaling and idempotent commit boundaries. */

export type M200OperationState = "planned" | "prepared" | "committed" | "compensated" | "failed";

export interface M200OperationJournal {
  organizationId: string;
  operationId: string;
  idempotencyKey: string;
  actionType: string;
  targetReferenceHash: string;
  preconditionHash: string;
  inputHash: string;
  compensationHash: string;
  state: M200OperationState;
  approvalPresent: boolean;
  tenantBound: boolean;
}

export interface M200CommitDecision {
  organizationId: string;
  operationId: string;
  commitId: string;
  sideEffectHash: string;
  attempt: number;
  dedupeChecked: boolean;
  preconditionPassed: boolean;
  atomicBoundary: boolean;
  receiptHash: string;
  noDuplicate: boolean;
  approvalPresent: boolean;
  tenantMatch: boolean;
}

export interface M200ReceiptProof {
  organizationId: string;
  operationId: string;
  receiptId: string;
  idempotencyKey: string;
  targetReferenceHash: string;
  sideEffectHash: string;
  providerReceiptHash: string;
  committedAt: number;
  replaySafe: boolean;
  tenantMatch: boolean;
}

export interface M200Compensation {
  organizationId: string;
  operationId: string;
  compensationId: string;
  originalSideEffectHash: string;
  compensationHash: string;
  reasonHash: string;
  reversible: boolean;
  approvalPresent: boolean;
  bounded: boolean;
  tenantMatch: boolean;
}

export interface M200JournalDecision {
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

export function validateM200Journal(journal: M200OperationJournal): M200JournalDecision {
  const reasons: string[] = [];
  required([[journal.organizationId, "organizationId"], [journal.operationId, "operationId"], [journal.idempotencyKey, "idempotencyKey"], [journal.actionType, "actionType"], [journal.targetReferenceHash, "targetReferenceHash"], [journal.preconditionHash, "preconditionHash"], [journal.inputHash, "inputHash"], [journal.compensationHash, "compensationHash"]], reasons);
  if (journal.state === "committed" && (!journal.approvalPresent || !journal.tenantBound)) reasons.push("committed journal needs approval and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ journal, reasons })) };
}

export function decideM200Commit(commit: M200CommitDecision): M200JournalDecision {
  const reasons: string[] = [];
  required([[commit.organizationId, "organizationId"], [commit.operationId, "operationId"], [commit.commitId, "commitId"], [commit.sideEffectHash, "sideEffectHash"], [commit.receiptHash, "receiptHash"]], reasons);
  if (!Number.isInteger(commit.attempt) || commit.attempt < 1 || !commit.dedupeChecked || !commit.preconditionPassed || !commit.atomicBoundary || !commit.noDuplicate || !commit.approvalPresent || !commit.tenantMatch) reasons.push("commit needs bounded attempt, dedupe, precondition, atomic, receipt, approval and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ commit, reasons })) };
}

export function validateM200Receipt(receipt: M200ReceiptProof): M200JournalDecision {
  const reasons: string[] = [];
  required([[receipt.organizationId, "organizationId"], [receipt.operationId, "operationId"], [receipt.receiptId, "receiptId"], [receipt.idempotencyKey, "idempotencyKey"], [receipt.targetReferenceHash, "targetReferenceHash"], [receipt.sideEffectHash, "sideEffectHash"], [receipt.providerReceiptHash, "providerReceiptHash"]], reasons);
  if (!Number.isFinite(receipt.committedAt) || !receipt.replaySafe || !receipt.tenantMatch) reasons.push("receipt needs committed timestamp, replay safety and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ receipt, reasons })) };
}

export function decideM200Compensation(compensation: M200Compensation): M200JournalDecision {
  const reasons: string[] = [];
  required([[compensation.organizationId, "organizationId"], [compensation.operationId, "operationId"], [compensation.compensationId, "compensationId"], [compensation.originalSideEffectHash, "originalSideEffectHash"], [compensation.compensationHash, "compensationHash"], [compensation.reasonHash, "reasonHash"]], reasons);
  if (!compensation.reversible || !compensation.approvalPresent || !compensation.bounded || !compensation.tenantMatch) reasons.push("compensation needs reversibility, approval, bound and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ compensation, reasons })) };
}
