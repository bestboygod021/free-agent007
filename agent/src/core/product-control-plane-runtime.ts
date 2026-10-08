/** M64 contracts for the product control-plane UI, API and approval surfaces. */

export type ProductScreenId = "home" | "runs" | "workspace" | "connections" | "models" | "directory" | "studio" | "approvals" | "settings";
export type ProductScreenState = "empty" | "loading" | "ready" | "error" | "degraded";
export type ProductApiMethod = "GET" | "POST" | "PATCH" | "DELETE";
export type ProductAction = "run_start" | "approve" | "connect" | "model_enable" | "publish_preview" | "revoke";

export interface ProductApiRequest {
  organizationId: string;
  userId: string;
  requestId: string;
  route: string;
  method: ProductApiMethod;
  screen: ProductScreenId;
  csrfProof: string;
  idempotencyKey?: string;
  sessionValid: boolean;
  tenantScoped: boolean;
}

export interface ProductScreenProjection {
  organizationId: string;
  screen: ProductScreenId;
  state: ProductScreenState;
  dataHash?: string;
  errorCode?: string;
  allowedActions: ProductAction[];
  tenantScoped: boolean;
  generatedAt: number;
}

export interface ProductApprovalItem {
  organizationId: string;
  approvalId: string;
  runId?: string;
  action: ProductAction;
  requestedBy: string;
  assignedTo?: string;
  payloadHash: string;
  expiresAt: number;
  alreadyDecided: boolean;
}

export interface ProductControlDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  auditHash: string;
}

export class ProductControlPlaneContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductControlPlaneContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new ProductControlPlaneContractError(`${label} is required`);
}

export function validateProductApiRequest(request: ProductApiRequest): ProductControlDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.userId, "userId"], [request.requestId, "requestId"], [request.route, "route"], [request.csrfProof, "csrfProof"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!request.route.startsWith("/api/")) reasons.push("product API route must be internal and relative");
  if (!request.sessionValid) reasons.push("product session is invalid");
  if (!request.tenantScoped) reasons.push("product API request must be tenant-scoped");
  if (request.method !== "GET" && !request.idempotencyKey) reasons.push("mutating product API request requires idempotency key");
  if (request.idempotencyKey && /password|secret|token|api[_-]?key/i.test(request.idempotencyKey)) reasons.push("idempotency key must not contain a secret");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.method !== "GET", auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateProductScreenProjection(projection: ProductScreenProjection, now: number): ProductControlDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[projection.organizationId, "organizationId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!projection.tenantScoped) reasons.push("screen projection must be tenant-scoped");
  if (!Number.isFinite(now) || !Number.isFinite(projection.generatedAt) || projection.generatedAt > now) reasons.push("screen projection timestamp is invalid");
  if (["ready", "degraded"].includes(projection.state) && !projection.dataHash) reasons.push("ready/degraded screen needs data hash");
  if (projection.state === "error" && !projection.errorCode) reasons.push("error screen needs error code");
  if (projection.state === "loading" && projection.allowedActions.length > 0) reasons.push("loading screen cannot expose mutating actions");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ projection, now, reasons })) };
}

export function decideProductAction(action: ProductApprovalItem, now: number, actorId: string, approvalPresent: boolean): ProductControlDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[action.organizationId, "organizationId"], [action.approvalId, "approvalId"], [action.requestedBy, "requestedBy"], [action.payloadHash, "payloadHash"], [actorId, "actorId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(now) || action.expiresAt <= now) reasons.push("approval item is expired");
  if (action.alreadyDecided) reasons.push("approval item has already been decided");
  if (actorId === action.requestedBy && ["approve", "run_start", "publish_preview"].includes(action.action)) reasons.push("requester cannot approve their own high-risk action");
  if (!approvalPresent && ["run_start", "model_enable", "publish_preview"].includes(action.action)) reasons.push("product action requires approval");
  if (action.assignedTo && action.assignedTo !== actorId) reasons.push("approval item is assigned to another reviewer");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ action, now, actorId, approvalPresent, reasons })) };
}

export function validateProductApiError(organizationId: string, requestId: string, errorCode: string, userMessage: string, exposesSecret: boolean): ProductControlDecision {
  required(organizationId, "organizationId");
  required(requestId, "requestId");
  required(errorCode, "errorCode");
  required(userMessage, "userMessage");
  const reasons: string[] = [];
  if (exposesSecret) reasons.push("product error must not expose a secret");
  if (userMessage.length > 500) reasons.push("user-facing error is too long");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ organizationId, requestId, errorCode, userMessage, exposesSecret, reasons })) };
}
