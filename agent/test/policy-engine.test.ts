import { describe, expect, it } from "vitest";
import {
  BASELINE_RULES,
  classifyTool,
  evaluateEgress,
  evaluateToolCall,
} from "../src/core/policy-engine.js";
import type { PolicyContext } from "../src/core/types.js";

const supervised: PolicyContext = {
  autonomy: "supervised",
  privacyLevel: "private",
  workingBranch: "agent/run-8f2c",
  protectedBranches: ["main", "production"],
  approverUserId: "user_1",
};

describe("policy engine — hard deny gate", () => {
  it.each([
    ["captcha.solve"],
    ["browser.captcha.solve"],
    ["mfa.bypass"],
    ["credential.read_raw"],
    ["host.exec"],
    ["sandbox.docker_socket"],
    ["github.account.bulk_create"],
    ["ratelimit.bypass"],
  ])("denies %s at every autonomy level", (tool) => {
    for (const autonomy of ["readonly", "supervised", "autonomous-branch", "full"] as const) {
      const v = evaluateToolCall({ tool, grantedScopes: ["*"] }, { ...supervised, autonomy });
      expect(v.allowed, `${tool} @ ${autonomy}`).toBe(false);
      expect(v.denyReason).toBeTruthy();
    }
  });

  it("cannot be overridden by a connector rule that looks permissive", () => {
    const v = evaluateToolCall(
      { tool: "host.exec", grantedScopes: ["*"] },
      supervised,
      [{ tool: "host.exec", sideEffect: "none", riskLevel: "read", reversible: true }],
    );
    expect(v.allowed).toBe(false);
  });
});

describe("policy engine — protected branches", () => {
  it("refuses a direct commit to main even with every scope", () => {
    const v = evaluateToolCall(
      { tool: "repo.commit.create", grantedScopes: ["repository:write"], targetRef: "main" },
      supervised,
    );
    expect(v.allowed).toBe(false);
    expect(v.denyReason).toBe("protected branch write");
  });

  it("allows the same commit on the agent branch", () => {
    const v = evaluateToolCall(
      { tool: "repo.commit.create", grantedScopes: ["repository:write"], targetRef: "agent/run-8f2c" },
      supervised,
    );
    expect(v.allowed).toBe(true);
  });
});

describe("policy engine — scope gate", () => {
  it("refuses a pull request when the connector lacks the scope", () => {
    const v = evaluateToolCall(
      { tool: "github.pull_request.create", grantedScopes: ["repository:read"] },
      supervised,
    );
    expect(v.allowed).toBe(false);
    expect(v.reasons.join(" ")).toMatch(/pull_request:write/);
  });
});

describe("policy engine — approval gate", () => {
  it("treats reads as free", () => {
    const v = evaluateToolCall({ tool: "repo.file.read", grantedScopes: [] }, supervised);
    expect(v.allowed).toBe(true);
    expect(v.approvalRequired).toBe(false);
    expect(v.riskLevel).toBe("read");
  });

  it("lets a supervised agent write inside the sandbox without approval", () => {
    const v = evaluateToolCall({ tool: "sandbox.exec", grantedScopes: [] }, supervised);
    expect(v.allowed).toBe(true);
    expect(v.approvalRequired).toBe(false);
  });

  it("always requires approval for an externally visible write", () => {
    const v = evaluateToolCall(
      { tool: "github.pull_request.create", grantedScopes: ["pull_request:write"] },
      { ...supervised, autonomy: "full" },
    );
    expect(v.allowed).toBe(true);
    expect(v.approvalRequired).toBe(true);
  });

  it("always requires approval for production, billing, credential and destructive actions", () => {
    for (const tool of ["deploy.production", "billing.charge", "secret.write", "database.migration.apply"]) {
      const v = evaluateToolCall(
        { tool, grantedScopes: ["deploy:write", "secret:write"] },
        { ...supervised, autonomy: "full" },
      );
      expect(v.allowed, tool).toBe(true);
      expect(v.approvalRequired, tool).toBe(true);
    }
  });

  it("blocks every side effect under readonly autonomy", () => {
    const v = evaluateToolCall({ tool: "sandbox.exec", grantedScopes: [] }, { ...supervised, autonomy: "readonly" });
    expect(v.allowed).toBe(true);
    expect(v.approvalRequired).toBe(true);
    expect(v.reasons.join(" ")).toMatch(/readonly/);
  });

  it("lets the agent raise its own declared risk but never lower it", () => {
    const raised = evaluateToolCall(
      { tool: "repo.file.read", grantedScopes: [], declaredRisk: "critical" },
      supervised,
    );
    expect(raised.riskLevel).toBe("critical");

    const lowered = evaluateToolCall(
      { tool: "deploy.production", grantedScopes: ["deploy:write"], declaredRisk: "read" },
      { ...supervised, autonomy: "full" },
    );
    expect(lowered.riskLevel).toBe("critical");
    expect(lowered.approvalRequired).toBe(true);
  });

  it("classifies unknown tools as high risk requiring approval", () => {
    const v = evaluateToolCall({ tool: "some.brand.new.tool", grantedScopes: [] }, supervised);
    expect(v.riskLevel).toBe("high");
    expect(v.approvalRequired).toBe(true);
  });

  it("picks the most specific matching rule", () => {
    expect(classifyTool("repo.file.read", BASELINE_RULES).riskLevel).toBe("read");
    expect(classifyTool("github.account.bulk_create", BASELINE_RULES).deny).toBe(true);
    expect(classifyTool("github.delete", BASELINE_RULES).sideEffect).toBe("destructive");
  });
});

