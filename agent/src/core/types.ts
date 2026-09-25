/**
 * Core domain types for the agent software-delivery platform.
 *
 * These types are the *contract* between the four planes:
 *   Control Plane   -> runs, tasks, approvals, audit
 *   Intelligence    -> model routing, prompt context, agent state
 *   Execution Plane -> sandbox commands, tests, builds
 *   Integration     -> connectors, tool calls
 */

export type Locale = "fa-IR" | "en-US" | string;

export type PrivacyLevel = "public" | "internal" | "private" | "confidential";

export type RiskLevel = "read" | "low" | "medium" | "high" | "critical";

export type AutonomyLevel = "readonly" | "supervised" | "autonomous-branch" | "full";

export type RunState =
  | "INTAKE"
  | "CLARIFY"
  | "SPECIFY"
  | "PLAN"
  | "AWAITING_PLAN_APPROVAL"
  | "RECON"
  | "IMPLEMENT"
  | "TEST"
  | "REPAIR"
  | "SECURITY_REVIEW"
  | "PREVIEW"
  | "AWAITING_DEPLOY_APPROVAL"
  | "DEPLOY"
  | "VERIFY"
  | "FINALIZE"
  | "DONE"
  | "FAILED"
  | "CANCELLED"
  | "BLOCKED";

export type TaskStatus =
  | "pending"
  | "ready"
  | "running"
  | "blocked"
  | "needs_repair"
  | "completed"
  | "failed"
  | "skipped";

export type TaskType =
  | "repo_analysis"
  | "scaffold"
  | "database"
  | "backend"
  | "frontend"
  | "integration"
  | "test"
  | "security"
  | "devops"
  | "docs"
  | "browser";

export type ConnectorAuthType =
  | "oauth2"
  | "api_key"
  | "github_app"
  | "browser_session"
  | "local";

export type SideEffectClass =
  | "none" // pure read / local computation
  | "local_write" // writes inside the run workspace or a feature branch
  | "external_write" // creates an artifact outside the sandbox (PR, message, issue)
  | "destructive" // deletes data or resources
  | "billing" // spends money or consumes a paid quota
  | "credential" // reads/writes secrets, permissions, tokens
  | "production"; // touches production

export type ModelTaskType =
  | "intake"
  | "clarification"
  | "specification"
  | "planning"
  | "code_generation"
  | "code_edit"
  | "code_review"
  | "test_generation"
  | "repair"
  | "security_review"
  | "documentation"
  | "summarization"
  | "embedding";

export interface ToolCallDecision {
  tool: string;
  action: string;
  sideEffect: SideEffectClass;
  riskLevel: RiskLevel;
  reversible: boolean;
  reason: string;
  requiredScopes: string[];
}

export interface AgentTask {
  taskId: string;
  title: string;
  type: TaskType;
  objective: string;
  acceptanceCriteria: string[];
  allowedPaths: string[];
  forbiddenActions: string[];
  dependencies: string[];
  riskLevel: RiskLevel;
  approvalRequired: boolean;
  status?: TaskStatus;
}

export interface ToolPolicyRule {
  /** glob-ish prefix, e.g. "github.*" or "*" */
  tool: string;
  sideEffect: SideEffectClass;
  riskLevel: RiskLevel;
  reversible: boolean;
  requiredScopes?: string[];
  /** force approval regardless of autonomy level */
  alwaysApprove?: boolean;
  /** hard deny — the platform never performs this */
  deny?: boolean;
  denyReason?: string;
}

export interface PolicyContext {
  autonomy: AutonomyLevel;
  privacyLevel: PrivacyLevel;
  /** branch the agent is allowed to write to (never the protected branch) */
  workingBranch: string;
  /** branch that must never be written to directly */
  protectedBranches: string[];
  /** user id that can grant approvals; approvals by the agent itself are invalid */
  approverUserId: string;
  /**
   * Capabilities the selected compute mode switched off
   * (`ModeProfile.disabledCapabilities`). Tool-shaped capabilities are denied
   * by the policy engine; provider-shaped ones are the router's job.
   */
  disabledCapabilities?: readonly string[];
}

export interface PolicyVerdict {
  allowed: boolean;
  approvalRequired: boolean;
  riskLevel: RiskLevel;
  sideEffect: SideEffectClass;
  reversible: boolean;
  requiredScopes: string[];
  reasons: string[];
  denyReason?: string;
}

export interface ModelProviderCapability {
  provider: string;
  model: string;
  /** where the inference physically happens */
  locality: "local" | "cloud";
  maxPrivacyLevel: PrivacyLevel;
  supportsToolCalling: boolean;
  supportsStructuredOutput: boolean;
  contextWindow: number;
  /** requests per minute */
  rpm: number;
  /** requests per day */
  rpd: number;
  /** true when the provider may use prompts to improve its models */
  mayTrainOnInput: boolean;
  /** SPDX-ish label of the model licence */
  license: string;
  /** lower is better; 0 = free */
  relativeCost: number;
  /** lower is better */
  relativeLatencyMs: number;
  enabled: boolean;
}

export interface ModelRouteRequest {
  taskType: ModelTaskType;
  privacyLevel: PrivacyLevel;
  requiresToolCalling: boolean;
  requiresStructuredOutput: boolean;
  contextTokens: number;
  /** hard ceiling; 0 means "free tier only" */
  maxCost: number;
  maxLatencyMs: number;
  /** soft preference from the compute mode's task table */
  preferredLocality?: "local" | "cloud";
}

export interface ModelRouteChoice {
  provider: string;
  model: string;
  locality: "local" | "cloud";
  reason: string;
}

export interface ModelRouteResult {
  primary: ModelRouteChoice | null;
  fallbacks: ModelRouteChoice[];
  rejected: Array<{ provider: string; model: string; reason: string }>;
  /** human-readable policy explanation, safe to show in the UI */
  explanation: string;
}

export interface SystemEvent<T = unknown> {
  eventId: string;
  schemaVersion: number;
  tenantId: string;
  runId: string;
  type: string;
  timestamp: string;
  payload: T;
}
