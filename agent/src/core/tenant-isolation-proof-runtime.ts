/** M147 contracts for RLS policy checks, cross-tenant probes and isolation proof bundles. */

export type M147AccessAction = "read" | "write" | "delete" | "admin";

export interface M147TenantPolicy {
  organizationId: string;
  policyVersion: string;
  tableNames: string[];
  rlsEnabled: boolean;
  defaultDeny: boolean;
  serviceRoleBound: boolean;
  tenantColumn: string;
  reviewed: boolean;
}

export interface M147IsolationProbe {
  organizationId: string;
  testId: string;
  subjectOrganizationId: string;
  targetOrganizationId: string;
  operation: M147AccessAction;
  expectedDenied: boolean;
  observedDenied: boolean;
  dbPolicyHash: string;
  queryHash: string;
  noLeak: boolean;
  transactionBound: boolean;
}

export interface M147AccessDecisionInput {
  organizationId: string;
  requestOrganizationId: string;
  targetOrganizationId: string;
  role: string;
  action: M147AccessAction;
  rowVisible: boolean;
  tenantContextValidated: boolean;
  transactionId: string;
  policyDefaultDeny: boolean;
}

export interface M147ProofBundle {
  organizationId: string;
  bundleId: string;
  testHashes: string[];
  noLeakHash: string;
  replayHash: string;
  generatedAt: number;
  reviewed: boolean;
  allDeniedProbes: boolean;
  policyVersion: string;
}

export interface M147IsolationDecision {
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

export function validateM147TenantPolicy(policy: M147TenantPolicy): M147IsolationDecision {
  const reasons: string[] = [];
  required([[policy.organizationId, "organizationId"], [policy.policyVersion, "policyVersion"], [policy.tenantColumn, "tenantColumn"]], reasons);
  if (policy.tableNames.length === 0) reasons.push("tenant policy must name tables");
  if (!policy.rlsEnabled || !policy.defaultDeny || !policy.serviceRoleBound || !policy.reviewed) reasons.push("policy needs RLS, default deny, service binding and review");
  if (policy.tenantColumn.includes(" ") || policy.tenantColumn.includes(";")) reasons.push("tenant column must be a safe identifier");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ policy, reasons })) };
}

export function decideM147Access(input: M147AccessDecisionInput): M147IsolationDecision {
  const reasons: string[] = [];
  required([[input.organizationId, "organizationId"], [input.requestOrganizationId, "requestOrganizationId"], [input.targetOrganizationId, "targetOrganizationId"], [input.role, "role"], [input.transactionId, "transactionId"]], reasons);
  if (input.organizationId !== input.requestOrganizationId) reasons.push("request context does not match organization");
  if (input.requestOrganizationId !== input.targetOrganizationId && input.rowVisible) reasons.push("cross-tenant row must not be visible");
  if (!input.tenantContextValidated || !input.policyDefaultDeny) reasons.push("tenant context and default-deny policy are required");
  if (input.action === "admin" && input.role !== "owner") reasons.push("admin access requires owner role");
  return { allowed: reasons.length === 0, reasons, requiresApproval: input.action === "admin", auditHash: hash(JSON.stringify({ input, reasons })) };
}

export function validateM147Probe(probe: M147IsolationProbe): M147IsolationDecision {
  const reasons: string[] = [];
  required([[probe.organizationId, "organizationId"], [probe.testId, "testId"], [probe.subjectOrganizationId, "subjectOrganizationId"], [probe.targetOrganizationId, "targetOrganizationId"], [probe.dbPolicyHash, "dbPolicyHash"], [probe.queryHash, "queryHash"]], reasons);
  if (probe.subjectOrganizationId === probe.targetOrganizationId) reasons.push("isolation probe must cross organization boundaries");
  if (!probe.expectedDenied || !probe.observedDenied || !probe.noLeak || !probe.transactionBound) reasons.push("cross-tenant probe needs denied, no-leak and transaction evidence");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ probe, reasons })) };
}

export function validateM147ProofBundle(bundle: M147ProofBundle): M147IsolationDecision {
  const reasons: string[] = [];
  required([[bundle.organizationId, "organizationId"], [bundle.bundleId, "bundleId"], [bundle.noLeakHash, "noLeakHash"], [bundle.replayHash, "replayHash"], [bundle.policyVersion, "policyVersion"]], reasons);
  if (bundle.testHashes.length === 0 || !bundle.allDeniedProbes || !bundle.reviewed) reasons.push("proof bundle needs tests, denied probes and review");
  if (!Number.isFinite(bundle.generatedAt)) reasons.push("generatedAt is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ bundle, reasons })) };
}
