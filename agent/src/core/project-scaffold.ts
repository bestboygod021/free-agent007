/** Deterministic, policy-safe project bootstrap planning. No filesystem writes happen here. */

export interface ScaffoldTemplate {
  templateId: string;
  version: string;
  stack: "typescript" | "python" | "go" | "rust" | "generic";
  files: Record<string, string>;
  requiredTools: string[];
  license: string;
  signature: string;
}

export interface ScaffoldRequest {
  projectId: string;
  templateId: string;
  templateVersion: string;
  destination: string;
  variables: Record<string, string>;
  existingPaths: string[];
  allowOverwrite: false;
}

export interface ScaffoldPlan {
  planId: string;
  projectId: string;
  templateId: string;
  templateVersion: string;
  files: Array<{ path: string; content: string; contentHash: string }>;
  conflicts: string[];
  requiredApprovals: string[];
  planHash: string;
}

export class ScaffoldContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScaffoldContractError";
  }
}

const forbiddenNames = new Set([".env", ".env.local", ".npmrc", ".pypirc", ".netrc", "id_rsa", "id_ed25519"]);

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function safeRelativePath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) {
    throw new ScaffoldContractError(`unsafe scaffold path: ${path}`);
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => {
    const lower = segment.toLowerCase();
    return segment === ".." || segment === "." || segment === "" || forbiddenNames.has(lower) ||
      /(?:^|[._-])(credential|credentials|secret|secrets|password|passwd|token|tokens|private[-_]?key)(?:[._-]|$)/i.test(segment);
  })) {
    throw new ScaffoldContractError(`unsafe scaffold path: ${path}`);
  }
  return normalized;
}

function interpolate(content: string, variables: Record<string, string>): string {
  return content.replace(/\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/g, (_match, key: string) => {
    const value = variables[key];
    if (value === undefined) throw new ScaffoldContractError(`missing template variable: ${key}`);
    if (value.includes("\0")) throw new ScaffoldContractError(`invalid template variable: ${key}`);
    return value;
  });
}

export function planScaffold(template: ScaffoldTemplate, request: ScaffoldRequest): ScaffoldPlan {
  if (template.templateId !== request.templateId || template.version !== request.templateVersion) {
    throw new ScaffoldContractError("template identity does not match request");
  }
  if (!template.signature.trim() || !template.license.trim()) throw new ScaffoldContractError("template is not signed or licensed");
  if (!request.destination.trim() || request.destination.startsWith("/") || request.destination.includes("..") || request.destination.includes("\0")) {
    throw new ScaffoldContractError("destination must be a safe logical workspace reference");
  }
  if (request.allowOverwrite !== false) throw new ScaffoldContractError("scaffold overwrite must remain false");
  if (!request.projectId.trim()) throw new ScaffoldContractError("projectId must not be empty");
  const existing = new Set(request.existingPaths.map(safeRelativePath));
  const files = Object.entries(template.files).map(([rawPath, rawContent]) => {
    const path = safeRelativePath(rawPath);
    if (existing.has(path)) throw new ScaffoldContractError(`scaffold conflict: ${path}`);
    const content = interpolate(rawContent, request.variables);
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:api[_-]?key|password|secret)\s*[:=]/i.test(content)) {
      throw new ScaffoldContractError(`secret-like content in scaffold file: ${path}`);
    }
    return { path, content, contentHash: hash(content) };
  }).sort((a, b) => a.path.localeCompare(b.path));
  const body = JSON.stringify({ template: template.templateId, version: template.version, destination: request.destination, files });
  return {
    planId: `scaffold-${hash(body)}`,
    projectId: request.projectId,
    templateId: template.templateId,
    templateVersion: template.version,
    files,
    conflicts: [],
    requiredApprovals: files.length > 0 ? ["project.scaffold"] : [],
    planHash: hash(body),
  };
}
