/** M47 contracts for legal documents, licensing, disclosure and enterprise governance. */

export type LegalDocumentKind = "terms" | "privacy" | "output_rights" | "disclaimer";
export type DependencyKind = "redis" | "vault" | "kms" | "database" | "provider";

export interface LegalDocument {
  documentId: string;
  kind: LegalDocumentKind;
  version: string;
  locale: "fa-IR" | "en-US";
  contentHash: string;
  effectiveAt: number;
  reviewedBy: string;
  approved: boolean;
}

export interface LegalGovernanceDecision {
  allowed: boolean;
  reasons: string[];
  requiresReview: boolean;
  evidenceHash: string;
}

export interface OutputRightsPolicy {
  organizationId: string;
  userOwnsOutput: boolean;
  providerTrainingOptOut: boolean;
  thirdPartyContentPresent: boolean;
  disclaimerAccepted: boolean;
  licenseReviewPresent: boolean;
}

export interface DependencyLicenseReview {
  organizationId: string;
  dependency: DependencyKind;
  license: string;
  allowedForSelfHost: boolean;
  replacementDocumented: boolean;
  reviewedAt: number;
  reviewerId: string;
}

export interface VulnerabilityDisclosurePlan {
  organizationId: string;
  policyVersion: string;
  contactReference: string;
  responseSlaHours: number;
  severityMatrixHash: string;
  publicDisclosureAllowed: boolean;
  approvalPresent: boolean;
}

export interface EnterpriseUpgradeRequest {
  organizationId: string;
  fromEdition: "community" | "self_host";
  toEdition: "self_host" | "enterprise";
  fromVersion: string;
  toVersion: string;
  dataPortabilityPlanHash: string;
  supportPlanHash: string;
  approvalPresent: boolean;
}

export class LegalEnterpriseGovernanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LegalEnterpriseGovernanceError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new LegalEnterpriseGovernanceError(`${label} is required`);
}

export function validateLegalDocument(document: LegalDocument): LegalGovernanceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[document.documentId, "documentId"], [document.version, "version"], [document.contentHash, "contentHash"], [document.reviewedBy, "reviewedBy"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(document.effectiveAt)) reasons.push("effectiveAt must be finite");
  if (!document.approved) reasons.push("legal document requires approval");
  if (document.kind === "privacy" && document.locale !== "fa-IR" && document.locale !== "en-US") reasons.push("privacy document locale is unsupported");
  return { allowed: reasons.length === 0, reasons, requiresReview: true, evidenceHash: hash(JSON.stringify({ document, reasons })) };
}

export function decideOutputRights(policy: OutputRightsPolicy): LegalGovernanceDecision {
  const reasons: string[] = [];
  required(policy.organizationId, "organizationId");
  if (!policy.userOwnsOutput) reasons.push("output ownership policy is not configured");
  if (!policy.providerTrainingOptOut) reasons.push("provider training opt-out must be explicit");
  if (policy.thirdPartyContentPresent && !policy.licenseReviewPresent) reasons.push("third-party content requires license review");
  if (!policy.disclaimerAccepted) reasons.push("disclaimer must be accepted");
  return { allowed: reasons.length === 0, reasons, requiresReview: policy.thirdPartyContentPresent, evidenceHash: hash(JSON.stringify({ policy, reasons })) };
}

export function decideDependencyLicense(review: DependencyLicenseReview): LegalGovernanceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[review.organizationId, "organizationId"], [review.license, "license"], [review.reviewerId, "reviewerId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!review.allowedForSelfHost) reasons.push("dependency license is not allowed for self-host");
  if (!["redis", "vault"].includes(review.dependency) && review.replacementDocumented === false) reasons.push("dependency replacement decision is missing");
  if (!Number.isFinite(review.reviewedAt)) reasons.push("reviewedAt must be finite");
  return { allowed: reasons.length === 0, reasons, requiresReview: true, evidenceHash: hash(JSON.stringify({ review, reasons })) };
}

export function planVulnerabilityDisclosure(plan: VulnerabilityDisclosurePlan): LegalGovernanceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[plan.organizationId, "organizationId"], [plan.policyVersion, "policyVersion"], [plan.contactReference, "contactReference"], [plan.severityMatrixHash, "severityMatrixHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(plan.responseSlaHours) || plan.responseSlaHours < 1 || plan.responseSlaHours > 720) reasons.push("response SLA is invalid");
  if (plan.publicDisclosureAllowed && !plan.approvalPresent) reasons.push("public vulnerability disclosure requires approval");
  if (/password|secret|token|api[_-]?key/i.test(plan.contactReference)) reasons.push("contact reference must be opaque");
  return { allowed: reasons.length === 0, reasons, requiresReview: true, evidenceHash: hash(JSON.stringify({ plan, reasons })) };
}

export function validateEnterpriseUpgrade(request: EnterpriseUpgradeRequest): LegalGovernanceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.fromVersion, "fromVersion"], [request.toVersion, "toVersion"], [request.dataPortabilityPlanHash, "dataPortabilityPlanHash"], [request.supportPlanHash, "supportPlanHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (request.fromEdition === request.toEdition) reasons.push("enterprise upgrade editions must differ");
  if (!request.approvalPresent) reasons.push("enterprise upgrade requires approval");
  return { allowed: reasons.length === 0, reasons, requiresReview: true, evidenceHash: hash(JSON.stringify({ request, reasons })) };
}
