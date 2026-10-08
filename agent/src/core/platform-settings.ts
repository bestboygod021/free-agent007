import { createHash } from "node:crypto";
import type { AutonomyLevel, PrivacyLevel, TaskType } from "./types.js";
import { COMPUTE_MODES, type ComputeMode } from "./compute-mode.js";
import { ROUTING_STRATEGIES, type RoutingStrategy } from "./free-provider-pool.js";

/**
 * Platform settings.
 *
 * One typed object controls the whole platform, resolved from three scopes:
 *
 *   platform (shipped defaults) → organization → project
 *
 * Two rules make this safe rather than merely convenient:
 *
 *   1. **Monotonic safety settings.** A lower scope may *tighten* a safety
 *      setting but never loosen it. A project cannot raise its autonomy ceiling
 *      above its organization's, cannot widen privacy, and cannot raise a token
 *      budget. Attempts are rejected with a reason, not silently clamped.
 *   2. **Every resolution is explainable.** `resolveSettings` returns, for each
 *      key, which scope won and why — so the UI can show "inherited from
 *      organization" instead of a mystery value, and an auditor can replay it.
 */

export type SettingScope = "platform" | "organization" | "project";

export const SETTING_SCOPES: readonly SettingScope[] = ["platform", "organization", "project"];

export interface SecuritySettings {
  autonomyCeiling: AutonomyLevel;
  /** protected refs may never be written directly, by anyone, in any scope */
  protectedBranches: string[];
  requireMfaForApproval: boolean;
  requireApprovalForDeploy: boolean;
  /** block a run whose payload still contains a detected secret */
  blockOnUnredactedSecrets: boolean;
  sessionTtlMinutes: number;
  sessionIdleTimeoutMinutes: number;
  maxFailedLogins: number;
  lockoutMinutes: number;
}

export interface QualitySettings {
  qualityGates: string[];
  requireEvidenceForCompletion: boolean;
  maxRepairAttempts: number;
  /** fail the run when the accessibility gate fails */
  blockOnA11yFailure: boolean;
  minTestCoveragePercent: number;
}

export interface ExecutionSettings {
  computeMode: ComputeMode;
  routingStrategy: RoutingStrategy;
  maxParallelTasks: number;
  sandboxTimeoutSeconds: number;
  perRunTokenBudget: number;
  /** hard stop: the run is killed at this number, no override */
  hardStopTokens: number;
  allowBrowserAutomation: boolean;
  allowPreview: boolean;
}

export interface ConnectorSettings {
  allowedConnectorTiers: string[];
  /** never store a raw password; OAuth or a secret reference only */
  allowRawPasswordAuth: boolean;
  oauthPkceRequired: boolean;
  webhookSignatureRequired: boolean;
  connectorRateLimitPerMinute: number;
}

export interface RetentionSettings {
  auditLogRetentionDays: number;
  runArtifactRetentionDays: number;
  /** audit logs are append-only; a scope cannot shorten this to zero */
  allowAuditLogDeletion: boolean;
}

export interface PlatformSettings {
  security: SecuritySettings;
  quality: QualitySettings;
  execution: ExecutionSettings;
  connectors: ConnectorSettings;
  retention: RetentionSettings;
}

export const AUTONOMY_ORDER: readonly AutonomyLevel[] = [
  "readonly",
  "supervised",
  "autonomous-branch",
  "full",
];

export const PRIVACY_ORDER_SETTINGS: readonly PrivacyLevel[] = [
  "public",
  "internal",
  "confidential",
  "private",
];

