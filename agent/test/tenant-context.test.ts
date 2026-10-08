import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  assertTenantOwnership,
  canManageTenant,
  canMutateTenant,
  createTenantContext,
  tenantSettingCommand,
} from "../src/core/tenant-context.js";

const root = new URL("../", import.meta.url);
const initSql = readFileSync(new URL("prisma/migrations/202609090001_init/migration.sql", root), "utf8");
const rlsSql = readFileSync(new URL("prisma/migrations/202609090002_tenant_rls/migration.sql", root), "utf8");

describe("tenant context boundary", () => {
  it("creates a normalized context from authenticated membership", () => {
    expect(createTenantContext({
      organizationId: " org_a ",
      userId: " user_1 ",
      role: "ADMIN",
      requestId: " req_1 ",
    })).toEqual({ organizationId: "org_a", userId: "user_1", role: "ADMIN", requestId: "req_1" });
  });

  it("rejects missing or control-character identifiers", () => {
    expect(() => createTenantContext({ organizationId: "", userId: "u", role: "MEMBER", requestId: "r" })).toThrow(
      "organizationId is required",
    );
    expect(() => createTenantContext({ organizationId: "org\nA", userId: "u", role: "MEMBER", requestId: "r" })).toThrow(
      "invalid control character",
    );
  });

  it("uses a transaction-local parameterized setting", () => {
    const context = createTenantContext({ organizationId: "org_a", userId: "u", role: "MEMBER", requestId: "r" });
    expect(tenantSettingCommand(context)).toEqual({
      text: "select set_config($1, $2, true)",
      values: ["app.organization_id", "org_a"],
    });
  });

  it("rejects a resource belonging to another tenant", () => {
    const context = createTenantContext({ organizationId: "org_a", userId: "u", role: "MEMBER", requestId: "r" });
    expect(() => assertTenantOwnership(context, "org_b")).toThrow("cross-tenant resource access denied");
    expect(() => assertTenantOwnership(context, "org_a")).not.toThrow();
  });

  it("keeps mutation and tenant-management roles distinct", () => {
    expect(canMutateTenant("VIEWER")).toBe(false);
    expect(canMutateTenant("MEMBER")).toBe(true);
    expect(canManageTenant("MEMBER")).toBe(false);
    expect(canManageTenant("ADMIN")).toBe(true);
  });
});

describe("PostgreSQL migration contract", () => {
  it("creates every Prisma model table and never a raw password column", () => {
    for (const table of [
      "users", "organizations", "organization_members", "projects", "agent_runs", "agent_tasks",
      "connectors", "secret_references", "approvals", "tool_calls", "audit_logs", "test_runs", "system_events",
    ]) {
      expect(initSql).toContain(`CREATE TABLE \"${table}\"`);
    }
    expect(initSql).toContain("password_hash");
    expect(initSql).not.toMatch(/raw_password|password_plaintext|password_value/i);
  });

  it("enforces transaction-local RLS for every tenant-scoped table", () => {
    expect(rlsSql).toContain("current_setting('app.organization_id', true)");
    for (const table of [
      "organization_members", "projects", "agent_runs", "agent_tasks", "connectors",
      "secret_references", "approvals", "tool_calls", "audit_logs", "test_runs",
    ]) {
      expect(rlsSql).toContain(`'${table}'`);
    }
    expect(rlsSql).toContain("FOREACH table_name IN ARRAY");
    expect(rlsSql).toContain("ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY");
    expect(rlsSql).toContain("table_name || '_tenant_isolation'");
    expect(rlsSql).toContain("ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY");
    expect(rlsSql).toContain("system_events_tenant_read");
    expect(rlsSql).toContain("system_events_tenant_append");
  });

  it("protects parent references and keeps audit/event streams append-only", () => {
    expect(rlsSql).toContain("CREATE OR REPLACE FUNCTION app.assert_same_organization()");
    expect(rlsSql).toContain("cross-tenant parent reference is not allowed");
    expect(rlsSql).toContain("UPDATE or DELETE policy is intentionally created");
    expect(rlsSql).not.toMatch(/CREATE POLICY audit_logs_.*FOR DELETE/i);
    expect(rlsSql).not.toMatch(/CREATE POLICY system_events_.*FOR DELETE/i);
  });
});
