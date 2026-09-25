import commonDefs from "../../schema/common.defs.json" with { type: "json" };
import completionReport from "../../schema/completion-report.schema.json" with { type: "json" };
import connectorManifest from "../../schema/connector-manifest.schema.json" with { type: "json" };
import systemEvent from "../../schema/event.schema.json" with { type: "json" };
import orchestratorOutput from "../../schema/orchestrator-output.schema.json" with { type: "json" };
import projectPlan from "../../schema/plan.schema.json" with { type: "json" };
import productSpec from "../../schema/product-spec.schema.json" with { type: "json" };
import runRequest from "../../schema/run-request.schema.json" with { type: "json" };
import qaReport from "../../schema/qa-report.schema.json" with { type: "json" };
import securityFinding from "../../schema/security-finding.schema.json" with { type: "json" };
import agentTask from "../../schema/task.schema.json" with { type: "json" };
import toolCallDecision from "../../schema/tool-call-decision.schema.json" with { type: "json" };
import { registerSchemas } from "./output-contract.js";

/**
 * The versioned contract library.
 *
 * `common.defs.json` must be registered first because the other schemas $ref
 * it by $id. Adding a schema here is what "versioning a prompt's output
 * contract" means in practice: the prompt file and its schema move together.
 */
export const SCHEMAS = [
  commonDefs,
  securityFinding,
  agentTask,
  toolCallDecision,
  completionReport,
  qaReport,
  productSpec,
  runRequest,
  projectPlan,
  orchestratorOutput,
  systemEvent,
  connectorManifest,
] as const;

export type SchemaId = (typeof SCHEMAS)[number]["$id"];

registerSchemas(SCHEMAS as unknown as readonly object[]);

export const SCHEMA_IDS = {
  task: "https://forgepilot.dev/schema/task.schema.json",
  toolCallDecision: "https://forgepilot.dev/schema/tool-call-decision.schema.json",
  completionReport: "https://forgepilot.dev/schema/completion-report.schema.json",
  qaReport: "https://forgepilot.dev/schema/qa-report.schema.json",
  securityFinding: "https://forgepilot.dev/schema/security-finding.schema.json",
  productSpec: "https://forgepilot.dev/schema/product-spec.schema.json",
  plan: "https://forgepilot.dev/schema/plan.schema.json",
  orchestratorOutput: "https://forgepilot.dev/schema/orchestrator-output.schema.json",
  event: "https://forgepilot.dev/schema/event.schema.json",
  runRequest: "https://forgepilot.dev/schema/run-request.schema.json",
  connectorManifest: "https://forgepilot.dev/schema/connector-manifest.schema.json",
} as const;
