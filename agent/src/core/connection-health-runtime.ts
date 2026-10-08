/** M53 contracts for connection center health, recovery and honest local/BYOK fallback. */

import type { ConnectedPlatform, ConnectionMode } from "./platform-connection-runtime.js";

export type ConnectionHealth = "healthy" | "degraded" | "expired" | "revoked" | "unreachable";
export type FallbackRoute = "same_platform_retry" | "free_provider" | "byok_provider" | "local_runtime" | "read_only" | "deny";

export interface ConnectionHealthReport {
  organizationId: string;
  connectionId: string;
  platform: ConnectedPlatform;
  health: ConnectionHealth;
  checkedAt: number;
  grantedScopes: string[];
  lastSuccessfulOperation?: string;
  errorClass?: "auth" | "rate_limit" | "network" | "permission" | "provider";
  tokenExpiresAt?: number;
  userVisibleMessage: string;
}

export interface FallbackRequest {
  organizationId: string;
  connectionId: string;
  platform: ConnectedPlatform;
  requestedRoute: FallbackRoute;
  mode: ConnectionMode;
  dataEgressAllowed: boolean;
  localCapabilityAvailable: boolean;
  byokConfigured: boolean;
  freeProviderAvailable: boolean;
}

export interface ReconnectPlan {
  organizationId: string;
  connectionId: string;
  platform: ConnectedPlatform;
  reason: "expired" | "revoked" | "permission_change" | "unreachable";
  preserveLocalContext: boolean;
  redirectUri: string;
  userInitiated: boolean;
}

export interface ConnectionHealthDecision {
  allowed: boolean;
  reasons: string[];
  selectedRoute: FallbackRoute;
  requiresUserAction: boolean;
  auditHash: string;
}

export class ConnectionHealthContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionHealthContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new ConnectionHealthContractError(`${label} is required`);
}

export function decideConnectionHealth(report: ConnectionHealthReport, now: number): ConnectionHealthDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[report.organizationId, "organizationId"], [report.connectionId, "connectionId"], [report.userVisibleMessage, "userVisibleMessage"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(now) || !Number.isFinite(report.checkedAt)) reasons.push("health timestamps must be finite");
  if (report.health === "healthy" && report.errorClass) reasons.push("healthy connection cannot report an active error");
  if (report.health === "expired" || report.health === "revoked") reasons.push("connection requires user reauthorization");
  if (report.health === "degraded" && !report.lastSuccessfulOperation) reasons.push("degraded connection needs last successful operation evidence");
  return { allowed: reasons.length === 0, reasons, selectedRoute: report.health === "healthy" ? "same_platform_retry" : "read_only", requiresUserAction: report.health === "expired" || report.health === "revoked", auditHash: hash(JSON.stringify({ report, now, reasons })) };
}

export function decideFallbackRoute(request: FallbackRequest): ConnectionHealthDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.connectionId, "connectionId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  let selectedRoute: FallbackRoute = "deny";
  if (request.requestedRoute === "local_runtime") {
    if (!request.localCapabilityAvailable) reasons.push("local fallback capability is unavailable");
    else if (request.dataEgressAllowed) reasons.push("local fallback cannot require external egress");
    else selectedRoute = "local_runtime";
  } else if (request.requestedRoute === "byok_provider") {
    if (!request.byokConfigured) reasons.push("BYOK fallback is not configured");
    else if (!request.dataEgressAllowed) reasons.push("BYOK provider requires explicit egress consent");
    else selectedRoute = "byok_provider";
  } else if (request.requestedRoute === "free_provider") {
    if (!request.freeProviderAvailable) reasons.push("free provider fallback is unavailable");
    else if (!request.dataEgressAllowed) reasons.push("free provider requires explicit egress consent");
    else selectedRoute = "free_provider";
  } else if (request.requestedRoute === "same_platform_retry") {
    selectedRoute = "same_platform_retry";
  } else if (request.requestedRoute === "read_only") {
    selectedRoute = "read_only";
  }
  return { allowed: reasons.length === 0, reasons, selectedRoute, requiresUserAction: false, auditHash: hash(JSON.stringify({ request, selectedRoute, reasons })) };
}

export function planConnectionReconnect(plan: ReconnectPlan, now: number): ConnectionHealthDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[plan.organizationId, "organizationId"], [plan.connectionId, "connectionId"], [plan.redirectUri, "redirectUri"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!plan.redirectUri.startsWith("/")) reasons.push("reconnect redirect must be relative");
  if (!plan.userInitiated) reasons.push("reconnect requires user initiation or explicit policy");
  if (!Number.isFinite(now)) reasons.push("reconnect clock must be finite");
  return { allowed: reasons.length === 0, reasons, selectedRoute: "same_platform_retry", requiresUserAction: true, auditHash: hash(JSON.stringify({ plan, now, reasons })) };
}

export function validateConnectionCenterScope(organizationId: string, requestedConnectionIds: string[], visibleConnectionIds: string[]): ConnectionHealthDecision {
  required(organizationId, "organizationId");
  const reasons: string[] = [];
  if (requestedConnectionIds.some((id) => !visibleConnectionIds.includes(id))) reasons.push("connection center request exceeds visible organization scope");
  return { allowed: reasons.length === 0, reasons, selectedRoute: "read_only", requiresUserAction: false, auditHash: hash(JSON.stringify({ organizationId, requestedConnectionIds, visibleConnectionIds, reasons })) };
}
