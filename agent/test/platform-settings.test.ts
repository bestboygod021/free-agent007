import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  resolveSettings,
  validatePatch,
  checkRunAgainstSettings,
  hashSettings,
  describeSettingsFa,
  AUTONOMY_ORDER,
  IMMUTABLE_SETTINGS,
  SETTING_SCOPES,
} from "../src/core/platform-settings.js";
import type { SettingsInput, SettingsPatch } from "../src/core/platform-settings.js";

const scope = (input: SettingsInput) => resolveSettings(input);
const path = (input: SettingsInput, p: string) =>
  scope(input).resolutions.find((r) => r.path === p);

describe("scope resolution", () => {
  it("resolves all three scopes in order", () => {
    expect(SETTING_SCOPES).toEqual(["platform", "organization", "project"]);
  });

  it("lets each narrower scope win over the one above it", () => {
    const r = scope({
      platform: { execution: { maxParallelTasks: 8 } },
      organization: { execution: { maxParallelTasks: 4 } },
      project: { execution: { maxParallelTasks: 2 } },
    });
    expect(r.settings.execution.maxParallelTasks).toBe(2);
    expect(path({ platform: { execution: { maxParallelTasks: 8 } },
      organization: { execution: { maxParallelTasks: 4 } },
      project: { execution: { maxParallelTasks: 2 } } }, "execution.maxParallelTasks")?.scope).toBe("project");
  });

  it("reports provenance for every untouched default as inherited", () => {
    const r = scope({});
    const paths = r.resolutions.map((x) => x.path);
    expect(paths).toContain("security.autonomyCeiling");
    expect(paths).toContain("retention.auditLogRetentionDays");
    expect(r.resolutions.every((x) => x.scope !== undefined)).toBe(true);
  });

  it("attributes an organization setting to the organization, not the platform", () => {
    const r = scope({ organization: { quality: { maxRepairAttempts: 1 } } });
    expect(r.settings.quality.maxRepairAttempts).toBe(1);
    expect(path({ organization: { quality: { maxRepairAttempts: 1 } } }, "quality.maxRepairAttempts")?.scope)
      .toBe("organization");
  });
});

describe("autonomy ladder", () => {
  it("is strictly ordered", () => {
    expect(AUTONOMY_ORDER).toEqual(["readonly", "supervised", "autonomous-branch", "full"]);
  });

  it("accepts any rung at or below the inherited ceiling", () => {
    const ceiling = DEFAULT_SETTINGS.security.autonomyCeiling;
    const ceilingIndex = AUTONOMY_ORDER.indexOf(ceiling);
    for (const rung of AUTONOMY_ORDER.slice(0, ceilingIndex + 1)) {
      const r = scope({ project: { security: { autonomyCeiling: rung } } });
      expect(r.settings.security.autonomyCeiling, rung).toBe(rung);
    }
  });

  it("refuses every rung above the inherited ceiling", () => {
    const ceilingIndex = AUTONOMY_ORDER.indexOf(DEFAULT_SETTINGS.security.autonomyCeiling);
    for (const rung of AUTONOMY_ORDER.slice(ceilingIndex + 1)) {
      const r = scope({ project: { security: { autonomyCeiling: rung } } });
      expect(r.settings.security.autonomyCeiling, rung).toBe(DEFAULT_SETTINGS.security.autonomyCeiling);
    }
  });
});

describe("patch validation", () => {
  it("accepts the shipped defaults", () => {
    expect(validatePatch(DEFAULT_SETTINGS as unknown as SettingsPatch)).toEqual([]);
  });

  it("rejects negative and absurd numbers", () => {
    const issues = validatePatch({
      security: { sessionTtlMinutes: -5, maxFailedLogins: 0 },
      execution: { maxParallelTasks: 9999, perRunTokenBudget: -1 },
      retention: { auditLogRetentionDays: 7 },
    } as unknown as SettingsPatch);
    const paths = issues.map((i) => i.path);
    expect(paths).toContain("security.sessionTtlMinutes");
    expect(paths).toContain("execution.maxParallelTasks");
    expect(paths).toContain("retention.auditLogRetentionDays");
  });

  it("rejects a non-array connector tier list", () => {
    const issues = validatePatch({ connectors: { allowedConnectorTiers: "A" } } as unknown as SettingsPatch);
    expect(issues.some((i) => i.path === "connectors.allowedConnectorTiers")).toBe(true);
  });

  it("ignores unknown keys rather than inventing them", () => {
    expect(validatePatch({ security: { nope: 1 } } as unknown as SettingsPatch)).toEqual([]);
    expect(JSON.stringify(scope({ project: { security: { nope: 1 } } as unknown as SettingsPatch }).settings))
      .not.toContain("nope");
  });
});

