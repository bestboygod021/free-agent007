/** M199 fail-closed contracts for intent normalization and scope freeze. */

export type M199RiskLevel = "low" | "medium" | "high" | "critical";

export interface M199Intent {
  organizationId: string;
  intentId: string;
  actorHash: string;
  goalHash: string;
  constraints: string[];
  allowedTools: string[];
  targetPaths: string[];
  riskLevel: M199RiskLevel;
  budgetCents: number;
  expiresAt: number;
  approvalPresent: boolean;
  noScopeExpansion: boolean;
  tenantBound: boolean;
}

export interface M199ScopeDecision {
  organizationId: string;
  intentId: string;
  scopeId: string;
  requestedTargets: string[];
  approvedTargets: string[];
  approvedTools: string[];
  policyHash: string;
  changesHash: string;
  noExpansion: boolean;
  approvalPresent: boolean;
  tenantMatch: boolean;
}

export interface M199PlanContract {
  organizationId: string;
  intentId: string;
  planId: string;
  requirementHashes: string[];
  acceptanceHashes: string[];
  dependencyHashes: string[];
  estimatedCostCents: number;
  estimatedDurationSeconds: number;
  scopeHash: string;
  policyHash: string;
  tenantMatch: boolean;
}

export interface M199ScopeFreeze {
  organizationId: string;
  intentId: string;
  freezeId: string;
  scopeHash: string;
  planHash: string;
  approvedAt: number;
  expiresAt: number;
  changeRequestAllowed: boolean;
  approvalPresent: boolean;
  tenantMatch: boolean;
}

export interface M199IntentDecision {
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

export function validateM199Intent(intent: M199Intent, now: number): M199IntentDecision {
  const reasons: string[] = [];
  required([[intent.organizationId, "organizationId"], [intent.intentId, "intentId"], [intent.actorHash, "actorHash"], [intent.goalHash, "goalHash"]], reasons);
  if (intent.constraints.length === 0 || intent.allowedTools.some((tool) => !tool.trim()) || intent.targetPaths.length === 0 || intent.targetPaths.some((path) => !path.trim()) || !Number.isInteger(intent.budgetCents) || intent.budgetCents < 0 || !Number.isFinite(intent.expiresAt) || intent.expiresAt <= now || !intent.approvalPresent || !intent.noScopeExpansion || !intent.tenantBound) reasons.push("intent needs explicit constraints, targets, budget, approval, expiry and tenant scope");
  return { allowed: reasons.length === 0, reasons, requiresApproval: intent.riskLevel === "high" || intent.riskLevel === "critical", auditHash: hash(JSON.stringify({ intent, now, reasons })) };
}

export function decideM199Scope(scope: M199ScopeDecision): M199IntentDecision {
  const reasons: string[] = [];
  required([[scope.organizationId, "organizationId"], [scope.intentId, "intentId"], [scope.scopeId, "scopeId"], [scope.policyHash, "policyHash"], [scope.changesHash, "changesHash"]], reasons);
  if (scope.requestedTargets.length === 0 || scope.approvedTargets.length === 0 || scope.approvedTargets.some((target) => !scope.requestedTargets.includes(target)) || scope.approvedTools.length === 0 || !scope.noExpansion || !scope.approvalPresent || !scope.tenantMatch) reasons.push("scope decision needs bounded targets, tools, no expansion, approval and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ scope, reasons })) };
}

export function validateM199Plan(plan: M199PlanContract): M199IntentDecision {
  const reasons: string[] = [];
  required([[plan.organizationId, "organizationId"], [plan.intentId, "intentId"], [plan.planId, "planId"], [plan.scopeHash, "scopeHash"], [plan.policyHash, "policyHash"]], reasons);
  if (plan.requirementHashes.length === 0 || plan.acceptanceHashes.length === 0 || plan.dependencyHashes.some((dependency) => !dependency.trim()) || !Number.isInteger(plan.estimatedCostCents) || plan.estimatedCostCents < 0 || !Number.isInteger(plan.estimatedDurationSeconds) || plan.estimatedDurationSeconds < 1 || !plan.tenantMatch) reasons.push("plan needs requirements, acceptance, bounded estimates, scope and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ plan, reasons })) };
}

export function decideM199Freeze(freeze: M199ScopeFreeze, now: number): M199IntentDecision {
  const reasons: string[] = [];
  required([[freeze.organizationId, "organizationId"], [freeze.intentId, "intentId"], [freeze.freezeId, "freezeId"], [freeze.scopeHash, "scopeHash"], [freeze.planHash, "planHash"]], reasons);
  if (!Number.isFinite(freeze.approvedAt) || !Number.isFinite(freeze.expiresAt) || freeze.expiresAt <= freeze.approvedAt || freeze.expiresAt <= now || freeze.changeRequestAllowed || !freeze.approvalPresent || !freeze.tenantMatch) reasons.push("scope freeze needs fresh expiry, no-unapproved-change, approval and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ freeze, now, reasons })) };
}
