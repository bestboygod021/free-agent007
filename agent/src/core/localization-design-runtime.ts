/** M45 contracts for localization, RTL design tokens and degraded clients. */

export type DesignSupportedLocale = "fa-IR" | "en-US" | "ar" | "de";
export type ClientConnectivity = "online" | "degraded" | "offline";
export type ThemeMode = "light" | "dark";

export interface LocalizedMessageCatalog {
  locale: DesignSupportedLocale;
  version: string;
  fallbackLocale: DesignSupportedLocale;
  messageKeys: string[];
  translatedKeys: string[];
  numberSystem: "latn" | "arab";
  rtl: boolean;
}

export interface LocalizationDecision {
  allowed: boolean;
  reasons: string[];
  resolvedLocale: DesignSupportedLocale;
  auditHash: string;
}

export interface DesignTokenSet {
  version: string;
  theme: ThemeMode;
  direction: "ltr" | "rtl";
  colorTokens: Record<string, string>;
  spacingTokens: Record<string, number>;
  focusToken: string;
  contrastVerified: boolean;
}

export interface OfflineAction {
  organizationId: string;
  action: "read_timeline" | "comment" | "approve" | "run_start";
  idempotencyKey: string;
  queuedAt: number;
  connectivity: ClientConnectivity;
  localSnapshotHash?: string;
}

export interface PwaManifestInput {
  appId: string;
  version: string;
  startUrl: string;
  display: "standalone" | "browser";
  offlineReadModel: boolean;
  storesCredentials: boolean;
  cacheScope: string;
}

export class LocalizationDesignContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalizationDesignContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new LocalizationDesignContractError(`${label} is required`);
}

export function validateMessageCatalog(catalog: LocalizedMessageCatalog): LocalizationDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[catalog.locale, "locale"], [catalog.version, "version"], [catalog.fallbackLocale, "fallbackLocale"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (catalog.messageKeys.length === 0 || new Set(catalog.messageKeys).size !== catalog.messageKeys.length) reasons.push("message keys must be non-empty and unique");
  if (catalog.translatedKeys.some((key) => !catalog.messageKeys.includes(key))) reasons.push("translated key is not in the catalog");
  if (catalog.locale === "fa-IR" && (!catalog.rtl || catalog.numberSystem !== "arab")) reasons.push("fa-IR requires RTL and Persian number configuration");
  return { allowed: reasons.length === 0, reasons, resolvedLocale: catalog.locale, auditHash: hash(JSON.stringify({ catalog, reasons })) };
}

export function resolveLocaleFallback(requested: DesignSupportedLocale, available: readonly DesignSupportedLocale[], fallback: DesignSupportedLocale): LocalizationDecision {
  const reasons: string[] = [];
  const resolvedLocale = available.includes(requested) ? requested : available.includes(fallback) ? fallback : "en-US";
  if (available.length === 0) reasons.push("at least one locale must be available");
  if (!available.includes(requested)) reasons.push("requested locale is unavailable; fallback selected");
  if (!available.includes(fallback) && resolvedLocale === "en-US") reasons.push("configured fallback is unavailable; default fallback selected");
  return { allowed: available.length > 0, reasons, resolvedLocale, auditHash: hash(JSON.stringify({ requested, available, fallback, resolvedLocale, reasons })) };
}

export function validateDesignTokenSet(tokens: DesignTokenSet): LocalizationDecision {
  const reasons: string[] = [];
  required(tokens.version, "token version");
  required(tokens.focusToken, "focus token");
  if (Object.keys(tokens.colorTokens).length === 0 || Object.keys(tokens.spacingTokens).length === 0) reasons.push("design token sets cannot be empty");
  if (tokens.direction === "rtl" && tokens.spacingTokens["inline-start"] === undefined) reasons.push("RTL token set requires inline-start spacing");
  if (!tokens.contrastVerified) reasons.push("contrast verification is required");
  return { allowed: reasons.length === 0, reasons, resolvedLocale: tokens.direction === "rtl" ? "fa-IR" : "en-US", auditHash: hash(JSON.stringify({ tokens, reasons })) };
}

export function decideOfflineAction(action: OfflineAction): LocalizationDecision {
  const reasons: string[] = [];
  required(action.organizationId, "organizationId");
  required(action.idempotencyKey, "idempotencyKey");
  if (!Number.isFinite(action.queuedAt)) reasons.push("queuedAt must be finite");
  if (action.connectivity === "offline" && ["approve", "run_start"].includes(action.action)) reasons.push("mutating or approval action cannot execute offline");
  if (action.connectivity !== "online" && !action.localSnapshotHash) reasons.push("degraded/offline read requires a local snapshot");
  return { allowed: reasons.length === 0, reasons, resolvedLocale: "en-US", auditHash: hash(JSON.stringify({ action, reasons })) };
}

export function validatePwaManifest(manifest: PwaManifestInput): LocalizationDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[manifest.appId, "appId"], [manifest.version, "version"], [manifest.startUrl, "startUrl"], [manifest.cacheScope, "cacheScope"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!manifest.startUrl.startsWith("/")) reasons.push("PWA startUrl must be relative");
  if (manifest.storesCredentials) reasons.push("PWA must not store credentials");
  if (manifest.offlineReadModel && !manifest.cacheScope.startsWith("tenant:")) reasons.push("offline cache must be tenant-scoped");
  return { allowed: reasons.length === 0, reasons, resolvedLocale: "en-US", auditHash: hash(JSON.stringify({ manifest, reasons })) };
}
