import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { guard, validate } from "../src/core/output-contract.js";
import { SCHEMA_IDS, SCHEMAS } from "../src/core/schema-registry.js";

const exampleDir = new URL("../examples/", import.meta.url);
const example = (name: string) =>
  JSON.parse(readFileSync(new URL(`${name}.json`, exampleDir), "utf8")) as unknown;

const PAIRS: Array<[string, string]> = [
  ["task.backend-auth", SCHEMA_IDS.task],
  ["tool-call-decision", SCHEMA_IDS.toolCallDecision],
  ["completion-report.completed", SCHEMA_IDS.completionReport],
  ["completion-report.unverified", SCHEMA_IDS.completionReport],
  ["security-finding", SCHEMA_IDS.securityFinding],
  ["qa-report", SCHEMA_IDS.qaReport],
  ["plan", SCHEMA_IDS.plan],
  ["orchestrator-output.plan-ready", SCHEMA_IDS.orchestratorOutput],
  ["event", SCHEMA_IDS.event],
  ["connector-manifest.github", SCHEMA_IDS.connectorManifest],
  ["run-request.free", SCHEMA_IDS.runRequest],
  ["run-request.paid", SCHEMA_IDS.runRequest],
  ["run-request.local", SCHEMA_IDS.runRequest],
];

describe("every schema compiles", () => {
  it("registers the full contract library", () => {
    expect(SCHEMAS.length).toBeGreaterThanOrEqual(10);
    for (const id of Object.values(SCHEMA_IDS)) {
      const probe = validate(id, {});
      // must be a *validation* failure, not a compile/resolve failure
      expect(probe.ok).toBe(false);
      expect(probe.errors.length).toBeGreaterThan(0);
    }
  });
});

describe("shipped examples are valid instances of their contracts", () => {
  it.each(PAIRS)("%s validates", (file, schemaId) => {
    const r = validate(schemaId, example(file));
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });
});

describe("contracts reject malformed agent output", () => {
  it("rejects a task id that is not namespaced", () => {
    const bad = { ...(example("task.backend-auth") as object), taskId: "Task_Bad" };
    expect(validate(SCHEMA_IDS.task, bad).ok).toBe(false);
  });

  it("rejects a task with no acceptance criteria", () => {
    const bad = { ...(example("task.backend-auth") as object), acceptanceCriteria: [] };
    expect(validate(SCHEMA_IDS.task, bad).ok).toBe(false);
  });

  it("rejects an orchestrator response that asks more than 7 questions", () => {
    const base = example("orchestrator-output.plan-ready") as {
      clarificationQuestions: unknown[];
    };
    const bad = {
      ...base,
      clarificationQuestions: Array.from({ length: 8 }, (_, i) => ({
        question: `question number ${i + 1} here`,
        whyItMatters: "because",
      })),
    };
    expect(validate(SCHEMA_IDS.orchestratorOutput, bad).ok).toBe(false);
  });

  it("rejects a security finding without a verification command", () => {
    const bad = { ...(example("security-finding") as object), verification: undefined };
    const r = validate(SCHEMA_IDS.securityFinding, bad);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" | ")).toMatch(/verification/);
  });

  it("rejects a blocked completion report with no failure reason", () => {
    const base = example("completion-report.completed") as Record<string, unknown>;
    const bad = { ...base, taskStatus: "blocked" };
    expect(validate(SCHEMA_IDS.completionReport, bad).ok).toBe(false);
  });

  it("rejects an event with a bumped schemaVersion", () => {
    const bad = { ...(example("event") as object), schemaVersion: 2 };
    expect(validate(SCHEMA_IDS.event, bad).ok).toBe(false);
  });

  it("rejects an event type that is not in the vocabulary", () => {
    const bad = { ...(example("event") as object), type: "something.invented" };
    expect(validate(SCHEMA_IDS.event, bad).ok).toBe(false);
  });

  it("rejects a connector capability that is not namespaced", () => {
    const bad = { ...(example("connector-manifest.github") as object), capabilities: ["list"] };
    expect(validate(SCHEMA_IDS.connectorManifest, bad).ok).toBe(false);
  });

  it("rejects a run request without a compute mode", () => {
    const bad = { ...(example("run-request.free") as object), computeMode: undefined };
    const r = validate(SCHEMA_IDS.runRequest, bad);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" | ")).toMatch(/computeMode/);
  });

  it("rejects a compute mode outside the three options", () => {
    const bad = { ...(example("run-request.free") as object), computeMode: "magic" };
    expect(validate(SCHEMA_IDS.runRequest, bad).ok).toBe(false);
  });

  it("covers all three compute modes with a valid example each", () => {
    for (const mode of ["free", "paid", "local"]) {
      const req = example(`run-request.${mode}`) as { computeMode: string };
      expect(req.computeMode).toBe(mode);
      expect(validate(SCHEMA_IDS.runRequest, req).ok).toBe(true);
    }
  });

  it("rejects a plan whose milestone has no exit criteria", () => {
    const base = example("plan") as { milestones: Array<Record<string, unknown>> };
    const bad = { ...base, milestones: [{ ...base.milestones[0]!, exitCriteria: [] }] };
    expect(validate(SCHEMA_IDS.plan, bad).ok).toBe(false);
  });
});

describe("guard() typing helper", () => {
  it("returns typed data on success and errors on failure", () => {
    const ok = guard<{ taskId: string }>(SCHEMA_IDS.task, example("task.backend-auth"));
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.data.taskId).toBe("task_backend_auth");

    const bad = guard(SCHEMA_IDS.task, { taskId: "nope" });
    expect(bad.ok).toBe(false);
  });
});

describe("the examples directory has no orphan fixture", () => {
  it("every example file is covered by a contract pair", () => {
    const files = readdirSync(exampleDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
    const covered = PAIRS.map(([f]) => f).sort();
    expect(files).toEqual(covered);
  });
});
