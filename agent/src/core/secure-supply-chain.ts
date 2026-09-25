/** Supply-chain admission, egress DLP and ephemeral-secret planning. No secret value is accepted or returned. */

export interface ToolManifest {
  toolId: string;
  version: string;
  packageDigest: string;
  signature: string;
  capabilities: string[];
  license: string;
  sbomHash: string;
  runtime: "sandbox" | "microvm" | "builtin";
}

export interface DependencyRecord {
  name: string;
  version: string;
  license: string;
  digest: string;
}

export interface SupplyChainPolicy {
  allowedLicenses: string[];
  deniedCapabilities: string[];
  allowedEgressDomains: string[];
  requireSbom: boolean;
  requireSignature: boolean;
  dlpPatterns: string[];
}

export interface AdmissionDecision {
  allowed: boolean;
  reasons: string[];
  decisionHash: string;
}

export interface SecretLeasePlan {
  allowed: boolean;
  leaseId: string;
  reference: string;
  expiresAt: number;
  reasons: string[];
}

export class SecureSupplyChainContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecureSupplyChainContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new SecureSupplyChainContractError(`${label} is required`);
}

export function decideToolAdmission(manifest: ToolManifest, dependencies: readonly DependencyRecord[], policy: SupplyChainPolicy): AdmissionDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[manifest.toolId, "toolId"], [manifest.version, "version"], [manifest.packageDigest, "packageDigest"]] as const) required(value, label);
  if (policy.requireSignature && !manifest.signature.trim()) reasons.push("tool signature is required");
  if (policy.requireSbom && !manifest.sbomHash.trim()) reasons.push("SBOM hash is required");
  if (manifest.runtime !== "sandbox" && manifest.runtime !== "microvm" && manifest.runtime !== "builtin") reasons.push("runtime is not governed");
  for (const capability of manifest.capabilities) if (policy.deniedCapabilities.includes(capability)) reasons.push(`denied capability: ${capability}`);
  if (!policy.allowedLicenses.includes(manifest.license)) reasons.push(`license is not allowed: ${manifest.license}`);
  for (const dependency of dependencies) {
    if (!dependency.digest.trim()) reasons.push(`dependency digest missing: ${dependency.name}`);
    if (!policy.allowedLicenses.includes(dependency.license)) reasons.push(`dependency license is not allowed: ${dependency.name}`);
  }
  return { allowed: reasons.length === 0, reasons, decisionHash: hash(JSON.stringify({ toolId: manifest.toolId, packageDigest: manifest.packageDigest, reasons })) };
}

export function planSecretLease(reference: string, leaseId: string, expiresAt: number, allowedReferences: readonly string[], now: number): SecretLeasePlan {
  required(reference, "reference");
  required(leaseId, "leaseId");
  if (!Number.isFinite(now) || !Number.isFinite(expiresAt) || expiresAt <= now) throw new SecureSupplyChainContractError("secret lease must expire in the future");
  const reasons = allowedReferences.includes(reference) ? [] : ["secret reference is not allowlisted"];
  return { allowed: reasons.length === 0, leaseId, reference, expiresAt, reasons };
}

export function decideEgress(destinationDomain: string, content: string, policy: SupplyChainPolicy): AdmissionDecision {
  required(destinationDomain, "destinationDomain");
  const reasons: string[] = [];
  if (!policy.allowedEgressDomains.includes(destinationDomain)) reasons.push("destination domain is not allowlisted");
  for (const pattern of policy.dlpPatterns) {
    if (new RegExp(pattern, "i").test(content)) reasons.push(`DLP pattern matched: ${pattern}`);
  }
  return { allowed: reasons.length === 0, reasons, decisionHash: hash(JSON.stringify({ destinationDomain, reasons })) };
}

export function detectPromptInjection(untrustedText: string): { blocked: boolean; findings: string[] } {
  const findings: string[] = [];
  if (/ignore (?:all|previous|earlier) instructions/i.test(untrustedText)) findings.push("instruction override");
  if (/(?:reveal|print|dump).{0,30}(?:secret|system prompt|credential)/i.test(untrustedText)) findings.push("exfiltration request");
  if (/(?:disable|bypass).{0,20}(?:policy|approval|sandbox|mfa|captcha)/i.test(untrustedText)) findings.push("control bypass");
  return { blocked: findings.length > 0, findings };
}
