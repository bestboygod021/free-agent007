/** M60 contracts for reproducible model evaluation, trust and activation gates. */

export type ModelEvaluationDimension = "quality" | "safety" | "latency" | "cost" | "tool_use" | "structured_output" | "privacy";
export type ModelTrustLevel = "unverified" | "screened" | "trusted" | "blocked";

export interface ModelEvaluationPlan {
  organizationId: string;
  catalogId: string;
  modelId: string;
  datasetId: string;
  caseIds: string[];
  dimensions: readonly ModelEvaluationDimension[];
  runner: "local" | "sandbox" | "ci";
  environmentDigest: string;
  seed: number;
  budgetAllowed: boolean;
  providerTermsReviewed: boolean;
}

export interface ModelEvaluationObservation {
  caseId: string;
  modelId: string;
  dimension: ModelEvaluationDimension;
  passed: boolean;
  score: number;
  latencyMs: number;
  cost: number;
  outputHash: string;
  safetyFindingCount: number;
  evidenceHash: string;
}

export interface ModelTrustProfile {
  organizationId: string;
  catalogId: string;
  modelId: string;
  trustLevel: ModelTrustLevel;
  qualityScore: number;
  safetyScore: number;
  latencyP95Ms: number;
  totalCost: number;
  evaluationHash: string;
  evaluatedAt: number;
  reviewerApproved: boolean;
}

export interface ModelEvaluationDecision {
  allowed: boolean;
  reasons: string[];
  trustLevel: ModelTrustLevel;
  auditHash: string;
}

export class ModelEvaluationTrustContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelEvaluationTrustContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new ModelEvaluationTrustContractError(`${label} is required`);
}

export function validateModelEvaluationPlan(plan: ModelEvaluationPlan): ModelEvaluationDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[plan.organizationId, "organizationId"], [plan.catalogId, "catalogId"], [plan.modelId, "modelId"], [plan.datasetId, "datasetId"], [plan.environmentDigest, "environmentDigest"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (plan.caseIds.length === 0 || new Set(plan.caseIds).size !== plan.caseIds.length) reasons.push("evaluation cases must be non-empty and unique");
  if (plan.dimensions.length === 0 || new Set(plan.dimensions).size !== plan.dimensions.length) reasons.push("evaluation dimensions must be non-empty and unique");
  if (!Number.isSafeInteger(plan.seed) || plan.seed < 0) reasons.push("evaluation seed is invalid");
  if (!plan.budgetAllowed) reasons.push("evaluation budget gate denied execution");
  if (!plan.providerTermsReviewed) reasons.push("provider terms must be reviewed before evaluation");
  return { allowed: reasons.length === 0, reasons, trustLevel: "unverified", auditHash: hash(JSON.stringify({ plan, reasons })) };
}

export function aggregateModelEvaluation(observations: readonly ModelEvaluationObservation[]): ModelEvaluationDecision {
  if (observations.length === 0) throw new ModelEvaluationTrustContractError("at least one model observation is required");
  const reasons: string[] = [];
  for (const observation of observations) {
    for (const [value, label] of [[observation.caseId, "caseId"], [observation.modelId, "modelId"], [observation.outputHash, "outputHash"], [observation.evidenceHash, "evidenceHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
    if (!Number.isFinite(observation.score) || observation.score < 0 || observation.score > 1) reasons.push("model score is outside 0..1");
    if (!Number.isFinite(observation.latencyMs) || observation.latencyMs < 0 || !Number.isFinite(observation.cost) || observation.cost < 0 || !Number.isInteger(observation.safetyFindingCount) || observation.safetyFindingCount < 0) reasons.push("model observation metrics are invalid");
  }
  if (reasons.length > 0) return { allowed: false, reasons, trustLevel: "blocked", auditHash: hash(JSON.stringify({ observations, reasons })) };
  const safetyFindings = observations.reduce((sum, item) => sum + item.safetyFindingCount, 0);
  const mean = observations.reduce((sum, item) => sum + item.score, 0) / observations.length;
  return { allowed: safetyFindings === 0, reasons: safetyFindings === 0 ? [] : ["model evaluation found safety findings"], trustLevel: safetyFindings === 0 && mean >= 0.7 ? "screened" : "blocked", auditHash: hash(JSON.stringify({ observations, mean, safetyFindings })) };
}

export function decideModelTrustGate(profile: ModelTrustProfile, minimumQuality = 0.7, minimumSafety = 0.99): ModelEvaluationDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[profile.organizationId, "organizationId"], [profile.catalogId, "catalogId"], [profile.modelId, "modelId"], [profile.evaluationHash, "evaluationHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(profile.qualityScore) || profile.qualityScore < minimumQuality) reasons.push("model quality is below trust threshold");
  if (!Number.isFinite(profile.safetyScore) || profile.safetyScore < minimumSafety) reasons.push("model safety is below trust threshold");
  if (!Number.isFinite(profile.latencyP95Ms) || profile.latencyP95Ms < 0 || !Number.isFinite(profile.totalCost) || profile.totalCost < 0) reasons.push("trust metrics are invalid");
  if (!Number.isFinite(profile.evaluatedAt)) reasons.push("evaluatedAt must be finite");
  if (!profile.reviewerApproved) reasons.push("trusted model requires reviewer approval");
  const trustLevel: ModelTrustLevel = reasons.length === 0 ? "trusted" : profile.safetyScore < minimumSafety ? "blocked" : "screened";
  return { allowed: reasons.length === 0, reasons, trustLevel, auditHash: hash(JSON.stringify({ profile, minimumQuality, minimumSafety, reasons })) };
}

export function validateModelFeedback(organizationId: string, modelId: string, feedbackHash: string, correctionHash: string | undefined, approvedForEvaluation: boolean): ModelEvaluationDecision {
  required(organizationId, "organizationId");
  required(modelId, "modelId");
  required(feedbackHash, "feedbackHash");
  const reasons: string[] = [];
  if (correctionHash !== undefined && !correctionHash.trim()) reasons.push("correction hash cannot be empty");
  if (!approvedForEvaluation) reasons.push("feedback needs consent before entering evaluation");
  return { allowed: reasons.length === 0, reasons, trustLevel: "screened", auditHash: hash(JSON.stringify({ organizationId, modelId, feedbackHash, correctionHash, approvedForEvaluation, reasons })) };
}