describe("policy engine — data egress", () => {
  it("treats reading a secret as credential handling, not a read", () => {
    // Both spellings: `matches` needs an exact `.suffix`, so a singular
    // pattern alone would let `secrets.read` fall through to `*.read`.
    for (const tool of ["secret.read", "secrets.read", "vault.secrets.read"]) {
      const v = evaluateToolCall({ tool, grantedScopes: ["secret:read"] }, supervised);
      expect(v.riskLevel, tool).toBe("high");
      expect(v.sideEffect, tool).toBe("credential");
      expect(v.approvalRequired, tool).toBe(true);
    }
    // without the scope it is refused outright
    expect(
      evaluateToolCall({ tool: "secrets.read", grantedScopes: [] }, supervised).allowed,
    ).toBe(false);
  });

  it("still treats an ordinary read as an ordinary read", () => {
    const v = evaluateToolCall({ tool: "repo.file.read", grantedScopes: [] }, supervised);
    expect(v.riskLevel).toBe("read");
    expect(v.approvalRequired).toBe(false);
  });

  it("denies a capability the compute mode switched off", () => {
    const v = evaluateToolCall(
      { tool: "browser.navigate", grantedScopes: ["browser:use"] },
      { ...supervised, disabledCapabilities: ["browser_automation"] },
    );
    expect(v.allowed).toBe(false);
    expect(v.denyReason).toBe("capability disabled: browser_automation");
    // the same call is fine when the mode allows it
    expect(
      evaluateToolCall({ tool: "browser.navigate", grantedScopes: ["browser:use"] }, supervised).allowed,
    ).toBe(true);
  });

  it("never sends unredacted secrets anywhere", () => {
    const v = evaluateEgress({
      privacyLevel: "public",
      providerLocality: "local",
      providerMayTrainOnInput: false,
      hasUnredactedSecrets: true,
      userConsentedToCloud: true,
    });
    expect(v.allowed).toBe(false);
    expect(v.denyReason).toBe("unredacted secrets");
  });

  it("never sends private data to a provider that may train on inputs", () => {
    const v = evaluateEgress({
      privacyLevel: "private",
      providerLocality: "cloud",
      providerMayTrainOnInput: true,
      hasUnredactedSecrets: false,
      userConsentedToCloud: true,
    });
    expect(v.allowed).toBe(false);
    expect(v.denyReason).toBe("privacy policy violation");
  });

  it("requires consent before private data leaves the machine", () => {
    const v = evaluateEgress({
      privacyLevel: "private",
      providerLocality: "cloud",
      providerMayTrainOnInput: false,
      hasUnredactedSecrets: false,
      userConsentedToCloud: false,
    });
    expect(v.allowed).toBe(true);
    expect(v.approvalRequired).toBe(true);
  });

  it("passes public data to a local model with no ceremony", () => {
    const v = evaluateEgress({
      privacyLevel: "public",
      providerLocality: "local",
      providerMayTrainOnInput: false,
      hasUnredactedSecrets: false,
      userConsentedToCloud: false,
    });
    expect(v.allowed).toBe(true);
    expect(v.approvalRequired).toBe(false);
  });
});
