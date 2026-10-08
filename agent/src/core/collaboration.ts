/**
 * Deterministic collaboration primitives for comments, handoffs and approval delegation.
 *
 * This module records proposals and verifies boundaries. It does not grant a
 * permission by itself; the existing policy/approval layer remains authoritative.
 */

export type CollaborationRole = "OWNER" | "ADMIN" | "MEMBER" | "REVIEWER" | "OBSERVER";
export type CollaborationEventKind = "comment" | "handoff" | "approval_delegation";

export interface Membership {
  organizationId: string;
  userId: string;
  roles: CollaborationRole[];
  active: boolean;
}

export interface RunComment {
  commentId: string;
  organizationId: string;
  runId: string;
  authorId: string;
  body: string;
  parentCommentId?: string;
  createdAt: number;
  bodyHash: string;
}

export interface RunHandoff {
  handoffId: string;
  organizationId: string;
  runId: string;
  fromUserId: string;
  toUserId: string;
  reason: string;
  createdAt: number;
  expiresAt: number;
  acceptedAt?: number;
  status: "pending" | "accepted" | "declined" | "expired";
  handoffHash: string;
}

export interface ApprovalDelegation {
  delegationId: string;
  organizationId: string;
  runId: string;
  approvalId: string;
  fromUserId: string;
  toUserId: string;
  requiredRole: "REVIEWER" | "ADMIN" | "OWNER";
  expiresAt: number;
  status: "pending" | "accepted" | "revoked" | "expired";
  delegationHash: string;
}

export class CollaborationContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CollaborationContractError";
  }
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new CollaborationContractError(`${label} must not be empty`);
}

function assertMembership(membership: Membership, organizationId: string, label: string): void {
  if (!membership.active || membership.organizationId !== organizationId) {
    throw new CollaborationContractError(`${label} is not an active member of the organization`);
  }
}

function hasRole(membership: Membership, role: CollaborationRole): boolean {
  return membership.roles.includes(role) || membership.roles.includes("OWNER") || membership.roles.includes("ADMIN");
}

function stableHash(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createRunComment(input: Omit<RunComment, "bodyHash">, actor?: Membership): RunComment {
  required(input.commentId, "commentId");
  required(input.organizationId, "organizationId");
  required(input.runId, "runId");
  required(input.authorId, "authorId");
  required(input.body, "body");
  if (!Number.isFinite(input.createdAt) || input.createdAt < 0) throw new CollaborationContractError("createdAt must be non-negative");
  if (actor) {
    assertMembership(actor, input.organizationId, "authorId");
    if (actor.userId !== input.authorId) throw new CollaborationContractError("comment author mismatch");
  }
  if (input.body.length > 20_000) throw new CollaborationContractError("comment body exceeds 20000 characters");
  return { ...structuredClone(input), bodyHash: stableHash({ ...input, body: input.body }) };
}

export function createHandoff(
  input: Omit<RunHandoff, "status" | "handoffHash">,
  from: Membership,
  to: Membership,
): RunHandoff {
  required(input.handoffId, "handoffId");
  required(input.organizationId, "organizationId");
  required(input.runId, "runId");
  required(input.reason, "reason");
  if (input.fromUserId === input.toUserId) throw new CollaborationContractError("handoff must have two distinct users");
  assertMembership(from, input.organizationId, "fromUserId");
  assertMembership(to, input.organizationId, "toUserId");
  if (input.fromUserId !== from.userId || input.toUserId !== to.userId) {
    throw new CollaborationContractError("handoff actor mismatch");
  }
  if (!hasRole(from, "MEMBER")) throw new CollaborationContractError("fromUserId cannot create a handoff");
  if (!Number.isFinite(input.expiresAt) || input.expiresAt <= input.createdAt) {
    throw new CollaborationContractError("handoff expiry must be after creation");
  }
  const handoff = { ...structuredClone(input), status: "pending" as const };
  return { ...handoff, handoffHash: stableHash(handoff) };
}

export function acceptHandoff(
  handoff: RunHandoff,
  actor: Membership,
  now: number,
): RunHandoff {
  assertMembership(actor, handoff.organizationId, "toUserId");
  if (actor.userId !== handoff.toUserId) throw new CollaborationContractError("only the delegated user can accept a handoff");
  if (handoff.status !== "pending") throw new CollaborationContractError("handoff is not pending");
  if (!Number.isFinite(now) || now < 0) throw new CollaborationContractError("now must be non-negative");
  if (now >= handoff.expiresAt) {
    const expired = { ...handoff, status: "expired" as const };
    return { ...expired, handoffHash: stableHash(expired) };
  }
  const next = { ...handoff, status: "accepted" as const, acceptedAt: now };
  return { ...next, handoffHash: stableHash(next) };
}

export function delegateApproval(
  input: Omit<ApprovalDelegation, "status" | "delegationHash">,
  from: Membership,
  to: Membership,
): ApprovalDelegation {
  required(input.delegationId, "delegationId");
  required(input.approvalId, "approvalId");
  assertMembership(from, input.organizationId, "fromUserId");
  assertMembership(to, input.organizationId, "toUserId");
  if (input.fromUserId !== from.userId || input.toUserId !== to.userId) {
    throw new CollaborationContractError("delegation actor mismatch");
  }
  if (from.userId === to.userId) throw new CollaborationContractError("self-delegation is not allowed");
  if (!hasRole(from, "ADMIN") && !hasRole(from, "OWNER")) {
    throw new CollaborationContractError("only admin or owner can delegate an approval");
  }
  if (!hasRole(to, input.requiredRole)) throw new CollaborationContractError("delegate lacks required role");
  if (!Number.isFinite(input.expiresAt) || input.expiresAt <= 0) throw new CollaborationContractError("invalid delegation expiry");
  const delegation = { ...structuredClone(input), status: "pending" as const };
  return { ...delegation, delegationHash: stableHash(delegation) };
}

export function acceptApprovalDelegation(
  delegation: ApprovalDelegation,
  actor: Membership,
  now: number,
): ApprovalDelegation {
  assertMembership(actor, delegation.organizationId, "toUserId");
  if (actor.userId !== delegation.toUserId) throw new CollaborationContractError("only the delegate can accept");
  if (delegation.status !== "pending") throw new CollaborationContractError("delegation is not pending");
  if (!Number.isFinite(now) || now < 0) throw new CollaborationContractError("now must be non-negative");
  if (now >= delegation.expiresAt) {
    const expired = { ...delegation, status: "expired" as const };
    return { ...expired, delegationHash: stableHash(expired) };
  }
  const next = { ...delegation, status: "accepted" as const };
  return { ...next, delegationHash: stableHash(next) };
}

export const collaborationEventKinds: readonly CollaborationEventKind[] = ["comment", "handoff", "approval_delegation"];
