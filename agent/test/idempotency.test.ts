import { describe, expect, it } from "vitest";

import { InMemoryIdempotencyStore } from "../src/core/idempotency.js";

describe("tenant-scoped idempotency store", () => {
  it("replays the completed response and rejects a changed body", () => {
    const store = new InMemoryIdempotencyStore<{ ok: boolean }>();
    const first = store.begin({ key: "key-1234", organizationId: "org-a", request: { value: 1 }, now: 1_000, ttlMs: 100 });
    expect(first.kind).toBe("new");
    store.complete("key-1234", { status: 201, body: { ok: true } }, 1_001);
    const replay = store.begin({ key: "key-1234", organizationId: "org-a", request: { value: 1 }, now: 1_002 });
    expect(replay.kind).toBe("replay");
    if (replay.kind === "replay") expect(replay.response.body).toEqual({ ok: true });
    const conflict = store.begin({ key: "key-1234", organizationId: "org-a", request: { value: 2 }, now: 1_003 });
    expect(conflict).toMatchObject({ kind: "conflict" });
  });

  it("does not allow cross-tenant key probing and supports in-flight detection", () => {
    const store = new InMemoryIdempotencyStore();
    expect(store.begin({ key: "tenant-key", organizationId: "org-a", request: {}, now: 1_000 }).kind).toBe("new");
    expect(store.begin({ key: "tenant-key", organizationId: "org-b", request: {}, now: 1_001 })).toMatchObject({ kind: "conflict" });
    expect(store.begin({ key: "tenant-key", organizationId: "org-a", request: {}, now: 1_001 })).toMatchObject({ kind: "in_flight" });
  });

  it("expires and purges keys", () => {
    const store = new InMemoryIdempotencyStore();
    store.begin({ key: "expire-key", organizationId: "org-a", request: {}, now: 1_000, ttlMs: 10 });
    expect(store.purge(1_009)).toBe(0);
    expect(store.purge(1_010)).toBe(1);
    expect(store.size).toBe(0);
  });
});
