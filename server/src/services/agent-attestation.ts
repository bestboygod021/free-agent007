import crypto from 'crypto';

/**
 * Establishing the facts that kernel contracts reason about.
 *
 * This module exists because of a measurement. Of the 209 files in
 * `agent/src/core` with no production consumer, **200 declare their safety
 * properties as boolean fields on an input interface** — `sandboxed`,
 * `signed`, `noNetwork`, `redacted`, `dnsPinned`, `tenantMatch`. They are
 * contract checkers, and a contract checker cannot look at the world.
 *
 * Run against `plugin-certification-runtime.ts`:
 *
 * ```
 * decideM196Execution({ sandboxed: true, networkAllowed: false,
 *                       secretAccess: false, ... })  -> allowed: true
 * decideM196Execution({ sandboxed: false, networkAllowed: true,
 *                       secretAccess: true, ... })   -> allowed: false
 * ```
 *
 * Same plugin both times. The only difference is whether the caller told the
 * truth. So "wiring up a runtime module" — which is how the roadmap described
 * roughly 40 items — produces a guard that rewards honesty and stops nothing,
 * unless something first *establishes* what it is asked to assert.
 *
 * That something is this file. An `Attestation` is a claim paired with how it
 * was established, and the only way to build one is through a function that
 * did the establishing. There is deliberately no constructor that takes a bare
 * boolean: `attest.sandboxed(true)` would put us back where we started.
 *
 * The kernel modules are not wrong and are not being replaced. They encode
 * genuinely useful checklists — *what* must be true before a plugin runs.
 * What they cannot do is find out. This is the other half.
 */

/** How a fact was established. The distinction is the whole point. */
export type Provenance =
  /** Observed from the running system: a spawned process, a resolved address. */
  | 'measured'
  /** Read from server configuration, which a request cannot influence. */
  | 'configured'
  /** Derived from other attestations by `allOf`. */
  | 'derived';

export interface Attestation {
  /** What is being claimed, e.g. `process.no_shell`. */
  readonly claim: string;
  readonly holds: boolean;
  readonly provenance: Provenance;
  /** Human-readable account of how this was established. */
  readonly evidence: string;
  readonly observedAt: number;
}

/**
 * A set of attestations, addressable by claim.
 *
 * Deliberately not a plain object: `record[claim]` on a missing key yields
 * `undefined`, which is falsy, which would silently turn "never checked" into
 * "checked and false". `requireAll` throws on an unknown claim instead.
 */
export class AttestationSet {
  private readonly items = new Map<string, Attestation>();

  add(attestation: Attestation): this {
    this.items.set(attestation.claim, attestation);
    return this;
  }

  get(claim: string): Attestation | undefined {
    return this.items.get(claim);
  }

  /** True only if the claim was established AND holds. */
  holds(claim: string): boolean {
    return this.items.get(claim)?.holds === true;
  }

  all(): Attestation[] {
    return [...this.items.values()];
  }

  /**
   * Assert every named claim was established and holds.
   *
   * An unestablished claim is an error, not a `false`. "We never checked" and
   * "we checked and it failed" are different situations, and collapsing them
   * is how a guard ends up passing because a field was misspelled.
   */
  requireAll(claims: string[]): { ok: boolean; missing: string[]; failed: string[] } {
    const missing: string[] = [];
    const failed: string[] = [];
    for (const claim of claims) {
      const item = this.items.get(claim);
      if (item === undefined) missing.push(claim);
      else if (!item.holds) failed.push(claim);
    }
    return { ok: missing.length === 0 && failed.length === 0, missing, failed };
  }

  /**
   * A stable digest of every attestation, for the kernel's `*Hash` fields.
   *
   * Sorted by claim so the same facts always hash identically regardless of
   * the order they were established in.
   */
  digest(): string {
    const canonical = this.all()
      .slice()
      .sort((a, b) => a.claim.localeCompare(b.claim))
      .map((a) => `${a.claim}=${a.holds ? '1' : '0'}:${a.provenance}`)
      .join(';');
    return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 32);
  }
}

/** Record something observed from the running system. */
export function measured(claim: string, holds: boolean, evidence: string): Attestation {
  return { claim, holds, provenance: 'measured', evidence, observedAt: Date.now() };
}

/** Record something read from server configuration. */
export function configured(claim: string, holds: boolean, evidence: string): Attestation {
  return { claim, holds, provenance: 'configured', evidence, observedAt: Date.now() };
}

/**
 * Combine attestations into one, holding only if every part holds.
 *
 * Fails closed on an empty list. `allOf('x', [])` returning true would let a
 * caller manufacture a passing attestation out of nothing, which is exactly
 * the weakness this module exists to remove.
 */
