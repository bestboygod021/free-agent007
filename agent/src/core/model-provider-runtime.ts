/** M61 contracts for connecting catalog models to providers and intelligent routing. */

import type { FreeApiStatus } from "./model-discovery-runtime.js";
import type { ModelTrustLevel } from "./model-evaluation-trust-runtime.js";

export type ModelProviderMode = "free" | "paid" | "local";
export type ModelProviderLocality = "local" | "cloud";
export type ModelProviderFailure = "rate_limit" | "auth" | "timeout" | "unreachable" | "capability" | "policy";

export interface ModelProviderEndpoint {
  providerId: string;
  catalogId: string;
  modelId: string;
  mode: ModelProviderMode;
  locality: ModelProviderLocality;
  apiBaseReference: string;
  credentialReference?: string;
  supportedTasks: string[];
  contextWindow: number;
  freeApiStatus: FreeApiStatus;
  trustLevel: ModelTrustLevel;
  enabled: boolean;
  maxConcurrent: number;
  quotaReference: string;
}

export interface ModelRuntimeRequest {
  organizationId: string;
  runId: string;
  taskType: string;
  modelPreference?: string;
  mode: ModelProviderMode;
  privacy: "local_only" | "tenant_safe" | "cloud_allowed";
  estimatedTokens: number;
  egressConsent: boolean;
  budgetAllowed: boolean;
}

export interface ModelRouteCandidate {
  endpoint: ModelProviderEndpoint;
  score: number;
  reasons: string[];
}

export interface ModelRuntimeDecision {
  allowed: boolean;
  reasons: string[];
  selectedProviderId?: string;
  selectedModelId?: string;
  fallbackProviderIds: string[];
  auditHash: string;
}

export class ModelProviderContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelProviderContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new ModelProviderContractError(`${label} is required`);
}

export function validateModelProviderEndpoint(endpoint: ModelProviderEndpoint): ModelRuntimeDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[endpoint.providerId, "providerId"], [endpoint.catalogId, "catalogId"], [endpoint.modelId, "modelId"], [endpoint.apiBaseReference, "apiBaseReference"], [endpoint.quotaReference, "quotaReference"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (endpoint.locality === "cloud" && !endpoint.apiBaseReference.startsWith("https://")) reasons.push("cloud provider endpoint must use HTTPS");
  if (endpoint.locality === "local" && endpoint.mode !== "local") reasons.push("locality and provider mode do not match");
  if (endpoint.mode === "local" && endpoint.credentialReference) reasons.push("local endpoint must not require remote credentials");
  if (endpoint.credentialReference && /password|secret|token|api[_-]?key/i.test(endpoint.credentialReference)) reasons.push("credential reference must be opaque");
  if (endpoint.supportedTasks.length === 0) reasons.push("provider endpoint needs supported tasks");
  if (!Number.isInteger(endpoint.contextWindow) || endpoint.contextWindow < 1 || !Number.isInteger(endpoint.maxConcurrent) || endpoint.maxConcurrent < 1) reasons.push("provider endpoint limits are invalid");
  if (!endpoint.enabled || endpoint.trustLevel === "blocked") reasons.push("provider endpoint is not eligible");
  return { allowed: reasons.length === 0, reasons, selectedProviderId: reasons.length === 0 ? endpoint.providerId : undefined, selectedModelId: reasons.length === 0 ? endpoint.modelId : undefined, fallbackProviderIds: [], auditHash: hash(JSON.stringify({ endpoint, reasons })) };
}

export function decideModelRuntimeRoute(request: ModelRuntimeRequest, endpoints: readonly ModelProviderEndpoint[]): ModelRuntimeDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.runId, "runId"], [request.taskType, "taskType"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(request.estimatedTokens) || request.estimatedTokens < 1) reasons.push("estimated tokens are invalid");
  if (!request.budgetAllowed) reasons.push("model route budget is denied");
  const candidates = endpoints.filter((endpoint) => {
    if (!endpoint.enabled || endpoint.trustLevel === "blocked" || !endpoint.supportedTasks.includes(request.taskType)) return false;
    if (request.modelPreference && endpoint.modelId !== request.modelPreference) return false;
    if (endpoint.mode !== request.mode) return false;
    if (request.privacy === "local_only" && endpoint.locality !== "local") return false;
    if (endpoint.locality === "cloud" && !request.egressConsent) return false;
    return true;
  });
  if (candidates.length === 0) reasons.push("no eligible model provider endpoint matches policy");
  const sorted = [...candidates].sort((a, b) => a.providerId.localeCompare(b.providerId) || a.modelId.localeCompare(b.modelId));
  const [selected, ...fallbacks] = sorted;
  return { allowed: reasons.length === 0, reasons, selectedProviderId: selected?.providerId, selectedModelId: selected?.modelId, fallbackProviderIds: fallbacks.map((endpoint) => endpoint.providerId), auditHash: hash(JSON.stringify({ request, endpoints, reasons })) };
}

export function decideModelProviderFallback(request: ModelRuntimeRequest, failure: ModelProviderFailure, fallbackEndpoints: readonly ModelProviderEndpoint[]): ModelRuntimeDecision {
  const reasons: string[] = [];
  if (["auth", "policy"].includes(failure)) reasons.push("provider failure requires user or policy correction before fallback");
  const eligible = fallbackEndpoints.filter((endpoint) => endpoint.enabled && endpoint.trustLevel !== "blocked" && endpoint.supportedTasks.includes(request.taskType) && endpoint.mode === request.mode && (request.privacy !== "local_only" || endpoint.locality === "local") && (endpoint.locality === "local" || request.egressConsent));
  if (eligible.length === 0) reasons.push("no eligible fallback provider endpoint");
  return { allowed: reasons.length === 0, reasons, selectedProviderId: eligible[0]?.providerId, selectedModelId: eligible[0]?.modelId, fallbackProviderIds: eligible.slice(1).map((endpoint) => endpoint.providerId), auditHash: hash(JSON.stringify({ request, failure, fallbackEndpoints, reasons })) };
}
