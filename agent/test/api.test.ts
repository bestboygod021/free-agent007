import { describe, expect, it, afterEach } from "vitest";
import type { AddressInfo } from "node:net";

import { createApiServer, InMemoryApiStore } from "../apps/api/server.js";
import type { Principal } from "../src/core/security-baseline.js";

const owner: Principal = { userId: "user-1", organizationId: "org-1", role: "owner", projectId: "project-1" };
const viewer: Principal = { userId: "viewer-1", organizationId: "org-1", role: "viewer", projectId: "project-1" };

const servers: Array<ReturnType<typeof createApiServer>> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))));
});

async function start(principal: Principal | null = owner, options: { capacity?: number } = {}, store = new InMemoryApiStore()): Promise<string> {
  const server = createApiServer({
    store,
    authenticate: () => principal ?? undefined,
    rateLimit: { capacity: options.capacity ?? 20, refillPerSecond: 0.001 },
    now: () => 1_700_000_000_000,
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return { "content-type": "application/json", ...extra };
}

const createPayload = { request: "fix the parser", computeMode: "local", privacyLevel: "private" };

describe("reference control-plane API", () => {
  it("exposes health without pretending health is authentication", async () => {
    const base = await start(null);
    const health = await fetch(`${base}/healthz`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: "ok" });
    const unauthorized = await fetch(`${base}/v1/runs/run-unknown`);
    expect(unauthorized.status).toBe(401);
  });

  it("creates a Run once and replays the response for the same idempotency key", async () => {
    const base = await start();
    const first = await fetch(`${base}/v1/projects/project-1/runs`, {
      method: "POST", headers: headers({ "idempotency-key": "create-run-1" }), body: JSON.stringify(createPayload),
    });
    const firstBody = await first.json() as { run: { runId: string; state: string }; event: { type: string } };
    expect(first.status).toBe(201);
    expect(firstBody.run.state).toBe("INTAKE");
    expect(firstBody.event.type).toBe("run.created");

    const replay = await fetch(`${base}/v1/projects/project-1/runs`, {
      method: "POST", headers: headers({ "idempotency-key": "create-run-1" }), body: JSON.stringify(createPayload),
    });
    expect(replay.status).toBe(201);
    expect(replay.headers.get("x-idempotent-replay")).toBe("true");
    expect((await replay.json() as { run: { runId: string } }).run.runId).toBe(firstBody.run.runId);

    const conflict = await fetch(`${base}/v1/projects/project-1/runs`, {
      method: "POST", headers: headers({ "idempotency-key": "create-run-1" }), body: JSON.stringify({ ...createPayload, request: "different" }),
    });
    expect(conflict.status).toBe(409);
    expect((await conflict.json() as { code: string }).code).toBe("idempotency_conflict");
  });

  it("validates contracts and enforces tenant/project visibility", async () => {
    const base = await start();
    const missingKey = await fetch(`${base}/v1/projects/project-1/runs`, {
      method: "POST", headers: headers(), body: JSON.stringify(createPayload),
    });
    expect(missingKey.status).toBe(400);
    expect((await missingKey.json() as { code: string }).code).toBe("idempotency_required");

    const invalid = await fetch(`${base}/v1/projects/project-1/runs`, {
      method: "POST", headers: headers({ "idempotency-key": "invalid-run-1" }), body: JSON.stringify({ request: "x", computeMode: "cloud" }),
    });
    expect(invalid.status).toBe(422);

    const created = await fetch(`${base}/v1/projects/project-1/runs`, {
      method: "POST", headers: headers({ "idempotency-key": "visible-run-1" }), body: JSON.stringify(createPayload),
    });
    const runId = (await created.json() as { run: { runId: string } }).run.runId;
    const visible = await fetch(`${base}/v1/runs/${runId}`);
    expect(visible.status).toBe(200);

    const otherProject = await fetch(`${base}/v1/projects/project-2/runs`, {
      method: "POST", headers: headers({ "idempotency-key": "other-project-1" }), body: JSON.stringify(createPayload),
    });
    expect(otherProject.status).toBe(404);
  });

  it("requires permission for cancellation and supports replayable SSE events", async () => {
    const sharedStore = new InMemoryApiStore();
    const base = await start(owner, {}, sharedStore);
    const created = await fetch(`${base}/v1/projects/project-1/runs`, {
      method: "POST", headers: headers({ "idempotency-key": "cancel-run-1" }), body: JSON.stringify(createPayload),
    });
    const runId = (await created.json() as { run: { runId: string } }).run.runId;
    const events = await fetch(`${base}/v1/runs/${runId}/events`, { headers: { accept: "text/event-stream" } });
    const eventText = await events.text();
    expect(events.status).toBe(200);
    expect(events.headers.get("content-type")).toContain("text/event-stream");
    expect(eventText).toContain("run.created");

    const viewerBase = await start(viewer, {}, sharedStore);
    const forbidden = await fetch(`${viewerBase}/v1/runs/${runId}/cancel`, {
      method: "POST", headers: headers({ "idempotency-key": "viewer-cancel" }),
    });
    expect(forbidden.status).toBe(403);
  });

  it("returns rate-limit headers and a retryable 429", async () => {
    const base = await start(owner, { capacity: 1 });
    const first = await fetch(`${base}/v1/runs/unknown`);
    expect(first.status).toBe(404);
    expect(first.headers.get("x-ratelimit-limit")).toBe("1");
    const second = await fetch(`${base}/v1/runs/unknown`);
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBeTruthy();
  });
});
