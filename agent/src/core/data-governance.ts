/** Deterministic data classification, consent and lifecycle planning. No data is deleted or exported here. */

export type DataClass = "public" | "internal" | "confidential" | "restricted" | "secret";
export type DataAction = "use" | "export" | "delete" | "external_egress";

export interface DataAsset {
  assetId: string;
  organizationId: string;
  projectId?: string;
  subjectId?: string;
  dataClass: DataClass;
  purpose: string;
  createdAt: number;
  retentionUntil: number;
  contentHash: string;
  encryptedAtRest: boolean;
  exportable: boolean;
  deletable: boolean;
}

export interface ConsentRecord {
  consentId: string;
  organizationId: string;
  subjectId: string;
  purpose: string;
  dataClasses: DataClass[];
  granted: boolean;
  grantedAt: number;
  expiresAt?: number;
  proofHash: string;
}

export interface DataGovernancePolicy {
  organizationId: string;
  allowedPurposes: Partial<Record<DataClass, string[]>>;
  consentRequiredFor: DataClass[];
  noExternalEgressFor: DataClass[];
  minimumRetentionMs: Partial<Record<DataClass, number>>;
  allowSubjectExport: boolean;
  allowSubjectDeletion: boolean;
}

export interface DataActionDecision {
  allowed: boolean;
  reasons: string[];
  action: DataAction;
  assetId: string;
  decisionHash: string;
}

export interface RetentionSweepPlan {
  organizationId: string;
  now: number;
  eligibleAssetIds: string[];
  blockedAssetIds: string[];
  planHash: string;
}

export class DataGovernanceContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataGovernanceContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new DataGovernanceContractError(`${label} is required`);
}

function containsSecretLikeText(value: string): boolean {
  return /-----BEGIN [^-]*PRIVATE KEY-----|(?:password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]/i.test(value);
}

export function classifyContent(content: string): { dataClass: DataClass; findings: string[]; contentHash: string } {
  if (!content.trim()) throw new DataGovernanceContractError("content must not be empty");
  const findings: string[] = [];
  if (/-----BEGIN [^-]*PRIVATE KEY-----/i.test(content)) findings.push("private-key");
  if (/(?:password|passwd)\s*[:=]/i.test(content)) findings.push("password-like");
  if (/(?:api[_-]?key|access[_-]?token|secret)\s*[:=]/i.test(content)) findings.push("credential-like");
  if (/\b(?:ssn|national[_ -]?id|passport)\b/i.test(content)) findings.push("identity-like");
  const dataClass: DataClass = findings.includes("private-key") || findings.includes("password-like") || findings.includes("credential-like")
    ? "secret"
    : findings.includes("identity-like")
      ? "restricted"
      : "internal";
  return { dataClass, findings, contentHash: hash(content) };
}

function consentValid(asset: DataAsset, consent: ConsentRecord | undefined, now: number): boolean {
  return Boolean(consent && consent.organizationId === asset.organizationId && consent.subjectId === asset.subjectId && consent.granted && consent.purpose === asset.purpose && consent.dataClasses.includes(asset.dataClass) && consent.grantedAt <= now && (consent.expiresAt === undefined || now < consent.expiresAt));
}

export function decideDataAction(
  asset: DataAsset,
  policy: DataGovernancePolicy,
  action: DataAction,
  now: number,
  consent?: ConsentRecord,
): DataActionDecision {
  required(asset.assetId, "assetId");
  required(asset.organizationId, "asset.organizationId");
  required(asset.purpose, "purpose");
  if (asset.organizationId !== policy.organizationId) throw new DataGovernanceContractError("asset and policy tenant mismatch");
  if (!Number.isFinite(now) || now < 0) throw new DataGovernanceContractError("now must be non-negative");
  if (!Number.isFinite(asset.retentionUntil) || asset.retentionUntil < asset.createdAt) throw new DataGovernanceContractError("invalid retention window");
  const reasons: string[] = [];
  const allowedPurposes = policy.allowedPurposes[asset.dataClass] ?? [];
  if (allowedPurposes.length > 0 && !allowedPurposes.includes(asset.purpose)) reasons.push("purpose is not allowed for this data class");
  if (policy.consentRequiredFor.includes(asset.dataClass) && !consentValid(asset, consent, now)) reasons.push("valid subject consent is required");
  if (action === "external_egress" && policy.noExternalEgressFor.includes(asset.dataClass)) reasons.push("external egress is denied for this data class");
  if (action === "export" && (!policy.allowSubjectExport || !asset.exportable)) reasons.push("subject export is not allowed");
  if (action === "delete" && (!policy.allowSubjectDeletion || !asset.deletable)) reasons.push("subject deletion is not allowed");
  if (action === "use" && now >= asset.retentionUntil) reasons.push("asset retention has expired");
  const body = { assetId: asset.assetId, organizationId: asset.organizationId, action, now, reasons };
  return { allowed: reasons.length === 0, reasons, action, assetId: asset.assetId, decisionHash: hash(JSON.stringify(body)) };
}

export function planRetentionSweep(assets: readonly DataAsset[], organizationId: string, now: number): RetentionSweepPlan {
  required(organizationId, "organizationId");
  if (!Number.isFinite(now) || now < 0) throw new DataGovernanceContractError("now must be non-negative");
  const eligibleAssetIds: string[] = [];
  const blockedAssetIds: string[] = [];
  for (const asset of assets) {
    if (asset.organizationId !== organizationId || now < asset.retentionUntil) continue;
    if (asset.deletable) eligibleAssetIds.push(asset.assetId);
    else blockedAssetIds.push(asset.assetId);
  }
  eligibleAssetIds.sort();
  blockedAssetIds.sort();
  const body = { organizationId, now, eligibleAssetIds, blockedAssetIds };
  return { ...body, planHash: hash(JSON.stringify(body)) };
}

export function containsRawSecret(value: string): boolean {
  return containsSecretLikeText(value);
}
