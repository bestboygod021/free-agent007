import type {
  AutonomyLevel,
  PolicyContext,
  PolicyVerdict,
  RiskLevel,
  SideEffectClass,
  ToolPolicyRule,
} from "./types.js";

/**
 * The permission engine.
 *
 * Every tool call the agent wants to make passes through `evaluateToolCall`.
 * The model can *propose* a tool call; it can never widen its own authority.
 *
 * Three independent gates, applied in order:
 *   G1 HARD DENY   — actions the platform never performs, at any autonomy level.
 *   G2 SCOPE       — the connector must actually hold the required scopes.
 *   G3 APPROVAL    — risk x autonomy decides whether a human must approve.
 */

export const DENY_RULES: readonly ToolPolicyRule[] = [
  {
    tool: "*.captcha.solve",
    sideEffect: "none",
    riskLevel: "critical",
    reversible: false,
    deny: true,
    denyReason: "CAPTCHA must be solved by the human in the controlled browser session.",
  },
  {
    tool: "*.mfa.bypass",
    sideEffect: "none",
    riskLevel: "critical",
    reversible: false,
    deny: true,
    denyReason: "MFA and security challenges are always completed by the human.",
  },
  {
    tool: "*.credential.read_raw",
    sideEffect: "credential",
    riskLevel: "critical",
    reversible: false,
    deny: true,
    denyReason: "Raw secrets are never surfaced to a model or a log; use SecretReference.",
  },
  {
    tool: "host.exec",
    sideEffect: "destructive",
    riskLevel: "critical",
    reversible: false,
    deny: true,
    denyReason: "Arbitrary commands never run on the host; only inside the sandbox.",
  },
  {
    tool: "sandbox.docker_socket",
    sideEffect: "destructive",
    riskLevel: "critical",
    reversible: false,
    deny: true,
    denyReason: "The Docker socket is never mounted into a sandbox.",
  },
  {
    tool: "*.account.bulk_create",
    sideEffect: "external_write",
    riskLevel: "critical",
    reversible: false,
    deny: true,
    denyReason: "Bulk account creation is never automated.",
  },
  {
    tool: "*.ratelimit.bypass",
    sideEffect: "none",
    riskLevel: "critical",
    reversible: false,
    deny: true,
    denyReason: "Provider rate limits and terms of service are never bypassed.",
  },
];

/** Default classification for anything not covered by an explicit rule. */
export const DEFAULT_RULE: ToolPolicyRule = {
  tool: "*",
  sideEffect: "external_write",
  riskLevel: "high",
  reversible: false,
  requiredScopes: [],
  alwaysApprove: true,
};

/**
 * Baseline rule set. A connector package may *raise* risk (add rules) but the
 * deny list above can never be removed at runtime.
 */
