import { type ValidateFunction } from "ajv";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

/**
 * Output contract enforcement.
 *
 * Every agent in this platform returns structured JSON that is validated
 * against a versioned JSON Schema before anything downstream consumes it.
 * A response that does not validate is treated as a failed model call and is
 * retried / escalated — never partially interpreted.
 *
 * Schemas live in /schema and are versioned by their `$id`. `registerSchemas`
 * must be called once at boot (see schema-registry.ts) so cross-schema $refs
 * resolve.
 */

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  allowUnionTypes: true,
});
addFormats(ajv);

const compiled = new Map<string, ValidateFunction>();
const registeredIds = new Set<string>();

export function registerSchemas(schemas: readonly object[]): void {
  for (const s of schemas) {
    const id = (s as { $id?: string }).$id;
    if (!id) throw new Error("schema without $id cannot be registered");
    if (registeredIds.has(id)) continue;
    ajv.addSchema(s, id);
    registeredIds.add(id);
  }
  compiled.clear();
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

function resolve(schemaOrId: object | string): object | string {
  if (typeof schemaOrId === "string") return schemaOrId;
  const id = (schemaOrId as { $id?: string }).$id;
  if (id && registeredIds.has(id)) return id;
  return schemaOrId;
}

export function compile(schemaOrId: object | string): ValidateFunction {
  const resolved = resolve(schemaOrId);
  const key = typeof resolved === "string" ? resolved : JSON.stringify(resolved);
  const existing = compiled.get(key);
  if (existing) return existing;
  const fn =
    typeof resolved === "string" ? ajv.getSchema(resolved) : ajv.compile(resolved);
  if (!fn) {
    throw new Error(
      `schema "${key}" is not registered; import schema-registry before validating`,
    );
  }
  compiled.set(key, fn);
  return fn;
}

export function validate(schemaOrId: object | string, data: unknown): ValidationResult {
  const fn = compile(schemaOrId);
  const ok = fn(data);
  if (ok) return { ok: true, errors: [] };
  return {
    ok: false,
    errors: (fn.errors ?? []).map(
      (e) => `${e.instancePath || "(root)"} ${e.message ?? "invalid"}`,
    ),
  };
}

/**
 * Guard a model response. Returns the data typed as T when valid, otherwise a
 * structured rejection the orchestrator can feed back to the model as a
 * "your output did not match the contract" repair prompt.
 */
export function guard<T>(
  schemaOrId: object | string,
  data: unknown,
): { ok: true; data: T } | { ok: false; errors: string[] } {
  const r = validate(schemaOrId, data);
  if (r.ok) return { ok: true, data: data as T };
  return { ok: false, errors: r.errors };
}

/**
 * Best-effort extraction of a JSON value from a model message that wrapped it
 * in prose or a code fence. Deliberately narrow: it never evaluates code.
 */
export function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? raw;
  const start = candidate.search(/[[{]/);
  if (start === -1) return undefined;
  const slice = candidate.slice(start);
  try {
    return JSON.parse(slice);
  } catch {
    const lastBrace = Math.max(slice.lastIndexOf("}"), slice.lastIndexOf("]"));
    if (lastBrace === -1) return undefined;
    try {
      return JSON.parse(slice.slice(0, lastBrace + 1));
    } catch {
      return undefined;
    }
  }
}
