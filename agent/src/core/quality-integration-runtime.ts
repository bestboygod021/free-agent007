/** M87 contracts for E2E, load/security and accessibility integration evidence. */

export type QualityScenarioKind = "e2e" | "load" | "security" | "accessibility";
export type QualityEnvironment = "local" | "staging" | "canary";

export interface QualityScenarioContract {
  organizationId: string;
  scenarioId: string;
  kind: QualityScenarioKind;
  environment: QualityEnvironment;
  seed: number;
  fixtureHash: string;
  expectedOutcomeHash: string;
  tenantIsolationRequired: boolean;
  untrustedInputPresent: boolean;
  secretsRedacted: boolean;
  approvalPresent: boolean;
}

export interface QualityE2eEvidence {
  organizationId: string;
  scenarioId: string;
  runId: string;
  steps: Array<{ name: string; evidenceHash: string; exitCode: number }>;
  tenantIsolationPassed: boolean;
  securityPassed: boolean;
  accessibilityPassed: boolean;
  artifactHash: string;
  completedAt: number;
}

export interface QualityLoadSecurityEvidence {
  organizationId: string;
  evidenceId: string;
  kind: "load" | "security";
  runnerReference: string;
  reportHash: string;
  threshold: number;
  measured: number;
  passed: boolean;
  secretsRedacted: boolean;
  environment: QualityEnvironment;
}

export interface QualityAccessibilityEvidence {
  organizationId: string;
  evidenceId: string;
  screenId: string;
  axeReportHash: string;
  keyboardPassed: boolean;
  contrastPassed: boolean;
  screenReaderPassed: boolean;
  rtlPassed: boolean;
  reducedMotionPassed: boolean;
  locale: string;
}

export interface QualityIntegrationDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  auditHash: string;
}

export class QualityIntegrationContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QualityIntegrationContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

export function validateQualityScenario(scenario: QualityScenarioContract): QualityIntegrationDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[scenario.organizationId, "organizationId"], [scenario.scenarioId, "scenarioId"], [scenario.fixtureHash, "fixtureHash"], [scenario.expectedOutcomeHash, "expectedOutcomeHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isSafeInteger(scenario.seed) || scenario.seed < 0) reasons.push("quality seed is invalid");
  if (scenario.kind === "e2e" && !scenario.tenantIsolationRequired) reasons.push("product E2E requires tenant isolation probe");
  if (!scenario.secretsRedacted) reasons.push("quality fixture must be redacted");
  if (scenario.environment === "canary" && !scenario.approvalPresent) reasons.push("canary quality scenario requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: scenario.environment === "canary", auditHash: hash(JSON.stringify({ scenario, reasons })) };
}

export function decideQualityE2eEvidence(evidence: QualityE2eEvidence, scenario: QualityScenarioContract): QualityIntegrationDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.scenarioId, "scenarioId"], [evidence.runId, "runId"], [evidence.artifactHash, "artifactHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (evidence.organizationId !== scenario.organizationId || evidence.scenarioId !== scenario.scenarioId) reasons.push("E2E evidence does not match scenario boundary");
  if (evidence.steps.length === 0 || evidence.steps.some((step) => !step.name.trim() || !step.evidenceHash.trim() || step.exitCode !== 0)) reasons.push("E2E step evidence is incomplete");
  if (!evidence.tenantIsolationPassed || !evidence.securityPassed || !evidence.accessibilityPassed) reasons.push("E2E quality gates are incomplete");
  if (!Number.isFinite(evidence.completedAt)) reasons.push("E2E completion timestamp is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ evidence, scenario: scenario.scenarioId, reasons })) };
}

export function validateQualityLoadSecurityEvidence(evidence: QualityLoadSecurityEvidence): QualityIntegrationDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.evidenceId, "evidenceId"], [evidence.runnerReference, "runnerReference"], [evidence.reportHash, "reportHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(evidence.threshold) || !Number.isFinite(evidence.measured)) reasons.push("quality measurement is invalid");
  if (!evidence.passed || !evidence.secretsRedacted) reasons.push("load/security evidence did not pass");
  if (evidence.kind === "load" && evidence.measured > evidence.threshold) reasons.push("load measurement exceeded threshold");
  return { allowed: reasons.length === 0, reasons, requiresApproval: evidence.environment === "canary", auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function validateQualityAccessibilityEvidence(evidence: QualityAccessibilityEvidence): QualityIntegrationDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.evidenceId, "evidenceId"], [evidence.screenId, "screenId"], [evidence.axeReportHash, "axeReportHash"], [evidence.locale, "locale"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!evidence.keyboardPassed || !evidence.contrastPassed || !evidence.screenReaderPassed || !evidence.rtlPassed || !evidence.reducedMotionPassed) reasons.push("accessibility evidence is incomplete");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
