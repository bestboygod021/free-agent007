/** M68 contracts for pilot cohorts, E2E evidence and controlled release gates. */

export type PilotEnvironment = "staging" | "canary" | "production";
export type PilotGateState = "blocked" | "ready" | "running" | "aborted" | "completed";

export interface PilotCohort {
  organizationId: string;
  cohortId: string;
  environment: PilotEnvironment;
  tenantIds: string[];
  percentage: number;
  startAt: number;
  durationMs: number;
  approvalPresent: boolean;
  rollbackPlanHash: string;
}

export interface EndToEndFlowEvidence {
  organizationId: string;
  flowId: string;
  steps: string[];
  stepEvidenceHashes: string[];
  passed: boolean;
  exitCode: number;
  tenantIsolationPassed: boolean;
  accessibilityPassed: boolean;
  securityPassed: boolean;
  observedAt: number;
}

export interface PilotReleaseGate {
  organizationId: string;
  releaseId: string;
  requiredFlowIds: string[];
  flowEvidence: EndToEndFlowEvidence[];
  openIncidents: number;
  securityFindings: number;
  rollbackEvidenceHash: string;
  approvalPresent: boolean;
  gateState: PilotGateState;
}

export interface PilotReleaseDecision {
  allowed: boolean;
  reasons: string[];
  state: PilotGateState;
  requiresApproval: boolean;
  auditHash: string;
}

export class PilotReleaseGateContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PilotReleaseGateContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new PilotReleaseGateContractError(`${label} is required`);
}

export function validatePilotCohort(cohort: PilotCohort, now: number): PilotReleaseDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[cohort.organizationId, "organizationId"], [cohort.cohortId, "cohortId"], [cohort.rollbackPlanHash, "rollbackPlanHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (cohort.tenantIds.length === 0 || new Set(cohort.tenantIds).size !== cohort.tenantIds.length) reasons.push("pilot cohort tenants must be non-empty and unique");
  if (!Number.isInteger(cohort.percentage) || cohort.percentage < 1 || cohort.percentage > 25) reasons.push("pilot percentage must be between 1 and 25");
  if (!Number.isFinite(cohort.startAt) || cohort.startAt < now) reasons.push("pilot start time must not be in the past");
  if (!Number.isInteger(cohort.durationMs) || cohort.durationMs < 60_000) reasons.push("pilot duration is too short");
  if (!cohort.approvalPresent) reasons.push("pilot cohort requires approval");
  return { allowed: reasons.length === 0, reasons, state: reasons.length === 0 ? "ready" : "blocked", requiresApproval: true, auditHash: hash(JSON.stringify({ cohort, now, reasons })) };
}

export function validateEndToEndFlowEvidence(evidence: EndToEndFlowEvidence, now: number): PilotReleaseDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.flowId, "flowId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (evidence.steps.length === 0 || evidence.steps.length !== evidence.stepEvidenceHashes.length) reasons.push("every E2E step needs evidence");
  if (evidence.exitCode !== 0 || !evidence.passed) reasons.push("E2E flow did not pass");
  if (!evidence.tenantIsolationPassed) reasons.push("E2E tenant isolation failed");
  if (!evidence.accessibilityPassed) reasons.push("E2E accessibility evidence failed");
  if (!evidence.securityPassed) reasons.push("E2E security evidence failed");
  if (!Number.isFinite(evidence.observedAt) || evidence.observedAt > now) reasons.push("E2E evidence timestamp is invalid");
  return { allowed: reasons.length === 0, reasons, state: reasons.length === 0 ? "completed" : "blocked", requiresApproval: false, auditHash: hash(JSON.stringify({ evidence, now, reasons })) };
}

export function decidePilotReleaseGate(gate: PilotReleaseGate): PilotReleaseDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[gate.organizationId, "organizationId"], [gate.releaseId, "releaseId"], [gate.rollbackEvidenceHash, "rollbackEvidenceHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  for (const flowId of gate.requiredFlowIds) if (!gate.flowEvidence.some((evidence) => evidence.flowId === flowId && evidence.passed && evidence.exitCode === 0 && evidence.tenantIsolationPassed && evidence.accessibilityPassed && evidence.securityPassed)) reasons.push(`required E2E flow evidence is missing: ${flowId}`);
  if (gate.openIncidents > 0) reasons.push("open incidents block release gate");
  if (gate.securityFindings > 0) reasons.push("security findings block release gate");
  if (!gate.approvalPresent) reasons.push("release gate requires approval");
  const state: PilotGateState = reasons.length === 0 ? "ready" : "blocked";
  return { allowed: reasons.length === 0, reasons, state, requiresApproval: true, auditHash: hash(JSON.stringify({ gate, reasons })) };
}

export function decidePilotAbort(organizationId: string, cohortId: string, trigger: "metric_breach" | "incident" | "manual", rollbackPlanHash: string, approvalPresent: boolean): PilotReleaseDecision {
  required(organizationId, "organizationId");
  required(cohortId, "cohortId");
  required(rollbackPlanHash, "rollbackPlanHash");
  const reasons: string[] = [];
  if (trigger === "manual" && !approvalPresent) reasons.push("manual pilot abort requires approval");
  return { allowed: reasons.length === 0, reasons, state: reasons.length === 0 ? "aborted" : "blocked", requiresApproval: trigger === "manual", auditHash: hash(JSON.stringify({ organizationId, cohortId, trigger, rollbackPlanHash, approvalPresent, reasons })) };
}
