/** M207 fail-closed contracts for side-effect-free action simulation and blast-radius preview. */

export interface M207Simulation {
  organizationId: string;
  simulationId: string;
  actionType: string;
  targetReferenceHash: string;
  inputHash: string;
  observedBeforeHash: string;
  predictedAfterHash: string;
  previewHash: string;
  affectedResources: string[];
  blastRadius: "none" | "bounded" | "unbounded";
  reversible: boolean;
  noSideEffect: boolean;
  sandboxed: boolean;
  tenantBound: boolean;
}

export interface M207ApplyDecision {
  organizationId: string;
  applyId: string;
  simulationId: string;
  simulationHash: string;
  preconditionHash: string;
  currentStateHash: string;
  approvalPresent: boolean;
  scopeMatch: boolean;
  previewReviewed: boolean;
  bounded: boolean;
  noUnexpectedDiff: boolean;
  tenantMatch: boolean;
}

export interface M207DiffEvidence {
  organizationId: string;
  simulationId: string;
  diffId: string;
  beforeHash: string;
  afterHash: string;
  changedResources: string[];
  secretFree: boolean;
  redacted: boolean;
  reviewable: boolean;
  tenantMatch: boolean;
}

export interface M207RollbackDecision {
  organizationId: string;
  rollbackId: string;
  applyId: string;
  rollbackPlanHash: string;
  reasonHash: string;
  reversible: boolean;
  approvalPresent: boolean;
  preconditionPassed: boolean;
  bounded: boolean;
  cleanupEvidenceHash: string;
  tenantMatch: boolean;
}

export interface M207SimulationDecision {
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

export function validateM207Simulation(simulation: M207Simulation): M207SimulationDecision {
  const reasons: string[] = [];
  required([[simulation.organizationId, "organizationId"], [simulation.simulationId, "simulationId"], [simulation.actionType, "actionType"], [simulation.targetReferenceHash, "targetReferenceHash"], [simulation.inputHash, "inputHash"], [simulation.observedBeforeHash, "observedBeforeHash"], [simulation.predictedAfterHash, "predictedAfterHash"], [simulation.previewHash, "previewHash"]], reasons);
  if (simulation.affectedResources.length === 0 || simulation.affectedResources.some((resource) => !resource.trim()) || simulation.blastRadius === "unbounded" || !simulation.reversible || !simulation.noSideEffect || !simulation.sandboxed || !simulation.tenantBound) reasons.push("simulation needs bounded affected resources, reversibility, no side effect, sandbox and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ simulation, reasons })) };
}

export function decideM207Apply(apply: M207ApplyDecision): M207SimulationDecision {
  const reasons: string[] = [];
  required([[apply.organizationId, "organizationId"], [apply.applyId, "applyId"], [apply.simulationId, "simulationId"], [apply.simulationHash, "simulationHash"], [apply.preconditionHash, "preconditionHash"], [apply.currentStateHash, "currentStateHash"]], reasons);
  if (!apply.approvalPresent || !apply.scopeMatch || !apply.previewReviewed || !apply.bounded || !apply.noUnexpectedDiff || !apply.tenantMatch) reasons.push("apply needs reviewed simulation, approval, scope/precondition match, bounded diff and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ apply, reasons })) };
}

export function validateM207Diff(diff: M207DiffEvidence): M207SimulationDecision {
  const reasons: string[] = [];
  required([[diff.organizationId, "organizationId"], [diff.simulationId, "simulationId"], [diff.diffId, "diffId"], [diff.beforeHash, "beforeHash"], [diff.afterHash, "afterHash"]], reasons);
  if (diff.changedResources.length === 0 || diff.changedResources.some((resource) => !resource.trim()) || !diff.secretFree || !diff.redacted || !diff.reviewable || !diff.tenantMatch) reasons.push("diff needs reviewable changed resources, redaction, no secrets and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ diff, reasons })) };
}

export function decideM207Rollback(rollback: M207RollbackDecision): M207SimulationDecision {
  const reasons: string[] = [];
  required([[rollback.organizationId, "organizationId"], [rollback.rollbackId, "rollbackId"], [rollback.applyId, "applyId"], [rollback.rollbackPlanHash, "rollbackPlanHash"], [rollback.reasonHash, "reasonHash"], [rollback.cleanupEvidenceHash, "cleanupEvidenceHash"]], reasons);
  if (!rollback.reversible || !rollback.approvalPresent || !rollback.preconditionPassed || !rollback.bounded || !rollback.tenantMatch) reasons.push("rollback needs reversible bounded plan, approval, precondition and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ rollback, reasons })) };
}
