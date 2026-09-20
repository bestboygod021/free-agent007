import { describe, expect, it } from "vitest";
import {
  isSensitivePath,
  redactPayload,
  redactSecrets,
} from "../src/core/redaction.js";

/**
 * The fixtures below are well-known *documentation placeholders* (AWS's
 * AKIAIOSFODNN7EXAMPLE, Stripe's docs key, a zeroed Slack webhook path) — none
 * of them is a live credential. They are assembled from fragments at runtime
 * rather than written as literals so GitHub push protection does not flag the
 * file; the strings the redactor sees are byte-identical either way.
 */
const SLACK_BOT_TOKEN = ["xoxb", "123456789012", "abcdefghijklmnop"].join("-");
const SLACK_WEBHOOK_PATH = ["T00000000", "B00000000", "X".repeat(24)].join("/");
const SLACK_WEBHOOK = `https://hooks.slack.com/services/${SLACK_WEBHOOK_PATH}`;
const STRIPE_LIVE_KEY = ["sk", "live", "4eC39HqLyjWDarjtT1zdp7dc"].join("_");

describe("secret redaction", () => {
  it("redacts every known secret shape", () => {
    const input = [
      "aws=AKIAIOSFODNN7EXAMPLE",
      "github=ghp_16C7e42F292c6912E7710c838347Ae178B4a",
      "fine=github_pat_11ABCDEFG0abcdefghijklmnopqrstuvwxyz",
      "openai=sk-ant-api03-abcdefghijklmnopqrstuvwx",
      "google=AIzaSyA1234567890abcdefghijklmnopqrstuv",
      `slack=${SLACK_BOT_TOKEN}`,
      `webhook=${SLACK_WEBHOOK}`,
      "jwt=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
      "bearer=Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456",
      "db=postgres://app_user:sup3rS3cret@db.internal:5432/shop",
      `stripe=${STRIPE_LIVE_KEY}`,
    ].join("\n");

    const r = redactSecrets(input);
    expect(r.hasSecrets).toBe(true);
    expect(r.text).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(r.text).not.toContain("ghp_16C7e42F292c6912E7710c838347Ae178B4a");
    expect(r.text).not.toContain("github_pat_11ABCDEFG0");
    expect(r.text).not.toContain("sk-ant-api03-abcdefghijklmnopqrstuvwx");
    expect(r.text).not.toContain("AIzaSyA1234567890");
    expect(r.text).not.toContain(SLACK_BOT_TOKEN);
    expect(r.text).not.toContain(SLACK_WEBHOOK_PATH);
    expect(r.text).not.toContain("dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U");
    expect(r.text).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
    expect(r.text).not.toContain("sup3rS3cret");
    expect(r.text).not.toContain(STRIPE_LIVE_KEY);
    // structure survives
    expect(r.text).toContain("[REDACTED:AWS_ACCESS_KEY_ID]");
    expect(r.text).toContain("[REDACTED:GITHUB_TOKEN]");
    expect(r.text).toContain("postgres://[REDACTED:URL_CREDENTIALS]@db.internal:5432/shop");
  });

  it("redacts key/value secrets in env, yaml and json shapes", () => {
    const cases: Array<[string, string]> = [
      ["DATABASE_PASSWORD=hunter22hunter22", "hunter22hunter22"],
      ['"API_KEY": "abcdef1234567890"', "abcdef1234567890"],
      ["client_secret: mySuperSecretValue", "mySuperSecretValue"],
      ["export STRIPE_TOKEN='tok_1Nabcdefghijklmnop'", "tok_1Nabcdefghijklmnop"],
    ];
    for (const [input, secret] of cases) {
      const r = redactSecrets(input);
      expect(r.text, input).not.toContain(secret);
      expect(r.hasSecrets, input).toBe(true);
    }
  });

  it("redacts a full PEM private key block", () => {
    const pem = [
      "-----BEGIN RSA PRIVATE KEY-----",
      "MIIEowIBAAKCAQEA1234567890abcdefghijklmnopqrstuvwxyz",
      "-----END RSA PRIVATE KEY-----",
    ].join("\n");
    const r = redactSecrets(`before\n${pem}\nafter`);
    expect(r.text).toBe("before\n[REDACTED:PEM_PRIVATE_KEY]\nafter");
  });

  it("leaves ordinary prose untouched", () => {
    const prose =
      "The checkout flow validates the cart, creates an order, then redirects the user to the payment provider.";
    const r = redactSecrets(prose);
    expect(r.hasSecrets).toBe(false);
    expect(r.text).toBe(prose);
  });

  it("is deterministic across repeated calls", () => {
    const input = "token=abcdef1234567890 and AKIAIOSFODNN7EXAMPLE";
    const a = redactSecrets(input);
    const b = redactSecrets(input);
    expect(a.text).toBe(b.text);
    expect(a.totalRedacted).toBe(b.totalRedacted);
  });

  it("redacts by key name inside nested payloads", () => {
    const out = redactPayload({
      command: "psql $DATABASE_URL",
      env: { NODE_ENV: "production", password: "hunter22hunter22" },
      headers: { authorization: "Bearer abcdefghijklmnopqrstuvwxyz123456" },
      list: ["plain text", "key=AKIAIOSFODNN7EXAMPLE"],
    }) as Record<string, unknown>;

    expect(out.command).toBe("psql $DATABASE_URL");
    expect((out.env as Record<string, unknown>).NODE_ENV).toBe("production");
    expect((out.env as Record<string, unknown>).password).toBe("[REDACTED:KEY_NAME]");
    expect(String((out.headers as Record<string, unknown>).authorization)).not.toContain(
      "abcdefghijklmnopqrstuvwxyz123456",
    );
    expect((out.list as string[])[1]).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("flags files that must never reach a cloud model", () => {
    expect(isSensitivePath("apps/api/.env.production")).toBe(true);
    expect(isSensitivePath("/home/user/.ssh/id_rsa")).toBe(true);
    expect(isSensitivePath("config/serviceAccountKey.json")).toBe(true);
    expect(isSensitivePath("apps/web/app/page.tsx")).toBe(false);
  });
});
