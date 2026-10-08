/** M32 contracts for observability, SLO, FinOps, incident and restore evidence. */

export interface MetricSample {
  organizationId: string;
  runId: string;
  name: "availability" | "latency_ms" | "error_rate" | "tokens" | "cost";
  value: number;
  observedAt: number;
  unit: string;
}

export interface MetricDecision {
  accepted: boolean;
  reasons: string[];
  sampleHash: string;
}

export interface IncidentDecision {
  accepted: boolean;
  reasons: string[];
  evidenceHash: string;
}

export interface OperationsSloWindow {
  targetAvailability: number;
  observedAvailability: number;
  targetLatencyMs: number;
  observedP95LatencyMs: number;
  errorBudgetRemaining: number;
  windowMs: number;
}

export interface SloDecision {
  allowed: boolean;
  burnRate: number;
  reasons: string[];
  requiresIncident: boolean;
}

export interface CostLedgerEntry {
  organizationId: string;
  runId: string;
  idempotencyKey: string;
  estimatedCost: number;
  actualCost: number;
  tokenCount: number;
  currency: "USD";
}

export interface Reconciliation {
  organizationId: string;
  runId: string;
  delta: number;
  withinTolerance: boolean;
  sourceHash: string;
}

export interface RestoreDrillPlan {
  organizationId: string;
  backupId: string;
  targetEnvironment: "isolated" | "staging" | "production";
  expectedRpoMs: number;
  expectedRtoMs: number;
  steps: string[];
  requiresHumanApproval: true;
  evidenceRequired: string[];
  planHash: string;
}

export interface IncidentAction {
  incidentId: string;
  severity: "low" | "medium" | "high" | "critical";
  ownerId: string;
  step: string;
  status: "planned" | "running" | "verified";
  evidenceHash?: string;
}

export class OperationsEvidenceContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperationsEvidenceContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

export function validateMetricSample(sample: MetricSample): MetricDecision {
  const reasons: string[] = [];
  if (!sample.organizationId.trim() || !sample.runId.trim()) reasons.push("metric tenant and run are required");
  if (!Number.isFinite(sample.value) || sample.value < 0) reasons.push("metric value must be non-negative");
  if (!Number.isFinite(sample.observedAt) || !sample.unit.trim()) reasons.push("metric timestamp and unit are required");
  return { accepted: reasons.length === 0, reasons, sampleHash: hash(JSON.stringify(sample)) };
}

export function evaluateSloWindow(window: OperationsSloWindow): SloDecision {
  const reasons: string[] = [];
  if (window.targetAvailability <= 0 || window.targetAvailability > 1 || window.observedAvailability < 0 || window.observedAvailability > 1) reasons.push("availability values are invalid");
  if (window.windowMs <= 0 || window.targetLatencyMs <= 0) reasons.push("SLO window is invalid");
  const burnRate = window.targetAvailability === 1 ? 0 : Math.max(0, (window.targetAvailability - window.observedAvailability) / (1 - window.targetAvailability));
  if (window.observedAvailability < window.targetAvailability) reasons.push("availability SLO is breached");
  if (window.observedP95LatencyMs > window.targetLatencyMs) reasons.push("latency SLO is breached");
  if (window.errorBudgetRemaining <= 0) reasons.push("error budget is exhausted");
  return { allowed: reasons.length === 0, burnRate: Number(burnRate.toFixed(6)), reasons, requiresIncident: reasons.length > 0 };
}

export function reconcileCost(entry: CostLedgerEntry, tolerance = 0.01): Reconciliation {
  if (!entry.organizationId.trim() || !entry.runId.trim() || !entry.idempotencyKey.trim() || entry.estimatedCost < 0 || entry.actualCost < 0 || entry.tokenCount < 0) throw new OperationsEvidenceContractError("cost ledger entry is invalid");
  const delta = Number((entry.actualCost - entry.estimatedCost).toFixed(6));
  return { organizationId: entry.organizationId, runId: entry.runId, delta, withinTolerance: Math.abs(delta) <= tolerance, sourceHash: hash(JSON.stringify({ ...entry, actualCost: Number(entry.actualCost.toFixed(6)) })) };
}

export function planRestoreDrill(input: Omit<RestoreDrillPlan, "requiresHumanApproval" | "evidenceRequired" | "planHash">): RestoreDrillPlan {
  if (!input.organizationId.trim() || !input.backupId.trim() || input.steps.length === 0) throw new OperationsEvidenceContractError("restore drill identity and steps are required");
  if (input.expectedRpoMs < 0 || input.expectedRtoMs <= 0) throw new OperationsEvidenceContractError("restore targets are invalid");
  if (input.targetEnvironment === "production") throw new OperationsEvidenceContractError("restore drills must target isolated or staging environments");
  const evidenceRequired = ["backup checksum", "tenant isolation result", "restore duration", "post-restore verification"];
  return { ...input, requiresHumanApproval: true, evidenceRequired, planHash: hash(JSON.stringify({ input, evidenceRequired })) };
}

export function verifyIncidentAction(action: IncidentAction): IncidentDecision {
  const reasons: string[] = [];
  if (!action.incidentId.trim() || !action.ownerId.trim() || !action.step.trim()) reasons.push("incident action identity is required");
  if (action.status === "verified" && !action.evidenceHash?.trim()) reasons.push("verified incident action requires evidence");
  return { accepted: reasons.length === 0, reasons, evidenceHash: hash(JSON.stringify({ action, reasons })) };
}
