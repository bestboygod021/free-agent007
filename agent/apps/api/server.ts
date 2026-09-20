/**
 * Dependency-free reference API for the first control-plane slice.
 *
 * This server is deliberately small and honest: it exposes health, create Run,
 * read Run, replay Run events over SSE, and cancel Run. It uses an in-memory
 * store so the contract can be tested without PostgreSQL. The authenticator is
 * mandatory and injected; the API never treats a user-supplied header as proof
 * of identity. A production adapter must provide session/OAuth verification
 * and persistence before this is exposed publicly.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";

import {
  InMemoryIdempotencyStore,
  type StoredIdempotencyResponse,
} from "../../src/core/idempotency.js";
import {
  DEFAULT_SETTINGS,
  type PlatformSettings,
} from "../../src/core/platform-settings.js";
import {
  assertSameOrganization,
  authorize,
  consumeRate,
  SECURITY_HEADERS,
  type Principal,
  type RateBucket,
} from "../../src/core/security-baseline.js";
import type { AutonomyLevel, PrivacyLevel, RunState } from "../../src/core/types.js";
import type { ComputeMode } from "../../src/core/compute-mode.js";

const MAX_BODY_BYTES = 256 * 1024;
const RUN_PATH = /^\/v1\/projects\/([^/]+)\/runs$/;
const RUN_DETAIL_PATH = /^\/v1\/runs\/([^/]+)$/;
const RUN_EVENTS_PATH = /^\/v1\/runs\/([^/]+)\/events$/;
const RUN_CANCEL_PATH = /^\/v1\/runs\/([^/]+)\/cancel$/;

export interface ApiRunRequest {
  request: string;
  computeMode: ComputeMode;
  privacyLevel?: PrivacyLevel;
  autonomyLevel?: AutonomyLevel;
  budget?: { maxCostPerRun?: number };
}

export interface ApiRun {
  runId: string;
  organizationId: string;
  projectId: string;
  createdBy: string;
  request: string;
  computeMode: ComputeMode;
  privacyLevel: PrivacyLevel;
  autonomyLevel: AutonomyLevel;
  state: RunState;
  createdAt: string;
  updatedAt: string;
}

export interface ApiRunEvent {
  id: string;
  sequence: number;
  type: string;
  runId: string;
  organizationId: string;
  actorType: "user" | "system";
  actorId: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface ApiStore {
  readonly idempotency: InMemoryIdempotencyStore<ApiResponseBody>;
  readonly rateBuckets: Map<string, RateBucket>;
  createRun(principal: Principal, projectId: string, input: ApiRunRequest, now: number): ApiRun;
  getRun(runId: string): ApiRun | undefined;
  updateRun(runId: string, updater: (run: ApiRun) => ApiRun): ApiRun;
  eventsFor(runId: string, afterSequence?: number): ApiRunEvent[];
  appendEvent(run: ApiRun, type: string, actor: Principal | undefined, payload: Record<string, unknown>, now: number): ApiRunEvent;
}

export interface ApiResponseBody {
  run?: ApiRun;
  event?: ApiRunEvent;
  message?: string;
  status?: string;
  requestId?: string;
}

export class InMemoryApiStore implements ApiStore {
  readonly idempotency = new InMemoryIdempotencyStore<ApiResponseBody>();
  readonly rateBuckets = new Map<string, RateBucket>();
  private readonly runs = new Map<string, ApiRun>();
  private readonly events = new Map<string, ApiRunEvent[]>();
  private runCounter = 0;

  createRun(principal: Principal, projectId: string, input: ApiRunRequest, now: number): ApiRun {
    const run: ApiRun = {
      runId: `run_${++this.runCounter}_${randomUUID().slice(0, 8)}`,
      organizationId: principal.organizationId,
      projectId,
      createdBy: principal.userId,
      request: input.request,
      computeMode: input.computeMode,
      privacyLevel: input.privacyLevel ?? "private",
      autonomyLevel: input.autonomyLevel ?? "supervised",
      state: "INTAKE",
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };
    this.runs.set(run.runId, run);
    this.events.set(run.runId, []);
    return structuredClone(run);
  }

  getRun(runId: string): ApiRun | undefined {
    const run = this.runs.get(runId);
    return run ? structuredClone(run) : undefined;
  }

  updateRun(runId: string, updater: (run: ApiRun) => ApiRun): ApiRun {
    const current = this.runs.get(runId);
    if (!current) throw new Error("run not found");
    const next = updater(structuredClone(current));
    this.runs.set(runId, structuredClone(next));
    return structuredClone(next);
  }

  eventsFor(runId: string, afterSequence = -1): ApiRunEvent[] {
    return (this.events.get(runId) ?? [])
      .filter((event) => event.sequence > afterSequence)
      .map((event) => structuredClone(event));
  }

  appendEvent(
    run: ApiRun,
    type: string,
    actor: Principal | undefined,
    payload: Record<string, unknown>,
    now: number,
  ): ApiRunEvent {
    const list = this.events.get(run.runId);
    if (!list) throw new Error("run event stream not found");
    const sequence = list.length;
    const event: ApiRunEvent = {
      id: `${run.runId}:${sequence}`,
      sequence,
      type,
      runId: run.runId,
      organizationId: run.organizationId,
      actorType: actor ? "user" : "system",
      actorId: actor?.userId ?? "system",
      timestamp: new Date(now).toISOString(),
      payload: structuredClone(payload),
    };
    list.push(event);
    return structuredClone(event);
  }
}

export interface ApiServerOptions {
  /** Identity must come from a trusted session/OAuth adapter, never raw headers. */
  authenticate(request: IncomingMessage): Promise<Principal | undefined> | Principal | undefined;
  settings?: PlatformSettings;
  store?: ApiStore;
  now?: () => number;
  rateLimit?: { capacity: number; refillPerSecond: number };
  maxBodyBytes?: number;
}

