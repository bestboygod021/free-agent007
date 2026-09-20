/** M114 contracts for legal policy, output rights, provider terms and vulnerability disclosure. */

export type M114LegalArtifact = "terms" | "privacy" | "output_rights" | "license" | "disclosure";
export type M114ReviewStatus = "draft" | "reviewed" | "approved" | "expired";

export interface M114LegalPolicyContract {
  organizationId: string;
  policyId: string;
  artifact: M114LegalArtifact;
  version: string;
  jurisdiction: string;
  effectiveAt: number;
  expiresAt: number;
  status: M114ReviewStatus;
  ownerHash: string;
  reviewedByHash: string;
  userConsentRequired: boolean;
  publicNoticeHash: string;
}

export interface M114OutputRightsEvidence {
  organizationId: string;
  outputId: string;
  sourceRunId: string;
  modelReference: string;
  licenseReferences: string[];
  providerTermsReviewed: boolean;
  userInputSeparated: boolean;
  thirdPartyContentDetected: boolean;
  attributionRequired: boolean;
  attributionPresent: boolean;
  disclaimerPresent: boolean;
  publicationApproved: boolean;
}

export interface M114ProviderTermsReview {
  organizationId: string;
  provider: string;
  termsUrl: string;
  termsHash: string;
  reviewedAt: number;
  reviewedByHash: string;
  dataTrainingPolicyKnown: boolean;
  retentionPolicyKnown: boolean;
  allowedComputeModes: Array<"local" | "byok" | "free" | "paid">;
  consentRequired: boolean;
  accepted: boolean;
}

export interface M114DisclosureReport {
  organizationId: string;
  reportId: string;
  reporterHash: string;
  vulnerabilityClass: "secret" | "tenant_isolation" | "injection" | "dependency" | "availability";
  evidenceHash: string;
  privateChannel: boolean;
  triaged: boolean;
  remediationOwnerHash?: string;
  publicDisclosureApproved: boolean;
}

export interface M114LegalDecision {
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

export function validateM114LegalPolicy(policy: M114LegalPolicyContract, now = Date.now()): M114LegalDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[policy.organizationId, "organizationId"], [policy.policyId, "policyId"], [policy.version, "version"], [policy.jurisdiction, "jurisdiction"], [policy.ownerHash, "ownerHash"], [policy.reviewedByHash, "reviewedByHash"], [policy.publicNoticeHash, "publicNoticeHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(policy.effectiveAt) || !Number.isFinite(policy.expiresAt) || policy.expiresAt <= policy.effectiveAt) reasons.push("legal policy validity window is invalid");
  if (policy.expiresAt <= now || policy.status === "expired") reasons.push("legal policy is expired");
  if (policy.status === "approved" && policy.ownerHash === policy.reviewedByHash) reasons.push("approved legal policy needs independent review");
  if (policy.status === "approved" && !policy.userConsentRequired && policy.artifact === "privacy") reasons.push("privacy policy needs explicit consent decision");
  return { allowed: reasons.length === 0, reasons, requiresApproval: policy.status !== "draft", auditHash: hash(JSON.stringify({ policy, reasons })) };
}

export function decideM114OutputPublication(evidence: M114OutputRightsEvidence): M114LegalDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.outputId, "outputId"], [evidence.sourceRunId, "sourceRunId"], [evidence.modelReference, "modelReference"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (evidence.licenseReferences.length === 0 || !evidence.providerTermsReviewed || !evidence.userInputSeparated) reasons.push("output rights and provider terms evidence is incomplete");
  if (evidence.thirdPartyContentDetected && evidence.attributionRequired && !evidence.attributionPresent) reasons.push("third-party output needs attribution");
  if (!evidence.disclaimerPresent || !evidence.publicationApproved) reasons.push("output publication needs disclaimer and approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function validateM114ProviderTerms(review: M114ProviderTermsReview, now = Date.now()): M114LegalDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[review.organizationId, "organizationId"], [review.provider, "provider"], [review.termsUrl, "termsUrl"], [review.termsHash, "termsHash"], [review.reviewedByHash, "reviewedByHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!review.termsUrl.startsWith("https://")) reasons.push("provider terms must use HTTPS");
  if (!Number.isFinite(review.reviewedAt) || review.reviewedAt > now) reasons.push("provider terms review date is invalid");
  if (!review.dataTrainingPolicyKnown || !review.retentionPolicyKnown || review.allowedComputeModes.length === 0) reasons.push("provider terms data and compute policy is incomplete");
  if (!review.accepted) reasons.push("provider terms have not been accepted");
  return { allowed: reasons.length === 0, reasons, requiresApproval: review.consentRequired, auditHash: hash(JSON.stringify({ review, reasons })) };
}

export function validateM114DisclosureReport(report: M114DisclosureReport): M114LegalDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[report.organizationId, "organizationId"], [report.reportId, "reportId"], [report.reporterHash, "reporterHash"], [report.evidenceHash, "evidenceHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!report.privateChannel) reasons.push("vulnerability reports must use a private channel");
  if (!report.triaged) reasons.push("vulnerability report needs triage");
  if (!report.remediationOwnerHash) reasons.push("triaged vulnerability needs a remediation owner");
  if (report.publicDisclosureApproved && report.vulnerabilityClass === "tenant_isolation") reasons.push("tenant isolation issue cannot be publicly disclosed before remediation");
  return { allowed: reasons.length === 0, reasons, requiresApproval: report.publicDisclosureApproved, auditHash: hash(JSON.stringify({ report, reasons })) };
}
