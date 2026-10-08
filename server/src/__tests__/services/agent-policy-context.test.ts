import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildPolicyContext,
  protectedBranches,
  configuredScopes,
  resolveScopes,
} from '../../services/agent-policy-context.js';

/**
 * Regression tests for a real vulnerability.
 *
 * The invoke route used to merge the caller's `policy` object straight into
 * the context the policy engine judges against. Two guarantees were therefore
 * decorative: a request could send `protectedBranches: []` and commit to
 * `main`, or send `approverUserId` matching its own `approvedBy` and satisfy
 * the human-approval gate with no human. Both were confirmed against a live
 * server before this was written.
 */

describe('policy context construction', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    delete process.env.AGENT_PROTECTED_BRANCHES;
    delete process.env.AGENT_WORKING_BRANCH;
    delete process.env.AGENT_AUTONOMY;
    delete process.env.AGENT_GRANTED_SCOPES;
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it('protects main and master by default', () => {
    expect(protectedBranches()).toEqual(['main', 'master']);
  });

  it('ignores a request trying to empty the protected list', () => {
    const ctx = buildPolicyContext({
      sessionEmail: 'alice@example.com',
      requested: { protectedBranches: [] },
    });
    expect(ctx.protectedBranches).toEqual(['main', 'master']);
  });

  it('ignores a request trying to replace the protected list', () => {
    const ctx = buildPolicyContext({
      sessionEmail: 'alice@example.com',
      requested: { protectedBranches: ['nothing-real'] },
    });
    expect(ctx.protectedBranches).toContain('main');
  });

  it('takes the approver from the session, not the request', () => {
    const ctx = buildPolicyContext({
      sessionEmail: 'alice@example.com',
      requested: { approverUserId: 'i-am-the-agent' },
    });
    // This is what makes `approvedBy: "i-am-the-agent"` fail: the gate compares
    // against the authenticated identity, which a request cannot set.
    expect(ctx.approverUserId).toBe('alice@example.com');
  });

  it('leaves no approver when there is no session', () => {
    const ctx = buildPolicyContext({ sessionEmail: undefined });
    expect(ctx.approverUserId).toBe('unknown');
  });

  it('honours configured protected branches', () => {
    process.env.AGENT_PROTECTED_BRANCHES = 'main, release, prod';
    expect(protectedBranches()).toEqual(['main', 'release', 'prod']);
  });

  // --- autonomy is clamped, not taken ------------------------------------

  it('refuses to let a request raise autonomy above the ceiling', () => {
    const ctx = buildPolicyContext({
      sessionEmail: 'alice@example.com',
      requested: { autonomy: 'full' },
    });
    expect(ctx.autonomy).toBe('supervised');
  });

  it('allows a request to lower autonomy', () => {
    const ctx = buildPolicyContext({
      sessionEmail: 'alice@example.com',
      requested: { autonomy: 'readonly' },
    });
    expect(ctx.autonomy).toBe('readonly');
  });

  it('respects a configured ceiling', () => {
    process.env.AGENT_AUTONOMY = 'autonomous-branch';
    const ctx = buildPolicyContext({
      sessionEmail: 'alice@example.com',
      requested: { autonomy: 'full' },
    });
    expect(ctx.autonomy).toBe('autonomous-branch');
  });

  it('falls back to supervised for a nonsense ceiling', () => {
    process.env.AGENT_AUTONOMY = 'god-mode';
    expect(buildPolicyContext({ sessionEmail: 'a@b.c' }).autonomy).toBe('supervised');
  });

  // --- descriptive fields are fine to accept -----------------------------

  it('accepts a valid privacy level from the request', () => {
    const ctx = buildPolicyContext({
      sessionEmail: 'alice@example.com',
      requested: { privacyLevel: 'confidential' },
    });
    expect(ctx.privacyLevel).toBe('confidential');
  });

  it('falls back to private for a nonsense privacy level', () => {
    const ctx = buildPolicyContext({
      sessionEmail: 'alice@example.com',
      requested: { privacyLevel: 'whatever' },
    });
    expect(ctx.privacyLevel).toBe('private');
  });

  it('uses the run privacy level when the request does not say', () => {
    const ctx = buildPolicyContext({ sessionEmail: 'a@b.c', privacyLevel: 'internal' });
    expect(ctx.privacyLevel).toBe('internal');
  });
});

describe('scope granting', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    delete process.env.AGENT_GRANTED_SCOPES;
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it('grants nothing by default', () => {
    // A fresh install can read. Writing is a deliberate act of configuration.
    expect(configuredScopes()).toEqual([]);
    expect(resolveScopes(['repository:write'])).toEqual([]);
  });

  it('ignores a scope the deployment does not hold', () => {
    process.env.AGENT_GRANTED_SCOPES = 'repository:write';
    // The old behaviour believed this outright.
    expect(resolveScopes(['deploy:write'])).toEqual([]);
  });

  it('keeps only the overlap when a request asks for more', () => {
    process.env.AGENT_GRANTED_SCOPES = 'repository:write';
    expect(resolveScopes(['repository:write', 'deploy:write', 'secret:read'])).toEqual([
      'repository:write',
    ]);
  });

  it('gives the full grant when the request says nothing', () => {
    process.env.AGENT_GRANTED_SCOPES = 'repository:write, pull_request:write';
    expect(resolveScopes(undefined)).toEqual(['repository:write', 'pull_request:write']);
  });

  it('lets a request narrow its own privilege', () => {
    process.env.AGENT_GRANTED_SCOPES = 'repository:write, deploy:write';
    // Useful for running one step with less power than the install allows.
    expect(resolveScopes(['repository:write'])).toEqual(['repository:write']);
    expect(resolveScopes([])).toEqual([]);
  });

  it('ignores non-string entries rather than trusting them', () => {
    process.env.AGENT_GRANTED_SCOPES = 'repository:write';
    expect(resolveScopes([{ toString: () => 'repository:write' }, 42])).toEqual([]);
  });
});
