/** M193 fail-closed contracts for tenant fairness and queue scheduling. */

export type M193FairnessClass = "standard" | "priority" | "reserved";

export interface M193Workload {
  organizationId: string;
  workloadId: string;
  requestedSlots: number;
  estimatedCostCents: number;
  deadlineAt: number;
  fairnessClass: M193FairnessClass;
  quotaRemaining: number;
  idempotencyKey: string;
  preemptible: boolean;
  tenantBound: boolean;
}

export interface M193Admission {
  organizationId: string;
  workloadId: string;
  admissionId: string;
  activeSlots: number;
  maxSlots: number;
  tenantShareBps: number;
  maxShareBps: number;
  starvationSeconds: number;
  reservedSlots: number;
  requestedSlots: number;
  approvalPresent: boolean;
  tenantMatch: boolean;
}

export interface M193Allocation {
  organizationId: string;
  allocationId: string;
  workloadId: string;
  slotsGranted: number;
  queuePosition: number;
  preemptedWorkloadIds: string[];
  fairnessClass: M193FairnessClass;
  leaseSeconds: number;
  idempotencyKey: string;
  bounded: boolean;
  tenantMatch: boolean;
}

export interface M193FairnessEvidence {
  organizationId: string;
  windowStart: number;
  windowEnd: number;
  tenantServiceSharesBps: Record<string, number>;
  maxDisparityBps: number;
  sampleCount: number;
  starvationBoundSeconds: number;
  budgetEvidenceHash: string;
  approved: boolean;
  redacted: boolean;
  tenantBound: boolean;
}

export interface M193SchedulerDecision {
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

export function validateM193Workload(workload: M193Workload, now: number): M193SchedulerDecision {
  const reasons: string[] = [];
  required([[workload.organizationId, "organizationId"], [workload.workloadId, "workloadId"], [workload.idempotencyKey, "idempotencyKey"]], reasons);
  if (!Number.isInteger(workload.requestedSlots) || workload.requestedSlots < 1 || !Number.isInteger(workload.estimatedCostCents) || workload.estimatedCostCents < 0 || !Number.isFinite(workload.deadlineAt) || workload.deadlineAt <= now || !Number.isInteger(workload.quotaRemaining) || workload.quotaRemaining < workload.estimatedCostCents || !workload.tenantBound) reasons.push("workload slot, cost, deadline, quota or tenant bound failed");
  return { allowed: reasons.length === 0, reasons, requiresApproval: workload.fairnessClass === "reserved", auditHash: hash(JSON.stringify({ workload, now, reasons })) };
}

export function decideM193Admission(admission: M193Admission): M193SchedulerDecision {
  const reasons: string[] = [];
  required([[admission.organizationId, "organizationId"], [admission.workloadId, "workloadId"], [admission.admissionId, "admissionId"]], reasons);
  if (!Number.isInteger(admission.activeSlots) || admission.activeSlots < 0 || !Number.isInteger(admission.maxSlots) || admission.maxSlots < 1 || admission.activeSlots > admission.maxSlots || !Number.isInteger(admission.tenantShareBps) || admission.tenantShareBps < 0 || admission.tenantShareBps > 10_000 || !Number.isInteger(admission.maxShareBps) || admission.maxShareBps < 1 || admission.maxShareBps > 10_000 || admission.tenantShareBps > admission.maxShareBps || !Number.isInteger(admission.starvationSeconds) || admission.starvationSeconds < 0 || !Number.isInteger(admission.reservedSlots) || admission.reservedSlots < 0 || !Number.isInteger(admission.requestedSlots) || admission.requestedSlots < 1 || admission.requestedSlots > admission.maxSlots || !admission.approvalPresent || !admission.tenantMatch) reasons.push("scheduler admission needs bounded capacity, share, starvation, reservation and approval proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ admission, reasons })) };
}

export function validateM193Allocation(allocation: M193Allocation): M193SchedulerDecision {
  const reasons: string[] = [];
  required([[allocation.organizationId, "organizationId"], [allocation.allocationId, "allocationId"], [allocation.workloadId, "workloadId"], [allocation.idempotencyKey, "idempotencyKey"]], reasons);
  if (!Number.isInteger(allocation.slotsGranted) || allocation.slotsGranted < 1 || !Number.isInteger(allocation.queuePosition) || allocation.queuePosition < 0 || allocation.preemptedWorkloadIds.some((id) => !id.trim()) || !Number.isInteger(allocation.leaseSeconds) || allocation.leaseSeconds < 1 || !allocation.bounded || !allocation.tenantMatch) reasons.push("allocation needs bounded slots, queue, lease and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: allocation.fairnessClass === "reserved", auditHash: hash(JSON.stringify({ allocation, reasons })) };
}

export function validateM193FairnessEvidence(evidence: M193FairnessEvidence): M193SchedulerDecision {
  const reasons: string[] = [];
  required([[evidence.organizationId, "organizationId"], [evidence.budgetEvidenceHash, "budgetEvidenceHash"]], reasons);
  const shares = Object.values(evidence.tenantServiceSharesBps);
  if (!Number.isFinite(evidence.windowStart) || !Number.isFinite(evidence.windowEnd) || evidence.windowEnd <= evidence.windowStart || shares.length < 1 || shares.some((share) => !Number.isInteger(share) || share < 0 || share > 10_000) || !Number.isInteger(evidence.maxDisparityBps) || evidence.maxDisparityBps < 0 || evidence.maxDisparityBps > 10_000 || !Number.isInteger(evidence.sampleCount) || evidence.sampleCount < 1 || !Number.isInteger(evidence.starvationBoundSeconds) || evidence.starvationBoundSeconds < 0 || !evidence.approved || !evidence.redacted || !evidence.tenantBound) reasons.push("fairness evidence needs bounded shares, window, samples, starvation, approval and redaction");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
