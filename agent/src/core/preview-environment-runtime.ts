/** M152 contracts for preview environments, port leases, routes and deployment targets. */

export type M152Target = "docker" | "process" | "kubernetes";
export type M152EnvironmentState = "planned" | "starting" | "ready" | "expired" | "destroyed";

export interface M152PreviewEnvironment {
  organizationId: string;
  previewId: string;
  runId: string;
  target: M152Target;
  state: M152EnvironmentState;
  port: number;
  hostname: string;
  tlsConfigured: boolean;
  expiresAt: number;
  tenantBound: boolean;
  sandboxed: boolean;
  readOnlyArtifacts: boolean;
}

export interface M152PortLease {
  organizationId: string;
  leaseId: string;
  previewId: string;
  port: number;
  issuedAt: number;
  expiresAt: number;
  hostReference: string;
  reserved: boolean;
  tenantMatch: boolean;
}

export interface M152RouteBinding {
  organizationId: string;
  previewId: string;
  hostname: string;
  pathPrefix: string;
  tlsConfigured: boolean;
  originAllowed: boolean;
  tenantMatch: boolean;
  expiresAt: number;
  proxyReference: string;
}

export interface M152DeploymentTarget {
  organizationId: string;
  targetId: string;
  kind: M152Target;
  imageDigest: string;
  configHash: string;
  smokeHash: string;
  approvalPresent: boolean;
  rollbackPlanHash: string;
  networkPolicyHash: string;
  noClobber: boolean;
}

export interface M152PreviewDecision {
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

export function validateM152Environment(environment: M152PreviewEnvironment, now: number): M152PreviewDecision {
  const reasons: string[] = [];
  required([[environment.organizationId, "organizationId"], [environment.previewId, "previewId"], [environment.runId, "runId"], [environment.hostname, "hostname"]], reasons);
  if (!Number.isInteger(environment.port) || environment.port < 1024 || environment.port > 65535) reasons.push("preview port is outside user-port range");
  if (!Number.isFinite(environment.expiresAt) || environment.expiresAt <= now) reasons.push("preview expiry is invalid");
  if (!environment.tlsConfigured || !environment.tenantBound || !environment.sandboxed || !environment.readOnlyArtifacts) reasons.push("preview needs TLS, tenant, sandbox and read-only artifact evidence");
  if (environment.state === "destroyed" && environment.expiresAt > now) reasons.push("destroyed preview cannot have future expiry");
  return { allowed: reasons.length === 0, reasons, requiresApproval: environment.target === "kubernetes", auditHash: hash(JSON.stringify({ environment, now, reasons })) };
}

export function validateM152PortLease(lease: M152PortLease, now: number): M152PreviewDecision {
  const reasons: string[] = [];
  required([[lease.organizationId, "organizationId"], [lease.leaseId, "leaseId"], [lease.previewId, "previewId"], [lease.hostReference, "hostReference"]], reasons);
  if (!Number.isInteger(lease.port) || lease.port < 1024 || lease.port > 65535) reasons.push("port is invalid");
  if (!Number.isFinite(lease.issuedAt) || !Number.isFinite(lease.expiresAt) || lease.expiresAt <= lease.issuedAt || lease.expiresAt <= now) reasons.push("port lease lifetime is invalid");
  if (!lease.reserved || !lease.tenantMatch) reasons.push("port lease needs reservation and tenant evidence");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ lease, now, reasons })) };
}

export function decideM152Route(route: M152RouteBinding, now: number): M152PreviewDecision {
  const reasons: string[] = [];
  required([[route.organizationId, "organizationId"], [route.previewId, "previewId"], [route.hostname, "hostname"], [route.pathPrefix, "pathPrefix"], [route.proxyReference, "proxyReference"]], reasons);
  if (!route.pathPrefix.startsWith("/")) reasons.push("path prefix must be absolute");
  if (!route.tlsConfigured || !route.originAllowed || !route.tenantMatch) reasons.push("route needs TLS, origin allowlist and tenant match");
  if (!Number.isFinite(route.expiresAt) || route.expiresAt <= now) reasons.push("route is expired");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ route, now, reasons })) };
}

export function validateM152DeploymentTarget(target: M152DeploymentTarget): M152PreviewDecision {
  const reasons: string[] = [];
  required([[target.organizationId, "organizationId"], [target.targetId, "targetId"], [target.imageDigest, "imageDigest"], [target.configHash, "configHash"], [target.smokeHash, "smokeHash"], [target.rollbackPlanHash, "rollbackPlanHash"], [target.networkPolicyHash, "networkPolicyHash"]], reasons);
  if (!target.approvalPresent || !target.noClobber) reasons.push("deployment target needs approval and no-clobber config");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ target, reasons })) };
}
