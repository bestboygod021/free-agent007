/** M120 contracts for CI test matrices, security/accessibility checks and verification evidence. */

export type M120CheckKind = "typecheck" | "unit" | "e2e" | "security" | "accessibility" | "load";
export type M120PipelineState = "planned" | "running" | "passed" | "failed" | "held";

export interface M120TestMatrixContract {
  organizationId: string;
  matrixId: string;
  runtime: string;
  operatingSystem: string;
  browser?: string;
  locale: string;
  computeMode: "local" | "byok" | "free" | "paid";
  checks: M120CheckKind[];
  sandboxed: boolean;
  seed: number;
  approved: boolean;
}

export interface M120PipelineEvidence {
  organizationId: string;
  pipelineId: string;
  commitHash: string;
  state: M120PipelineState;
  checks: Array<{ kind: M120CheckKind; passed: boolean; evidenceHash: string }>;
  startedAt: number;
  completedAt?: number;
  artifactHash: string;
  logsRedacted: boolean;
  reproducible: boolean;
}

export interface M120SecurityCheckEvidence {
  organizationId: string;
  scanId: string;
  scanner: "dependency" | "secret" | "injection" | "dast" | "tenant_probe";
  findings: number;
  criticalFindings: number;
  policyVersion: string;
  falsePositiveReview: boolean;
  artifactHash: string;
  passed: boolean;
}

export interface M120AccessibilityEvidence {
  organizationId: string;
  auditId: string;
  locale: string;
  rtl: boolean;
  keyboardPassed: boolean;
  screenReaderPassed: boolean;
  contrastPassed: boolean;
  reducedMotionPassed: boolean;
  violations: number;
  reportHash: string;
}

export interface M120VerificationDecision {
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

export function validateM120TestMatrix(matrix: M120TestMatrixContract): M120VerificationDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[matrix.organizationId, "organizationId"], [matrix.matrixId, "matrixId"], [matrix.runtime, "runtime"], [matrix.operatingSystem, "operatingSystem"], [matrix.locale, "locale"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (matrix.checks.length === 0 || !matrix.checks.includes("typecheck") || !matrix.checks.includes("unit")) reasons.push("matrix needs typecheck and unit checks");
  if (!matrix.sandboxed || !Number.isInteger(matrix.seed) || matrix.seed < 0) reasons.push("matrix needs sandbox and replayable seed");
  if (!matrix.approved) reasons.push("test matrix requires approval");
  if (matrix.locale.startsWith("fa") && !matrix.checks.includes("accessibility")) reasons.push("Persian locale matrix needs accessibility check");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ matrix, reasons })) };
}

export function validateM120PipelineEvidence(evidence: M120PipelineEvidence): M120VerificationDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.pipelineId, "pipelineId"], [evidence.commitHash, "commitHash"], [evidence.artifactHash, "artifactHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (evidence.state === "passed" && evidence.checks.some((check) => !check.passed || !check.evidenceHash.trim())) reasons.push("passed pipeline contains a failed or undocumented check");
  if (!Number.isFinite(evidence.startedAt) || (evidence.completedAt !== undefined && evidence.completedAt < evidence.startedAt)) reasons.push("pipeline timestamps are invalid");
  if (!evidence.logsRedacted || !evidence.reproducible) reasons.push("pipeline logs must be redacted and reproducible");
  return { allowed: reasons.length === 0, reasons, requiresApproval: evidence.state === "passed", auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function validateM120SecurityCheck(evidence: M120SecurityCheckEvidence): M120VerificationDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.scanId, "scanId"], [evidence.policyVersion, "policyVersion"], [evidence.artifactHash, "artifactHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(evidence.findings) || evidence.findings < 0 || !Number.isInteger(evidence.criticalFindings) || evidence.criticalFindings < 0 || evidence.criticalFindings > evidence.findings) reasons.push("security finding counts are invalid");
  if (evidence.criticalFindings > 0 || !evidence.passed) reasons.push("critical security findings block verification");
  if (evidence.findings > 0 && !evidence.falsePositiveReview) reasons.push("security findings need false-positive review");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function validateM120Accessibility(evidence: M120AccessibilityEvidence): M120VerificationDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.auditId, "auditId"], [evidence.locale, "locale"], [evidence.reportHash, "reportHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!evidence.keyboardPassed || !evidence.screenReaderPassed || !evidence.contrastPassed || !evidence.reducedMotionPassed) reasons.push("accessibility checks are incomplete");
  if (!Number.isInteger(evidence.violations) || evidence.violations !== 0) reasons.push("accessibility report contains violations");
  if (evidence.locale.startsWith("fa") && !evidence.rtl) reasons.push("Persian accessibility evidence needs RTL coverage");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
