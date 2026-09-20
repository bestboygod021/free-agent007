import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  computeWaves,
  findWaveConflicts,
  normalizePattern,
  patternsOverlap,
  serializeConflicts,
  validateDag,
} from "../src/core/task-dag.js";
import type { AgentTask } from "../src/core/types.js";

function task(id: string, deps: string[], paths: string[]): AgentTask {
  return {
    taskId: id,
    title: id,
    type: "backend",
    objective: "objective for " + id,
    acceptanceCriteria: ["criterion"],
    allowedPaths: paths,
    forbiddenActions: [],
    dependencies: deps,
    riskLevel: "low",
    approvalRequired: false,
  };
}

describe("task DAG validation", () => {
  it("accepts a clean DAG", () => {
    const tasks = [task("task_a", [], ["a/**"]), task("task_b", ["task_a"], ["b/**"])];
    expect(validateDag(tasks).ok).toBe(true);
  });

  it("detects a cycle and names the tasks involved", () => {
    const tasks = [
      task("task_a", ["task_c"], ["a/**"]),
      task("task_b", ["task_a"], ["b/**"]),
      task("task_c", ["task_b"], ["c/**"]),
    ];
    const v = validateDag(tasks);
    expect(v.ok).toBe(false);
    const cycle = v.errors.find((e) => e.code === "cycle");
    expect(cycle).toBeTruthy();
    expect(cycle?.message).toMatch(/task_a/);
  });

  it("detects a self dependency", () => {
    const v = validateDag([task("task_a", ["task_a"], ["a/**"])]);
    expect(v.errors.some((e) => e.code === "self_dependency")).toBe(true);
  });

  it("detects a reference to a task that does not exist", () => {
    const v = validateDag([task("task_a", ["task_ghost"], ["a/**"])]);
    expect(v.errors.some((e) => e.code === "unknown_dependency")).toBe(true);
  });

  it("detects duplicate task ids", () => {
    const v = validateDag([task("task_a", [], ["a/**"]), task("task_a", [], ["b/**"])]);
    expect(v.errors.some((e) => e.code === "duplicate_task_id")).toBe(true);
  });
});

describe("scheduling", () => {
  it("produces dependency-ordered waves", () => {
    const tasks = [
      task("task_a", [], ["a/**"]),
      task("task_b", [], ["b/**"]),
      task("task_c", ["task_a", "task_b"], ["c/**"]),
    ];
    expect(computeWaves(tasks)).toEqual([["task_a", "task_b"], ["task_c"]]);
  });

  it("never terminates on a cyclic plan", () => {
    const tasks = [task("task_a", ["task_b"], ["a/**"]), task("task_b", ["task_a"], ["b/**"])];
    expect(computeWaves(tasks)).toEqual([]);
  });
});

describe("file locks", () => {
  it("normalises globs to their significant prefix", () => {
    expect(normalizePattern("apps/web/app/(auth)/**")).toEqual(["apps", "web", "app", "(auth)"]);
    expect(normalizePattern("packages/ui/**")).toEqual(["packages", "ui"]);
    expect(normalizePattern("README.md")).toEqual(["README.md"]);
  });

  it("detects nested-path overlap", () => {
    expect(patternsOverlap("apps/api/**", "apps/api/src/modules/payments/**")).toBe(true);
    expect(patternsOverlap("packages/ui/**", "packages/ui/button.tsx")).toBe(true);
    expect(patternsOverlap("**", "anything/at/all")).toBe(true);
  });

  it("does not report disjoint paths as conflicting", () => {
    expect(patternsOverlap("apps/web/**", "apps/api/**")).toBe(false);
    expect(patternsOverlap("packages/ui/**", "packages/database/**")).toBe(false);
    expect(patternsOverlap("tests/**", "docs/**")).toBe(false);
  });

  it("flags two parallel tasks that touch the same subtree", () => {
    const tasks = [
      task("task_auth", [], ["apps/api/**"]),
      task("task_payments", [], ["apps/api/src/modules/payments/**"]),
    ];
    const waves = computeWaves(tasks);
    const conflicts = findWaveConflicts(tasks, waves);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.a).toBe("task_auth");
    expect(conflicts[0]?.b).toBe("task_payments");
  });

  it("serialises the conflicting task into the next wave", () => {
    const tasks = [
      task("task_auth", [], ["apps/api/**"]),
      task("task_payments", [], ["apps/api/src/modules/payments/**"]),
    ];
    const fixed = serializeConflicts(tasks, computeWaves(tasks));
    expect(fixed).toEqual([["task_auth"], ["task_payments"]]);
    expect(findWaveConflicts(tasks, fixed)).toEqual([]);
  });

  it("resolves conflicts in the shipped example plan", () => {
    const plan = JSON.parse(
      readFileSync(new URL("../examples/plan.json", import.meta.url), "utf8"),
    ) as { tasks: AgentTask[] };

    expect(validateDag(plan.tasks).ok).toBe(true);

    const waves = computeWaves(plan.tasks);
    expect(waves.flat().sort()).toEqual(plan.tasks.map((t) => t.taskId).sort());

    const conflicts = findWaveConflicts(plan.tasks, waves);
    // apps/api/** vs apps/api/src/modules/payments/** land in the same wave
    expect(conflicts.length).toBeGreaterThan(0);

    const fixed = serializeConflicts(plan.tasks, waves);
    expect(findWaveConflicts(plan.tasks, fixed)).toEqual([]);
    // nothing is lost
    expect(fixed.flat().sort()).toEqual(plan.tasks.map((t) => t.taskId).sort());
  });
});