export const DEFAULT_SETTINGS: PlatformSettings = {
  security: {
    autonomyCeiling: "supervised",
    protectedBranches: ["main", "master", "release/*"],
    requireMfaForApproval: true,
    requireApprovalForDeploy: true,
    blockOnUnredactedSecrets: true,
    sessionTtlMinutes: 480,
    sessionIdleTimeoutMinutes: 30,
    maxFailedLogins: 5,
    lockoutMinutes: 15,
  },
  quality: {
    qualityGates: ["typecheck", "lint", "unit", "build", "security-scan", "evidence"],
    requireEvidenceForCompletion: true,
    maxRepairAttempts: 3,
    blockOnA11yFailure: false,
    minTestCoveragePercent: 0,
  },
  execution: {
    computeMode: "free",
    routingStrategy: "most-reliable",
    maxParallelTasks: 2,
    sandboxTimeoutSeconds: 600,
    perRunTokenBudget: 400_000,
    hardStopTokens: 600_000,
    allowBrowserAutomation: false,
    allowPreview: true,
  },
  connectors: {
    allowedConnectorTiers: ["A", "B"],
    allowRawPasswordAuth: false,
    oauthPkceRequired: true,
    webhookSignatureRequired: true,
    connectorRateLimitPerMinute: 60,
  },
  retention: {
    auditLogRetentionDays: 365,
    runArtifactRetentionDays: 30,
    allowAuditLogDeletion: false,
  },
};

export type SettingsPatch = {
  security?: Partial<SecuritySettings>;
  quality?: Partial<QualitySettings>;
  execution?: Partial<ExecutionSettings>;
  connectors?: Partial<ConnectorSettings>;
  retention?: Partial<RetentionSettings>;
};

export interface SettingIssue {
  path: string;
  problem: string;
  value: unknown;
}

export interface SettingResolution {
  path: string;
  value: unknown;
  scope: SettingScope;
  /** present when a lower scope asked for something unsafe and was refused */
  refused?: { requested: unknown; scope: SettingScope; reason: string };
}

export interface ResolvedSettings {
  settings: PlatformSettings;
  resolutions: SettingResolution[];
  /** stable hash of the effective settings; stored on the run for replay */
  hash: string;
  issues: SettingIssue[];
}

const AUTONOMY_RANK = new Map(AUTONOMY_ORDER.map((a, i) => [a, i]));

function autonomyRank(level: AutonomyLevel): number {
  return AUTONOMY_RANK.get(level) ?? 0;
}

/** Deep-merge that only accepts plain objects, so a patch cannot inject keys. */
function mergeGroup<T extends object>(base: T, patch: Partial<T> | undefined): T {
  if (!patch) return { ...base };
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (!(key in base)) continue; // unknown keys are dropped, never invented
    out[key] = Array.isArray(value) ? [...(value as unknown[])] : value;
  }
  return out as T;
}

export interface SettingsInput {
  platform?: SettingsPatch;
  organization?: SettingsPatch;
  project?: SettingsPatch;
}

/**
 * Validate a patch against the shipped defaults. Type errors are reported, not
 * coerced — a settings UI that silently accepts `maxFailedLogins: "five"` is a
 * security bug waiting to happen.
 */