export const BASELINE_RULES: readonly ToolPolicyRule[] = [
  // --- reads (risk class A) ---------------------------------------------
  { tool: "*.read", sideEffect: "none", riskLevel: "read", reversible: true },
  { tool: "*.list", sideEffect: "none", riskLevel: "read", reversible: true },
  { tool: "*.search", sideEffect: "none", riskLevel: "read", reversible: true },
  { tool: "*.read_file", sideEffect: "none", riskLevel: "read", reversible: true },
  { tool: "*.tree", sideEffect: "none", riskLevel: "read", reversible: true },
  { tool: "*.read_logs", sideEffect: "none", riskLevel: "read", reversible: true },
  { tool: "*.query", sideEffect: "none", riskLevel: "low", reversible: true },

  // --- sandbox execution (risk class B) ----------------------------------
  { tool: "sandbox.exec", sideEffect: "local_write", riskLevel: "medium", reversible: true },
  { tool: "sandbox.test", sideEffect: "local_write", riskLevel: "low", reversible: true },
  {
    tool: "*.file.write",
    sideEffect: "local_write",
    riskLevel: "medium",
    reversible: true,
    requiredScopes: ["repository:write"],
  },
  {
    tool: "*.branch.create",
    sideEffect: "local_write",
    riskLevel: "low",
    reversible: true,
    requiredScopes: ["repository:write"],
  },
  {
    tool: "*.commit.create",
    sideEffect: "local_write",
    riskLevel: "medium",
    reversible: true,
    requiredScopes: ["repository:write"],
  },
  // A rename rewrites many files at once. Without this rule the name falls to
  // the catch-all, which is nominally stricter (`high`) but carries **no
  // required scope at all** — measured against this engine before the rule was
  // added. Naming it explicitly is what makes the scope demand real.
  //
  // `reversible: false` is deliberate and is the one place this differs from
  // `*.file.write`: a multi-file edit that fails partway cannot be undone by
  // re-running the tool, because the tool no longer knows what the original
  // content was.
  {
    tool: "*.rename.apply",
    sideEffect: "local_write",
    riskLevel: "high",
    reversible: false,
    requiredScopes: ["repository:write"],
    alwaysApprove: true,
  },

  // --- externally visible writes (risk class C) --------------------------
  {
    tool: "*.pull_request.create",
    sideEffect: "external_write",
    riskLevel: "medium",
    reversible: true,
    requiredScopes: ["pull_request:write"],
    alwaysApprove: true,
  },
  {
    tool: "*.issue.create",
    sideEffect: "external_write",
    riskLevel: "medium",
    reversible: true,
    requiredScopes: ["issue:write"],
    alwaysApprove: true,
  },
  {
    tool: "*.message.send",
    sideEffect: "external_write",
    riskLevel: "medium",
    reversible: false,
    requiredScopes: ["message:write"],
    alwaysApprove: true,
  },
  {
    tool: "*.form.submit",
    sideEffect: "external_write",
    riskLevel: "high",
    reversible: false,
    alwaysApprove: true,
  },
  {
    tool: "*.deploy.preview",
    sideEffect: "external_write",
    riskLevel: "medium",
    reversible: true,
    requiredScopes: ["deploy:write"],
    alwaysApprove: true,
  },

  // --- risk class D: destructive / billing / credential / production ------
  {
    tool: "*.delete",
    sideEffect: "destructive",
    riskLevel: "critical",
    reversible: false,
    alwaysApprove: true,
  },
  {
    tool: "*.migration.apply",
    sideEffect: "destructive",
    riskLevel: "high",
    reversible: false,
    alwaysApprove: true,
  },
  {
    tool: "*.deploy.production",
    sideEffect: "production",
    riskLevel: "critical",
    reversible: false,
    requiredScopes: ["deploy:write"],
    alwaysApprove: true,
  },
  {
    // Reading a secret is credential handling, not a read. Without these rules
    // `secret.read` / `secrets.read` match `*.read` and are waved through as
    // risk "read". Both spellings are listed because `matches` needs an exact
    // `.suffix` — a singular pattern does not catch the plural tool name.
    tool: "*.secret.read",
    sideEffect: "credential",
    riskLevel: "high",
    reversible: true,
    requiredScopes: ["secret:read"],
    alwaysApprove: true,
  },
  {
    tool: "*.secrets.read",
    sideEffect: "credential",
    riskLevel: "high",
    reversible: true,
    requiredScopes: ["secret:read"],
    alwaysApprove: true,
  },
  {
    tool: "*.secret.write",
    sideEffect: "credential",
    riskLevel: "critical",
    reversible: false,
    requiredScopes: ["secret:write"],
    alwaysApprove: true,
  },
  {
    tool: "billing.*",
    sideEffect: "billing",
    riskLevel: "critical",
    reversible: false,
    alwaysApprove: true,
  },
];

/**
 * Pattern grammar (deliberately tiny, so it is auditable):
 *   "*"          matches everything
 *   "*.suffix"   matches "suffix" and "anything.suffix"
 *   "prefix.*"   matches "prefix.anything"
 *   "exact.name" matches exactly that
 */
export function matches(pattern: string, tool: string): boolean {
  if (pattern === "*") return true;
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1); // ".suffix"
    return tool === pattern.slice(2) || tool.endsWith(suffix);
  }
  if (pattern.endsWith(".*")) {
    return tool.startsWith(pattern.slice(0, -1));
  }
  return pattern === tool;
}

/** Most specific match wins: exact > suffix-glob > "*". */
export function classifyTool(
  tool: string,
  rules: readonly ToolPolicyRule[] = BASELINE_RULES,
): ToolPolicyRule {
  const deny = DENY_RULES.find((r) => matches(r.tool, tool));
  if (deny) return deny;

  let best: ToolPolicyRule | null = null;
  let bestScore = -1;
  let bestSpecificity = -1;
  for (const rule of rules) {
    if (!matches(rule.tool, tool)) continue;
    let score: number;
    if (rule.tool === "*") score = 0;
    else if (rule.tool.endsWith(".*")) score = 1;
    else if (rule.tool.startsWith("*.")) score = 2;
    else score = 3;
    // Within one shape class the longer pattern is the more specific one.
    // Without this tie-break, declaration order decides: `*.secret.read`
    // written after `*.read` would score the same and never win, leaving the
    // narrower rule silently dead.
    const specificity = rule.tool.length;
    if (score > bestScore || (score === bestScore && specificity > bestSpecificity)) {
      best = rule;
      bestScore = score;
      bestSpecificity = specificity;
    }
  }
  return best ?? DEFAULT_RULE;
}