describe("hashing", () => {
  it("is stable across identical resolutions", () => {
    expect(hashSettings(scope({}).settings)).toBe(hashSettings(scope({ platform: {} }).settings));
  });

  it("changes when any nested setting changes", () => {
    const a = hashSettings(scope({}).settings);
    const b = hashSettings(scope({ project: { quality: { maxRepairAttempts: 1 } } }).settings);
    expect(a).not.toBe(b);
  });

  it("depends on every group, not just the top-level key names", () => {
    const base = scope({}).settings;
    const groups = Object.keys(base) as Array<keyof typeof base>;
    expect(groups.length).toBe(5);
    for (const group of groups) {
      const changed = JSON.parse(JSON.stringify(base)) as typeof base;
      const bag = changed[group] as unknown as Record<string, unknown>;
      const first = Object.keys(bag)[0]!;
      bag[first] = "probe-value";
      expect(hashSettings(changed), `${group}.${first}`).not.toBe(hashSettings(base));
    }
  });

  it("is short enough to store on every audit entry", () => {
    expect(hashSettings(scope({}).settings)).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("run gate", () => {
  it("lists every protected ref that was written directly", () => {
    const v = checkRunAgainstSettings({
      settings: scope({}).settings,
      protectedBranchWrites: ["main", "release/1.0"],
    });
    expect(v).toHaveLength(2);
  });

  it("rejects a run whose mode exceeds the configured ceiling", () => {
    const localOnly = scope({ project: { execution: { computeMode: "local" } } }).settings;
    const v = checkRunAgainstSettings({ settings: localOnly, requestedMode: "paid" });
    expect(v.some((x) => x.path === "execution.computeMode")).toBe(true);
  });

  it("rejects autonomy above the ceiling", () => {
    const supervised = scope({}).settings;
    const v = checkRunAgainstSettings({ settings: supervised, requestedAutonomy: "full" });
    expect(v.some((x) => x.path === "security.autonomyCeiling")).toBe(true);
  });
});

describe("immutable settings", () => {
  it("covers every dangerous toggle", () => {
    for (const p of [
      "connectors.allowRawPasswordAuth",
      "connectors.oauthPkceRequired",
      "retention.allowAuditLogDeletion",
      "quality.requireEvidenceForCompletion",
    ]) {
      expect(IMMUTABLE_SETTINGS, p).toContain(p);
    }
  });

  it("clamps an unsafe platform-level value and records the refusal", () => {
    const r = scope({ platform: { retention: { allowAuditLogDeletion: true } } });
    expect(r.settings.retention.allowAuditLogDeletion).toBe(false);
    const res = path({ platform: { retention: { allowAuditLogDeletion: true } } }, "retention.allowAuditLogDeletion");
    expect(res?.refused?.requested).toBe(true);
    expect(res?.refused?.reason).toMatch(/append-only/);
  });
});

describe("Persian summary", () => {
  it("mentions the compute mode, gates and retention", () => {
    const text = describeSettingsFa(scope({}).settings);
    expect(text).toContain("حالت محاسباتی: free");
    expect(text).toContain("دروازه‌های کیفیت");
    expect(text).toContain("MFA برای تصویب");
  });

  it("changes when the settings change", () => {
    expect(describeSettingsFa(scope({}).settings)).not.toBe(
      describeSettingsFa(scope({ project: { execution: { computeMode: "paid" } } }).settings),
    );
  });
});