export function validatePatch(patch: SettingsPatch): SettingIssue[] {
  const issues: SettingIssue[] = [];
  const check = (path: string, value: unknown, kind: "string" | "number" | "boolean" | "array") => {
    if (value === undefined) return;
    if (kind === "array" && !Array.isArray(value)) {
      issues.push({ path, problem: `expected array, got ${typeof value}`, value });
      return;
    }
    if (kind !== "array" && typeof value !== kind) {
      issues.push({ path, problem: `expected ${kind}, got ${typeof value}`, value });
    }
  };
  const positiveInt = (path: string, value: unknown) => {
    if (value === undefined) return;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      issues.push({ path, problem: "expected a non-negative integer", value });
    }
  };

  const s = patch.security;
  if (s) {
    if (s.autonomyCeiling !== undefined && !AUTONOMY_ORDER.includes(s.autonomyCeiling)) {
      issues.push({
        path: "security.autonomyCeiling",
        problem: `must be one of ${AUTONOMY_ORDER.join(", ")}`,
        value: s.autonomyCeiling,
      });
    }
    check("security.protectedBranches", s.protectedBranches, "array");
    check("security.requireMfaForApproval", s.requireMfaForApproval, "boolean");
    check("security.requireApprovalForDeploy", s.requireApprovalForDeploy, "boolean");
    check("security.blockOnUnredactedSecrets", s.blockOnUnredactedSecrets, "boolean");
    positiveInt("security.sessionTtlMinutes", s.sessionTtlMinutes);
    positiveInt("security.sessionIdleTimeoutMinutes", s.sessionIdleTimeoutMinutes);
    positiveInt("security.maxFailedLogins", s.maxFailedLogins);
    positiveInt("security.lockoutMinutes", s.lockoutMinutes);
    if (s.maxFailedLogins !== undefined && s.maxFailedLogins < 3) {
      issues.push({
        path: "security.maxFailedLogins",
        problem: "below 3 makes brute-force lockout a denial of service against the user",
        value: s.maxFailedLogins,
      });
    }
  }

  const q = patch.quality;
  if (q) {
    check("quality.qualityGates", q.qualityGates, "array");
    check("quality.requireEvidenceForCompletion", q.requireEvidenceForCompletion, "boolean");
    positiveInt("quality.maxRepairAttempts", q.maxRepairAttempts);
    check("quality.blockOnA11yFailure", q.blockOnA11yFailure, "boolean");
    if (q.minTestCoveragePercent !== undefined) {
      if (typeof q.minTestCoveragePercent !== "number" || q.minTestCoveragePercent < 0 || q.minTestCoveragePercent > 100) {
        issues.push({
          path: "quality.minTestCoveragePercent",
          problem: "must be a number between 0 and 100",
          value: q.minTestCoveragePercent,
        });
      }
    }
  }

  const e = patch.execution;
  if (e) {
    if (e.computeMode !== undefined && !COMPUTE_MODES.includes(e.computeMode)) {
      issues.push({
        path: "execution.computeMode",
        problem: `must be one of ${COMPUTE_MODES.join(", ")}`,
        value: e.computeMode,
      });
    }
    if (e.routingStrategy !== undefined && !ROUTING_STRATEGIES.includes(e.routingStrategy)) {
      issues.push({
        path: "execution.routingStrategy",
        problem: `must be one of ${ROUTING_STRATEGIES.join(", ")}`,
        value: e.routingStrategy,
      });
    }
    positiveInt("execution.maxParallelTasks", e.maxParallelTasks);
    positiveInt("execution.sandboxTimeoutSeconds", e.sandboxTimeoutSeconds);
    positiveInt("execution.perRunTokenBudget", e.perRunTokenBudget);
    positiveInt("execution.hardStopTokens", e.hardStopTokens);
    if (
      e.perRunTokenBudget !== undefined &&
      e.hardStopTokens !== undefined &&
      e.hardStopTokens < e.perRunTokenBudget
    ) {
      issues.push({
        path: "execution.hardStopTokens",
        problem: "hard stop must be at least the per-run budget",
        value: e.hardStopTokens,
      });
    }
    if (e.maxParallelTasks !== undefined && e.maxParallelTasks > 16) {
      issues.push({
        path: "execution.maxParallelTasks",
        problem: "above 16 the file-lock model stops being meaningful",
        value: e.maxParallelTasks,
      });
    }
  }

  const c = patch.connectors;
  if (c) {
    check("connectors.allowedConnectorTiers", c.allowedConnectorTiers, "array");
    check("connectors.allowRawPasswordAuth", c.allowRawPasswordAuth, "boolean");
    if (c.allowRawPasswordAuth === true) {
      issues.push({
        path: "connectors.allowRawPasswordAuth",
        problem: "raw password storage is forbidden by platform policy; use OAuth or a secret reference",
        value: c.allowRawPasswordAuth,
      });
    }
    check("connectors.oauthPkceRequired", c.oauthPkceRequired, "boolean");
    if (c.oauthPkceRequired === false) {
      issues.push({
        path: "connectors.oauthPkceRequired",
        problem: "PKCE is mandatory for public OAuth clients",
        value: c.oauthPkceRequired,
      });
    }
    check("connectors.webhookSignatureRequired", c.webhookSignatureRequired, "boolean");
    positiveInt("connectors.connectorRateLimitPerMinute", c.connectorRateLimitPerMinute);
  }

  const r = patch.retention;
  if (r) {
    positiveInt("retention.auditLogRetentionDays", r.auditLogRetentionDays);
    positiveInt("retention.runArtifactRetentionDays", r.runArtifactRetentionDays);
    check("retention.allowAuditLogDeletion", r.allowAuditLogDeletion, "boolean");
    if (r.allowAuditLogDeletion === true) {
      issues.push({
        path: "retention.allowAuditLogDeletion",
        problem: "audit logs are append-only; deletion would destroy the evidence trail",
        value: r.allowAuditLogDeletion,
      });
    }
    if (r.auditLogRetentionDays !== undefined && r.auditLogRetentionDays < 90) {
      issues.push({
        path: "retention.auditLogRetentionDays",
        problem: "below 90 days no security incident can be reconstructed",
        value: r.auditLogRetentionDays,
      });
    }
  }

  return issues;
}

