import type { RunState } from "./types.js";

/**
 * Deterministic state machine for an AgentRun.
 *
 * The LLM never chooses the next state. The orchestrator *proposes* an event;
 * this module decides whether that event is legal from the current state and,
 * if so, what the next state is. Everything else is bookkeeping.
 *
 * Hard invariants enforced here (see docs/04-agent-state-machine.md):
 *   I1  No implementation before an approved plan.
 *   I2  No deployment without explicit deploy approval.
 *   I3  No terminal DONE without passing VERIFY.
 *   I4  Repair attempts are bounded (default 3); the loop cannot spin forever.
 *   I5  SECURITY_REVIEW cannot be skipped on the way to PREVIEW/DEPLOY.
 *   I6  Terminal states are terminal.
 */

export type RunEvent =
  | "request_received"
  | "needs_clarification"
  | "clarification_answered"
  | "spec_ready"
  | "plan_ready"
  | "plan_approved"
  | "plan_rejected"
  | "recon_complete"
  | "implementation_batch_done"
  | "tests_passed"
  | "tests_failed"
  | "repair_succeeded"
  | "repair_exhausted"
  | "security_clear"
  | "security_blocked"
  | "security_findings_accepted"
  | "preview_ready"
  | "deploy_requested"
  | "deploy_approved"
  | "deploy_rejected"
  | "deploy_verified"
  | "deploy_failed"
  | "finalized"
  | "fail"
  | "cancel"
  | "block"
  | "unblock";

export interface RunContext {
  repairAttempts: number;
  maxRepairAttempts: number;
  planApproved: boolean;
  deployApproved: boolean;
  securityGatePassed: boolean;
  verifyPassed: boolean;
  /** set when `block` happens; surfaced to the UI */
  blockReason?: string;
}

export interface TransitionResult {
  ok: boolean;
  from: RunState;
  to: RunState;
  event: RunEvent;
  /** why the transition was refused — this string goes into the audit log */
  reason?: string;
}

/** Every state the machine can be in — the single source of truth for docs, DB enum and UI. */
export const RUN_STATES: readonly RunState[] = [
  "INTAKE",
  "CLARIFY",
  "SPECIFY",
  "PLAN",
  "AWAITING_PLAN_APPROVAL",
  "RECON",
  "IMPLEMENT",
  "TEST",
  "REPAIR",
  "SECURITY_REVIEW",
  "PREVIEW",
  "AWAITING_DEPLOY_APPROVAL",
  "DEPLOY",
  "VERIFY",
  "FINALIZE",
  "DONE",
  "FAILED",
  "CANCELLED",
  "BLOCKED",
];

export const TERMINAL_STATES: ReadonlySet<RunState> = new Set<RunState>([
  "DONE",
  "FAILED",
  "CANCELLED",
]);

export function initialContext(maxRepairAttempts = 3): RunContext {
  return {
    repairAttempts: 0,
    maxRepairAttempts,
    planApproved: false,
    deployApproved: false,
    securityGatePassed: false,
    verifyPassed: false,
  };
}

/**
 * Allowed events per state. Anything not listed is rejected with a reason.
 * `fail` / `cancel` / `block` are allowed from every non-terminal state and are
 * handled separately below.
 */
const TABLE: Record<RunState, readonly RunEvent[]> = {
  INTAKE: ["needs_clarification", "spec_ready", "plan_ready"],
  CLARIFY: ["clarification_answered", "spec_ready", "plan_ready"],
  SPECIFY: ["spec_ready", "plan_ready", "needs_clarification"],
  PLAN: ["plan_ready", "needs_clarification"],
  AWAITING_PLAN_APPROVAL: ["plan_approved", "plan_rejected"],
  RECON: ["recon_complete", "implementation_batch_done", "needs_clarification"],
  IMPLEMENT: ["implementation_batch_done", "tests_failed", "block"],
  TEST: ["tests_passed", "tests_failed", "repair_exhausted"],
  REPAIR: ["repair_succeeded", "repair_exhausted", "tests_failed"],
  SECURITY_REVIEW: ["security_clear", "security_blocked", "security_findings_accepted"],
  PREVIEW: ["preview_ready", "deploy_requested", "implementation_batch_done"],
  AWAITING_DEPLOY_APPROVAL: ["deploy_approved", "deploy_rejected"],
  DEPLOY: ["deploy_verified", "deploy_failed"],
  VERIFY: ["finalized", "tests_failed", "deploy_failed"],
  FINALIZE: ["finalized"],
  DONE: [],
  FAILED: [],
  CANCELLED: [],
  BLOCKED: ["unblock"],
};

const UNIVERSAL: readonly RunEvent[] = ["fail", "cancel", "block"];

/** Where each event lands, given it is legal. */
const TARGET: Partial<Record<RunEvent, RunState>> = {
  needs_clarification: "CLARIFY",
  clarification_answered: "SPECIFY",
  spec_ready: "PLAN",
  plan_ready: "AWAITING_PLAN_APPROVAL",
  plan_approved: "RECON",
  plan_rejected: "PLAN",
  recon_complete: "IMPLEMENT",
  implementation_batch_done: "TEST",
  tests_passed: "SECURITY_REVIEW",
  tests_failed: "REPAIR",
  repair_succeeded: "TEST",
  repair_exhausted: "BLOCKED",
  security_clear: "PREVIEW",
  security_blocked: "BLOCKED",
  security_findings_accepted: "PREVIEW",
  preview_ready: "AWAITING_DEPLOY_APPROVAL",
  deploy_requested: "AWAITING_DEPLOY_APPROVAL",
  deploy_approved: "DEPLOY",
  deploy_rejected: "FINALIZE",
  deploy_verified: "VERIFY",
  deploy_failed: "BLOCKED",
  finalized: "DONE",
  fail: "FAILED",
  cancel: "CANCELLED",
  block: "BLOCKED",
};

