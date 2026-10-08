/**
 * Immutable Run checkpoints for crash recovery and replay.
 *
 * This is the deterministic domain contract and an in-memory reference
 * adapter. A production adapter must persist the same records transactionally
 * and must not allow update/delete of an existing sequence number.
 */

import { createHash } from "node:crypto";

export interface RunCheckpoint<T = unknown> {
  checkpointId: string;
  runId: string;
  sequence: number;
  state: string;
  payload: T;
  createdAt: number;
  previousHash: string;
  hash: string;
}

export interface CheckpointInput<T = unknown> {
  checkpointId: string;
  runId: string;
  sequence: number;
  state: string;
  payload: T;
  createdAt: number;
}

export const CHECKPOINT_GENESIS = "0".repeat(64);

export class CheckpointContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckpointContractError";
  }
}

function canonical<T>(input: CheckpointInput<T>, previousHash: string): string {
  return JSON.stringify({
    checkpointId: input.checkpointId,
    runId: input.runId,
    sequence: input.sequence,
    state: input.state,
    payload: input.payload,
    createdAt: input.createdAt,
    previousHash,
  });
}

function hash(input: CheckpointInput, previousHash: string): string {
  return createHash("sha256").update(canonical(input, previousHash)).digest("hex");
}

function validateInput(input: CheckpointInput): void {
  for (const [value, label] of [
    [input.checkpointId, "checkpointId"],
    [input.runId, "runId"],
    [input.state, "state"],
  ] as const) {
    if (!value.trim()) throw new CheckpointContractError(`${label} must not be empty`);
  }
  if (!Number.isInteger(input.sequence) || input.sequence < 0) {
    throw new CheckpointContractError("sequence must be a non-negative integer");
  }
  if (!Number.isFinite(input.createdAt) || input.createdAt <= 0) {
    throw new CheckpointContractError("createdAt must be a positive timestamp");
  }
}

export class InMemoryCheckpointStore<T = unknown> {
  private readonly rows: RunCheckpoint<T>[] = [];

  append(input: CheckpointInput<T>): RunCheckpoint<T> {
    validateInput(input);
    const last = [...this.rows].reverse().find((row) => row.runId === input.runId);
    if (!last && input.sequence !== 0) {
      throw new CheckpointContractError("first checkpoint sequence must be zero");
    }
    if (last && input.sequence !== last.sequence + 1) {
      throw new CheckpointContractError("checkpoint sequence must be contiguous");
    }
    if (this.rows.some((row) => row.checkpointId === input.checkpointId)) {
      throw new CheckpointContractError(`duplicate checkpointId: ${input.checkpointId}`);
    }
    const previousHash = last?.hash ?? CHECKPOINT_GENESIS;
    const record: RunCheckpoint<T> = {
      ...structuredClone(input),
      previousHash,
      hash: hash(input, previousHash),
    };
    this.rows.push(record);
    return structuredClone(record);
  }

  list(runId?: string): RunCheckpoint<T>[] {
    return this.rows
      .filter((row) => runId === undefined || row.runId === runId)
      .map((row) => structuredClone(row));
  }

  latest(runId: string): RunCheckpoint<T> | undefined {
    const row = [...this.rows].reverse().find((candidate) => candidate.runId === runId);
    return row ? structuredClone(row) : undefined;
  }

  verify(runId?: string): { valid: boolean; brokenAt?: number } {
    const runIds = runId ? [runId] : [...new Set(this.rows.map((row) => row.runId))];
    for (const selectedRunId of runIds) {
      const rows = this.rows.filter((row) => row.runId === selectedRunId);
      let previousHash = CHECKPOINT_GENESIS;
      let previousSequence = -1;
      for (const row of rows) {
        const input: CheckpointInput<T> = {
          checkpointId: row.checkpointId,
          runId: row.runId,
          sequence: row.sequence,
          state: row.state,
          payload: row.payload,
          createdAt: row.createdAt,
        };
        if (row.previousHash !== previousHash || row.sequence !== previousSequence + 1 || hash(input, previousHash) !== row.hash) {
          return { valid: false, brokenAt: row.sequence };
        }
        previousHash = row.hash;
        previousSequence = row.sequence;
      }
    }
    return { valid: true };
  }

  get size(): number {
    return this.rows.length;
  }
}