/** Safety-critical keys: a lower scope may tighten but never loosen. */
type MonotonicRule = {
  path: string;
  /** true when the candidate is safer than the inherited value */
  isTighter: (candidate: unknown, inherited: unknown) => boolean;
  reason: string;
};

const MONOTONIC_RULES: readonly MonotonicRule[] = [
  {
    path: "security.autonomyCeiling",
    isTighter: (c, i) => autonomyRank(c as AutonomyLevel) <= autonomyRank(i as AutonomyLevel),
    reason: "a project cannot grant itself more autonomy than its organization allows",
  },
  {
    path: "security.requireMfaForApproval",
    isTighter: (c, i) => (i === false ? true : c === true),
    reason: "MFA for approvals cannot be turned off below the scope that enabled it",
  },
  {
    path: "security.requireApprovalForDeploy",
    isTighter: (c, i) => (i === false ? true : c === true),
    reason: "deploy approval cannot be turned off below the scope that enabled it",
  },
  {
    path: "security.blockOnUnredactedSecrets",
    isTighter: (c, i) => (i === false ? true : c === true),
    reason: "secret blocking cannot be disabled below the scope that enabled it",
  },
  {
    path: "security.sessionTtlMinutes",
    isTighter: (c, i) => (c as number) <= (i as number),
    reason: "session lifetime cannot be extended below the scope that set it",
  },
  {
    path: "security.sessionIdleTimeoutMinutes",
    isTighter: (c, i) => (c as number) <= (i as number),
    reason: "idle timeout cannot be extended below the scope that set it",
  },
  {
    path: "execution.hardStopTokens",
    isTighter: (c, i) => (c as number) <= (i as number),
    reason: "the hard token stop can only be lowered",
  },
  {
    path: "execution.perRunTokenBudget",
    isTighter: (c, i) => (c as number) <= (i as number),
    reason: "the per-run token budget can only be lowered",
  },
  {
    path: "execution.sandboxTimeoutSeconds",
    isTighter: (c, i) => (c as number) <= (i as number),
    reason: "sandbox timeout can only be shortened",
  },
  {
    path: "execution.maxParallelTasks",
    isTighter: (c, i) => (c as number) <= (i as number),
    reason: "parallelism can only be reduced",
  },
  {
    path: "quality.maxRepairAttempts",
    isTighter: (c, i) => (c as number) <= (i as number),
    reason: "repair attempts can only be reduced",
  },
  {
    path: "quality.requireEvidenceForCompletion",
    isTighter: (c, i) => (i === false ? true : c === true),
    reason: "the Evidence Rule cannot be switched off",
  },
  {
    path: "connectors.allowedConnectorTiers",
    isTighter: (c, i) => (c as string[]).every((t) => (i as string[]).includes(t)),
    reason: "connector tiers can only be narrowed",
  },
  {
    path: "connectors.allowRawPasswordAuth",
    isTighter: (c) => c === false,
    reason: "raw password auth can never be enabled",
  },
  {
    path: "retention.auditLogRetentionDays",
    isTighter: (c, i) => (c as number) >= (i as number),
    reason: "audit retention can only be lengthened",
  },
  {
    path: "retention.allowAuditLogDeletion",
    isTighter: (c) => c === false,
    reason: "audit log deletion can never be enabled",
  },
];

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  let cursor = obj;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i] as string;
    const next = cursor[key];
    if (typeof next !== "object" || next === null) cursor[key] = {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[keys[keys.length - 1] as string] = value;
}

/**
 * Resolve platform → organization → project, refusing any attempt to loosen a
 * safety-critical setting and recording the refusal.
 */
/**
 * Absolute floors. Unlike the monotonic rules these are not about ordering:
 * some settings must never take the unsafe value in *any* scope, including the
 * platform itself. `IMMUTABLE_SETTINGS` names them; this enforces them.
 */
