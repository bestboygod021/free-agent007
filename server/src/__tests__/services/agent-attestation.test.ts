import { describe, it, expect } from 'vitest';
import {
  AttestationSet,
  attestSpawn,
  measured,
  configured,
  allOf,
  looksLikeCredentialName,
  CLAIMS,
  PROCESS_SAFETY_CLAIMS,
} from '../../services/agent-attestation.js';

const cleanEnv = { PATH: '/usr/bin', HOME: '/home/agent', NODE_ENV: 'test', CI: '1' };

function facts(overrides: Partial<Parameters<typeof attestSpawn>[0]> = {}) {
  return attestSpawn({
    shell: false,
    env: cleanEnv,
    cwd: '/work',
    timeoutMs: 120_000,
    outputCapBytes: 65_536,
    workspaceRoot: '/work',
    ...overrides,
  });
}

describe('AttestationSet', () => {
  it('distinguishes "never established" from "established and false"', () => {
    const set = new AttestationSet().add(measured('a', false, 'checked, failed'));
    const verdict = set.requireAll(['a', 'b']);

    // Collapsing these two is how a guard ends up passing because a claim name
    // was misspelled: an absent key reads as falsy and looks like a failure
    // that was actually never run.
    expect(verdict.failed).toEqual(['a']);
    expect(verdict.missing).toEqual(['b']);
    expect(verdict.ok).toBe(false);
  });

  it('holds() is false for an unknown claim rather than throwing', () => {
    expect(new AttestationSet().holds('nope')).toBe(false);
  });

  it('passes only when every claim was established and holds', () => {
    const set = new AttestationSet()
      .add(measured('a', true, 'ok'))
      .add(measured('b', true, 'ok'));
    expect(set.requireAll(['a', 'b'])).toEqual({ ok: true, missing: [], failed: [] });
  });

  it('a later attestation replaces an earlier one for the same claim', () => {
    const set = new AttestationSet()
      .add(measured('a', true, 'first'))
      .add(measured('a', false, 'second'));
    expect(set.holds('a')).toBe(false);
  });

  describe('digest', () => {
    it('is stable regardless of insertion order', () => {
      const one = new AttestationSet().add(measured('a', true, 'x')).add(measured('b', false, 'y'));
      const two = new AttestationSet().add(measured('b', false, 'y')).add(measured('a', true, 'x'));
      expect(one.digest()).toBe(two.digest());
    });

    it('changes when a claim flips', () => {
      const yes = new AttestationSet().add(measured('a', true, 'x'));
      const no = new AttestationSet().add(measured('a', false, 'x'));
      expect(yes.digest()).not.toBe(no.digest());
    });

    it('changes when provenance differs, even with the same verdict', () => {
      // "we measured it" and "an operator configured it" are different
      // guarantees and must not hash alike.
      const m = new AttestationSet().add(measured('a', true, 'x'));
      const c = new AttestationSet().add(configured('a', true, 'x'));
      expect(m.digest()).not.toBe(c.digest());
    });
  });
});

describe('allOf', () => {
  it('holds when every part holds', () => {
    expect(allOf('all', [measured('a', true, ''), measured('b', true, '')]).holds).toBe(true);
  });

  it('fails and names the broken part', () => {
    const result = allOf('all', [measured('a', true, ''), measured('b', false, 'reason here')]);
    expect(result.holds).toBe(false);
    expect(result.evidence).toContain('b');
    expect(result.evidence).toContain('reason here');
  });

  it('fails closed on an empty list', () => {
    // Vacuous truth here would let a caller manufacture a passing attestation
    // out of nothing, which is the exact weakness this module exists to remove.
    expect(allOf('all', []).holds).toBe(false);
  });
});

