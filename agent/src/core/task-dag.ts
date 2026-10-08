import type { AgentTask } from "./types.js";

/**
 * Task DAG + file locks.
 *
 * Two jobs:
 *   1. Turn the plan into an executable schedule (waves of parallel tasks that
 *      respect `dependencies`), and refuse plans that contain cycles or
 *      references to tasks that do not exist.
 *   2. Refuse to run two tasks in the same wave whose `allowedPaths` overlap —
 *      that is how two agents produce a merge conflict nobody asked for.
 *
 * Path overlap is intentionally *conservative*: it compares normalised path
 * prefixes, so `apps/web/**` and `apps/web/app/(auth)/**` conflict even though
 * a smarter analysis might prove they touch disjoint files. Over-reporting a
 * conflict costs a serial step; under-reporting costs a broken branch.
 */

export interface DagError {
  code: "unknown_dependency" | "self_dependency" | "cycle" | "duplicate_task_id";
  message: string;
  taskIds?: string[];
}

export interface DagValidation {
  ok: boolean;
  errors: DagError[];
}

export interface WaveConflict {
  wave: number;
  a: string;
  b: string;
  patternA: string;
  patternB: string;
}

export function validateDag(tasks: readonly AgentTask[]): DagValidation {
  const errors: DagError[] = [];
  const ids = new Set<string>();

  for (const t of tasks) {
    if (ids.has(t.taskId)) {
      errors.push({
        code: "duplicate_task_id",
        message: `duplicate taskId "${t.taskId}"`,
        taskIds: [t.taskId],
      });
    }
    ids.add(t.taskId);
  }

  for (const t of tasks) {
    for (const dep of t.dependencies) {
      if (dep === t.taskId) {
        errors.push({
          code: "self_dependency",
          message: `task "${t.taskId}" depends on itself`,
          taskIds: [t.taskId],
        });
      } else if (!ids.has(dep)) {
        errors.push({
          code: "unknown_dependency",
          message: `task "${t.taskId}" depends on unknown task "${dep}"`,
          taskIds: [t.taskId, dep],
        });
      }
    }
  }

  const cycle = findCycle(tasks);
  if (cycle) {
    errors.push({
      code: "cycle",
      message: `dependency cycle: ${cycle.join(" -> ")}`,
      taskIds: cycle,
    });
  }

  return { ok: errors.length === 0, errors };
}

function findCycle(tasks: readonly AgentTask[]): string[] | null {
  const byId = new Map(tasks.map((t) => [t.taskId, t]));
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];

  const visit = (id: string): string[] | null => {
    const s = state.get(id);
    if (s === "done") return null;
    if (s === "visiting") {
      const start = stack.indexOf(id);
      return [...stack.slice(start), id];
    }
    state.set(id, "visiting");
    stack.push(id);
    const t = byId.get(id);
    for (const dep of t?.dependencies ?? []) {
      if (!byId.has(dep)) continue;
      const found = visit(dep);
      if (found) return found;
    }
    stack.pop();
    state.set(id, "done");
    return null;
  };

  for (const t of tasks) {
    const found = visit(t.taskId);
    if (found) return found;
  }
  return null;
}

/**
 * Level-order waves: wave 0 has no unresolved dependencies, wave n depends only
 * on waves < n. Tasks inside one wave are safe to run in parallel *as long as*
 * their allowedPaths do not overlap (see `findWaveConflicts`).
 */
export function computeWaves(tasks: readonly AgentTask[]): string[][] {
  const remaining = new Map(tasks.map((t) => [t.taskId, t]));
  const done = new Set<string>();
  const waves: string[][] = [];

  while (remaining.size > 0) {
    const wave: string[] = [];
    for (const [id, t] of remaining) {
      if (t.dependencies.every((d) => done.has(d) || !remaining.has(d))) {
        wave.push(id);
      }
    }
    if (wave.length === 0) {
      // cycle — validateDag should have caught it; bail out deterministically
      break;
    }
    wave.sort();
    for (const id of wave) {
      remaining.delete(id);
      done.add(id);
    }
    waves.push(wave);
  }

  return waves;
}

/**
 * Normalise a glob into its significant path prefix.
 *   "apps/web/app/(auth)/**" -> ["apps","web","app","(auth)"]
 *   "packages/ui/**"         -> ["packages","ui"]
 *   "README.md"              -> ["README.md"]
 */
export function normalizePattern(pattern: string): string[] {
  return pattern
    .replace(/\\/g, "/")
    .split("/")
    .filter((seg) => seg.length > 0 && seg !== "**" && seg !== "*" && seg !== ".");
}

export function patternsOverlap(a: string, b: string): boolean {
  const sa = normalizePattern(a);
  const sb = normalizePattern(b);
  if (sa.length === 0 || sb.length === 0) return true; // bare "**" overlaps everything
  const n = Math.min(sa.length, sb.length);
  for (let i = 0; i < n; i++) {
    const x = sa[i];
    const y = sb[i];
    if (x === undefined || y === undefined) break;
    if (x === "*" || y === "*") continue;
    if (x !== y) return false;
  }
  return true;
}

export function findWaveConflicts(
  tasks: readonly AgentTask[],
  waves: readonly (readonly string[])[],
): WaveConflict[] {
  const byId = new Map(tasks.map((t) => [t.taskId, t]));
  const conflicts: WaveConflict[] = [];

  waves.forEach((wave, index) => {
    for (let i = 0; i < wave.length; i++) {
      for (let j = i + 1; j < wave.length; j++) {
        const aId = wave[i];
        const bId = wave[j];
        if (aId === undefined || bId === undefined) continue;
        const a = byId.get(aId);
        const b = byId.get(bId);
        if (!a || !b) continue;
        for (const pa of a.allowedPaths) {
          for (const pb of b.allowedPaths) {
            if (patternsOverlap(pa, pb)) {
              conflicts.push({
                wave: index,
                a: a.taskId,
                b: b.taskId,
                patternA: pa,
                patternB: pb,
              });
            }
          }
        }
      }
    }
  });

  return conflicts;
}

/**
 * Resolve conflicts by pushing the later task into its own following wave.
 * Pure and deterministic: keeps the earlier (lexicographically smaller) task in
 * place and defers the other.
 */
export function serializeConflicts(
  tasks: readonly AgentTask[],
  waves: readonly (readonly string[])[],
): string[][] {
  const byId = new Map(tasks.map((t) => [t.taskId, t]));
  const out: string[][] = waves.map((w) => [...w]);

  let changed = true;
  let guard = 0;
  while (changed && guard < 100) {
    changed = false;
    guard += 1;
    const conflicts = findWaveConflicts(tasks, out);
    for (const c of conflicts) {
      const wave = out[c.wave];
      if (!wave) continue;
      // defer the lexicographically greater task
      const victim = c.a < c.b ? c.b : c.a;
      const idx = wave.indexOf(victim);
      if (idx === -1) continue;
      wave.splice(idx, 1);
      const next = out[c.wave + 1];
      if (next) next.push(victim);
      else out.push([victim]);
      next?.sort();
      changed = true;
      break; // recompute from scratch
    }
    // drop now-empty waves
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i]?.length === 0) out.splice(i, 1);
    }
    void byId;
  }

  return out;
}
