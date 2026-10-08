/** M188 fail-closed contracts for schema evolution and consumer compatibility. */

export type M188Compatibility = "backward" | "forward" | "full";
export type M188MigrationState = "planned" | "expanded" | "backfilled" | "contracted" | "rolled_back";

export interface M188Schema {
  organizationId: string;
  schemaId: string;
  version: number;
  fields: string[];
  compatibility: M188Compatibility;
  schemaHash: string;
  policyHash: string;
  state: "registered" | "approved" | "retired";
  tenantBound: boolean;
  approved: boolean;
}

export interface M188Migration {
  organizationId: string;
  migrationId: string;
  schemaId: string;
  fromVersion: number;
  toVersion: number;
  migrationHash: string;
  state: M188MigrationState;
  expandContract: boolean;
  backfillEvidenceHash: string;
  rollbackHash: string;
  approvalPresent: boolean;
  tenantMatch: boolean;
}

export interface M188ConsumerProof {
  organizationId: string;
  schemaId: string;
  consumerId: string;
  acceptedVersion: number;
  contractTestHash: string;
  unknownFieldPolicy: "ignore" | "reject";
  replayPassed: boolean;
  tenantMatch: boolean;
  approved: boolean;
}

export interface M188Cutover {
  organizationId: string;
  cutoverId: string;
  schemaId: string;
  targetVersion: number;
  consumerCount: number;
  allConsumersProven: boolean;
  rollbackReady: boolean;
  evidenceHash: string;
  approvalPresent: boolean;
  bounded: boolean;
  tenantMatch: boolean;
}

export interface M188SchemaDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  auditHash: string;
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(values: Array<readonly [string, string]>, reasons: string[]): void {
  for (const [value, label] of values) if (!value.trim()) reasons.push(`${label} is required`);
}

export function validateM188Schema(schema: M188Schema): M188SchemaDecision {
  const reasons: string[] = [];
  required([[schema.organizationId, "organizationId"], [schema.schemaId, "schemaId"], [schema.schemaHash, "schemaHash"], [schema.policyHash, "policyHash"]], reasons);
  if (!Number.isInteger(schema.version) || schema.version < 1 || schema.fields.length === 0 || new Set(schema.fields).size !== schema.fields.length || schema.fields.some((field) => !field.trim()) || !schema.tenantBound || (schema.state === "approved" && !schema.approved)) reasons.push("schema version, fields, approval or tenant boundary is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: schema.state === "approved", auditHash: hash(JSON.stringify({ schema, reasons })) };
}

export function decideM188Migration(migration: M188Migration): M188SchemaDecision {
  const reasons: string[] = [];
  required([[migration.organizationId, "organizationId"], [migration.migrationId, "migrationId"], [migration.schemaId, "schemaId"], [migration.migrationHash, "migrationHash"], [migration.backfillEvidenceHash, "backfillEvidenceHash"], [migration.rollbackHash, "rollbackHash"]], reasons);
  if (!Number.isInteger(migration.fromVersion) || !Number.isInteger(migration.toVersion) || migration.fromVersion < 1 || migration.toVersion <= migration.fromVersion || !migration.expandContract || !migration.approvalPresent || !migration.tenantMatch) reasons.push("migration needs increasing version, expand-contract, approval and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ migration, reasons })) };
}

export function validateM188Consumer(proof: M188ConsumerProof): M188SchemaDecision {
  const reasons: string[] = [];
  required([[proof.organizationId, "organizationId"], [proof.schemaId, "schemaId"], [proof.consumerId, "consumerId"], [proof.contractTestHash, "contractTestHash"]], reasons);
  if (!Number.isInteger(proof.acceptedVersion) || proof.acceptedVersion < 1 || !proof.replayPassed || !proof.tenantMatch || !proof.approved) reasons.push("consumer proof needs version, replay, approval and tenant evidence");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ proof, reasons })) };
}

export function decideM188Cutover(cutover: M188Cutover): M188SchemaDecision {
  const reasons: string[] = [];
  required([[cutover.organizationId, "organizationId"], [cutover.cutoverId, "cutoverId"], [cutover.schemaId, "schemaId"], [cutover.evidenceHash, "evidenceHash"]], reasons);
  if (!Number.isInteger(cutover.targetVersion) || cutover.targetVersion < 1 || !Number.isInteger(cutover.consumerCount) || cutover.consumerCount < 1 || !cutover.allConsumersProven || !cutover.rollbackReady || !cutover.approvalPresent || !cutover.bounded || !cutover.tenantMatch) reasons.push("cutover needs consumer proof, rollback, approval and bound");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ cutover, reasons })) };
}
