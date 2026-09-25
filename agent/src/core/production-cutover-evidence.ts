/** M48 contracts for production integration evidence and controlled cutover. */

export type EvidenceLevel = "design" | "kernel" | "integration" | "production";
export type CutoverTarget = "staging" | "canary" | "production";

export interface IntegrationEvidence {
  organizationId: string;
  capabilityId: string;
  adapterId: string;
  environment: "local" | "staging" | "production";
  commandHash: string;
  artifactHash: string;
  exitCode: number;
  observedAt: number;
  tenantProbePassed: boolean;
  evidenceLevel: EvidenceLevel;
}

export interface CutoverDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  evidenceHash: string;
}

export interface ReadinessGate {
  organizationId: string;
  capabilityId: string;
  requiredEvidence: EvidenceLevel[];
  evidence: IntegrationEvidence[];
  securityFindings: number;
  openIncidents: number;
  rollbackPlanHash: string;
  approvalPresent: boolean;
}

export interface CanaryPlan {
  organizationId: string;
  capabilityId: string;
  target: "staging" | "canary";
  percentage: number;
  durationMs: number;
  successMetric: string;
  abortMetric: string;
  approvalPresent: boolean;
}

export interface CutoverPlan {
  organizationId: string;
  capabilityId: string;
  target: CutoverTarget;
  changeHash: string;
  dependencyEvidenceHashes: string[];
  dependencyEvidenceLevels: EvidenceLevel[];
  rollbackPlanHash: string;
  approvalPresent: boolean;
}

export class ProductionCutoverEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionCutoverEvidenceError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new ProductionCutoverEvidenceError(`${label} is required`);
}

export function validateIntegrationEvidence(evidence: IntegrationEvidence): CutoverDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.capabilityId, "capabilityId"], [evidence.adapterId, "adapterId"], [evidence.commandHash, "commandHash"], [evidence.artifactHash, "artifactHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(evidence.exitCode) || evidence.exitCode !== 0) reasons.push("integration command did not pass");
  if (!Number.isFinite(evidence.observedAt)) reasons.push("observedAt must be finite");
  if (!evidence.tenantProbePassed) reasons.push("tenant isolation probe did not pass");
  if (evidence.evidenceLevel === "production" && evidence.environment !== "production") reasons.push("production evidence must come from production environment");
  return { allowed: reasons.length === 0, reasons, requiresApproval: evidence.environment === "production", evidenceHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function decideReadinessGate(gate: ReadinessGate): CutoverDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[gate.organizationId, "organizationId"], [gate.capabilityId, "capabilityId"], [gate.rollbackPlanHash, "rollbackPlanHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  for (const level of gate.requiredEvidence) if (!gate.evidence.some((item) => item.evidenceLevel === level && item.exitCode === 0 && item.tenantProbePassed)) reasons.push(`required evidence level missing: ${level}`);
  if (gate.securityFindings > 0) reasons.push("security findings block cutover");
  if (gate.openIncidents > 0) reasons.push("open incidents block cutover");
  if (!gate.approvalPresent) reasons.push("readiness gate requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, evidenceHash: hash(JSON.stringify({ gate, reasons })) };
}

export function planCanary(plan: CanaryPlan): CutoverDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[plan.organizationId, "organizationId"], [plan.capabilityId, "capabilityId"], [plan.successMetric, "successMetric"], [plan.abortMetric, "abortMetric"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(plan.percentage) || plan.percentage < 1 || plan.percentage > 25) reasons.push("canary percentage must be between 1 and 25");
  if (!Number.isInteger(plan.durationMs) || plan.durationMs < 60_000) reasons.push("canary duration is too short");
  if (!plan.approvalPresent) reasons.push("canary requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, evidenceHash: hash(JSON.stringify({ plan, reasons })) };
}

export function planCutover(plan: CutoverPlan): CutoverDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[plan.organizationId, "organizationId"], [plan.capabilityId, "capabilityId"], [plan.changeHash, "changeHash"], [plan.rollbackPlanHash, "rollbackPlanHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (plan.dependencyEvidenceHashes.length === 0) reasons.push("cutover requires dependency evidence");
  if (plan.dependencyEvidenceHashes.length !== plan.dependencyEvidenceLevels.length) reasons.push("each dependency evidence hash requires an evidence level");
  if (plan.target === "production" && !plan.dependencyEvidenceLevels.some((level) => level === "integration" || level === "production")) reasons.push("production cutover requires integration evidence");
  if (plan.target === "production" && !plan.approvalPresent) reasons.push("production cutover requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: plan.target === "production", evidenceHash: hash(JSON.stringify({ plan, reasons })) };
}

export function validateRollbackEvidence(organizationId: string, capabilityId: string, rollbackPlanHash: string, trigger: "metric_breach" | "incident" | "manual", approvalPresent: boolean): CutoverDecision {
  for (const [value, label] of [[organizationId, "organizationId"], [capabilityId, "capabilityId"], [rollbackPlanHash, "rollbackPlanHash"]] as const) required(value, label);
  const reasons: string[] = [];
  if (trigger === "manual" && !approvalPresent) reasons.push("manual rollback requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: trigger === "manual", evidenceHash: hash(JSON.stringify({ organizationId, capabilityId, rollbackPlanHash, trigger, approvalPresent, reasons })) };
}
