/** M67 contracts for connector/provider integration probes and external runtime gates. */

export type ExternalAdapterKind = "connector" | "model_provider" | "webhook" | "database" | "mcp";
export type ExternalEnvironment = "local" | "sandbox" | "staging" | "production";
export type ExternalProbeStatus = "passed" | "failed" | "skipped";

export interface ExternalAdapterManifest {
  organizationId: string;
  adapterId: string;
  adapterKind: ExternalAdapterKind;
  platformOrProvider: string;
  version: string;
  endpointReference: string;
  capabilityNames: string[];
  credentialReference?: string;
  sandboxed: boolean;
  reviewed: boolean;
  environment: ExternalEnvironment;
}

export interface ExternalIntegrationProbe {
  organizationId: string;
  adapterId: string;
  capability: string;
  environment: ExternalEnvironment;
  requestHash: string;
  responseHash: string;
  status: ExternalProbeStatus;
  exitCode: number;
  tenantProbePassed: boolean;
  signatureVerified: boolean;
  observedAt: number;
}

export interface ExternalIntegrationRun {
  organizationId: string;
  integrationId: string;
  adapterId: string;
  environment: ExternalEnvironment;
  capabilities: string[];
  egressConsent: boolean;
  approvalPresent: boolean;
  evidenceRequired: boolean;
}

export interface ExternalGateDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  auditHash: string;
}

export class ExternalIntegrationGateContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExternalIntegrationGateContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new ExternalIntegrationGateContractError(`${label} is required`);
}

export function validateExternalAdapterManifest(manifest: ExternalAdapterManifest): ExternalGateDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[manifest.organizationId, "organizationId"], [manifest.adapterId, "adapterId"], [manifest.platformOrProvider, "platformOrProvider"], [manifest.version, "version"], [manifest.endpointReference, "endpointReference"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (manifest.capabilityNames.length === 0 || new Set(manifest.capabilityNames).size !== manifest.capabilityNames.length) reasons.push("adapter capabilities must be non-empty and unique");
  if (manifest.environment === "production" && !manifest.reviewed) reasons.push("production adapter requires review");
  if (!manifest.sandboxed && ["mcp", "webhook"].includes(manifest.adapterKind)) reasons.push("external adapter must be sandboxed");
  if (manifest.credentialReference && /password|secret|token|api[_-]?key/i.test(manifest.credentialReference)) reasons.push("credential reference must be opaque");
  return { allowed: reasons.length === 0, reasons, requiresApproval: manifest.environment === "production", auditHash: hash(JSON.stringify({ manifest, reasons })) };
}

export function validateExternalIntegrationProbe(probe: ExternalIntegrationProbe, now: number): ExternalGateDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[probe.organizationId, "organizationId"], [probe.adapterId, "adapterId"], [probe.capability, "capability"], [probe.requestHash, "requestHash"], [probe.responseHash, "responseHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (probe.status !== "passed" || probe.exitCode !== 0) reasons.push("external integration probe did not pass");
  if (!probe.tenantProbePassed) reasons.push("tenant isolation probe did not pass");
  if (!probe.signatureVerified && probe.capability.includes("webhook")) reasons.push("webhook integration signature is not verified");
  if (!Number.isFinite(probe.observedAt) || probe.observedAt > now) reasons.push("probe timestamp is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: probe.environment === "production", auditHash: hash(JSON.stringify({ probe, now, reasons })) };
}

export function decideExternalIntegrationRun(run: ExternalIntegrationRun, manifest: ExternalAdapterManifest, probes: readonly ExternalIntegrationProbe[]): ExternalGateDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[run.organizationId, "organizationId"], [run.integrationId, "integrationId"], [run.adapterId, "adapterId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (run.adapterId !== manifest.adapterId || run.organizationId !== manifest.organizationId) reasons.push("integration scope does not match adapter manifest");
  if (run.capabilities.some((capability) => !manifest.capabilityNames.includes(capability))) reasons.push("integration requests an undeclared capability");
  for (const capability of run.capabilities) if (!probes.some((probe) => probe.capability === capability && probe.status === "passed" && probe.tenantProbePassed)) reasons.push(`passed probe is missing: ${capability}`);
  if (!run.egressConsent && manifest.environment !== "local") reasons.push("external integration requires egress consent");
  if (manifest.environment === "production" && !run.approvalPresent) reasons.push("production integration requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: manifest.environment === "production", auditHash: hash(JSON.stringify({ run, manifest, probes, reasons })) };
}

export function validateExternalRollback(organizationId: string, integrationId: string, rollbackEvidenceHash: string, approvalPresent: boolean): ExternalGateDecision {
  required(organizationId, "organizationId");
  required(integrationId, "integrationId");
  required(rollbackEvidenceHash, "rollbackEvidenceHash");
  const reasons: string[] = [];
  if (!approvalPresent) reasons.push("external integration rollback requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ organizationId, integrationId, rollbackEvidenceHash, approvalPresent, reasons })) };
}
