/**
 * Secret redaction.
 *
 * Runs *before* any content leaves the process for a cloud model, and before
 * anything is written to a log, an event payload, or a screenshot caption.
 *
 * Design rules:
 *  - Deterministic and total: same input always produces the same output.
 *  - Never lossy about *structure*: the placeholder keeps the secret class so
 *    the model can still reason about "there is an API key here".
 *  - Conservative: it may redact a false positive; it must not leak a real one.
 *  - It is a defence-in-depth layer, not a substitute for never storing raw
 *    secrets in the first place (SecretReference + vault).
 */

export interface RedactionHit {
  type: string;
  count: number;
  /** zero-based character offsets of the *replaced region* in the output */
  offsets: number[];
}

export interface RedactionResult {
  text: string;
  hits: RedactionHit[];
  hasSecrets: boolean;
  totalRedacted: number;
}

interface Pattern {
  type: string;
  re: RegExp;
  /** replacement string (may use $1..$n) or a function of the match args */
  replacement: string | ((...args: string[]) => string);
}

/**
 * Key-name classification. Done in code rather than one giant regex so the
 * rule is readable, testable and does not fire on prose such as "author: Jane".
 */
const SECRET_TOKENS: ReadonlySet<string> = new Set([
  "key",
  "secret",
  "token",
  "password",
  "passwd",
  "pwd",
  "credential",
  "credentials",
  "authorization",
  "auth",
  "signature",
  "signing",
  "encryption",
  "session",
  "cookie",
  "bearer",
  "dsn",
  "cert",
  "certificate",
]);

const SECRET_COMPOUNDS: readonly string[] = [
  "apikey",
  "secretkey",
  "accesskey",
  "privatekey",
  "clientsecret",
  "signingkey",
  "encryptionkey",
  "databaseurl",
  "dburl",
  "connectionstring",
  "authtoken",
  "accesstoken",
  "refreshtoken",
  "jwtsecret",
];

export function isSecretKey(key: string): boolean {
  const tokens = key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .split("_")
    .filter(Boolean);
  if (tokens.some((t) => SECRET_TOKENS.has(t))) return true;
  const joined = tokens.join("");
  return SECRET_COMPOUNDS.some((c) => joined.includes(c));
}

/** key<sep>value where the value is at least 6 non-space characters */
const KV_ASSIGNMENT =
  /([A-Za-z0-9_][A-Za-z0-9_.\-]{1,63})(["']?)(\s*[:=]\s*)(["']?)([^\s"',;}\]]{6,})(["']?)/g;

const PATTERNS: readonly Pattern[] = [
  {
    type: "PEM_PRIVATE_KEY",
    re: /-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/g,
    replacement: "[REDACTED:PEM_PRIVATE_KEY]",
  },
  {
    type: "AWS_ACCESS_KEY_ID",
    re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    replacement: "[REDACTED:AWS_ACCESS_KEY_ID]",
  },
  {
    type: "GITHUB_TOKEN",
    re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
    replacement: "[REDACTED:GITHUB_TOKEN]",
  },
  {
    type: "GITHUB_FINE_GRAINED_PAT",
    re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
    replacement: "[REDACTED:GITHUB_PAT]",
  },
  {
    type: "OPENAI_STYLE_KEY",
    re: /\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}\b/g,
    replacement: "[REDACTED:LLM_API_KEY]",
  },
  {
    type: "GOOGLE_API_KEY",
    re: /\bAIza[0-9A-Za-z\-_]{30,}\b/g,
    replacement: "[REDACTED:GOOGLE_API_KEY]",
  },
  {
    type: "SLACK_TOKEN",
    re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    replacement: "[REDACTED:SLACK_TOKEN]",
  },
  {
    type: "SLACK_WEBHOOK",
    re: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]+/g,
    replacement: "[REDACTED:SLACK_WEBHOOK]",
  },
  {
    type: "JWT",
    re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    replacement: "[REDACTED:JWT]",
  },
  {
    type: "BEARER_TOKEN",
    re: /\b(bearer\s+)[A-Za-z0-9._~+/-]{16,}=*/gi,
    replacement: "$1[REDACTED:BEARER_TOKEN]",
  },
  {
    type: "URL_CREDENTIALS",
    // scheme://user:password@host  -> keep scheme and host, drop credentials
    re: /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s@]+@/gi,
    replacement: "$1[REDACTED:URL_CREDENTIALS]@",
  },
  {
    type: "KV_SECRET",
    // KEY = "value" / KEY: value  (json, yaml, .env, shell export)
    re: KV_ASSIGNMENT,
    replacement: (
      full: string,
      key: string,
      quoteA: string,
      sep: string,
      quoteB: string,
      _val: string,
      quoteC: string,
    ) => (isSecretKey(key) ? `${key}${quoteA}${sep}${quoteB}[REDACTED:KV_SECRET]${quoteC}` : full),
  },
  {
    type: "STRIPE_KEY",
    re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
    replacement: "[REDACTED:STRIPE_KEY]",
  },
];