const ABSOLUTE_FLOORS: Array<{
  path: string;
  read: (s: PlatformSettings) => unknown;
  safe: (v: unknown) => boolean;
  reason: string;
}> = [
  {
    path: "connectors.allowRawPasswordAuth",
    read: (s) => s.connectors.allowRawPasswordAuth,
    safe: (v) => v === false,
    reason: "raw passwords are never stored, so raw password auth is never available",
  },
  {
    path: "connectors.oauthPkceRequired",
    read: (s) => s.connectors.oauthPkceRequired,
    safe: (v) => v === true,
    reason: "PKCE is required for every authorization-code flow",
  },
  {
    path: "connectors.webhookSignatureRequired",
    read: (s) => s.connectors.webhookSignatureRequired,
    safe: (v) => v === true,
    reason: "a webhook without a verified signature cannot be trusted",
  },
  {
    path: "retention.allowAuditLogDeletion",
    read: (s) => s.retention.allowAuditLogDeletion,
    safe: (v) => v === false,
    reason: "the audit log is append-only by definition",
  },
  {
    path: "quality.requireEvidenceForCompletion",
    read: (s) => s.quality.requireEvidenceForCompletion,
    safe: (v) => v === true,
    reason: "the Evidence Rule is the platform's completion contract",
  },
];

/**
 * Clamp anything set to the unsafe value back to the default and record the
 * refusal, so an operator sees it instead of silently losing the change.
 */
function enforceFloors(settings: Record<string, unknown>, resolutions: SettingResolution[]): void {
  for (const floor of ABSOLUTE_FLOORS) {
    const typed = settings as unknown as PlatformSettings;
    const current = floor.read(typed);
    if (floor.safe(current)) continue;

    const safeValue = floor.read(DEFAULT_SETTINGS);
    setPath(settings, floor.path, safeValue);

    const existing = resolutions.find((r) => r.path === floor.path);
    const refusal = { scope: "platform" as SettingScope, requested: current, reason: floor.reason };
    if (existing) {
      existing.value = safeValue;
      existing.scope = "platform";
      existing.refused = refusal;
    } else {
      resolutions.push({ path: floor.path, value: safeValue, scope: "platform", refused: refusal });
    }
  }
}

export function resolveSettings(input: SettingsInput): ResolvedSettings {
  const issues: SettingIssue[] = [];
  for (const scope of SETTING_SCOPES) {
    const patch = input[scope];
    if (patch) issues.push(...validatePatch(patch));
  }

  const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as Record<string, unknown>;
  const resolutions: SettingResolution[] = [];

  for (const scope of SETTING_SCOPES) {
    const patch = input[scope];
    if (!patch) continue;
    for (const [group, values] of Object.entries(patch)) {
      if (!values || typeof values !== "object") continue;
      for (const [key, value] of Object.entries(values)) {
        if (value === undefined) continue;
        const path = `${group}.${key}`;
        const inherited = getPath(settings, path);
        if (inherited === undefined) continue; // unknown key: dropped by mergeGroup

        const rule = MONOTONIC_RULES.find((r) => r.path === path);
        if (rule && scope !== "platform" && !rule.isTighter(value, inherited)) {
          const existing = resolutions.find((r) => r.path === path);
          const refusal = { requested: value, scope, reason: rule.reason };
          if (existing) {
            existing.refused = refusal;
          } else {
            resolutions.push({ path, value: inherited, scope: "platform", refused: refusal });
          }
          continue;
        }

        setPath(settings, path, Array.isArray(value) ? [...value] : value);
        const prior = resolutions.find((r) => r.path === path);
        if (prior) {
          prior.value = value;
          prior.scope = scope;
          delete prior.refused;
        } else {
          resolutions.push({ path, value, scope });
        }
      }
    }
  }

  // Record the winning scope for every untouched default so the UI can say
  // "inherited" instead of showing a blank.
  for (const [group, values] of Object.entries(DEFAULT_SETTINGS)) {
    for (const key of Object.keys(values)) {
      const path = `${group}.${key}`;
      if (!resolutions.some((r) => r.path === path)) {
        resolutions.push({ path, value: getPath(settings, path), scope: "platform" });
      }
    }
  }
  enforceFloors(settings, resolutions);
  resolutions.sort((a, b) => a.path.localeCompare(b.path));

  return {
    settings: settings as unknown as PlatformSettings,
    resolutions,
    hash: hashSettings(settings as unknown as PlatformSettings),
    issues,
  };
}

