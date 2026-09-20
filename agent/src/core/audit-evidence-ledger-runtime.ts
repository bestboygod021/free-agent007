/** M124 contracts for durable audit chains, evidence provenance, replay and retention. */

export type M124EvidenceKind = "audit" | "test" | "security" | "privacy" | "release";
export type M124RetentionClass = "short" | "standard" | "legal_hold";

export interface M124AuditEvent {
  organizationId: string;
  eventId: string;
  sequence: number;
  actorHash: string;
  action: string;
  resourceType: string;
  resourceReference: string;
  tenantScopeHash: string;
  previousHash: string;
  payloadHash: string;
  redacted: boolean;
  immutable: boolean;
  occurredAt: number;
}

export interface M124EvidenceBundle {
  organizationId: string;
  evidenceId: string;
  phase: string;
  kind: M124EvidenceKind;
  artifactHashes: string[];
  commandHash: string;
  testEvidenceHash: string;
  securityEvidenceHash: string;
  signerHash: string;
  replayable: boolean;
  redacted: boolean;
  sourceTrust: "local" | "ci" | "integration" | "production";
}

export interface M124ReplayRequest {
  organizationId: string;
  replayId: string;
  evidenceId: string;
  expectedPreviousHash: string;
  actualPreviousHash: string;
  chainValid: boolean;
  sequenceValid: boolean;
  tenantVisible: boolean;
  independentReviewerHash: string;
  replayCommandHash: string;
}

export interface M124RetentionRecord {
  organizationId: string;
  evidenceId: string;
  retentionClass: M124RetentionClass;
  retainUntil: number;
  legalHold: boolean;
  deletionApprovalPresent: boolean;
  encryptedReference: string;
  purgeProofHash?: string;
}

export interface M124EvidenceDecision {
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

export function validateM124AuditEvent(event: M124AuditEvent): M124EvidenceDecision {
  const reasons: string[] = [];
  required([[event.organizationId, "organizationId"], [event.eventId, "eventId"], [event.actorHash, "actorHash"], [event.action, "action"], [event.resourceType, "resourceType"], [event.resourceReference, "resourceReference"], [event.tenantScopeHash, "tenantScopeHash"], [event.previousHash, "previousHash"], [event.payloadHash, "payloadHash"]], reasons);
  if (!Number.isInteger(event.sequence) || event.sequence < 0) reasons.push("audit sequence must be a non-negative integer");
  if (!Number.isFinite(event.occurredAt)) reasons.push("audit occurredAt is invalid");
  if (!event.redacted || !event.immutable) reasons.push("audit event must be redacted and immutable");
  if (/password|secret|token|api[_-]?key/i.test(`${event.resourceReference} ${event.action}`)) reasons.push("audit references must not contain raw secrets");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ event, reasons })) };
}

export function validateM124EvidenceBundle(bundle: M124EvidenceBundle): M124EvidenceDecision {
  const reasons: string[] = [];
  required([[bundle.organizationId, "organizationId"], [bundle.evidenceId, "evidenceId"], [bundle.phase, "phase"], [bundle.commandHash, "commandHash"], [bundle.testEvidenceHash, "testEvidenceHash"], [bundle.securityEvidenceHash, "securityEvidenceHash"], [bundle.signerHash, "signerHash"]], reasons);
  if (bundle.artifactHashes.length === 0) reasons.push("evidence bundle needs an artifact hash");
  if (!bundle.replayable || !bundle.redacted) reasons.push("evidence bundle must be replayable and redacted");
  if (bundle.sourceTrust === "production" && !bundle.signerHash) reasons.push("production evidence needs a signer");
  return { allowed: reasons.length === 0, reasons, requiresApproval: bundle.sourceTrust === "production", auditHash: hash(JSON.stringify({ bundle, reasons })) };
}

export function decideM124Replay(request: M124ReplayRequest): M124EvidenceDecision {
  const reasons: string[] = [];
  required([[request.organizationId, "organizationId"], [request.replayId, "replayId"], [request.evidenceId, "evidenceId"], [request.expectedPreviousHash, "expectedPreviousHash"], [request.actualPreviousHash, "actualPreviousHash"], [request.independentReviewerHash, "independentReviewerHash"], [request.replayCommandHash, "replayCommandHash"]], reasons);
  if (request.expectedPreviousHash !== request.actualPreviousHash) reasons.push("evidence chain predecessor does not match");
  if (!request.chainValid || !request.sequenceValid) reasons.push("evidence chain or sequence is invalid");
  if (!request.tenantVisible) reasons.push("replay is not tenant-visible and bounded");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateM124Retention(record: M124RetentionRecord, now = Date.now()): M124EvidenceDecision {
  const reasons: string[] = [];
  required([[record.organizationId, "organizationId"], [record.evidenceId, "evidenceId"], [record.encryptedReference, "encryptedReference"]], reasons);
  if (!Number.isFinite(record.retainUntil) || record.retainUntil <= now) reasons.push("retention deadline must be in the future");
  if (record.legalHold && record.deletionApprovalPresent) reasons.push("legal hold blocks deletion approval");
  if (!record.legalHold && record.retentionClass === "legal_hold") reasons.push("legal_hold class requires legal hold");
  if (record.deletionApprovalPresent && !record.purgeProofHash) reasons.push("approved purge needs purge proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: record.deletionApprovalPresent, auditHash: hash(JSON.stringify({ record, reasons })) };
}