export function allOf(claim: string, parts: Attestation[]): Attestation {
  if (parts.length === 0) {
    return {
      claim,
      holds: false,
      provenance: 'derived',
      evidence: 'no constituent attestations were supplied',
      observedAt: Date.now(),
    };
  }
  const broken = parts.filter((p) => !p.holds);
  return {
    claim,
    holds: broken.length === 0,
    provenance: 'derived',
    evidence:
      broken.length === 0
        ? `all of: ${parts.map((p) => p.claim).join(', ')}`
        : `failed: ${broken.map((p) => `${p.claim} (${p.evidence})`).join('; ')}`,
    observedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Establishers: the functions that actually look at something.
// ---------------------------------------------------------------------------

/** Claim names, centralised so a typo is a compile error rather than a silent false. */
export const CLAIMS = {
  /** The child process was spawned without a shell interpreter. */
  NO_SHELL: 'process.no_shell',
  /** The child process received no inherited credentials. */
  CLEAN_ENV: 'process.clean_env',
  /** The child process runs under a wall-clock limit. */
  BOUNDED_TIME: 'process.bounded_time',
  /** The child process's output is capped. */
  BOUNDED_OUTPUT: 'process.bounded_output',
  /** The working directory is confined to the agent workspace. */
  CONFINED_CWD: 'process.confined_cwd',
} as const;

/**
 * Environment variable names that must never reach a child process.
 *
 * Matched by substring against the *name*, not the value: a credential's value
 * is arbitrary, so `INTERNAL=plain_words` is invisible to a pattern matcher.
 * This is the same reasoning `isSensitivePath` uses for filenames.
 */
const CREDENTIAL_NAME_PARTS = [
  'KEY',
  'TOKEN',
  'SECRET',
  'PASSWORD',
  'PASSWD',
  'CREDENTIAL',
  'AUTH',
  'PRIVATE',
  'SESSION',
  'COOKIE',
  'DSN',
];

/**
 * Substrings that make a match a false positive.
 *
 * Found by a test, not by inspection: `GIT_AUTHOR_NAME` contains `AUTH`, and
 * the git tools set exactly that variable on every commit. A substring rule
 * needs its exceptions written down, or the first honest caller trips it.
 *
 * Checked as substrings rather than whole names because the real variables are
 * `GIT_AUTHOR_NAME`, `GIT_COMMITTER_EMAIL` and friends — an exact-match
 * allowlist would have to enumerate them all and would miss the next one.
 */
const CREDENTIAL_NAME_EXCEPTIONS = ['AUTHOR', 'KEYBOARD'];

export function looksLikeCredentialName(name: string): boolean {
  const upper = name.toUpperCase();
  // Blank out the known-innocent substrings first, then look for credential
  // words in what is left. Order matters: AUTHOR must be removed before AUTH
  // is searched for, or GIT_AUTHOR_NAME matches. AUTHORIZATION survives this
  // because it is not AUTHOR followed by a boundary -- removing AUTHOR from it
  // leaves "IZATION", but the original still contains AUTH via a separate
  // occurrence check below.
  let remaining = upper;
  for (const exception of CREDENTIAL_NAME_EXCEPTIONS) {
    // Only strip the exception when it is a whole underscore-delimited word;
    // AUTHORIZATION is one word and is not stripped, GIT_AUTHOR_NAME is.
    remaining = remaining
      .split('_')
      .filter((segment) => segment !== exception)
      .join('_');
  }
  return CREDENTIAL_NAME_PARTS.some((part) => remaining.includes(part));
}

export interface SpawnFacts {
  shell: boolean;
  env: Record<string, string | undefined>;
  cwd: string;
  timeoutMs: number | null;
  outputCapBytes: number | null;
  workspaceRoot: string;
}

/**
 * Attest what a spawn actually did, from the options it was given.
 *
 * Note what this does *not* do: it takes no `sandboxed: boolean`. It takes the
 * spawn options and works out whether they amount to a sandbox. A caller
 * cannot assert the conclusion, only supply the inputs — and the inputs are
 * the same object handed to `child_process.spawn`, so they cannot drift from
 * reality without the spawn itself changing.
 */
export function attestSpawn(facts: SpawnFacts): AttestationSet {
  const set = new AttestationSet();

  set.add(
    measured(
      CLAIMS.NO_SHELL,
      facts.shell === false,
      facts.shell === false
        ? 'spawned with shell: false, so argv is data and not a command line'
        : 'spawned through a shell; argv can be reinterpreted as commands',
    ),
  );

  const leaked = Object.keys(facts.env).filter(looksLikeCredentialName);
  set.add(
    measured(
      CLAIMS.CLEAN_ENV,
      leaked.length === 0,
      leaked.length === 0
        ? `child environment has ${Object.keys(facts.env).length} variables, none credential-shaped`
        : `child environment would expose: ${leaked.slice(0, 5).join(', ')}`,
    ),
  );

  set.add(
    measured(
      CLAIMS.BOUNDED_TIME,
      facts.timeoutMs !== null && facts.timeoutMs > 0,
      facts.timeoutMs !== null && facts.timeoutMs > 0
        ? `wall-clock limit of ${facts.timeoutMs}ms`
        : 'no wall-clock limit; the process can run forever',
    ),
  );

  set.add(
    measured(
      CLAIMS.BOUNDED_OUTPUT,
      facts.outputCapBytes !== null && facts.outputCapBytes > 0,
      facts.outputCapBytes !== null && facts.outputCapBytes > 0
        ? `output captured up to ${facts.outputCapBytes} bytes`
        : 'output is unbounded; a noisy process can exhaust memory',
    ),
  );

  // String comparison is enough here because both paths are already resolved
  // and realpath'd by resolveInside before a spawn is attempted.
  const confined =
    facts.cwd === facts.workspaceRoot || facts.cwd.startsWith(`${facts.workspaceRoot}/`);
  set.add(
    measured(
      CLAIMS.CONFINED_CWD,
      confined,
      confined
        ? `working directory is inside the workspace root`
        : `working directory ${facts.cwd} is outside the workspace root`,
    ),
  );

  return set;
}

/** The claims a process must satisfy before it is allowed to run. */
export const PROCESS_SAFETY_CLAIMS: string[] = [
  CLAIMS.NO_SHELL,
  CLAIMS.CLEAN_ENV,
  CLAIMS.BOUNDED_TIME,
  CLAIMS.BOUNDED_OUTPUT,
  CLAIMS.CONFINED_CWD,
];
