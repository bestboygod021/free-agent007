/** Small, deterministic localization boundary with safe fallback and RTL metadata. */

export type SupportedLocale = "fa-IR" | "en-US";
export type TextDirection = "rtl" | "ltr";

export interface MessageCatalog {
  locale: SupportedLocale;
  messages: Record<string, string>;
  version: string;
  catalogHash: string;
}

export interface ResolvedMessage {
  key: string;
  text: string;
  locale: SupportedLocale;
  fallbackUsed: boolean;
}

export class I18nContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "I18nContractError";
  }
}

export const localeDirection: Record<SupportedLocale, TextDirection> = { "fa-IR": "rtl", "en-US": "ltr" };

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function assertKey(key: string): void {
  if (!/^[a-z][a-z0-9_.-]+$/.test(key)) throw new I18nContractError(`invalid message key: ${key}`);
}

export function createCatalog(locale: SupportedLocale, version: string, messages: Record<string, string>): MessageCatalog {
  if (!version.trim()) throw new I18nContractError("catalog version is required");
  for (const [key, value] of Object.entries(messages)) {
    assertKey(key);
    if (!value.trim()) throw new I18nContractError(`empty message: ${key}`);
  }
  const ordered = Object.fromEntries(Object.entries(messages).sort(([a], [b]) => a.localeCompare(b)));
  return { locale, version, messages: structuredClone(ordered), catalogHash: hash(JSON.stringify({ locale, version, ordered })) };
}

export function resolveMessage(key: string, locale: SupportedLocale, catalogs: readonly MessageCatalog[], variables: Record<string, string | number> = {}): ResolvedMessage {
  assertKey(key);
  const preferred = catalogs.find((catalog) => catalog.locale === locale)?.messages[key];
  const fallback = catalogs.find((catalog) => catalog.locale === "en-US")?.messages[key];
  const text = preferred ?? fallback;
  if (text === undefined) throw new I18nContractError(`missing message: ${key}`);
  const rendered = text.replace(/\{\{([a-z][a-z0-9_]*)\}\}/g, (_match, name: string) => {
    const value = variables[name];
    if (value === undefined) throw new I18nContractError(`missing variable ${name} for ${key}`);
    return String(value).replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character] ?? character);
  });
  return { key, text: rendered, locale: preferred === undefined ? "en-US" : locale, fallbackUsed: preferred === undefined };
}

export function formatNumber(value: number, locale: SupportedLocale): string {
  if (!Number.isFinite(value)) throw new I18nContractError("number must be finite");
  return new Intl.NumberFormat(locale).format(value);
}

export function formatDate(timestampMs: number, locale: SupportedLocale): string {
  if (!Number.isFinite(timestampMs)) throw new I18nContractError("timestamp must be finite");
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(timestampMs));
}
