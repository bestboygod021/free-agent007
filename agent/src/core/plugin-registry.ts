/** Signed, compatibility-checked plugin metadata. Registration never executes code. */

export type PluginTrust = "builtin" | "verified" | "private" | "unverified" | "revoked";

export interface PluginManifest {
  pluginId: string;
  version: string;
  sdkVersion: string;
  organizationId?: string;
  capabilities: string[];
  requestedScopes: string[];
  runtime: "sandbox" | "wasm" | "external_adapter";
  packageDigest: string;
  signature: string;
  license: string;
  compatibility: { minPlatformVersion: string; maxPlatformVersion?: string };
  trust: PluginTrust;
  manifestHash: string;
}

export interface PluginInstallRequest {
  organizationId: string;
  platformVersion: string;
  requestedCapabilities: string[];
  requestedScopes: string[];
  allowPrivate: boolean;
}

export interface PluginDecision {
  allowed: boolean;
  reasons: string[];
  manifestHash: string;
  executionBoundary: "none" | "sandbox";
}

export class PluginRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluginRegistryError";
  }
}

function versionParts(version: string): number[] {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) throw new PluginRegistryError(`invalid semver: ${version}`);
  return match.slice(1).map(Number);
}

function lessOrEqual(left: string, right: string): boolean {
  const [aMajor, aMinor, aPatch] = versionParts(left);
  const [bMajor, bMinor, bPatch] = versionParts(right);
  const majorA = aMajor ?? 0; const minorA = aMinor ?? 0; const patchA = aPatch ?? 0;
  const majorB = bMajor ?? 0; const minorB = bMinor ?? 0; const patchB = bPatch ?? 0;
  return majorA < majorB || (majorA === majorB && (minorA < minorB || (minorA === minorB && patchA <= patchB)));
}

export function validatePluginManifest(manifest: PluginManifest): void {
  for (const [value, label] of [[manifest.pluginId, "pluginId"], [manifest.version, "version"], [manifest.sdkVersion, "sdkVersion"], [manifest.packageDigest, "packageDigest"], [manifest.signature, "signature"], [manifest.license, "license"], [manifest.manifestHash, "manifestHash"] as const]) {
    if (!value.trim()) throw new PluginRegistryError(`${label} is required`);
  }
  if (!Array.isArray(manifest.capabilities) || !Array.isArray(manifest.requestedScopes)) throw new PluginRegistryError("capabilities and scopes must be arrays");
  versionParts(manifest.version);
  versionParts(manifest.compatibility.minPlatformVersion);
  if (manifest.compatibility.maxPlatformVersion) versionParts(manifest.compatibility.maxPlatformVersion);
  if (manifest.runtime !== "sandbox" && manifest.trust !== "builtin") throw new PluginRegistryError("untrusted plugins must run in sandbox");
  if (manifest.trust === "unverified" || manifest.trust === "revoked") throw new PluginRegistryError(`plugin trust ${manifest.trust} cannot execute`);
  if (manifest.capabilities.some((capability) => /host\.exec|docker|credential\.read_raw|captcha\.solve|mfa\.bypass/i.test(capability))) {
    throw new PluginRegistryError("plugin requests a hard-denied capability");
  }
}

export function planPluginInstall(manifest: PluginManifest, request: PluginInstallRequest, signatureVerifier: (manifest: PluginManifest) => boolean): PluginDecision {
  const reasons: string[] = [];
  let validManifest = true;
  try { validatePluginManifest(manifest); } catch (error) {
    validManifest = false;
    reasons.push(error instanceof Error ? error.message : "invalid manifest");
  }
  try {
    if (!signatureVerifier(manifest)) reasons.push("signature verification failed");
  } catch {
    reasons.push("signature verification failed");
  }
  if (manifest.organizationId && manifest.organizationId !== request.organizationId) reasons.push("private plugin belongs to another organization");
  if (manifest.trust === "private" && !request.allowPrivate) reasons.push("private plugins are disabled by policy");
  if (validManifest) {
    try {
      if (!lessOrEqual(manifest.compatibility.minPlatformVersion, request.platformVersion)) reasons.push("platform is older than plugin minimum");
      if (manifest.compatibility.maxPlatformVersion && !lessOrEqual(request.platformVersion, manifest.compatibility.maxPlatformVersion)) reasons.push("platform is newer than plugin maximum");
    } catch {
      reasons.push("invalid platform version");
    }
  }
  const declaredCapabilities = Array.isArray(manifest.capabilities) ? manifest.capabilities : [];
  const declaredScopes = Array.isArray(manifest.requestedScopes) ? manifest.requestedScopes : [];
  for (const capability of request.requestedCapabilities) if (!declaredCapabilities.includes(capability)) reasons.push(`capability not declared: ${capability}`);
  for (const scope of request.requestedScopes) if (!declaredScopes.includes(scope)) reasons.push(`scope not declared: ${scope}`);
  return {
    allowed: reasons.length === 0,
    reasons,
    manifestHash: manifest.manifestHash,
    executionBoundary: reasons.length === 0 ? "sandbox" : "none",
  };
}