/** Stable hash so a run can be replayed against the settings it actually had. */
/**
 * Stable 16-hex digest of the effective settings, stored on every audit entry
 * so an incident can be replayed against the configuration that was in force.
 *
 * Keys are sorted at *every* depth: an array replacer passed to JSON.stringify
 * filters property names at all levels, which would silently drop every nested
 * setting and make the hash constant.
 */
export function hashSettings(settings: PlatformSettings): string {
  const canonical = JSON.stringify(sortDeep(settings as unknown as Record<string, unknown>));
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) out[key] = sortDeep(source[key]);
    return out;
  }
  return value;
}

export interface SettingsViolation {
  path: string;
  problem: string;
}

/**
 * Refuse a run whose requested shape contradicts the effective settings. This
 * is the gate the API layer must call before a run is accepted.
 */
export function checkRunAgainstSettings(params: {
  settings: PlatformSettings;
  requestedMode?: ComputeMode;
  requestedParallelism?: number;
  requestedAutonomy?: AutonomyLevel;
  privacyLevel?: PrivacyLevel;
  protectedBranchWrites?: string[];
}): SettingsViolation[] {
  const violations: SettingsViolation[] = [];
  const s = params.settings;

  if (params.requestedMode && params.requestedMode !== s.execution.computeMode) {
    const rank = (m: ComputeMode) => (m === "local" ? 0 : m === "free" ? 1 : 2);
    if (rank(params.requestedMode) > rank(s.execution.computeMode)) {
      violations.push({
        path: "execution.computeMode",
        problem: `workspace is set to "${s.execution.computeMode}"; "${params.requestedMode}" needs more trust than the settings allow`,
      });
    }
  }
  if (params.requestedParallelism !== undefined && params.requestedParallelism > s.execution.maxParallelTasks) {
    violations.push({
      path: "execution.maxParallelTasks",
      problem: `requested ${params.requestedParallelism} parallel tasks, ceiling is ${s.execution.maxParallelTasks}`,
    });
  }
  if (
    params.requestedAutonomy &&
    autonomyRank(params.requestedAutonomy) > autonomyRank(s.security.autonomyCeiling)
  ) {
    violations.push({
      path: "security.autonomyCeiling",
      problem: `requested autonomy "${params.requestedAutonomy}" exceeds the ceiling "${s.security.autonomyCeiling}"`,
    });
  }
  if (params.protectedBranchWrites) {
    for (const ref of params.protectedBranchWrites) {
      if (s.security.protectedBranches.some((p) => ref === p || ref.startsWith(p.replace("/*", "/")))) {
        violations.push({
          path: "security.protectedBranches",
          problem: `direct write to protected ref "${ref}" is forbidden; open a pull request`,
        });
      }
    }
  }
  return violations;
}

/** Settings that the UI should render as read-only because no scope may change them. */
export const IMMUTABLE_SETTINGS: readonly string[] = ABSOLUTE_FLOORS.map((f) => f.path);

/** Human-readable Persian summary, for the settings page and audit entries. */
export function describeSettingsFa(settings: PlatformSettings): string {
  return [
    `حالت محاسباتی: ${settings.execution.computeMode}`,
    `سقف خودمختاری: ${settings.security.autonomyCeiling}`,
    `سقف توکن هر اجرا: ${settings.execution.perRunTokenBudget.toLocaleString("fa-IR")} (توقف سخت ${settings.execution.hardStopTokens.toLocaleString("fa-IR")})`,
    `تسک موازی: ${settings.execution.maxParallelTasks}`,
    `دروازه‌های کیفیت: ${settings.quality.qualityGates.length}`,
    `MFA برای تصویب: ${settings.security.requireMfaForApproval ? "بله" : "خیر"}`,
    `تصویب استقرار: ${settings.security.requireApprovalForDeploy ? "بله" : "خیر"}`,
  ].join(" · ");
}

export type { TaskType };
