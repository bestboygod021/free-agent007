import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Structural checks on the Prisma schema.
 *
 * NOTE: `prisma validate` cannot run in this sandbox — the CLI downloads its
 * schema-engine binary from binaries.prisma.sh, which is not reachable here.
 * These tests therefore check the *design rules* the schema must obey by
 * parsing the file directly. Run `npx prisma validate` locally for the full
 * type check.
 */

const raw = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

interface Model {
  name: string;
  body: string;
}

function parseModels(src: string): Model[] {
  const out: Model[] = [];
  const re = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    out.push({ name: m[1] as string, body: m[2] as string });
  }
  return out;
}

const models = parseModels(raw);
const byName = new Map(models.map((m) => [m.name, m]));

/** Tables that legitimately sit above or outside the tenant boundary. */
const NON_TENANT = new Set(["User", "Organization", "OrganizationMember"]);

describe("prisma schema structure", () => {
  it("parses every model", () => {
    expect(models.length).toBeGreaterThanOrEqual(13);
    for (const expected of [
      "User",
      "Organization",
      "OrganizationMember",
      "Project",
      "AgentRun",
      "AgentTask",
      "Connector",
      "SecretReference",
      "Approval",
      "ToolCall",
      "AuditLog",
      "TestRun",
      "SystemEvent",
    ]) {
      expect(byName.has(expected), expected).toBe(true);
    }
  });

  it("gives every tenant-scoped table an organizationId", () => {
    for (const model of models) {
      if (NON_TENANT.has(model.name)) continue;
      // SystemEvent carries tenantId instead, matching the event schema
      if (model.name === "SystemEvent") {
        expect(model.body, model.name).toMatch(/tenantId\s+String/);
        continue;
      }
      expect(model.body, `${model.name} is missing organizationId`).toMatch(
        /organizationId\s+String/,
      );
    }
  });

  it("never stores a raw secret", () => {
    const forbidden = /\b(password|secret|token|apiKey|privateKey)\s+String/;
    for (const model of models) {
      // passwordHash on User is the one allowed exception, and it is a hash
      const body = model.body.replace(/passwordHash\s+String[^\n]*/g, "");
      expect(forbidden.test(body), `${model.name} stores something that looks like a secret`).toBe(
        false,
      );
    }
    expect(byName.get("SecretReference")?.body).toMatch(/vaultPath\s+String/);
    expect(byName.get("SecretReference")?.body).not.toMatch(/\bvalue\s+String/);
  });

  it("maps every table to a snake_case name", () => {
    for (const model of models) {
      expect(model.body, `${model.name} has no @@map`).toMatch(/@@map\("[a-z_]+"\)/);
    }
  });

  it("binds an approval to the exact payload that was approved and gives it an expiry", () => {
    const approval = byName.get("Approval")?.body ?? "";
    expect(approval).toMatch(/payloadHash\s+String/);
    expect(approval).toMatch(/expiresAt/);
    expect(approval).toMatch(/decidedBy/);
  });

  it("records the prompt version on every tool call so a run can be reproduced", () => {
    const tc = byName.get("ToolCall")?.body ?? "";
    expect(tc).toMatch(/promptVersion\s+String/);
    expect(tc).toMatch(/inputHash\s+String/);
    expect(tc).toMatch(/idempotencyKey\s+String\s+@unique/);
    expect(tc).toMatch(/sideEffect\s+SideEffectClass/);
  });

  it("keeps the audit log append-only with no user cascade", () => {
    const audit = byName.get("AuditLog")?.body ?? "";
    expect(audit).toMatch(/organizationId/);
    expect(audit).not.toMatch(/references: \[id\], onDelete: Cascade\)\s*\n\s*user/);
    // ip addresses are hashed, never stored raw
    expect(audit).toMatch(/ipHash/);
    expect(audit).not.toMatch(/\bipAddress\s+String/);
  });

  it("binds a run to the approved plan hash and to a repair budget", () => {
    const run = byName.get("AgentRun")?.body ?? "";
    expect(run).toMatch(/planHash/);
    expect(run).toMatch(/repairAttempts\s+Int/);
    expect(run).toMatch(/maxRepairAttempts\s+Int\s+@default\(3\)/);
    expect(run).toMatch(/hardStopTokens/);
    expect(run).toMatch(/workingBranch/);
  });

  it("scopes project name uniqueness to the tenant, not globally", () => {
    const project = byName.get("Project")?.body ?? "";
    expect(project).toMatch(/@@unique\(\[organizationId, name\]\)/);
  });

  it("models the event stream as immutable and versioned", () => {
    const ev = byName.get("SystemEvent")?.body ?? "";
    expect(ev).toMatch(/eventId\s+String\s+@unique/);
    expect(ev).toMatch(/schemaVersion\s+Int\s+@default\(1\)/);
    expect(ev).toMatch(/redacted\s+Boolean/);
  });

  it("keeps the RunState enum in sync with the state machine", async () => {
    const { RUN_STATES, TERMINAL_STATES } = await import("../src/core/state-machine.js");
    const enumBody = /enum RunState \{([\s\S]*?)\n\}/.exec(raw)?.[1] ?? "";
    const values = enumBody
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    for (const state of RUN_STATES) {
      expect(values, `state ${state} missing from the Prisma enum`).toContain(state);
    }
    for (const terminal of TERMINAL_STATES) {
      expect(values, terminal).toContain(terminal);
    }
    expect(values).toContain("AWAITING_PLAN_APPROVAL");
    expect(values).toContain("AWAITING_DEPLOY_APPROVAL");
    expect(values).toContain("BLOCKED");
    expect(values.length).toBeGreaterThanOrEqual(19);
  });

  it("stores the compute mode on the tenant and snapshots it per run", () => {
    const org = byName.get("Organization")?.body ?? "";
    const run = byName.get("AgentRun")?.body ?? "";
    expect(org).toMatch(/computeMode\s+ComputeMode\s+@default\(FREE\)/);
    expect(run).toMatch(/computeMode\s+ComputeMode\s+@default\(FREE\)/);
    // a run must not drift if the workspace default changes mid-flight
    expect(run).toMatch(/modeProfileHash/);
    const enumBody = /enum ComputeMode \{([\s\S]*?)\n\}/.exec(raw)?.[1] ?? "";
    const values = enumBody.split("\n").map((l) => l.trim()).filter(Boolean).sort();
    expect(values).toEqual(["FREE", "LOCAL", "PAID"]);
  });

  it("never cascades a user deletion into the audit trail", () => {
    // deleting a User must not erase evidence
    const audit = byName.get("AuditLog")?.body ?? "";
    expect(audit).not.toMatch(/User\s+@relation/);
  });
});
