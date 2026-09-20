/** M195 fail-closed contracts for provider health, circuit recovery and fallback routing. */

export type M195ProviderMode = "local" | "free" | "byok" | "hosted";
export type M195CircuitState = "closed" | "open" | "half_open";

export interface M195ProviderManifest {
  organizationId: string;
  providerId: string;
  mode: M195ProviderMode;
  endpointReference: string;
  capabilities: string[];
  quotaRemaining: number;
  region: string;
  termsReviewed: boolean;
  credentialReference: string;
  healthPolicyHash: string;
  tenantBound: boolean;
}

export interface M195HealthSample {
  organizationId: string;
  providerId: string;
  sampleId: string;
  sampledAt: number;
  latencyMs: number;
  statusCode: number;
  success: boolean;
  errorClass: string;
  quotaRemaining: number;
  evidenceHash: string;
  signed: boolean;
  tenantMatch: boolean;
}

export interface M195Circuit {
  organizationId: string;
  providerId: string;
  circuitId: string;
  state: M195CircuitState;
  consecutiveFailures: number;
  failureThreshold: number;
  cooldownUntil: number;
  probeAllowed: boolean;
  fallbackDisclosed: boolean;
  approvalPresent: boolean;
  tenantMatch: boolean;
}

export interface M195RouteDecision {
  organizationId: string;
  routeId: string;
  requestedCapability: string;
  candidateProviderIds: string[];
  selectedProviderId: string;
  healthFresh: boolean;
  quotaAvailable: boolean;
  dataEgress: "never" | "approved";
  fallbackDisclosed: boolean;
  budgetAvailable: boolean;
  consentPresent: boolean;
  tenantMatch: boolean;
}

export interface M195ProviderDecision {
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

export function validateM195Provider(manifest: M195ProviderManifest): M195ProviderDecision {
  const reasons: string[] = [];
  required([[manifest.organizationId, "organizationId"], [manifest.providerId, "providerId"], [manifest.endpointReference, "endpointReference"], [manifest.region, "region"], [manifest.credentialReference, "credentialReference"], [manifest.healthPolicyHash, "healthPolicyHash"]], reasons);
  if (manifest.capabilities.length === 0 || manifest.capabilities.some((capability) => !capability.trim()) || !Number.isInteger(manifest.quotaRemaining) || manifest.quotaRemaining < 0 || !manifest.termsReviewed || !manifest.tenantBound) reasons.push("provider manifest needs capability, quota, terms and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: manifest.mode === "hosted", auditHash: hash(JSON.stringify({ manifest, reasons })) };
}

export function validateM195Health(sample: M195HealthSample, now: number): M195ProviderDecision {
  const reasons: string[] = [];
  required([[sample.organizationId, "organizationId"], [sample.providerId, "providerId"], [sample.sampleId, "sampleId"], [sample.errorClass, "errorClass"], [sample.evidenceHash, "evidenceHash"]], reasons);
  if (!Number.isFinite(sample.sampledAt) || sample.sampledAt > now || !Number.isInteger(sample.latencyMs) || sample.latencyMs < 0 || !Number.isInteger(sample.statusCode) || sample.statusCode < 100 || sample.statusCode > 599 || !Number.isInteger(sample.quotaRemaining) || sample.quotaRemaining < 0 || !sample.signed || !sample.tenantMatch) reasons.push("health sample timing, network status, quota, signature or tenant proof failed");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ sample, now, reasons })) };
}

export function decideM195Circuit(circuit: M195Circuit, now: number): M195ProviderDecision {
  const reasons: string[] = [];
  required([[circuit.organizationId, "organizationId"], [circuit.providerId, "providerId"], [circuit.circuitId, "circuitId"]], reasons);
  if (!Number.isInteger(circuit.consecutiveFailures) || circuit.consecutiveFailures < 0 || !Number.isInteger(circuit.failureThreshold) || circuit.failureThreshold < 1 || !Number.isFinite(circuit.cooldownUntil) || circuit.cooldownUntil < now || circuit.state === "open" && !circuit.fallbackDisclosed || circuit.state === "half_open" && !circuit.probeAllowed || !circuit.approvalPresent || !circuit.tenantMatch) reasons.push("circuit needs bounded failure/cooldown, probe, fallback, approval and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ circuit, now, reasons })) };
}

export function decideM195Route(route: M195RouteDecision): M195ProviderDecision {
  const reasons: string[] = [];
  required([[route.organizationId, "organizationId"], [route.routeId, "routeId"], [route.requestedCapability, "requestedCapability"], [route.selectedProviderId, "selectedProviderId"]], reasons);
  if (route.candidateProviderIds.length === 0 || !route.candidateProviderIds.includes(route.selectedProviderId) || !route.healthFresh || !route.quotaAvailable || !route.budgetAvailable || !route.consentPresent || !route.tenantMatch || route.dataEgress === "approved" && !route.fallbackDisclosed) reasons.push("route needs candidate, fresh health, quota, budget, consent and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: route.dataEgress === "approved", auditHash: hash(JSON.stringify({ route, reasons })) };
}
