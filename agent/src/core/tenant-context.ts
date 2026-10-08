/**
 * Trusted tenant context used by the persistence adapter.
 *
 * This module never reads tenant identity from a request body or a repository
 * document. The caller must derive it from authenticated membership and pass it
 * to the transaction boundary. SQL RLS remains the final enforcement layer.
 */

export type TenantRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export interface TenantContext {
  organizationId: string;
  userId: string;
  role: TenantRole;
  requestId: string;
}

export interface TenantSettingCommand {
  text: "select set_config($1, $2, true)";
  values: readonly ["app.organization_id", string];
}

export const TENANT_SETTING_NAME = "app.organization_id" as const;

function requiredIdentifier(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  if (value.includes("\u0000") || value.includes("\n") || value.includes("\r")) {
    throw new Error(`${name} contains an invalid control character`);
  }
  return value.trim();
}

export function createTenantContext(input: {
  organizationId: unknown;
  userId: unknown;
  role: TenantRole;
  requestId: unknown;
}): TenantContext {
  if (!["OWNER", "ADMIN", "MEMBER", "VIEWER"].includes(input.role)) {
    throw new Error("role is invalid");
  }
  return {
    organizationId: requiredIdentifier(input.organizationId, "organizationId"),
    userId: requiredIdentifier(input.userId, "userId"),
    role: input.role,
    requestId: requiredIdentifier(input.requestId, "requestId"),
  };
}

/**
 * Set the transaction-local PostgreSQL setting with parameters, never string
 * interpolation. The `true` argument prevents a pooled connection from
 * carrying one tenant into the next transaction.
 */
export function tenantSettingCommand(context: TenantContext): TenantSettingCommand {
  const organizationId = requiredIdentifier(context.organizationId, "organizationId");
  return {
    text: "select set_config($1, $2, true)",
    values: [TENANT_SETTING_NAME, organizationId],
  };
}

export function assertTenantOwnership(
  context: TenantContext,
  resourceOrganizationId: unknown,
): void {
  const resourceId = requiredIdentifier(resourceOrganizationId, "resourceOrganizationId");
  if (context.organizationId !== resourceId) {
    throw new Error("cross-tenant resource access denied");
  }
}

export function canMutateTenant(role: TenantRole): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "MEMBER";
}

export function canManageTenant(role: TenantRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}
