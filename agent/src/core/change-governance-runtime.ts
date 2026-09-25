/** M179 fail-closed contracts for pull-request quality and commit provenance. */

export type M179CommitState = "proposed" | "verified" | "rejected";
export type M179PullRequestState = "draft" | "ready" | "approved" | "merged" | "closed";

export interface M179CommitRecord {
  organizationId: string;
  changeId: string;
  commitId: string;
  parentHashes: string[];
  authorReference: string;
  branch: string;
  message: string;
  diffHash: string;
  testsHash: string;
  state: M179CommitState;
  signed: boolean;
  noSecrets: boolean;
  noDirectMainMutation: boolean;
  tenantBound: boolean;
}

export interface M179PullRequest {
  organizationId: string;
  changeId: string;
  pullRequestId: string;
  sourceBranch: string;
  targetBranch: string;
  title: string;
  summary: string;
  testEvidenceHash: string;
  riskSummaryHash: string;
  changedFiles: number;
  state: M179PullRequestState;
  reviewerReference: string;
  approvalPresent: boolean;
  conflictsFree: boolean;
  tenantBound: boolean;
}

export interface M179MergeDecisionRequest {
  organizationId: string;
  pullRequestId: string;
  mergeId: string;
  targetBranch: string;
  approvalPresent: boolean;
  checksPassed: boolean;
  conflictsFree: boolean;
  directPush: boolean;
  rollbackReference: string;
  operatorReference: string;
}

export interface M179ChangelogRecord {
  organizationId: string;
  releaseId: string;
  version: string;
  changeIds: string[];
  migrationNotesHash: string;
  securityNotesHash: string;
  generatedFromEvidence: boolean;
  approved: boolean;
  tenantBound: boolean;
}

export interface M179ChangeDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  auditHash: string;
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(values: Array<readonly [string, string]>, reasons: string[]): void {
  for (const [value, label] of values) if (!value.trim()) reasons.push(`${label} is required`);
}

export function validateM179Commit(commit: M179CommitRecord): M179ChangeDecision {
  const reasons: string[] = [];
  required([[commit.organizationId, "organizationId"], [commit.changeId, "changeId"], [commit.commitId, "commitId"], [commit.authorReference, "authorReference"], [commit.branch, "branch"], [commit.message, "message"], [commit.diffHash, "diffHash"], [commit.testsHash, "testsHash"]], reasons);
  if (!/^(feat|fix|docs|refactor|test|chore|perf|build|ci)(\([^)]+\))?!?: .+/.test(commit.message)) reasons.push("commit message must follow the change convention");
  if (commit.branch === "main" || commit.branch === "master") reasons.push("direct work on protected branch is denied");
  if (commit.parentHashes.length === 0 || commit.parentHashes.some((parent) => !parent.trim())) reasons.push("commit parent provenance is required");
  if (!commit.signed || !commit.noSecrets || !commit.noDirectMainMutation || !commit.tenantBound) reasons.push("commit signature, secret, protected-branch or tenant gate failed");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ commit, reasons })) };
}

export function validateM179PullRequest(request: M179PullRequest): M179ChangeDecision {
  const reasons: string[] = [];
  required([[request.organizationId, "organizationId"], [request.changeId, "changeId"], [request.pullRequestId, "pullRequestId"], [request.sourceBranch, "sourceBranch"], [request.targetBranch, "targetBranch"], [request.title, "title"], [request.summary, "summary"], [request.testEvidenceHash, "testEvidenceHash"], [request.riskSummaryHash, "riskSummaryHash"], [request.reviewerReference, "reviewerReference"]], reasons);
  if (request.sourceBranch === request.targetBranch || request.sourceBranch === "main" || request.sourceBranch === "master") reasons.push("pull request source must be a separate branch");
  if (!Number.isInteger(request.changedFiles) || request.changedFiles < 1) reasons.push("changed file count is invalid");
  if (request.state === "approved" || request.state === "merged") {
    if (!request.approvalPresent || !request.conflictsFree || !request.tenantBound) reasons.push("approved pull request needs review, conflict and tenant evidence");
  }
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.targetBranch === "main", auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function decideM179Merge(request: M179MergeDecisionRequest): M179ChangeDecision {
  const reasons: string[] = [];
  required([[request.organizationId, "organizationId"], [request.pullRequestId, "pullRequestId"], [request.mergeId, "mergeId"], [request.targetBranch, "targetBranch"], [request.rollbackReference, "rollbackReference"], [request.operatorReference, "operatorReference"]], reasons);
  if (!request.approvalPresent || !request.checksPassed || !request.conflictsFree || request.directPush) reasons.push("merge needs approval, checks, conflict proof and non-direct delivery");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.targetBranch === "main", auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateM179Changelog(changelog: M179ChangelogRecord): M179ChangeDecision {
  const reasons: string[] = [];
  required([[changelog.organizationId, "organizationId"], [changelog.releaseId, "releaseId"], [changelog.version, "version"], [changelog.migrationNotesHash, "migrationNotesHash"], [changelog.securityNotesHash, "securityNotesHash"]], reasons);
  if (!/^v?\d+\.\d+\.\d+([+-][0-9A-Za-z.-]+)?$/.test(changelog.version)) reasons.push("release version is not semantic");
  if (changelog.changeIds.length === 0 || changelog.changeIds.some((id) => !id.trim()) || !changelog.generatedFromEvidence || !changelog.approved || !changelog.tenantBound) reasons.push("changelog needs change evidence, approval and tenant boundary");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ changelog, reasons })) };
}
