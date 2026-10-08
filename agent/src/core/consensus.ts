/** Bounded multi-model consensus; disagreement never silently becomes approval. */

export interface ConsensusCandidate {
  candidateId: string;
  outputHash: string;
  modelId: string;
  weight: number;
}

export interface ConsensusVote {
  voterId: string;
  candidateId: string;
  confidence: number;
  invariantPass: boolean;
  reason: string;
}

export interface ConsensusDecision {
  status: "accepted" | "rejected" | "undecided";
  candidateId?: string;
  support: number;
  quorum: number;
  reasons: string[];
  decisionHash: string;
}

export class ConsensusContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConsensusContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

export function decideConsensus(
  candidates: readonly ConsensusCandidate[],
  votes: readonly ConsensusVote[],
  quorum: number,
): ConsensusDecision {
  if (candidates.length === 0) throw new ConsensusContractError("at least one candidate is required");
  if (!Number.isFinite(quorum) || quorum <= 0 || quorum > 1) throw new ConsensusContractError("quorum must be in (0, 1]");
  const candidateIds = new Set(candidates.map((candidate) => candidate.candidateId));
  if (candidateIds.size !== candidates.length) throw new ConsensusContractError("duplicate candidate");
  for (const candidate of candidates) {
    if (!candidate.candidateId.trim() || !candidate.outputHash.trim() || !candidate.modelId.trim()) {
      throw new ConsensusContractError("candidate identity is required");
    }
    if (!Number.isFinite(candidate.weight) || candidate.weight <= 0) throw new ConsensusContractError("candidate weight must be positive");
  }
  const weights = new Map(candidates.map((candidate) => [candidate.candidateId, candidate.weight]));
  const seenVoters = new Set<string>();
  const support = new Map<string, number>();
  for (const vote of votes) {
    if (seenVoters.has(vote.voterId)) throw new ConsensusContractError(`duplicate voter: ${vote.voterId}`);
    seenVoters.add(vote.voterId);
    if (!candidateIds.has(vote.candidateId)) throw new ConsensusContractError("vote references unknown candidate");
    if (!Number.isFinite(vote.confidence) || vote.confidence < 0 || vote.confidence > 1) throw new ConsensusContractError("confidence must be between 0 and 1");
    if (vote.invariantPass) support.set(vote.candidateId, (support.get(vote.candidateId) ?? 0) + (weights.get(vote.candidateId) ?? 0) * vote.confidence);
  }
  const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  const ranked = [...support.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const winner = ranked[0];
  const winnerRatio = winner ? winner[1] / totalWeight : 0;
  const reasons: string[] = [];
  let status: ConsensusDecision["status"] = "undecided";
  let candidateId: string | undefined;
  if (!winner || winnerRatio < quorum) reasons.push("no candidate reached quorum");
  else if (ranked[1] && ranked[1][1] === winner[1]) reasons.push("tie requires human review");
  else { status = "accepted"; candidateId = winner[0]; }
  const body = { status, candidateId, support: winner?.[1] ?? 0, quorum, reasons };
  return { ...body, decisionHash: hash(JSON.stringify(body)) };
}
