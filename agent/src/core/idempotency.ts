/**
 * Tenant-scoped, TTL-bound idempotency storage.
 *
 * `security-baseline.ts` contains the pure decision function. This module adds
 * the stateful boundary needed by an API: it remembers the request hash and
 * the completed response, rejects cross-tenant reuse, and lets expired keys be
 * removed. The in-memory class is a reference adapter; a database adapter must
 * preserve the same compare-and-set semantics.
 */

import { hashRequest } from "./security-baseline.js";

export interface StoredIdempotencyResponse<T = unknown> {
  status: number;
  body: T;
  headers?: Record<string, string>;
}

export interface IdempotencyEntry<T = unknown> {
  key: string;
  organizationId: string;
  requestHash: string;
  createdAt: number;
  expiresAt: number;
  state: "in_flight" | "completed";
  response?: StoredIdempotencyResponse<T>;
}

export type BeginIdempotencyResult<T = unknown> =
  | { kind: "new"; entry: IdempotencyEntry<T> }
  | { kind: "in_flight"; entry: IdempotencyEntry<T> }
  | { kind: "replay"; entry: IdempotencyEntry<T>; response: StoredIdempotencyResponse<T> }
  | { kind: "conflict"; reason: string };

export class IdempotencyContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdempotencyContractError";
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function validateKey(key: string): void {
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) {
    throw new IdempotencyContractError("Idempotency-Key must be 8-128 safe characters");
  }
}

/**
 * In-memory reference implementation. Production persistence must make
 * `begin()` an atomic insert-or-read operation under a unique tenant/key
 * constraint; a normal read followed by insert is racy.
 */
export class InMemoryIdempotencyStore<T = unknown> {
  private readonly entries = new Map<string, IdempotencyEntry<T>>();

  begin(params: {
    key: string;
    organizationId: string;
    request: unknown;
    now?: number;
    ttlMs?: number;
  }): BeginIdempotencyResult<T> {
    validateKey(params.key);
    if (!params.organizationId.trim()) {
      throw new IdempotencyContractError("organizationId must not be empty");
    }
    const now = params.now ?? Date.now();
    const ttlMs = params.ttlMs ?? 24 * 60 * 60 * 1_000;
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new IdempotencyContractError("ttlMs must be positive");
    }
    const requestHash = hashRequest(params.request);
    const existing = this.entries.get(params.key);
    if (existing && existing.expiresAt <= now) this.entries.delete(params.key);
    const current = this.entries.get(params.key);
    if (!current) {
      const entry: IdempotencyEntry<T> = {
        key: params.key,
        organizationId: params.organizationId,
        requestHash,
        createdAt: now,
        expiresAt: now + ttlMs,
        state: "in_flight",
      };
      this.entries.set(params.key, entry);
      return { kind: "new", entry: clone(entry) };
    }

    if (current.organizationId !== params.organizationId) {
      return { kind: "conflict", reason: "idempotency key belongs to another organization" };
    }
    if (current.requestHash !== requestHash) {
      return { kind: "conflict", reason: "idempotency key was reused with a different request body" };
    }
    if (current.state === "in_flight") return { kind: "in_flight", entry: clone(current) };
    if (!current.response) {
      throw new IdempotencyContractError("completed idempotency entry has no response");
    }
    return { kind: "replay", entry: clone(current), response: clone(current.response) };
  }

  complete(
    key: string,
    response: StoredIdempotencyResponse<T>,
    now = Date.now(),
  ): IdempotencyEntry<T> {
    const current = this.entries.get(key);
    if (!current) throw new IdempotencyContractError("cannot complete an unknown idempotency key");
    if (current.expiresAt <= now) throw new IdempotencyContractError("cannot complete an expired idempotency key");
    if (current.state !== "in_flight") throw new IdempotencyContractError("idempotency key is already completed");
    if (!Number.isInteger(response.status) || response.status < 100 || response.status > 599) {
      throw new IdempotencyContractError("response status must be a valid HTTP status");
    }
    current.state = "completed";
    current.response = clone(response);
    const result = clone(current);
    this.entries.set(key, current);
    return result;
  }

  purge(now = Date.now()): number {
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  get size(): number {
    return this.entries.size;
  }
}