describe('looksLikeCredentialName', () => {
  it('matches credential-shaped names by substring', () => {
    for (const name of [
      'OPENAI_API_KEY', 'GITHUB_TOKEN', 'DB_PASSWORD', 'my_secret', 'AWS_SESSION_TOKEN',
      'DATABASE_DSN', 'PRIVATE_KEY', 'HTTP_AUTHORIZATION',
    ]) {
      expect(looksLikeCredentialName(name), name).toBe(true);
    }
  });

  it('leaves ordinary names alone', () => {
    for (const name of ['PATH', 'HOME', 'NODE_ENV', 'CI', 'LANG', 'TERM', 'TMPDIR']) {
      expect(looksLikeCredentialName(name), name).toBe(false);
    }
  });

  it('allows names that merely contain a matching substring innocently', () => {
    expect(looksLikeCredentialName('GIT_AUTHOR_NAME')).toBe(false);
  });

  it('matches by name, not by value shape', () => {
    // The whole reason this is a name check: a credential's value is
    // arbitrary, so INTERNAL_TOKEN=plain_words matches no value pattern.
    expect(looksLikeCredentialName('INTERNAL_TOKEN')).toBe(true);
  });
});

describe('attestSpawn', () => {
  it('establishes every process safety claim for a well-formed spawn', () => {
    expect(facts().requireAll(PROCESS_SAFETY_CLAIMS)).toEqual({
      ok: true,
      missing: [],
      failed: [],
    });
  });

  it('takes spawn options, not a sandboxed boolean', () => {
    // The distinction this module exists for: the conclusion is derived from
    // the same object handed to child_process.spawn, so it cannot drift from
    // what the spawn actually does.
    const attested = facts();
    expect(attested.get(CLAIMS.NO_SHELL)?.provenance).toBe('measured');
  });

  it('refuses a shell spawn', () => {
    const attested = facts({ shell: true });
    expect(attested.holds(CLAIMS.NO_SHELL)).toBe(false);
    expect(attested.get(CLAIMS.NO_SHELL)?.evidence).toContain('shell');
  });

  it('detects credentials that would leak into the child', () => {
    const attested = facts({ env: { ...cleanEnv, OPENAI_API_KEY: 'sk-live-x' } });
    expect(attested.holds(CLAIMS.CLEAN_ENV)).toBe(false);
    expect(attested.get(CLAIMS.CLEAN_ENV)?.evidence).toContain('OPENAI_API_KEY');
  });

  it('does not put the credential value in the evidence', () => {
    const attested = facts({ env: { ...cleanEnv, GITHUB_TOKEN: 'ghp_supersecretvalue' } });
    // Evidence ends up in logs and audit rows; naming the variable is useful,
    // quoting its value would defeat the purpose.
    expect(attested.get(CLAIMS.CLEAN_ENV)?.evidence).not.toContain('ghp_supersecretvalue');
  });

  it('refuses an unbounded runtime', () => {
    expect(facts({ timeoutMs: null }).holds(CLAIMS.BOUNDED_TIME)).toBe(false);
    expect(facts({ timeoutMs: 0 }).holds(CLAIMS.BOUNDED_TIME)).toBe(false);
  });

  it('refuses unbounded output', () => {
    expect(facts({ outputCapBytes: null }).holds(CLAIMS.BOUNDED_OUTPUT)).toBe(false);
  });

  it('refuses a working directory outside the workspace', () => {
    expect(facts({ cwd: '/etc' }).holds(CLAIMS.CONFINED_CWD)).toBe(false);
  });

  it('does not accept a sibling directory that merely shares a prefix', () => {
    // /work-evil starts with /work but is not inside it.
    expect(facts({ cwd: '/work-evil', workspaceRoot: '/work' }).holds(CLAIMS.CONFINED_CWD)).toBe(
      false,
    );
  });

  it('accepts a subdirectory of the workspace', () => {
    expect(facts({ cwd: '/work/pkg', workspaceRoot: '/work' }).holds(CLAIMS.CONFINED_CWD)).toBe(
      true,
    );
  });

  it('reports every failure at once rather than the first', () => {
    const verdict = facts({ shell: true, timeoutMs: null, cwd: '/etc' }).requireAll(
      PROCESS_SAFETY_CLAIMS,
    );
    // An operator fixing a misconfiguration should not have to discover the
    // problems one deploy at a time.
    expect(verdict.failed).toEqual(
      expect.arrayContaining([CLAIMS.NO_SHELL, CLAIMS.BOUNDED_TIME, CLAIMS.CONFINED_CWD]),
    );
  });
});
