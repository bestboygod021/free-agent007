import { describe, expect, it } from "vitest";

import {
  InMemoryUsageLedger,
  assertBudget,
  checkBudget,
  emptyUsageTotals,
  sumUsage,
  type UsageEntry,
} from "../src/core/usage-ledger.js";

const base: UsageEntry = {
  entryId: "u-1",
  organizationId: "org-1",
  projectId: "project-1",
  runId: "run-1",
  provider: "local",
  model: "model-a",
  locality: "local",
  inputTokens: 100,
  outputTokens: 20,
  cachedInputTokens: 10,
  durationMs: 50,
  cost: 0.2,
  currency: "USD",
  measuredAt: 1_700_000_000_000,
};

describe("usage ledger and budget gate", () => {
  it("sums measured usage and keeps entries immutable to callers", () => {
    const ledger = new InMemoryUsageLedger();
    ledger.append(base);
    const copy = ledger.list()[0];
    if (!copy) throw new Error("missing entry");
    copy.inputTokens = 999;
    expect(ledger.totals()).toMatchObject({ entries: 1, inputTokens: 100, outputTokens: 20, cost: 0.2 });
    expect(sumUsage([base])).toMatchObject({ entries: 1, durationMs: 50 });
  });

  it("filters by tenant, project, run and time", () => {
    const ledger = new InMemoryUsageLedger();
    ledger.append(base);
    ledger.append({ ...base, entryId: "u-2", runId: "run-2", measuredAt: base.measuredAt + 10 });
    expect(ledger.list({ runId: "run-2" })).toHaveLength(1);
    expect(ledger.list({ since: base.measuredAt + 1 })).toHaveLength(1);
    expect(ledger.list({ organizationId: "other" })).toHaveLength(0);
  });

  it("prevents duplicate entries and mixed currencies", () => {
    const ledger = new InMemoryUsageLedger();
    ledger.append(base);
    expect(() => ledger.append(base)).toThrow("duplicate usage entry");
    expect(() => sumUsage([{ ...base, currency: "EUR" }], "USD")).toThrow("mixed currencies");
  });

  it("allows a projection only when every hard ceiling holds", () => {
    const current = emptyUsageTotals("USD");
    const projection = { inputTokens: 100, outputTokens: 20, durationMs: 50, cost: 0.2, currency: "USD" };
    const allowed = checkBudget(current, projection, { maxCost: 0.3, currency: "USD", maxInputTokens: 200 });
    expect(allowed.allowed).toBe(true);
    const denied = checkBudget(current, { ...projection, cost: 0.4 }, { maxCost: 0.3, currency: "USD" });
    expect(denied.allowed).toBe(false);
    expect(denied.reasons[0]).toContain("cost");
    expect(() => assertBudget(current, { ...projection, outputTokens: 99 }, {
      maxCost: 0.3, currency: "USD", maxOutputTokens: 20,
    })).toThrow("budget denied");
  });
});
