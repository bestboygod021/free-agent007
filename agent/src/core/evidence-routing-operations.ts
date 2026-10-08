/**
 * M25 contracts for external evidence, calibrated routing, shadow decisions and
 * trace/error vocabulary. External claims remain untrusted data; none of these
 * functions changes a policy, calls a provider, or creates a network span.
 */

export type ExternalEvidenceTier = "measured" | "verified_benchmark" | "vendor_claim" | "community_signal";
export type FailureClass = "rate_limited" | "timeout" | "invalid_output" | "policy_denied" | "dependency" | "unknown";

export interface ExternalClaimInput {
  subject: string;
  sourceUrl: string;
  domain: string;
  tier: ExternalEvidenceTier;
  value: number;
  sampleSize: number;
  observedAt: number;
  provenanceHash: string;
}

export interface NormalizedExternalClaim extends ExternalClaimInput {
  influenceCap: number;
  trustedForPolicy: false;
}

export interface CalibrationResult {
  subject: string;
  calibratedValue: number;
  internalWeight: number;
  externalWeight: number;
  claimCount: number;
  explanation: string;
}

export interface DriftResult {
  subject: string;
  drifted: boolean;
  delta: number;
  direction: "up" | "down" | "stable";
  reason: string;
}

export interface RoutingCandidate {
  subject: string;
  quality: number;
  cost: number;
  latencyMs: number;
  privacy: number;
  reliability: number;
  allowed: boolean;
}

export interface ParetoResult {
  frontier: RoutingCandidate[];
  dominated: Array<{ subject: string; dominatedBy: string }>;
  rejected: Array<{ subject: string; reason: string }>;
}

export interface RouteExplanation {
  selected: string;
  evidenceDigest: string;
  policyHash: string;
  reasons: string[];
  rejected: Array<{ subject: string; reason: string }>;
}

export interface ShadowRoutePlan {
  allowed: boolean;
  executesProvider: false;
  chargesMoney: false;
  writesExternalState: false;
  primary: string;
  shadow: string;
  differences: string[];
  planHash: string;
}

export interface TraceContext {
  traceId: string;
  organizationId: string;
  runId: string;
  parentSpanId?: string;
}

export interface TraceSpan {
  spanId: string;
  traceId: string;
  name: string;
  startMs: number;
  endMs?: number;
  attributes: Record<string, string>;
}

export interface NormalizedFailure {
  class: FailureClass;
  retryable: boolean;
  publicCode: string;
  rawMessageHash: string;
}

export class EvidenceRoutingContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceRoutingContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

const CAP: Record<ExternalEvidenceTier, number> = { measured: 1, verified_benchmark: 0.9, vendor_claim: 0.35, community_signal: 0.15 };
const RELIABILITY: Record<ExternalEvidenceTier, number> = { measured: 1, verified_benchmark: 0.85, vendor_claim: 0.45, community_signal: 0.2 };

