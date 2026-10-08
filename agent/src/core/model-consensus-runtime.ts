/** M175 fail-closed contracts for multi-model consensus and voting. */

export type M175PanelState = "formed" | "voting" | "closed" | "invalid";
export type M175VoteValue = "approve" | "reject" | "abstain";
export type M175TieBreak = "deny" | "human_review" | "evidence_weight";

export interface M175Panel {
  organizationId: string;
  panelId: string;
  proposalHash: string;
  policyHash: string;
  participantIds: string[];
  minimumParticipants: number;
  quorum: number;
  thresholdBps: number;
  state: M175PanelState;
  independentPrompts: boolean;
  tenantBound: boolean;
  noSingleModelAuthority: boolean;
}

export interface M175Vote {
  organizationId: string;
  panelId: string;
  voteId: string;
  participantId: string;
  vote: M175VoteValue;
  rationaleHash: string;
  evidenceHash: string;
  confidenceBps: number;
  independent: boolean;
  tenantMatch: boolean;
}

export interface M175Consensus {
  organizationId: string;
  panelId: string;
  consensusId: string;
  proposalHash: string;
  voteCount: number;
  approveCount: number;
  rejectCount: number;
  abstainCount: number;
  quorum: number;
  thresholdBps: number;
  tieBreak: M175TieBreak;
  decision: "approved" | "rejected" | "undecided";
  evidenceHash: string;
  independentEvidence: boolean;
  tenantMatch: boolean;
}

export interface M175TieBreakRequest {
  organizationId: string;
  panelId: string;
  tieBreakId: string;
  tieBreak: M175TieBreak;
  reviewerReference: string;
  reasonHash: string;
  approvalPresent: boolean;
  bounded: boolean;
}

export interface M175ConsensusDecision {
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

export function validateM175Panel(panel: M175Panel): M175ConsensusDecision {
  const reasons: string[] = [];
  required([[panel.organizationId, "organizationId"], [panel.panelId, "panelId"], [panel.proposalHash, "proposalHash"], [panel.policyHash, "policyHash"]], reasons);
  if (panel.participantIds.length < 2 || new Set(panel.participantIds).size !== panel.participantIds.length || panel.participantIds.some((id) => !id.trim())) reasons.push("panel needs at least two unique participants");
  if (!Number.isInteger(panel.minimumParticipants) || panel.minimumParticipants < 2 || panel.minimumParticipants > panel.participantIds.length) reasons.push("minimum participant bound is invalid");
  if (!Number.isInteger(panel.quorum) || panel.quorum < panel.minimumParticipants || panel.quorum > panel.participantIds.length) reasons.push("quorum is invalid");
  if (!Number.isInteger(panel.thresholdBps) || panel.thresholdBps < 5_001 || panel.thresholdBps > 10_000) reasons.push("threshold must be a strict majority");
  if (panel.state === "voting" && (!panel.independentPrompts || !panel.tenantBound || !panel.noSingleModelAuthority)) reasons.push("voting panel needs independent, tenant and authority boundaries");
  return { allowed: reasons.length === 0, reasons, requiresApproval: panel.state === "closed", auditHash: hash(JSON.stringify({ panel, reasons })) };
}

export function decideM175Vote(vote: M175Vote): M175ConsensusDecision {
  const reasons: string[] = [];
  required([[vote.organizationId, "organizationId"], [vote.panelId, "panelId"], [vote.voteId, "voteId"], [vote.participantId, "participantId"], [vote.rationaleHash, "rationaleHash"], [vote.evidenceHash, "evidenceHash"]], reasons);
  if (!Number.isInteger(vote.confidenceBps) || vote.confidenceBps < 0 || vote.confidenceBps > 10_000) reasons.push("confidence is invalid");
  if (!vote.independent || !vote.tenantMatch) reasons.push("vote must be independent and tenant-bound");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ vote, reasons })) };
}

export function validateM175Consensus(consensus: M175Consensus): M175ConsensusDecision {
  const reasons: string[] = [];
  required([[consensus.organizationId, "organizationId"], [consensus.panelId, "panelId"], [consensus.consensusId, "consensusId"], [consensus.proposalHash, "proposalHash"], [consensus.evidenceHash, "evidenceHash"]], reasons);
  if (!Number.isInteger(consensus.voteCount) || consensus.voteCount < consensus.quorum || consensus.approveCount + consensus.rejectCount + consensus.abstainCount !== consensus.voteCount) reasons.push("vote count or quorum is invalid");
  if (consensus.approveCount < 0 || consensus.rejectCount < 0 || consensus.abstainCount < 0 || consensus.approveCount > consensus.voteCount || consensus.rejectCount > consensus.voteCount) reasons.push("vote totals are invalid");
  if (!Number.isInteger(consensus.thresholdBps) || consensus.thresholdBps < 5_001 || consensus.thresholdBps > 10_000) reasons.push("consensus threshold is invalid");
  if (consensus.decision === "approved" && consensus.approveCount * 10_000 < consensus.voteCount * consensus.thresholdBps) reasons.push("approved consensus lacks threshold");
  if (consensus.decision === "rejected" && consensus.rejectCount * 10_000 < consensus.voteCount * consensus.thresholdBps) reasons.push("rejected consensus lacks threshold");
  if (!consensus.independentEvidence || !consensus.tenantMatch) reasons.push("consensus evidence needs independence and tenant match");
  return { allowed: reasons.length === 0, reasons, requiresApproval: consensus.decision === "approved", auditHash: hash(JSON.stringify({ consensus, reasons })) };
}

export function decideM175TieBreak(request: M175TieBreakRequest): M175ConsensusDecision {
  const reasons: string[] = [];
  required([[request.organizationId, "organizationId"], [request.panelId, "panelId"], [request.tieBreakId, "tieBreakId"], [request.reviewerReference, "reviewerReference"], [request.reasonHash, "reasonHash"]], reasons);
  if (request.tieBreak !== "human_review" && request.tieBreak !== "deny" && request.tieBreak !== "evidence_weight") reasons.push("tie-break method is invalid");
  if (request.tieBreak !== "deny" && (!request.approvalPresent || !request.bounded)) reasons.push("non-deny tie-break needs approval and bound");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ request, reasons })) };
}
