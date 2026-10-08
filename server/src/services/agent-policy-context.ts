import type { PolicyContext } from '@freellmapi/agent/core/types.js';

/**
 * Which parts of a policy context a request may set, and which it may not.
 *
 * The tool registry evaluates a call against a `PolicyContext`, and the invoke
 * route was merging the caller's `policy` object straight into it. That made
 * two guarantees decorative:
 *
 *   - `protectedBranches: []` turned off the protected-branch guard, so a
 *     request could commit directly to `main`.
 *   - `approverUserId` and `approvedBy` are both request fields, so a caller
 *     could nominate itself as its own approver and satisfy the human-approval
 *     gate without a human.
 *
 * A control that the subject of the control can edit is not a control. So the
 * fields deciding *whether* something is allowed come from server
 * configuration and the authenticated session; the request may only influence
 * fields that make a verdict stricter or merely describe the work.
 */

/** Branches an agent may never write to directly. */
export function protectedBranches(): string[] {
  const configured = process.env.AGENT_PROTECTED_BRANCHES?.trim();
  if (!configured) return ['main', 'master'];
  return configured
    .split(',')
    .map((b) => b.trim())
    .filter((b) => b !== '');
}

/** The branch an agent is expected to work on. */
export function workingBranch(): string {
  return process.env.AGENT_WORKING_BRANCH?.trim() || 'agent/work';
}

export interface BuildContextParams {
  /** Email from the validated session: the only identity that may approve. */
  sessionEmail: string | undefined;
  /** The caller's requested context. Only non-authority fields are honoured. */
  requested?: Record<string, unknown> | undefined;
  /** Privacy level of the run, when the call belongs to one. */
  privacyLevel?: string | undefined;
}

const PRIVACY_LEVELS = new Set(['public', 'internal', 'private', 'confidential']);
const AUTONOMY_ORDER = ['readonly', 'supervised', 'autonomous-branch', 'full'] as const;

/**
 * Build the context a tool call is judged against.
 *
 * Authority fields (`protectedBranches`, `approverUserId`) always come from
 * configuration and the session. Descriptive fields are taken from the request
 * when valid, because getting those wrong makes a verdict stricter rather than
 * looser — except `autonomy`, which is clamped to a configured ceiling.
 */
export function buildPolicyContext(params: BuildContextParams): PolicyContext {
  const requested = params.requested ?? {};

  // `autonomy` widens what is permitted, so a request may lower it but never
  // raise it above what the deployment allows.
  const configured = process.env.AGENT_AUTONOMY?.trim() ?? '';
  const ceiling = (AUTONOMY_ORDER as readonly string[]).includes(configured)
    ? configured
    : 'supervised';
  const asked = typeof requested.autonomy === 'string' ? requested.autonomy : ceiling;
  const autonomy =
    (AUTONOMY_ORDER as readonly string[]).includes(asked) &&
    AUTONOMY_ORDER.indexOf(asked as (typeof AUTONOMY_ORDER)[number]) <
      AUTONOMY_ORDER.indexOf(ceiling as (typeof AUTONOMY_ORDER)[number])
      ? asked
      : ceiling;

  const privacyLevel =
    typeof requested.privacyLevel === 'string' && PRIVACY_LEVELS.has(requested.privacyLevel)
      ? requested.privacyLevel
      : PRIVACY_LEVELS.has(params.privacyLevel ?? '')
        ? params.privacyLevel!
        : 'private';

  return {
    autonomy,
    privacyLevel,
    workingBranch: workingBranch(),
    // Server-owned: a request cannot shorten this list.
    protectedBranches: protectedBranches(),
    // Session-owned: only the authenticated human can approve, so `approvedBy`
    // must match a real logged-in identity to pass the gate.
    approverUserId: params.sessionEmail ?? 'unknown',
    ...(Array.isArray(requested.disabledCapabilities)
      ? { disabledCapabilities: requested.disabledCapabilities as string[] }
      : {}),
  } as PolicyContext;
}

/**
 * Scopes this deployment actually holds.
 *
 * `grantedScopes` is described by the kernel as "scopes the connector
 * currently holds", but the invoke route took the list from the request — so a
 * caller could assert `repository:write` and have it believed. That is the
 * same shape of bug as a request naming its own approver: the subject of the
 * control supplying the control's input.
 *
 * Scopes are therefore granted by configuration. `AGENT_GRANTED_SCOPES` is an
 * operator statement about what this install is allowed to do; a request may
 * narrow it to less, which is useful for running a single step with reduced
 * privilege, but can never add to it.
 *
 * The default is empty: a fresh install can read, and must be deliberately
 * configured before it can write anything.
 */
export function configuredScopes(): string[] {
  const configured = process.env.AGENT_GRANTED_SCOPES?.trim();
  if (!configured) return [];
  return configured
    .split(',')
    .map((scope) => scope.trim())
    .filter((scope) => scope !== '');
}

/**
 * The scopes a call may use: what the server grants, optionally narrowed by
 * what the request asked for. Intersection, never union.
 */
export function resolveScopes(requested: unknown): string[] {
  const available = configuredScopes();
  if (!Array.isArray(requested)) return available;

  const asked = new Set(requested.filter((s): s is string => typeof s === 'string'));
  return available.filter((scope) => asked.has(scope));
}