export function normalizeExternalClaim(input: ExternalClaimInput): NormalizedExternalClaim {
  if (!/^https:\/\//.test(input.sourceUrl)) throw new EvidenceRoutingContractError("external evidence must use HTTPS");
  if (!input.domain.trim() || !input.provenanceHash.trim() || !input.subject.trim()) throw new EvidenceRoutingContractError("claim provenance is required");
  if (!Number.isFinite(input.value) || input.value < 0 || input.value > 1 || !Number.isInteger(input.sampleSize) || input.sampleSize < 1) throw new EvidenceRoutingContractError("claim score or sample size is invalid");
  return { ...input, influenceCap: CAP[input.tier], trustedForPolicy: false };
}

export function calibrateClaims(claims: readonly NormalizedExternalClaim[], internalBaseline: Record<string, number>): CalibrationResult[] {
  const subjects = [...new Set(claims.map((claim) => claim.subject).concat(Object.keys(internalBaseline)))].sort();
  return subjects.map((subject) => {
    const entries = claims.filter((claim) => claim.subject === subject);
    const internal = internalBaseline[subject];
    const internalWeight = internal === undefined ? 0 : 1;
    const weighted = entries.reduce((sum, claim) => sum + claim.value * claim.sampleSize * RELIABILITY[claim.tier] * Math.min(CAP[claim.tier], 1), 0);
    const externalWeight = entries.reduce((sum, claim) => sum + claim.sampleSize * RELIABILITY[claim.tier] * Math.min(CAP[claim.tier], 1), 0);
    const calibratedValue = internal === undefined
      ? (externalWeight === 0 ? 0 : weighted / externalWeight)
      : (internal * 1 + weighted) / (1 + externalWeight);
    return {
      subject,
      calibratedValue: Number(Math.max(0, Math.min(1, calibratedValue)).toFixed(6)),
      internalWeight,
      externalWeight: Number(externalWeight.toFixed(6)),
      claimCount: entries.length,
      explanation: internal === undefined ? "no internal measurement; external signal remains advisory" : "internal measurement anchors calibration; external claims are capped",
    };
  });
}

export function detectCapabilityDrift(subject: string, baseline: number, current: number, threshold = 0.1): DriftResult {
  if (!subject.trim() || !Number.isFinite(baseline) || !Number.isFinite(current) || threshold < 0) throw new EvidenceRoutingContractError("invalid drift input");
  const delta = Number((current - baseline).toFixed(6));
  return { subject, drifted: Math.abs(delta) >= threshold, delta, direction: delta > 0 ? "up" : delta < 0 ? "down" : "stable", reason: Math.abs(delta) >= threshold ? "re-evaluation is required; drift does not change route by itself" : "within configured drift threshold" };
}

function dominates(a: RoutingCandidate, b: RoutingCandidate): boolean {
  const noWorse = a.quality >= b.quality && a.privacy >= b.privacy && a.reliability >= b.reliability && a.cost <= b.cost && a.latencyMs <= b.latencyMs;
  const strictlyBetter = a.quality > b.quality || a.privacy > b.privacy || a.reliability > b.reliability || a.cost < b.cost || a.latencyMs < b.latencyMs;
  return noWorse && strictlyBetter;
}

export function computeParetoFrontier(candidates: readonly RoutingCandidate[]): ParetoResult {
  const rejected = candidates.filter((candidate) => !candidate.allowed).map((candidate) => ({ subject: candidate.subject, reason: "hard policy constraint" }));
  const allowed = candidates.filter((candidate) => candidate.allowed);
  const frontier = allowed.filter((candidate) => !allowed.some((other) => other.subject !== candidate.subject && dominates(other, candidate)));
  const dominated = allowed.filter((candidate) => !frontier.includes(candidate)).map((candidate) => ({ subject: candidate.subject, dominatedBy: frontier.find((other) => dominates(other, candidate))?.subject ?? "unknown" }));
  return { frontier: [...frontier].sort((a, b) => a.subject.localeCompare(b.subject)), dominated, rejected };
}

export function explainRoute(selected: string, evidenceDigest: string, policyHash: string, reasons: string[], rejected: Array<{ subject: string; reason: string }>): RouteExplanation {
  if (!selected.trim() || !evidenceDigest.trim() || !policyHash.trim()) throw new EvidenceRoutingContractError("route explanation identity is required");
  return { selected, evidenceDigest, policyHash, reasons: [...reasons], rejected: [...rejected].sort((a, b) => a.subject.localeCompare(b.subject)) };
}

export function planShadowRoute(primary: string, shadow: string, differences: string[]): ShadowRoutePlan {
  if (!primary.trim() || !shadow.trim()) throw new EvidenceRoutingContractError("shadow route identities are required");
  return { allowed: primary !== shadow, executesProvider: false, chargesMoney: false, writesExternalState: false, primary, shadow, differences: [...differences], planHash: hash(JSON.stringify({ primary, shadow, differences })) };
}

export function startTrace(organizationId: string, runId: string, traceId: string): TraceContext {
  if (!organizationId.trim() || !runId.trim() || !traceId.trim()) throw new EvidenceRoutingContractError("trace identity is required");
  return { organizationId, runId, traceId };
}

export function addTraceSpan(context: TraceContext, span: TraceSpan): TraceSpan {
  if (span.traceId !== context.traceId || span.endMs !== undefined && span.endMs < span.startMs) throw new EvidenceRoutingContractError("invalid trace span");
  return { ...span, attributes: { ...span.attributes, organizationId: context.organizationId, runId: context.runId } };
}

export function normalizeFailure(errorClass: FailureClass, rawMessage: string): NormalizedFailure {
  const retryable = ["rate_limited", "timeout", "dependency"].includes(errorClass);
  const publicCode = ({ rate_limited: "PROVIDER_RATE_LIMITED", timeout: "PROVIDER_TIMEOUT", invalid_output: "MODEL_INVALID_OUTPUT", policy_denied: "POLICY_DENIED", dependency: "DEPENDENCY_UNAVAILABLE", unknown: "UNKNOWN_FAILURE" } as Record<FailureClass, string>)[errorClass];
  return { class: errorClass, retryable, publicCode, rawMessageHash: hash(rawMessage) };
}