const RISK_ORDER: Record<RiskLevel, number> = {
  read: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/** Highest side-effect class each autonomy level may perform *without* approval. */
const AUTONOMY_CEILING: Record<AutonomyLevel, SideEffectClass | null> = {
  readonly: null,
  supervised: "local_write",
  "autonomous-branch": "external_write",
  full: "external_write",
};

const EFFECT_ORDER: Record<SideEffectClass, number> = {
  none: 0,
  local_write: 1,
  external_write: 2,
  destructive: 3,
  billing: 4,
  credential: 5,
  production: 6,
};

function exceedsCeiling(autonomy: AutonomyLevel, effect: SideEffectClass): boolean {
  const ceiling = AUTONOMY_CEILING[autonomy];
  if (ceiling === null) return EFFECT_ORDER[effect] > EFFECT_ORDER.none;
  return EFFECT_ORDER[effect] > EFFECT_ORDER[ceiling];
}

export interface ToolCallRequest {
  tool: string;
  action?: string;
  /** scopes the *connector* currently holds for this tenant */
  grantedScopes: string[];
  /** for git writes: the ref being written to */
  targetRef?: string;
  /** free-form; recorded (hashed) in the audit log */
  inputHash?: string;
  /** requested by the calling agent, may only raise the risk never lower it */
  declaredRisk?: RiskLevel;
}

/**
 * Which disabled capability turns off which tool prefix. Only capabilities that
 * name a tool family belong here — `paid_models` and `cloud_inference` are
 * provider constraints and are enforced by the model router instead.
 */
const CAPABILITY_TOOL_PREFIXES: Record<string, readonly string[]> = {
  browser_automation: ["browser."],
};

export function evaluateToolCall(
  req: ToolCallRequest,
  ctx: PolicyContext,
  rules: readonly ToolPolicyRule[] = BASELINE_RULES,
): PolicyVerdict {
  const rule = classifyTool(req.tool, rules);
  const reasons: string[] = [];

  // the agent may declare a *higher* risk, never a lower one
  const riskLevel: RiskLevel =
    req.declaredRisk && RISK_ORDER[req.declaredRisk] > RISK_ORDER[rule.riskLevel]
      ? req.declaredRisk
      : rule.riskLevel;

  // G1 — hard deny
  if (rule.deny) {
    return {
      allowed: false,
      approvalRequired: false,
      riskLevel,
      sideEffect: rule.sideEffect,
      reversible: rule.reversible,
      requiredScopes: rule.requiredScopes ?? [],
      reasons: [`hard deny: ${rule.denyReason ?? "action is not permitted"}`],
      denyReason: rule.denyReason,
    };
  }

  // capability guard — a mode that switched a capability off cannot be talked
  // into using it, whatever the tool's own risk class says
  for (const capability of ctx.disabledCapabilities ?? []) {
    const prefixes = CAPABILITY_TOOL_PREFIXES[capability];
    if (!prefixes) continue;
    if (prefixes.some((prefix) => req.tool.startsWith(prefix))) {
      return {
        allowed: false,
        approvalRequired: false,
        riskLevel: "high",
        sideEffect: rule.sideEffect,
        reversible: rule.reversible,
        requiredScopes: rule.requiredScopes ?? [],
        reasons: [
          `capability "${capability}" is disabled in the selected compute mode`,
        ],
        denyReason: `capability disabled: ${capability}`,
      };
    }
  }

  // protected branch guard — applies even to tools classified as local_write
  if (req.targetRef && ctx.protectedBranches.includes(req.targetRef)) {
    return {
      allowed: false,
      approvalRequired: false,
      riskLevel: "critical",
      sideEffect: "production",
      reversible: false,
      requiredScopes: rule.requiredScopes ?? [],
      reasons: [
        `direct write to protected ref "${req.targetRef}" is forbidden; open a pull request instead`,
      ],
      denyReason: "protected branch write",
    };
  }

  // G2 — scope
  const requiredScopes = rule.requiredScopes ?? [];
  const missing = requiredScopes.filter((s) => !req.grantedScopes.includes(s));
  if (missing.length > 0) {
    return {
      allowed: false,
      approvalRequired: false,
      riskLevel,
      sideEffect: rule.sideEffect,
      reversible: rule.reversible,
      requiredScopes,
      reasons: [`connector is missing required scopes: ${missing.join(", ")}`],
      denyReason: "insufficient scope",
    };
  }

  // G3 — approval
  const overCeiling = exceedsCeiling(ctx.autonomy, rule.sideEffect);
  const approvalRequired =
    Boolean(rule.alwaysApprove) ||
    overCeiling ||
    rule.sideEffect === "destructive" ||
    rule.sideEffect === "billing" ||
    rule.sideEffect === "credential" ||
    rule.sideEffect === "production";

  if (overCeiling) {
    reasons.push(
      `side effect "${rule.sideEffect}" exceeds the "${ctx.autonomy}" autonomy ceiling`,
    );
  }
  if (rule.alwaysApprove) {
    reasons.push(`"${req.tool}" always requires explicit approval (risk class D)`);
  }
  if (approvalRequired && reasons.length === 0) {
    reasons.push(`approval required for side effect "${rule.sideEffect}"`);
  }

  return {
    allowed: true,
    approvalRequired,
    riskLevel,
    sideEffect: rule.sideEffect,
    reversible: rule.reversible,
    requiredScopes,
    reasons,
  };
}

/**
 * Data egress gate: is this payload allowed to reach a given model locality?
 *
 * The platform never sends `private`/`confidential` content to a cloud model
 * that may train on inputs, and never sends detected secrets anywhere.
 */
export function evaluateEgress(params: {
  privacyLevel: PrivacyContext["privacyLevel"];
  providerLocality: "local" | "cloud";
  providerMayTrainOnInput: boolean;
  hasUnredactedSecrets: boolean;
  userConsentedToCloud: boolean;
  /** the compute mode the user selected; "local" means no cloud egress at all */
  computeMode?: "free" | "paid" | "local";
}): PolicyVerdict {
  const reasons: string[] = [];

  // The mode is a hard wall, checked before anything else: a workspace set to
  // local makes cloud egress impossible regardless of consent.
  if (params.computeMode === "local" && params.providerLocality === "cloud") {
    return {
      allowed: false,
      approvalRequired: false,
      riskLevel: "critical",
      sideEffect: "external_write",
      reversible: false,
      requiredScopes: [],
      reasons: [
        'compute mode is "local"; no content may leave the machine, consent or not',
      ],
      denyReason: "local mode: cloud egress forbidden",
    };
  }

  if (params.hasUnredactedSecrets) {
    return {
      allowed: false,
      approvalRequired: false,
      riskLevel: "critical",
      sideEffect: "credential",
      reversible: false,
      requiredScopes: [],
      reasons: ["payload contains unredacted secrets; redaction must run first"],
      denyReason: "unredacted secrets",
    };
  }

  const sensitive =
    params.privacyLevel === "private" || params.privacyLevel === "confidential";

  if (sensitive && params.providerLocality === "cloud") {
    if (params.providerMayTrainOnInput) {
      return {
        allowed: false,
        approvalRequired: false,
        riskLevel: "critical",
        sideEffect: "credential",
        reversible: false,
        requiredScopes: [],
        reasons: [
          "workspace privacy level forbids sending data to a provider that may train on inputs",
        ],
        denyReason: "privacy policy violation",
      };
    }
    if (!params.userConsentedToCloud) {
      reasons.push(
        "sensitive content requires explicit per-run consent before leaving the machine",
      );
      return {
        allowed: true,
        approvalRequired: true,
        riskLevel: "high",
        sideEffect: "external_write",
        reversible: false,
        requiredScopes: [],
        reasons,
      };
    }
    reasons.push("user consented to cloud processing for this run");
  }

  return {
    allowed: true,
    approvalRequired: false,
    riskLevel: sensitive ? "medium" : "low",
    sideEffect: params.providerLocality === "local" ? "none" : "external_write",
    reversible: true,
    requiredScopes: [],
    reasons: reasons.length > 0 ? reasons : ["egress permitted by workspace policy"],
  };
}

type PrivacyContext = Pick<PolicyContext, "privacyLevel">;
