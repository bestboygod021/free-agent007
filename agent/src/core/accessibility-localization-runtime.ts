/** M172 fail-closed contracts for locale catalogs and accessibility verification. */

export type M172Direction = "ltr" | "rtl";
export type M172A11yState = "pending" | "passed" | "failed" | "waived";

export interface M172LocaleCatalog {
  organizationId: string;
  catalogId: string;
  locale: string;
  fallbackLocale: string;
  direction: M172Direction;
  messageKeys: string[];
  translatedKeys: string[];
  version: number;
  noRawUserData: boolean;
  tenantScoped: boolean;
  approved: boolean;
}

export interface M172A11yCheck {
  organizationId: string;
  checkId: string;
  screenReference: string;
  locale: string;
  wcagLevel: "A" | "AA";
  state: M172A11yState;
  toolReference: string;
  violations: number;
  keyboardPassed: boolean;
  contrastPassed: boolean;
  screenReaderPassed: boolean;
  evidenceHash: string;
  approvedWaiver: boolean;
}

export interface M172ScreenEvidence {
  organizationId: string;
  screenReference: string;
  locale: string;
  screenshotHash: string;
  focusOrderHash: string;
  labelsHash: string;
  direction: M172Direction;
  responsive: boolean;
  redacted: boolean;
  tenantMatch: boolean;
}

export interface M172FallbackDecision {
  organizationId: string;
  locale: string;
  fallbackLocale: string;
  missingKeys: string[];
  allowed: boolean;
  reasonHash: string;
  approvalPresent: boolean;
}

export interface M172UxDecision {
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

export function validateM172Catalog(catalog: M172LocaleCatalog): M172UxDecision {
  const reasons: string[] = [];
  required([[catalog.organizationId, "organizationId"], [catalog.catalogId, "catalogId"], [catalog.locale, "locale"], [catalog.fallbackLocale, "fallbackLocale"]], reasons);
  if (catalog.messageKeys.length === 0 || catalog.messageKeys.some((key) => !key.trim())) reasons.push("message keys are required");
  for (const key of catalog.translatedKeys) if (!catalog.messageKeys.includes(key)) reasons.push("translated key is not in catalog");
  if (!Number.isInteger(catalog.version) || catalog.version < 1 || !catalog.noRawUserData || !catalog.tenantScoped || !catalog.approved) reasons.push("catalog needs version, no-user-data, tenant and approval gates");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ catalog, reasons })) };
}

export function decideM172A11yCheck(check: M172A11yCheck): M172UxDecision {
  const reasons: string[] = [];
  required([[check.organizationId, "organizationId"], [check.checkId, "checkId"], [check.screenReference, "screenReference"], [check.locale, "locale"], [check.toolReference, "toolReference"], [check.evidenceHash, "evidenceHash"]], reasons);
  if (check.wcagLevel !== "AA" || check.state !== "passed" || check.violations !== 0 || !check.keyboardPassed || !check.contrastPassed || !check.screenReaderPassed) reasons.push("accessibility evidence is incomplete");
  if (check.state === "waived" && !check.approvedWaiver) reasons.push("waiver needs approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: check.state === "waived", auditHash: hash(JSON.stringify({ check, reasons })) };
}

export function validateM172ScreenEvidence(evidence: M172ScreenEvidence): M172UxDecision {
  const reasons: string[] = [];
  required([[evidence.organizationId, "organizationId"], [evidence.screenReference, "screenReference"], [evidence.locale, "locale"], [evidence.screenshotHash, "screenshotHash"], [evidence.focusOrderHash, "focusOrderHash"], [evidence.labelsHash, "labelsHash"]], reasons);
  if (!evidence.responsive || !evidence.redacted || !evidence.tenantMatch) reasons.push("screen evidence needs responsive, redacted and tenant-safe proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function decideM172Fallback(fallback: M172FallbackDecision): M172UxDecision {
  const reasons: string[] = [];
  required([[fallback.organizationId, "organizationId"], [fallback.locale, "locale"], [fallback.fallbackLocale, "fallbackLocale"], [fallback.reasonHash, "reasonHash"]], reasons);
  if (fallback.locale === fallback.fallbackLocale || !fallback.allowed || !fallback.approvalPresent) reasons.push("fallback needs distinct locale, allowance and approval");
  if (fallback.missingKeys.length === 0) reasons.push("fallback needs missing-key evidence");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ fallback, reasons })) };
}
