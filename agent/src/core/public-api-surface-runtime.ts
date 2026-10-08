/** M144 contracts for public API surface, OpenAPI documents and request admission. */

export type M144HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type M144AuthScheme = "session" | "oauth" | "api_key_reference" | "local_only";
export type M144RateClass = "read" | "write" | "stream" | "admin";

export interface M144OpenApiDocument {
  organizationId: string;
  apiId: string;
  version: string;
  specHash: string;
  endpointsHash: string;
  serverOrigin: string;
  authScheme: M144AuthScheme;
  tenantScoped: boolean;
  errorCatalogHash: string;
  deprecatedOperations: string[];
  documentedAt: number;
}

export interface M144EndpointContract {
  organizationId: string;
  apiId: string;
  operationId: string;
  method: M144HttpMethod;
  path: string;
  requestSchemaHash: string;
  responseSchemaHash: string;
  idempotent: boolean;
  authzRequired: boolean;
  rateLimitClass: M144RateClass;
  documented: boolean;
  tenantScoped: boolean;
}

export interface M144CompatibilityCheck {
  organizationId: string;
  apiId: string;
  previousSpecHash: string;
  currentSpecHash: string;
  breakingChanges: boolean;
  diffHash: string;
  consumerEvidenceHash: string;
  migrationPlanHash: string;
  approvalPresent: boolean;
  deprecationWindowDays: number;
}

export interface M144ApiRequest {
  organizationId: string;
  requestId: string;
  operationId: string;
  tenantMatch: boolean;
  authzPassed: boolean;
  schemaValid: boolean;
  idempotencyKey: string;
  rateLimitRemaining: number;
  redacted: boolean;
}

export interface M144ApiDecision {
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

export function validateM144OpenApiDocument(document: M144OpenApiDocument): M144ApiDecision {
  const reasons: string[] = [];
  required([[document.organizationId, "organizationId"], [document.apiId, "apiId"], [document.version, "version"], [document.specHash, "specHash"], [document.endpointsHash, "endpointsHash"], [document.serverOrigin, "serverOrigin"], [document.errorCatalogHash, "errorCatalogHash"]], reasons);
  if (!/^https:\/\//.test(document.serverOrigin) && document.authScheme !== "local_only") reasons.push("public API origin must use HTTPS");
  if (!document.tenantScoped) reasons.push("public API must declare tenant scope");
  if (!Number.isFinite(document.documentedAt)) reasons.push("documentedAt is invalid");
  if (document.deprecatedOperations.some((operation) => !operation.trim())) reasons.push("deprecated operations must be named");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ document, reasons })) };
}

export function validateM144Endpoint(endpoint: M144EndpointContract): M144ApiDecision {
  const reasons: string[] = [];
  required([[endpoint.organizationId, "organizationId"], [endpoint.apiId, "apiId"], [endpoint.operationId, "operationId"], [endpoint.path, "path"], [endpoint.requestSchemaHash, "requestSchemaHash"], [endpoint.responseSchemaHash, "responseSchemaHash"]], reasons);
  if (!endpoint.path.startsWith("/")) reasons.push("endpoint path must be absolute");
  if (!endpoint.documented || !endpoint.tenantScoped || !endpoint.authzRequired) reasons.push("endpoint needs documentation, tenant scope and authorization");
  if (["POST", "PUT", "PATCH", "DELETE"].includes(endpoint.method) && !endpoint.idempotent) reasons.push("mutating endpoint must declare idempotency");
  return { allowed: reasons.length === 0, reasons, requiresApproval: endpoint.rateLimitClass === "admin", auditHash: hash(JSON.stringify({ endpoint, reasons })) };
}

export function decideM144Compatibility(check: M144CompatibilityCheck): M144ApiDecision {
  const reasons: string[] = [];
  required([[check.organizationId, "organizationId"], [check.apiId, "apiId"], [check.previousSpecHash, "previousSpecHash"], [check.currentSpecHash, "currentSpecHash"], [check.diffHash, "diffHash"], [check.consumerEvidenceHash, "consumerEvidenceHash"], [check.migrationPlanHash, "migrationPlanHash"]], reasons);
  if (check.previousSpecHash === check.currentSpecHash) reasons.push("compatibility check must compare different specs");
  if (!Number.isInteger(check.deprecationWindowDays) || check.deprecationWindowDays < 0) reasons.push("deprecation window is invalid");
  if (check.breakingChanges && (check.deprecationWindowDays < 1 || !check.approvalPresent)) reasons.push("breaking API change needs window and approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: check.breakingChanges, auditHash: hash(JSON.stringify({ check, reasons })) };
}

export function decideM144Request(request: M144ApiRequest): M144ApiDecision {
  const reasons: string[] = [];
  required([[request.organizationId, "organizationId"], [request.requestId, "requestId"], [request.operationId, "operationId"], [request.idempotencyKey, "idempotencyKey"]], reasons);
  if (!request.tenantMatch || !request.authzPassed || !request.schemaValid || !request.redacted) reasons.push("request needs tenant, authorization, schema and redaction evidence");
  if (!Number.isInteger(request.rateLimitRemaining) || request.rateLimitRemaining < 1) reasons.push("rate limit is exhausted");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ request, reasons })) };
}
