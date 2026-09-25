import { describe, expect, it } from "vitest";

import { CHECKPOINT_GENESIS, InMemoryCheckpointStore } from "../src/core/checkpoint-store.js";

describe("immutable run checkpoints", () => {
  it("appends per-run chains and resumes from the latest record", () => {
    const store = new InMemoryCheckpointStore<{ step: number }>();
    const first = store.append({ checkpointId: "cp-1", runId: "run-1", sequence: 0, state: "PLAN", payload: { step: 1 }, createdAt: 1_700_000_000_000 });
    store.append({ checkpointId: "cp-2", runId: "run-2", sequence: 0, state: "INTAKE", payload: { step: 0 }, createdAt: 1_700_000_000_001 });
    store.append({ checkpointId: "cp-3", runId: "run-1", sequence: 1, state: "IMPLEMENT", payload: { step: 2 }, createdAt: 1_700_000_000_002 });
    expect(first.previousHash).toBe(CHECKPOINT_GENESIS);
    expect(store.latest("run-1")?.payload).toEqual({ step: 2 });
    expect(store.verify()).toEqual({ valid: true });
    expect(store.verify("run-2")).toEqual({ valid: true });
  });

  it("requires contiguous sequence and rejects duplicate IDs", () => {
    const store = new InMemoryCheckpointStore();
    expect(() => store.append({ checkpointId: "cp-0", runId: "run-0", sequence: 1, state: "INTAKE", payload: {}, createdAt: 1_700_000_000_000 })).toThrow("first checkpoint");
    store.append({ checkpointId: "cp-1", runId: "run-1", sequence: 0, state: "INTAKE", payload: {}, createdAt: 1_700_000_000_000 });
    expect(() => store.append({ checkpointId: "cp-2", runId: "run-1", sequence: 2, state: "PLAN", payload: {}, createdAt: 1_700_000_000_001 })).toThrow("contiguous");
    expect(() => store.append({ checkpointId: "cp-1", runId: "run-2", sequence: 0, state: "INTAKE", payload: {}, createdAt: 1_700_000_000_002 })).toThrow("duplicate");
  });

  it("detects tampering in the payload or chain", () => {
    const store = new InMemoryCheckpointStore<{ safe: boolean }>();
    store.append({ checkpointId: "cp-1", runId: "run-1", sequence: 0, state: "INTAKE", payload: { safe: true }, createdAt: 1_700_000_000_000 });
    const internal = store as unknown as { rows: Array<{ payload: { safe: boolean } }> };
    const firstRow = internal.rows[0];
    if (!firstRow) throw new Error("missing internal checkpoint");
    firstRow.payload.safe = false;
    expect(store.verify("run-1")).toEqual({ valid: false, brokenAt: 0 });
  });
});
