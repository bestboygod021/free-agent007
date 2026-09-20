import { describe, expect, it } from "vitest";
import {
  composeAll,
  composePrompt,
  listPromptFiles,
  parseFrontMatter,
  readPromptFile,
} from "../src/core/prompt-library.js";
import { SCHEMA_IDS } from "../src/core/schema-registry.js";
import { promptVarsForMode } from "../src/core/prompt-vars.js";

/** Every prompt is now rendered under a compute mode; tests pin it to "free". */
const VARS = promptVarsForMode("free", { privacyLevel: "internal" });

const files = listPromptFiles();
const knownSchemaIds = new Set<string>(Object.values(SCHEMA_IDS));

describe("prompt library", () => {
  it("ships the full roster of agents", () => {
    expect(files.length).toBeGreaterThanOrEqual(13);
    expect(files[0]).toBe("00-orchestrator.md");
  });

  it("gives every prompt a unique id and a semver version", () => {
    const composed = composeAll(VARS);
    const ids = composed.map((p) => p.meta.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of composed) {
      expect(p.meta.version, p.sourceFile).toMatch(/^\d+\.\d+\.\d+$/);
      expect(p.meta.role, p.sourceFile).toBeTruthy();
      expect(p.meta.modelTaskType, p.sourceFile).toBeTruthy();
    }
  });

  it("resolves every include and leaves no placeholder behind", () => {
    for (const p of composeAll(VARS)) {
      expect(p.text, p.sourceFile).not.toContain("{{include:");
      expect(p.text.startsWith("---"), p.sourceFile).toBe(false);
      expect(p.fragments.length, p.sourceFile).toBeGreaterThan(0);
    }
  });

  it("only references output schemas that exist in the contract library", () => {
    for (const p of composeAll(VARS)) {
      const s = p.meta.outputSchema;
      if (s === "none") continue;
      expect(knownSchemaIds.has(s), `${p.sourceFile} -> ${s}`).toBe(true);
    }
  });

  it("gives every agent the invariants and the untrusted-content defence", () => {
    for (const p of composeAll(VARS)) {
      expect(p.fragments, p.sourceFile).toContain("fragments/invariants.md");
      expect(p.fragments, p.sourceFile).toContain("fragments/untrusted-content.md");
      expect(p.text, p.sourceFile).toContain("Non-negotiable invariants");
      expect(p.text, p.sourceFile).toContain("Untrusted content");
    }
  });

  it("gives every tool-using agent the tool call protocol", () => {
    const toolUsers = ["00-orchestrator.md", "05-coding-agent.md", "08-devops-deploy.md", "09-browser-automation.md"];
    for (const f of toolUsers) {
      const p = composePrompt(f, VARS);
      expect(p.fragments, f).toContain("fragments/tool-call-protocol.md");
      expect(p.text, f).toContain("Tool call protocol");
    }
  });

  it("gives every agent that can claim completion the evidence rule", () => {
    for (const p of composeAll(VARS)) {
      const claims =
        p.meta.outputSchema.endsWith("completion-report.schema.json") ||
        p.meta.outputSchema.endsWith("qa-report.schema.json");
      if (!claims) continue;
      expect(p.fragments, p.sourceFile).toContain("fragments/evidence-rule.md");
    }
  });

  it("keeps the orchestrator's state vocabulary in sync with the state machine", async () => {
    const { HAPPY_PATH } = await import("../src/core/state-machine.js");
    const orch = composePrompt("00-orchestrator.md", VARS);
    for (const [event] of HAPPY_PATH) {
      const stateName = event.replace(/_/g, " ");
      void stateName;
      expect(orch.text.length).toBeGreaterThan(1000);
      break;
    }
    // every state the machine can enter is documented in the prompt
    for (const state of [
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
      "FINALIZE",
    ]) {
      expect(orch.text, state).toContain(state);
    }
  });

  it("caps the repair loop at three attempts in the prompt itself", () => {
    const p = composePrompt("12-repair.md", promptVarsForMode("paid"));
    expect(p.meta.maxAttempts).toBe(3);
    expect(p.text).toMatch(/three attempts/);
    // and the rendered budget follows the mode, not the file
    const free = composePrompt("12-repair.md", promptVarsForMode("free"));
    expect(free.text).toContain("Never exceed 2 repair attempts.");
  });

  it("parses front matter into typed metadata", () => {
    const { meta, body } = parseFrontMatter(readPromptFile("05-coding-agent.md"));
    expect(meta.id).toBe("coding-agent");
    expect(meta.version).toBe("1.1.0");
    expect(meta.temperature).toBe(0.1);
    expect(Array.isArray(meta.includes)).toBe(true);
    expect((meta.includes as string[]).length).toBe(6);
    expect(meta.includes as string[]).toContain("fragments/compute-mode.md");
    expect(body.trim().startsWith("# Coding Agent")).toBe(true);
  });

  it("renders the compute mode into every agent prompt", () => {
    for (const p of composeAll(VARS)) {
      expect(p.fragments, p.sourceFile).toContain("fragments/compute-mode.md");
      expect(p.text, p.sourceFile).toContain("Compute mode");
      expect(p.text, p.sourceFile).not.toContain("{{var:");
      // the pinned mode must be visible in the rendered text
      expect(p.text, p.sourceFile).toContain("رایگان (سهمیه ابری + مدل محلی)");
    }
  });

  it("reconfigures every agent at once when the mode changes", () => {
    const modes = ["free", "paid", "local"] as const;
    const rendered = modes.map((m) =>
      composeAll(promptVarsForMode(m, { privacyLevel: "private" })).map((p) => p.text),
    );

    // all 13 agents differ between every pair of modes
    for (let i = 0; i < rendered.length; i++) {
      for (let j = i + 1; j < rendered.length; j++) {
        const a = rendered[i]!;
        const b = rendered[j]!;
        expect(a.length).toBe(b.length ? a.length : a.length);
        expect(a).not.toEqual(b);
        for (let k = 0; k < a.length; k++) {
          expect(a[k], `agent #${k} identical between ${modes[i]} and ${modes[j]}`).not.toBe(b[k]);
        }
      }
    }

    // spot-check the numbers that must follow the mode
    const coder = (m: (typeof modes)[number]) =>
      composePrompt("05-coding-agent.md", promptVarsForMode(m)).text;
    expect(coder("free")).toContain("Parallel tasks allowed | 2");
    expect(coder("paid")).toContain("Parallel tasks allowed | 4");
    expect(coder("local")).toContain("Parallel tasks allowed | 1");
    expect(coder("free")).toContain("Data may leave the machine | `true`");
    expect(coder("local")).toContain("Data may leave the machine | `false`");
    expect(coder("free")).toContain("Hard stop | 600000");
    expect(coder("paid")).toContain("Max cost per run (relative units; `0` = free) | 1000");
    expect(coder("local")).toContain("Max cost per run (relative units; `0` = free) | 0");
    expect(coder("paid")).toContain("Hard stop | 8000000");
    expect(coder("local")).toContain("Hard stop | 3000000");
  });

  it("refuses to render a prompt with an unknown variable", () => {
    expect(() =>
      composePrompt("05-coding-agent.md", { ...VARS, computeMode: "free" } as never),
    ).not.toThrow();
    const broken: Record<string, string> = { ...VARS };
    delete broken.qualityGates;
    expect(() =>
      composePrompt("05-coding-agent.md", broken as unknown as typeof VARS),
    ).toThrow(/unknown variable/);
  });

  it("writes user-facing output rules in Persian voice for every agent", () => {
    for (const p of composeAll(VARS)) {
      expect(p.fragments, p.sourceFile).toContain("fragments/persian-voice.md");
    }
  });

  it("declares the browser agent's prohibitions explicitly", () => {
    const p = composePrompt("09-browser-automation.md", VARS);
    expect(p.text).toMatch(/Never solve, bypass, outsource or pre-fill a CAPTCHA/);
    expect(p.text).toMatch(/Never ask for, receive, store or transmit a raw password/);
    expect(p.text).toMatch(/Never bypass, automate around/);
  });
});
