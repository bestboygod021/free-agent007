import { describe, expect, it } from "vitest";
import {
  HAPPY_PATH,
  TERMINAL_STATES,
  initialContext,
  transition,
  type RunContext,
} from "../src/core/state-machine.js";
import type { RunState } from "../src/core/types.js";

function play(events: Parameters<typeof transition>[1][], ctx: RunContext) {
  let state: RunState = "INTAKE";
  const trail: string[] = [];
  for (const e of events) {
    const r = transition(state, e, ctx);
    trail.push(`${state} --${e}--> ${r.ok ? r.to : `REFUSED(${r.reason})`}`);
    if (r.ok) state = r.to;
  }
  return { state, trail };
}

describe("run state machine", () => {
  it("walks the documented happy path to DONE", () => {
    const ctx = initialContext(3);
    let state: RunState = "INTAKE";
    for (const [event, expected] of HAPPY_PATH) {
      const r = transition(state, event, ctx);
      expect(r.ok, `${event} refused: ${r.reason}`).toBe(true);
      expect(r.to).toBe(expected);
      state = r.to;
    }
    expect(state).toBe("DONE");
  });

  it("I1: refuses to implement before the plan is approved", () => {
    const ctx = initialContext();
    const r = transition("RECON", "implementation_batch_done", ctx);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/plan has not been approved/);
  });

  it("I1: refuses plan approval outside AWAITING_PLAN_APPROVAL", () => {
    const ctx = initialContext();
    const r = transition("INTAKE", "plan_approved", ctx);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/invariant I1/);
  });

  it("I2: refuses deploy without an explicit deploy approval", () => {
    const ctx = initialContext();
    ctx.securityGatePassed = true;
    const r = transition("PREVIEW", "deploy_approved", ctx);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/invariant I2/);
    expect(ctx.deployApproved).toBe(false);
  });

  it("I2: deploy_rejected goes to FINALIZE, never to DEPLOY", () => {
    const ctx = initialContext();
    ctx.securityGatePassed = true;
    const r = transition("AWAITING_DEPLOY_APPROVAL", "deploy_rejected", ctx);
    expect(r.ok).toBe(true);
    expect(r.to).toBe("FINALIZE");
  });

  it("I3: cannot finalize from VERIFY unless verification passed", () => {
    const ctx = initialContext();
    const r = transition("VERIFY", "finalized", ctx);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/invariant I3/);
  });

  it("I3: cannot jump to DONE from IMPLEMENT", () => {
    const ctx = initialContext();
    ctx.planApproved = true;
    const r = transition("IMPLEMENT", "finalized", ctx);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/invariant I3/);
  });

  it("I4: bounds repair attempts and then refuses further retries", () => {
    const ctx = initialContext(3);
    let state: RunState = "TEST";
    let acceptedFailures = 0;
    for (let i = 0; i < 6; i++) {
      const r = transition(state, "tests_failed", ctx);
      if (!r.ok) break;
      acceptedFailures += 1;
      state = r.to;
      // simulate a repair cycle that did not actually fix anything
      const back = transition("REPAIR", "repair_succeeded", ctx);
      expect(back.ok).toBe(true);
      state = back.to;
    }
    expect(acceptedFailures).toBe(3);
    expect(ctx.repairAttempts).toBe(3);
    const refused = transition("TEST", "tests_failed", ctx);
    expect(refused.ok).toBe(false);
    expect(refused.reason).toMatch(/repair budget exhausted/);
    // the documented escape hatch
    const exhausted = transition("TEST", "repair_exhausted", ctx);
    expect(exhausted.ok).toBe(true);
    expect(exhausted.to).toBe("BLOCKED");
  });

  it("I5: cannot reach PREVIEW before the security gate passes", () => {
    const ctx = initialContext();
    const r = transition("TEST", "tests_passed", ctx);
    expect(r.ok).toBe(true);
    expect(r.to).toBe("SECURITY_REVIEW");
    // from SECURITY_REVIEW you cannot skip to PREVIEW without a gate event
    const skip = transition("SECURITY_REVIEW", "preview_ready", ctx);
    expect(skip.ok).toBe(false);
  });

  it("I5: preview_ready is refused while the security gate is unmet", () => {
    const ctx = initialContext();
    const r = transition("PREVIEW", "preview_ready", ctx);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/security review gate/);
  });

  it("I6: terminal states accept nothing", () => {
    for (const terminal of TERMINAL_STATES) {
      const ctx = initialContext();
      const r = transition(terminal, "fail", ctx);
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/terminal state/);
    }
  });

  it("records a reason for every illegal event instead of silently ignoring it", () => {
    const ctx = initialContext();
    const r = transition("INTAKE", "deploy_verified", ctx);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("not legal in state INTAKE");
  });

  it("a refused transition leaves the context untouched", () => {
    const ctx = initialContext();
    const before = JSON.stringify(ctx);
    play(["plan_approved", "deploy_approved"], ctx);
    expect(JSON.stringify(ctx)).toBe(before);
  });
});