/**
 * Guard: is this event allowed right now? Returns a refusal reason or null.
 */
function guard(
  state: RunState,
  event: RunEvent,
  ctx: RunContext,
): string | null {
  if (TERMINAL_STATES.has(state)) {
    return `run is in terminal state ${state}; no further events accepted (invariant I6)`;
  }

  switch (event) {
    case "plan_approved":
      // I1: approval is a *user* action; the model cannot self-approve.
      if (state !== "AWAITING_PLAN_APPROVAL") {
        return "plan approval is only valid while AWAITING_PLAN_APPROVAL (invariant I1)";
      }
      return null;

    case "implementation_batch_done":
      if (!ctx.planApproved) {
        return "cannot implement: plan has not been approved (invariant I1)";
      }
      if (state === "RECON" || state === "IMPLEMENT" || state === "PREVIEW") return null;
      return `implementation is not allowed from ${state} (invariant I1)`;

    case "tests_failed":
      if (ctx.repairAttempts >= ctx.maxRepairAttempts) {
        return `repair budget exhausted (${ctx.repairAttempts}/${ctx.maxRepairAttempts}); stop and report instead of retrying (invariant I4)`;
      }
      return null;

    case "repair_exhausted":
      return null;

    case "deploy_requested":
    case "preview_ready":
      if (!ctx.securityGatePassed) {
        return "security review gate has not passed (invariant I5)";
      }
      return null;

    case "deploy_approved":
      if (state !== "AWAITING_DEPLOY_APPROVAL") {
        return "deploy approval is only valid while AWAITING_DEPLOY_APPROVAL (invariant I2)";
      }
      return null;

    case "finalized":
      if (state === "FINALIZE") return null;
      if (state === "VERIFY" && !ctx.verifyPassed) {
        return "cannot finalize: verification has not passed (invariant I3)";
      }
      if (state === "VERIFY") return null;
      return `cannot reach DONE from ${state} without VERIFY (invariant I3)`;

    default:
      return null;
  }
}

/**
 * Pure transition. `ctx` is mutated only when the transition succeeds, so a
 * rejected event leaves the run untouched.
 */
export function transition(
  state: RunState,
  event: RunEvent,
  ctx: RunContext,
): TransitionResult {
  if (TERMINAL_STATES.has(state)) {
    return {
      ok: false,
      from: state,
      to: state,
      event,
      reason: `run is in terminal state ${state}; no further events accepted (invariant I6)`,
    };
  }

  // Guards run first so the audit log records *which invariant* was violated
  // rather than a generic "illegal event" message.
  const refusal = guard(state, event, ctx);
  if (refusal) {
    return { ok: false, from: state, to: state, event, reason: refusal };
  }

  const legal = TABLE[state] ?? [];
  const universal = UNIVERSAL.includes(event);

  if (!legal.includes(event) && !universal) {
    return {
      ok: false,
      from: state,
      to: state,
      event,
      reason: `event "${event}" is not legal in state ${state}`,
    };
  }

  const to = TARGET[event] ?? state;

  // side effects on context
  if (event === "plan_approved") ctx.planApproved = true;
  if (event === "deploy_approved") ctx.deployApproved = true;
  if (event === "security_clear" || event === "security_findings_accepted") {
    ctx.securityGatePassed = true;
  }
  if (event === "tests_failed") ctx.repairAttempts += 1;
  if (event === "repair_succeeded") {
    // keep the attempt counter; the budget is per-run, not per-fix
  }
  if (event === "deploy_verified") ctx.verifyPassed = true;
  if (event === "block") ctx.blockReason = ctx.blockReason ?? "blocked";
  if (event === "unblock") {
    delete ctx.blockReason;
    return { ok: true, from: state, to: "IMPLEMENT", event };
  }

  return { ok: true, from: state, to, event };
}

/**
 * Convenience: assert-and-throw wrapper used by the orchestrator loop.
 */
export function mustTransition(
  state: RunState,
  event: RunEvent,
  ctx: RunContext,
): RunState {
  const r = transition(state, event, ctx);
  if (!r.ok) {
    throw new Error(`illegal transition ${state} --${event}--> : ${r.reason}`);
  }
  return r.to;
}

/** The happy path, used by docs and by the e2e smoke test. */
/**
 * The happy path. A run is *created* in INTAKE, so the first listed event is the
 * first real one. Used by docs and by the smoke test.
 */
export const HAPPY_PATH: ReadonlyArray<readonly [RunEvent, RunState]> = [
  ["needs_clarification", "CLARIFY"],
  ["clarification_answered", "SPECIFY"],
  ["spec_ready", "PLAN"],
  ["plan_ready", "AWAITING_PLAN_APPROVAL"],
  ["plan_approved", "RECON"],
  ["recon_complete", "IMPLEMENT"],
  ["implementation_batch_done", "TEST"],
  ["tests_passed", "SECURITY_REVIEW"],
  ["security_clear", "PREVIEW"],
  ["preview_ready", "AWAITING_DEPLOY_APPROVAL"],
  ["deploy_approved", "DEPLOY"],
  ["deploy_verified", "VERIFY"],
  ["finalized", "DONE"],
] as const;