export function createApiServer(options: ApiServerOptions): Server {
  const settings = options.settings ?? DEFAULT_SETTINGS;
  const store = options.store ?? new InMemoryApiStore();
  const now = options.now ?? (() => Date.now());
  const rateLimit = options.rateLimit ?? { capacity: 60, refillPerSecond: 1 };
  const maxBodyBytes = options.maxBodyBytes ?? MAX_BODY_BYTES;

  return createServer((request, response) => {
    void handleRequest(request, response, {
      settings,
      store,
      now,
      authenticate: options.authenticate,
      rateLimit,
      maxBodyBytes,
    }).catch((error: unknown) => {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined);
        return;
      }
      sendProblem(response, 500, "internal_error", "خطای داخلی", "درخواست قابل پردازش نیست");
    });
  });
}

interface HandlerContext {
  settings: PlatformSettings;
  store: ApiStore;
  now: () => number;
  authenticate: ApiServerOptions["authenticate"];
  rateLimit: { capacity: number; refillPerSecond: number };
  maxBodyBytes: number;
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  context: HandlerContext,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://forgepilot.local");
  const method = request.method?.toUpperCase() ?? "GET";
  const requestId = request.headers["x-request-id"]?.toString() || randomUUID();

  if (method === "GET" && url.pathname === "/healthz") {
    sendJson(response, 200, { status: "ok", requestId });
    return;
  }
  if (!url.pathname.startsWith("/v1/")) {
    sendProblem(response, 404, "not_found", "یافت نشد", "مسیر درخواست وجود ندارد", requestId);
    return;
  }

  const principal = await context.authenticate(request);
  if (!principal) {
    sendProblem(response, 401, "authentication_required", "احراز هویت لازم است", "این API به یک session معتبر نیاز دارد", requestId);
    return;
  }
  const rate = consumeRate(
    context.store.rateBuckets.get(principal.organizationId),
    { key: principal.organizationId, ...context.rateLimit, now: context.now() },
  );
  context.store.rateBuckets.set(principal.organizationId, rate.bucket);
  for (const [header, value] of Object.entries(rate.decision.headers)) {
    response.setHeader(header, value);
  }
  if (!rate.decision.allowed) {
    sendProblem(
      response,
      429,
      "rate_limited",
      "تعداد درخواست بیش از حد مجاز است",
      `حدود ${rate.decision.retryAfterSeconds} ثانیه بعد دوباره تلاش کنید`,
      requestId,
      rate.decision.headers,
    );
    return;
  }