function isFunctionReplacement(
  r: string | ((...args: string[]) => string),
): r is (...args: string[]) => string {
  return typeof r === "function";
}

/**
 * Redact secrets from arbitrary text.
 */
export function redactSecrets(input: string): RedactionResult {
  let text = input;
  const hits: RedactionHit[] = [];
  let total = 0;

  for (const p of PATTERNS) {
    // fresh regex per call so lastIndex is never shared between runs
    const re = new RegExp(p.re.source, p.re.flags);
    let count = 0;
    const offsets: number[] = [];

    const replacement = p.replacement;
    if (isFunctionReplacement(replacement)) {
      const fn = replacement;
      text = text.replace(re, (...args: unknown[]) => {
        const matchArgs = args as unknown as string[];
        const full = matchArgs[0] ?? "";
        const replaced = fn(...matchArgs);
        // a function replacement may decline (returns the match unchanged)
        if (replaced !== full) {
          count += 1;
          offsets.push(full.length);
        }
        return replaced;
      });
    } else {
      text = text.replace(re, (full: string, ...rest: unknown[]) => {
        count += 1;
        offsets.push(full.length);
        return replacement.replace(/\$(\d)/g, (_m, n: string) => {
          const g = rest[Number(n) - 1];
          return typeof g === "string" ? g : "";
        });
      });
    }

    if (count > 0) {
      hits.push({ type: p.type, count, offsets });
      total += count;
    }
  }

  return { text, hits, hasSecrets: total > 0, totalRedacted: total };
}

/**
 * Structural redaction for object payloads (events, tool-call inputs).
 * Keys whose name looks like a secret have their value replaced; string values
 * anywhere else still go through `redactSecrets`.
 */
export function redactPayload(value: unknown, depth = 0): unknown {
  if (depth > 12) return "[REDACTED:MAX_DEPTH]";

  if (typeof value === "string") {
    return redactSecrets(value).text;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactPayload(v, depth + 1));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSecretKey(k)) {
        out[k] = "[REDACTED:KEY_NAME]";
      } else {
        out[k] = redactPayload(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

// key-name classification lives in isSecretKey()

/** File names / globs that must never be shipped to a cloud model at all. */
export const SENSITIVE_PATHS: readonly string[] = [
  ".env",
  ".env.local",
  ".env.production",
  "id_rsa",
  "id_ed25519",
  "credentials",
  "secrets.yml",
  "secrets.yaml",
  "serviceAccountKey.json",
  ".npmrc",
  ".pypirc",
  ".netrc",
  "known_hosts",
];

export function isSensitivePath(path: string): boolean {
  const base = path.split(/[\\/]/).pop() ?? path;
  return SENSITIVE_PATHS.some((s) => base === s || base.startsWith(`${s}.`));
}
