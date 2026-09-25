/** M42 contracts for toolchain matrix, CI gates, E2E and quality evidence. */

export type QualityRunner = "vitest" | "pytest" | "go" | "cargo" | "phpunit" | "junit";
export type QualitySurface = "e2e" | "load" | "security" | "accessibility";

export interface ToolchainCell {
  organizationId: string;
  language: "node" | "python" | "go" | "rust" | "java" | "php";
  runner: QualityRunner;
  imageDigest: string;
  version: string;
  allowed: boolean;
}

export interface QualityDecision {
  allowed: boolean;
  reasons: string[];
  evidenceHash: string;
}

export interface AdapterTestResult {
  runner: QualityRunner;
  exitCode: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  logHash: string;
  artifactHash: string;
}

export interface NormalizedAdapterResult {
  status: "passed" | "failed" | "cancelled";
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  evidenceHash: string;
}

export interface EndToEndScenario {
  organizationId: string;
  scenarioId: string;
  steps: string[];
  environment: "local" | "self_host" | "staging";
  requiresExternalConnector: boolean;
  connectorFixtureHash?: string;
  approvalStepPresent: boolean;
}

export interface CiQualityGate {
  organizationId: string;
  commitSha: string;
  requiredSurfaces: QualitySurface[];
  passedSurfaces: QualitySurface[];
  testResults: NormalizedAdapterResult[];
  securityFindings: number;
  accessibilityCriticalFindings: number;
  approvalPresent: boolean;
}

export interface AccessibilityEvidence {
  organizationId: string;
  page: string;
  locale: "fa-IR" | "en-US";
  keyboard: boolean;
  focusVisible: boolean;
  rtlChecked: boolean;
  criticalFindings: number;
  reportHash: string;
}

export class QualityCiContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QualityCiContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new QualityCiContractError(`${label} is required`);
}

export function validateToolchainCell(cell: ToolchainCell): QualityDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[cell.organizationId, "organizationId"], [cell.imageDigest, "imageDigest"], [cell.version, "version"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!/^sha256:[a-f0-9]{8,}$/i.test(cell.imageDigest)) reasons.push("toolchain image must be digest-pinned");
  if (!cell.allowed) reasons.push("toolchain cell is not allowlisted");
  return { allowed: reasons.length === 0, reasons, evidenceHash: hash(JSON.stringify({ cell, reasons })) };
}

export function normalizeAdapterTestResult(result: AdapterTestResult): NormalizedAdapterResult {
  for (const [value, label] of [[result.logHash, "logHash"], [result.artifactHash, "artifactHash"]] as const) required(value, label);
  if (!Number.isInteger(result.exitCode) || result.passed < 0 || result.failed < 0 || result.skipped < 0 || result.durationMs < 0) throw new QualityCiContractError("adapter result is invalid");
  const total = result.passed + result.failed + result.skipped;
  const status = result.exitCode === 0 && result.failed === 0 ? "passed" : result.exitCode < 0 ? "cancelled" : "failed";
  return { status, total, passed: result.passed, failed: result.failed, skipped: result.skipped, durationMs: result.durationMs, evidenceHash: hash(JSON.stringify(result)) };
}

export function planEndToEndScenario(scenario: EndToEndScenario): QualityDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[scenario.organizationId, "organizationId"], [scenario.scenarioId, "scenarioId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (scenario.steps.length < 4) reasons.push("E2E scenario must cover the critical user journey");
  if (!scenario.approvalStepPresent) reasons.push("E2E scenario must include human approval");
  if (scenario.requiresExternalConnector && !scenario.connectorFixtureHash) reasons.push("external connector scenario requires a fixture or recorded contract");
  return { allowed: reasons.length === 0, reasons, evidenceHash: hash(JSON.stringify({ scenario, reasons })) };
}

export function decideCiQualityGate(gate: CiQualityGate): QualityDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[gate.organizationId, "organizationId"], [gate.commitSha, "commitSha"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (gate.requiredSurfaces.some((surface) => !gate.passedSurfaces.includes(surface))) reasons.push("required quality surface did not pass");
  if (gate.testResults.some((result) => result.status !== "passed")) reasons.push("a required test result failed or was cancelled");
  if (gate.securityFindings > 0) reasons.push("security findings block the gate");
  if (gate.accessibilityCriticalFindings > 0) reasons.push("critical accessibility findings block the gate");
  if (gate.requiredSurfaces.includes("e2e") && !gate.approvalPresent) reasons.push("E2E release gate requires approval");
  return { allowed: reasons.length === 0, reasons, evidenceHash: hash(JSON.stringify({ gate, reasons })) };
}

export function validateAccessibilityEvidence(evidence: AccessibilityEvidence): QualityDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.page, "page"], [evidence.reportHash, "reportHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!evidence.keyboard || !evidence.focusVisible) reasons.push("keyboard and visible focus evidence is required");
  if (evidence.locale === "fa-IR" && !evidence.rtlChecked) reasons.push("fa-IR accessibility requires RTL evidence");
  if (!Number.isInteger(evidence.criticalFindings) || evidence.criticalFindings > 0) reasons.push("critical accessibility findings remain");
  return { allowed: reasons.length === 0, reasons, evidenceHash: hash(JSON.stringify({ evidence, reasons })) };
}