  try {
    const route = await routeRequest(request, response, url.pathname, method, principal, context, requestId);
    if (!route) {
      sendProblem(response, 404, "not_found", "یافت نشد", "Endpoint وجود ندارد", requestId);
    }
  } catch (error: unknown) {
    if (error instanceof HttpProblem) {
      sendProblem(response, error.status, error.code, "درخواست نامعتبر", error.detail, requestId);
      return;
    }
    throw error;
  }
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  method: string,
  principal: Principal,
  context: HandlerContext,
  requestId: string,
): Promise<boolean> {
  const runMatch = RUN_PATH.exec(pathname);
  if (method === "POST" && runMatch?.[1]) {
    const projectId = decodeURIComponent(runMatch[1]);
    const auth = authorize(principal, "run.create", context.settings, context.now());
    if (!auth.allowed) {
      sendProblem(response, 403, "forbidden", "دسترسی رد شد", auth.reason, requestId);
      return true;
    }
    if (principal.projectId && principal.projectId !== projectId) {
      sendProblem(response, 404, "not_found", "یافت نشد", "پروژه وجود ندارد", requestId);
      return true;
    }
    const body = await readJson(request, context.maxBodyBytes);
    const input = parseRunRequest(body);
    const key = request.headers["idempotency-key"]?.toString();
    if (!key) {
      sendProblem(response, 400, "idempotency_required", "کلید تکرارنشدن لازم است", "برای ایجاد Run باید Idempotency-Key ارسال شود", requestId);
      return true;
    }
    const begin = context.store.idempotency.begin({
      key,
      organizationId: principal.organizationId,
      request: { projectId, input },
      now: context.now(),
    });
    if (begin.kind === "conflict") {
      sendProblem(response, 409, "idempotency_conflict", "تعارض درخواست تکراری", begin.reason, requestId);
      return true;
    }
    if (begin.kind === "in_flight") {
      sendProblem(response, 409, "request_in_flight", "درخواست در حال اجراست", "همین Idempotency-Key هنوز تکمیل نشده است", requestId);
      return true;
    }
    if (begin.kind === "replay") {
      sendStored(response, begin.response, { "X-Idempotent-Replay": "true", "X-Request-ID": requestId });
      return true;
    }
    const run = context.store.createRun(principal, projectId, input, context.now());
    const event = context.store.appendEvent(run, "run.created", principal, {
      computeMode: run.computeMode,
      privacyLevel: run.privacyLevel,
    }, context.now());
    const bodyOut: ApiResponseBody = { run, event, requestId };
    const stored: StoredIdempotencyResponse<ApiResponseBody> = { status: 201, body: bodyOut };
    context.store.idempotency.complete(key, stored, context.now());
    sendStored(response, stored, { "X-Request-ID": requestId });
    return true;
  }

  const detailMatch = RUN_DETAIL_PATH.exec(pathname);
  if (method === "GET" && detailMatch?.[1]) {
    const run = findAuthorizedRun(context.store, detailMatch[1], principal);
    if (!run) {
      sendProblem(response, 404, "not_found", "یافت نشد", "Run وجود ندارد", requestId);
      return true;
    }
    sendJson(response, 200, { run, requestId });
    return true;
  }

  const eventsMatch = RUN_EVENTS_PATH.exec(pathname);
  if (method === "GET" && eventsMatch?.[1]) {
    const run = findAuthorizedRun(context.store, eventsMatch[1], principal);
    if (!run) {
      sendProblem(response, 404, "not_found", "یافت نشد", "Run وجود ندارد", requestId);
      return true;
    }
    const after = parseLastEventId(request.headers["last-event-id"]?.toString(), run.runId);
    const events = context.store.eventsFor(run.runId, after);
    sendSse(response, events);
    return true;
  }

  const cancelMatch = RUN_CANCEL_PATH.exec(pathname);
  if (method === "POST" && cancelMatch?.[1]) {
    const run = findAuthorizedRun(context.store, cancelMatch[1], principal);
    if (!run) {
      sendProblem(response, 404, "not_found", "یافت نشد", "Run وجود ندارد", requestId);
      return true;
    }
    const auth = authorize(principal, "run.cancel", context.settings, context.now());
    if (!auth.allowed) {
      sendProblem(response, 403, "forbidden", "دسترسی رد شد", auth.reason, requestId);
      return true;
    }
    const key = request.headers["idempotency-key"]?.toString();
    if (!key) {
      sendProblem(response, 400, "idempotency_required", "کلید تکرارنشدن لازم است", "لغو Run نیز side effect است", requestId);
      return true;
    }
    const begin = context.store.idempotency.begin({
      key,
      organizationId: principal.organizationId,
      request: { runId: run.runId, action: "cancel" },
      now: context.now(),
    });
    if (begin.kind === "conflict") {
      sendProblem(response, 409, "idempotency_conflict", "تعارض درخواست تکراری", begin.reason, requestId);
      return true;
    }
    if (begin.kind === "in_flight") {
      sendProblem(response, 409, "request_in_flight", "درخواست در حال اجراست", "عملیات قبلی هنوز تکمیل نشده است", requestId);
      return true;
    }
    if (begin.kind === "replay") {
      sendStored(response, begin.response, { "X-Idempotent-Replay": "true", "X-Request-ID": requestId });
      return true;
    }
    const updated = context.store.updateRun(run.runId, (current) => ({
      ...current,
      state: current.state === "DONE" || current.state === "FAILED" ? current.state : "CANCELLED",
      updatedAt: new Date(context.now()).toISOString(),
    }));
    const event = context.store.appendEvent(updated, "run.cancelled", principal, {}, context.now());
    const stored: StoredIdempotencyResponse<ApiResponseBody> = { status: 200, body: { run: updated, event, requestId } };
    context.store.idempotency.complete(key, stored, context.now());
    sendStored(response, stored, { "X-Request-ID": requestId });
    return true;
  }

  return false;
}

