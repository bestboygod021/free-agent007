/** M182 fail-closed contracts for onboarding and a safe first run. */

export type M182ComputeMode = "local" | "free" | "byok";
export type M182OnboardingState = "planned" | "consented" | "started" | "completed" | "blocked";

export interface M182OnboardingPlan {
  organizationId: string;
  onboardingId: string;
  mode: M182ComputeMode;
  steps: string[];
  locale: string;
  consentPresent: boolean;
  dataEgressPolicy: "never" | "approved";
  providerReference: string;
  state: M182OnboardingState;
  sandboxVerified: boolean;
  syntheticFixtureOnly: boolean;
  tenantBound: boolean;
}

export interface M182FirstRunRequest {
  organizationId: string;
  onboardingId: string;
  runId: string;
  fixtureHash: string;
  mode: M182ComputeMode;
  noRealRepository: boolean;
  noExternalMutation: boolean;
  egressApproved: boolean;
  budgetTokens: number;
  redacted: boolean;
  tenantMatch: boolean;
}

export interface M182ProgressEvidence {
  organizationId: string;
  onboardingId: string;
  evidenceId: string;
  completedSteps: string[];
  failedSteps: string[];
  evidenceHash: string;
  secretsRedacted: boolean;
  syntheticData: boolean;
  tenantMatch: boolean;
}

export interface M182Completion {
  organizationId: string;
  onboardingId: string;
  completionId: string;
  mode: M182ComputeMode;
  consentHash: string;
  safetyChecklistHash: string;
  userConfirmed: boolean;
  fallbackDisclosed: boolean;
  noSecretsStored: boolean;
  evidenceHash: string;
  tenantMatch: boolean;
}

export interface M182OnboardingDecision {
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

export function validateM182Plan(plan: M182OnboardingPlan): M182OnboardingDecision {
  const reasons: string[] = [];
  required([[plan.organizationId, "organizationId"], [plan.onboardingId, "onboardingId"], [plan.locale, "locale"], [plan.providerReference, "providerReference"]], reasons);
  if (plan.steps.length === 0 || plan.steps.some((step) => !step.trim())) reasons.push("onboarding steps are required");
  if (!plan.consentPresent || plan.dataEgressPolicy === "approved" && plan.mode === "local" || !plan.sandboxVerified || !plan.syntheticFixtureOnly || !plan.tenantBound) reasons.push("onboarding consent, egress, sandbox, fixture or tenant gate failed");
  return { allowed: reasons.length === 0, reasons, requiresApproval: plan.dataEgressPolicy === "approved", auditHash: hash(JSON.stringify({ plan, reasons })) };
}

export function decideM182FirstRun(request: M182FirstRunRequest): M182OnboardingDecision {
  const reasons: string[] = [];
  required([[request.organizationId, "organizationId"], [request.onboardingId, "onboardingId"], [request.runId, "runId"], [request.fixtureHash, "fixtureHash"]], reasons);
  if (!request.noRealRepository || !request.noExternalMutation || (request.mode !== "local" && !request.egressApproved) || !Number.isInteger(request.budgetTokens) || request.budgetTokens < 1 || !request.redacted || !request.tenantMatch) reasons.push("first run needs synthetic, mutation, egress, budget, redaction and tenant gates");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.mode !== "local", auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateM182Progress(progress: M182ProgressEvidence): M182OnboardingDecision {
  const reasons: string[] = [];
  required([[progress.organizationId, "organizationId"], [progress.onboardingId, "onboardingId"], [progress.evidenceId, "evidenceId"], [progress.evidenceHash, "evidenceHash"]], reasons);
  if (progress.completedSteps.length === 0 || progress.completedSteps.some((step) => !step.trim()) || progress.failedSteps.some((step) => !step.trim()) || !progress.secretsRedacted || !progress.syntheticData || !progress.tenantMatch) reasons.push("progress evidence is incomplete or unsafe");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ progress, reasons })) };
}

export function decideM182Completion(completion: M182Completion): M182OnboardingDecision {
  const reasons: string[] = [];
  required([[completion.organizationId, "organizationId"], [completion.onboardingId, "onboardingId"], [completion.completionId, "completionId"], [completion.consentHash, "consentHash"], [completion.safetyChecklistHash, "safetyChecklistHash"], [completion.evidenceHash, "evidenceHash"]], reasons);
  if (!completion.userConfirmed || !completion.fallbackDisclosed || !completion.noSecretsStored || !completion.tenantMatch) reasons.push("completion needs user confirmation, fallback disclosure, no-secret and tenant evidence");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ completion, reasons })) };
}
