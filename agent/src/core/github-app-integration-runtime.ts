/** M151 contracts for GitHub App installation, short-lived token and webhook/action safety. */

export type M151RepoAction = "read_issue" | "create_branch" | "open_pr" | "comment";
export type M151Trust = "official_app" | "approved_app" | "local_mock" | "untrusted";

export interface M151GithubInstallation {
  organizationId: string;
  installationId: string;
  appId: string;
  repositoryId: string;
  permissionHash: string;
  eventTypes: string[];
  webhookSecretReference: string;
  sourceTrust: M151Trust;
  approved: boolean;
  tenantMatch: boolean;
  noRawCredential: boolean;
}

export interface M151GithubTokenLease {
  organizationId: string;
  installationId: string;
  leaseId: string;
  tokenReference: string;
  scopes: string[];
  issuedAt: number;
  expiresAt: number;
  revoked: boolean;
  encryptedReference: boolean;
  rawTokenStored: false;
}

export interface M151GithubWebhook {
  organizationId: string;
  installationId: string;
  deliveryId: string;
  signatureHash: string;
  eventHash: string;
  sentAt: number;
  dedupeKey: string;
  verified: boolean;
  redacted: boolean;
  repositoryTenantMatch: boolean;
}

export interface M151RepositoryAction {
  organizationId: string;
  repositoryId: string;
  actionId: string;
  operation: M151RepoAction;
  authorizationPassed: boolean;
  approvalPresent: boolean;
  idempotencyKey: string;
  branchName?: string;
  protectedBranch: boolean;
  forcePush: boolean;
  tenantMatch: boolean;
  diffHash: string;
}

export interface M151GithubDecision {
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

export function validateM151Installation(installation: M151GithubInstallation): M151GithubDecision {
  const reasons: string[] = [];
  required([[installation.organizationId, "organizationId"], [installation.installationId, "installationId"], [installation.appId, "appId"], [installation.repositoryId, "repositoryId"], [installation.permissionHash, "permissionHash"], [installation.webhookSecretReference, "webhookSecretReference"]], reasons);
  if (installation.eventTypes.length === 0) reasons.push("installation must declare event types");
  if (!installation.approved || !installation.tenantMatch || !installation.noRawCredential) reasons.push("installation needs approval, tenant match and no-raw-credential evidence");
  if (installation.sourceTrust === "untrusted") reasons.push("untrusted GitHub app is not admissible");
  if (/secret|token|password|key/i.test(installation.webhookSecretReference)) reasons.push("webhook secret reference must be opaque");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ installation, reasons })) };
}

export function validateM151TokenLease(lease: M151GithubTokenLease, now: number): M151GithubDecision {
  const reasons: string[] = [];
  required([[lease.organizationId, "organizationId"], [lease.installationId, "installationId"], [lease.leaseId, "leaseId"], [lease.tokenReference, "tokenReference"]], reasons);
  if (lease.scopes.length === 0) reasons.push("token lease must declare scopes");
  if (!Number.isFinite(lease.issuedAt) || !Number.isFinite(lease.expiresAt) || lease.expiresAt <= lease.issuedAt || lease.expiresAt <= now) reasons.push("GitHub token lease lifetime is invalid");
  if (lease.revoked || !lease.encryptedReference || lease.rawTokenStored !== false) reasons.push("GitHub token lease must be active, encrypted and raw-token-free");
  if (/token|secret|password|key/i.test(lease.tokenReference)) reasons.push("token reference must be opaque");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ lease, now, reasons })) };
}

export function decideM151Webhook(webhook: M151GithubWebhook): M151GithubDecision {
  const reasons: string[] = [];
  required([[webhook.organizationId, "organizationId"], [webhook.installationId, "installationId"], [webhook.deliveryId, "deliveryId"], [webhook.signatureHash, "signatureHash"], [webhook.eventHash, "eventHash"], [webhook.dedupeKey, "dedupeKey"]], reasons);
  if (!webhook.verified || !webhook.redacted || !webhook.repositoryTenantMatch) reasons.push("webhook needs signature, redaction and repository tenant evidence");
  if (!Number.isFinite(webhook.sentAt)) reasons.push("sentAt is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ webhook, reasons })) };
}

export function decideM151RepositoryAction(action: M151RepositoryAction): M151GithubDecision {
  const reasons: string[] = [];
  required([[action.organizationId, "organizationId"], [action.repositoryId, "repositoryId"], [action.actionId, "actionId"], [action.idempotencyKey, "idempotencyKey"], [action.diffHash, "diffHash"]], reasons);
  if (!action.authorizationPassed || !action.tenantMatch) reasons.push("repository action needs authorization and tenant match");
  if (["create_branch", "open_pr", "comment"].includes(action.operation) && !action.approvalPresent) reasons.push("repository mutation needs approval");
  if (action.forcePush) reasons.push("force push is prohibited");
  if (action.operation === "create_branch" && !action.branchName?.trim()) reasons.push("branch creation needs branch name");
  if (action.protectedBranch && action.operation !== "read_issue" && !action.approvalPresent) reasons.push("protected branch action needs approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: action.operation !== "read_issue", auditHash: hash(JSON.stringify({ action, reasons })) };
}