function findAuthorizedRun(store: ApiStore, runId: string, principal: Principal): ApiRun | undefined {
  const run = store.getRun(runId);
  if (!run) return undefined;
  try {
    assertSameOrganization(principal, run);
  } catch {
    return undefined;
  }
  if (principal.projectId && principal.projectId !== run.projectId) return undefined;
  return run;
}

function parseRunRequest(value: unknown): ApiRunRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpProblem(400, "invalid_json", "بدنه JSON نامعتبر است");
  const body = value as Record<string, unknown>;
  if (typeof body.request !== "string" || body.request.trim().length < 3 || body.request.length > 20_000) {
    throw new HttpProblem(422, "invalid_request", "فیلد request باید بین ۳ تا ۲۰۰۰۰ نویسه باشد");
  }
  if (body.computeMode !== "free" && body.computeMode !== "paid" && body.computeMode !== "local") {
    throw new HttpProblem(422, "invalid_compute_mode", "computeMode باید free، paid یا local باشد");
  }
  if (body.privacyLevel !== undefined && !["public", "internal", "private", "confidential"].includes(String(body.privacyLevel))) {
    throw new HttpProblem(422, "invalid_privacy_level", "privacyLevel نامعتبر است");
  }
  if (body.autonomyLevel !== undefined && !["readonly", "supervised", "autonomous-branch", "full"].includes(String(body.autonomyLevel))) {
    throw new HttpProblem(422, "invalid_autonomy_level", "autonomyLevel نامعتبر است");
  }
  const budget = body.budget;
  if (budget !== undefined && (!budget || typeof budget !== "object" || Array.isArray(budget))) {
    throw new HttpProblem(422, "invalid_budget", "budget باید یک object باشد");
  }
  const maxCost = budget && typeof budget === "object" ? (budget as Record<string, unknown>).maxCostPerRun : undefined;
  if (maxCost !== undefined && (typeof maxCost !== "number" || !Number.isFinite(maxCost) || maxCost < 0)) {
    throw new HttpProblem(422, "invalid_budget", "maxCostPerRun باید عدد نامنفی باشد");
  }
  return {
    request: body.request,
    computeMode: body.computeMode,
    privacyLevel: body.privacyLevel as PrivacyLevel | undefined,
    autonomyLevel: body.autonomyLevel as AutonomyLevel | undefined,
    budget: maxCost === undefined ? undefined : { maxCostPerRun: maxCost },
  };
}

class HttpProblem extends Error {
  constructor(readonly status: number, readonly code: string, readonly detail: string) {
    super(detail);
    this.name = "HttpProblem";
  }
}

async function readJson(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  const declared = Number(request.headers["content-length"] ?? 0);
  if (declared > maxBytes) throw new HttpProblem(413, "body_too_large", "بدنه درخواست بیش از حد مجاز است");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new HttpProblem(413, "body_too_large", "بدنه درخواست بیش از حد مجاز است");
    chunks.push(buffer);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new HttpProblem(400, "invalid_json", "بدنه JSON قابل خواندن نیست");
  }
}

function parseLastEventId(value: string | undefined, runId: string): number {
  if (!value) return -1;
  const prefix = `${runId}:`;
  if (!value.startsWith(prefix)) return -1;
  const sequence = Number(value.slice(prefix.length));
  return Number.isInteger(sequence) && sequence >= -1 ? sequence : -1;
}

function sendSse(response: ServerResponse, events: readonly ApiRunEvent[]): void {
  const headers = { ...SECURITY_HEADERS, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" };
  response.writeHead(200, headers);
  for (const event of events) {
    response.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  }
  response.end();
}

function sendStored(response: ServerResponse, stored: StoredIdempotencyResponse<ApiResponseBody>, extra: Record<string, string>): void {
  sendJson(response, stored.status, stored.body, extra);
}

function sendJson(response: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, { ...SECURITY_HEADERS, ...extra, "Content-Type": "application/json; charset=utf-8", "Content-Length": String(Buffer.byteLength(payload)) });
  response.end(payload);
}

function sendProblem(
  response: ServerResponse,
  status: number,
  code: string,
  title: string,
  detail: string,
  requestId?: string,
  extra: Record<string, string> = {},
): void {
  const body = { type: `https://forgepilot.dev/errors/${code}`, title, status, detail, code, ...(requestId ? { requestId } : {}) };
  sendJson(response, status, body, { ...extra, "X-Content-Type-Options": "nosniff" });
}

/** The command is intentionally unauthenticated for everything except health. */
if (process.env.FORGEPILOT_API_LISTEN === "1") {
  const port = Number(process.env.PORT ?? 4311);
  const server = createApiServer({ authenticate: () => undefined });
  server.listen(port, "0.0.0.0", () => {
    console.log(`ForgePilot reference API listening on 0.0.0.0:${port}`);
  });
}
