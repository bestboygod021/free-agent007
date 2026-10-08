/** M51 contracts for cross-platform deep links, context handoff and safe import/export. */

import type { ConnectedPlatform } from "./platform-connection-runtime.js";

export type HandoffTarget = "github" | "gitlab" | "bitbucket" | "slack" | "linear" | "notion" | "google_drive" | "jira" | "custom";
export type BundleFormat = "json" | "markdown" | "csv";

export interface PlatformDeepLink {
  organizationId: string;
  linkId: string;
  sourcePlatform: ConnectedPlatform;
  targetPlatform: HandoffTarget;
  targetUrl: string;
  signedCapability: string;
  expiresAt: number;
  oneTime: boolean;
  consumed: boolean;
}

export interface ContextHandoff {
  organizationId: string;
  runId: string;
  sourcePlatform: ConnectedPlatform;
  targetPlatform: HandoffTarget;
  projectReference: string;
  taskReference: string;
  contextFields: Record<string, string>;
  handoffHash: string;
  userApproved: boolean;
  containsSecret: false;
}

export interface PlatformBundle {
  organizationId: string;
  bundleId: string;
  format: BundleFormat;
  schemaVersion: string;
  sourcePlatform: ConnectedPlatform;
  targetPlatform: HandoffTarget;
  payloadHash: string;
  recordCount: number;
  encryptedAtRest: boolean;
  containsRawCredential: false;
}

export interface PlatformHandoffDecision {
  allowed: boolean;
  reasons: string[];
  requiresUserReview: boolean;
  auditHash: string;
}

export class PlatformHandoffContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformHandoffContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new PlatformHandoffContractError(`${label} is required`);
}

export function validatePlatformDeepLink(link: PlatformDeepLink, now: number): PlatformHandoffDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[link.organizationId, "organizationId"], [link.linkId, "linkId"], [link.targetUrl, "targetUrl"], [link.signedCapability, "signedCapability"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!link.targetUrl.startsWith("https://") && link.targetPlatform !== "custom") reasons.push("platform deep link must use HTTPS");
  if (!Number.isFinite(now) || link.expiresAt <= now) reasons.push("deep link is expired");
  if (link.oneTime && link.consumed) reasons.push("one-time deep link was already consumed");
  return { allowed: reasons.length === 0, reasons, requiresUserReview: true, auditHash: hash(JSON.stringify({ link, now, reasons })) };
}

export function planContextHandoff(handoff: ContextHandoff): PlatformHandoffDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[handoff.organizationId, "organizationId"], [handoff.runId, "runId"], [handoff.projectReference, "projectReference"], [handoff.taskReference, "taskReference"], [handoff.handoffHash, "handoffHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (Object.keys(handoff.contextFields).length === 0) reasons.push("context handoff must contain an explicit bounded field set");
  if (handoff.containsSecret !== false) reasons.push("context handoff cannot contain secrets");
  if (!handoff.userApproved) reasons.push("cross-platform context handoff requires user approval");
  if (Object.keys(handoff.contextFields).some((key) => /password|secret|token|api[_-]?key/i.test(key))) reasons.push("secret-like context field is forbidden");
  return { allowed: reasons.length === 0, reasons, requiresUserReview: true, auditHash: hash(JSON.stringify({ handoff, reasons })) };
}

export function validatePlatformBundle(bundle: PlatformBundle): PlatformHandoffDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[bundle.organizationId, "organizationId"], [bundle.bundleId, "bundleId"], [bundle.schemaVersion, "schemaVersion"], [bundle.payloadHash, "payloadHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(bundle.recordCount) || bundle.recordCount < 0 || bundle.recordCount > 10000) reasons.push("bundle record count is outside bounds");
  if (!bundle.encryptedAtRest) reasons.push("cross-platform bundle must be encrypted at rest");
  if (bundle.containsRawCredential !== false) reasons.push("bundle cannot contain raw credentials");
  return { allowed: reasons.length === 0, reasons, requiresUserReview: bundle.recordCount > 0, auditHash: hash(JSON.stringify({ bundle, reasons })) };
}

export function consumeOneTimeDeepLink(linkId: string, organizationId: string, consumed: boolean): PlatformHandoffDecision {
  required(linkId, "linkId");
  required(organizationId, "organizationId");
  const reasons: string[] = [];
  if (consumed) reasons.push("one-time deep link cannot be consumed twice");
  return { allowed: reasons.length === 0, reasons, requiresUserReview: false, auditHash: hash(JSON.stringify({ linkId, organizationId, consumed, reasons })) };
}
