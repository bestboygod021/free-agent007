/** M204 fail-closed contracts for pause, human takeover and resumable run continuity. */

export type M204RunState = "running" | "paused" | "takeover" | "resuming" | "terminated";

export interface M204ControlRequest {
  organizationId: string;
  runId: string;
  controlId: string;
  currentState: M204RunState;
  checkpointHash: string;
  actorHash: string;
  reasonHash: string;
  requestedAt: number;
  expiresAt: number;
  approvalPresent: boolean;
  noUnboundedResume: boolean;
  tenantBound: boolean;
}

export interface M204Handoff {
  organizationId: string;
  runId: string;
  handoffId: string;
  fromActorHash: string;
  toActorHash: string;
  checkpointHash: string;
  authorityHash: string;
  consentPresent: boolean;
  secretFree: boolean;
  stateMatch: boolean;
  leaseExpiresAt: number;
  tenantMatch: boolean;
}

export interface M204ResumeRequest {
  organizationId: string;
  runId: string;
  resumeId: string;
  checkpointHash: string;
  stateHash: string;
  actorHash: string;
  leaseHash: string;
  replaySafe: boolean;
  noDuplicateEffects: boolean;
  approvalPresent: boolean;
  preconditionsPassed: boolean;
  tenantMatch: boolean;
}

export interface M204TerminationProof {
  organizationId: string;
  runId: string;
  terminationId: string;
  checkpointHash: string;
  terminationReasonHash: string;
  cleanupEvidenceHash: string;
  terminatedAt: number;
  noActiveLease: boolean;
  residualWorkers: number;
  tenantMatch: boolean;
}

export interface M204RunDecision {
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

export function validateM204Control(request: M204ControlRequest, now: number): M204RunDecision {
  const reasons: string[] = [];
  required([[request.organizationId, "organizationId"], [request.runId, "runId"], [request.controlId, "controlId"], [request.checkpointHash, "checkpointHash"], [request.actorHash, "actorHash"], [request.reasonHash, "reasonHash"]], reasons);
  if (request.currentState === "terminated" || !Number.isFinite(request.requestedAt) || !Number.isFinite(request.expiresAt) || request.expiresAt <= now || request.expiresAt <= request.requestedAt || !request.approvalPresent || !request.noUnboundedResume || !request.tenantBound) reasons.push("run control needs a live bounded state, approval, bounded expiry and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ request, now, reasons })) };
}

export function decideM204Handoff(handoff: M204Handoff, now: number): M204RunDecision {
  const reasons: string[] = [];
  required([[handoff.organizationId, "organizationId"], [handoff.runId, "runId"], [handoff.handoffId, "handoffId"], [handoff.fromActorHash, "fromActorHash"], [handoff.toActorHash, "toActorHash"], [handoff.checkpointHash, "checkpointHash"], [handoff.authorityHash, "authorityHash"]], reasons);
  if (handoff.fromActorHash === handoff.toActorHash || !handoff.consentPresent || !handoff.secretFree || !handoff.stateMatch || !Number.isFinite(handoff.leaseExpiresAt) || handoff.leaseExpiresAt <= now || !handoff.tenantMatch) reasons.push("handoff needs distinct authorized actors, consent, secret-free state, live lease and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ handoff, now, reasons })) };
}

export function decideM204Resume(resume: M204ResumeRequest): M204RunDecision {
  const reasons: string[] = [];
  required([[resume.organizationId, "organizationId"], [resume.runId, "runId"], [resume.resumeId, "resumeId"], [resume.checkpointHash, "checkpointHash"], [resume.stateHash, "stateHash"], [resume.actorHash, "actorHash"], [resume.leaseHash, "leaseHash"]], reasons);
  if (!resume.replaySafe || !resume.noDuplicateEffects || !resume.approvalPresent || !resume.preconditionsPassed || !resume.tenantMatch) reasons.push("resume needs replay safety, duplicate-effect protection, approval, preconditions and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ resume, reasons })) };
}

export function validateM204Termination(proof: M204TerminationProof): M204RunDecision {
  const reasons: string[] = [];
  required([[proof.organizationId, "organizationId"], [proof.runId, "runId"], [proof.terminationId, "terminationId"], [proof.checkpointHash, "checkpointHash"], [proof.terminationReasonHash, "terminationReasonHash"], [proof.cleanupEvidenceHash, "cleanupEvidenceHash"]], reasons);
  if (!Number.isFinite(proof.terminatedAt) || !proof.noActiveLease || !Number.isInteger(proof.residualWorkers) || proof.residualWorkers !== 0 || !proof.tenantMatch) reasons.push("termination needs cleanup evidence, no active lease, zero residual workers and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ proof, reasons })) };
}
