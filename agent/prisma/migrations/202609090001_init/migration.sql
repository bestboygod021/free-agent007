-- ForgePilot reference migration 001: durable PostgreSQL data model.
--
-- This migration is intentionally explicit rather than generated at runtime.
-- It contains no raw password/credential column: SecretReference stores only a
-- vault pointer. Tenant isolation is added in migration 002.

CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');
CREATE TYPE "PrivacyLevel" AS ENUM ('PUBLIC', 'INTERNAL', 'PRIVATE', 'CONFIDENTIAL');
CREATE TYPE "ComputeMode" AS ENUM ('FREE', 'PAID', 'LOCAL');
CREATE TYPE "AutonomyLevel" AS ENUM ('READONLY', 'SUPERVISED', 'AUTONOMOUS_BRANCH', 'FULL');
CREATE TYPE "RunState" AS ENUM (
  'INTAKE', 'CLARIFY', 'SPECIFY', 'PLAN', 'AWAITING_PLAN_APPROVAL',
  'RECON', 'IMPLEMENT', 'TEST', 'REPAIR', 'SECURITY_REVIEW', 'PREVIEW',
  'AWAITING_DEPLOY_APPROVAL', 'DEPLOY', 'VERIFY', 'FINALIZE', 'DONE',
  'FAILED', 'CANCELLED', 'BLOCKED'
);
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'READY', 'RUNNING', 'BLOCKED', 'NEEDS_REPAIR', 'COMPLETED', 'FAILED', 'SKIPPED');
CREATE TYPE "TaskType" AS ENUM ('REPO_ANALYSIS', 'SCAFFOLD', 'DATABASE', 'BACKEND', 'FRONTEND', 'INTEGRATION', 'TEST', 'SECURITY', 'DEVOPS', 'DOCS', 'BROWSER');
CREATE TYPE "RiskLevel" AS ENUM ('READ', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "SideEffectClass" AS ENUM ('NONE', 'LOCAL_WRITE', 'EXTERNAL_WRITE', 'DESTRUCTIVE', 'BILLING', 'CREDENTIAL', 'PRODUCTION');
CREATE TYPE "ConnectorStatus" AS ENUM ('DISCONNECTED', 'CONNECTING', 'CONNECTED', 'EXPIRED', 'REVOKED', 'ERROR');
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');
CREATE TYPE "ActorType" AS ENUM ('USER', 'AGENT', 'SYSTEM', 'CONNECTOR');

CREATE TABLE "users" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "avatar_url" TEXT,
  "locale" TEXT NOT NULL DEFAULT 'fa-IR',
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
  "password_hash" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "organizations" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "owner_id" TEXT NOT NULL,
  "plan" TEXT NOT NULL DEFAULT 'free',
  "privacy_level" "PrivacyLevel" NOT NULL DEFAULT 'PRIVATE',
  "autonomy" "AutonomyLevel" NOT NULL DEFAULT 'SUPERVISED',
  "compute_mode" "ComputeMode" NOT NULL DEFAULT 'FREE',
  "settings" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

CREATE TABLE "organization_members" (
  "organization_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'MEMBER',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_members_pkey" PRIMARY KEY ("organization_id", "user_id"),
  CONSTRAINT "organization_members_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "organization_members_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "organization_members_user_id_idx" ON "organization_members"("user_id");

CREATE TABLE "projects" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "stack" JSONB,
  "repository_id" TEXT,
  "repository_url" TEXT,
  "default_branch" TEXT NOT NULL DEFAULT 'main',
  "privacy_level" "PrivacyLevel" NOT NULL DEFAULT 'PRIVATE',
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "projects_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "projects_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "projects_organization_id_name_key" ON "projects"("organization_id", "name");
CREATE INDEX "projects_organization_id_idx" ON "projects"("organization_id");

CREATE TABLE "agent_runs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "user_request" TEXT NOT NULL,
  "status" "RunState" NOT NULL DEFAULT 'INTAKE',
  "current_state" "RunState" NOT NULL DEFAULT 'INTAKE',
  "working_branch" TEXT,
  "model_policy" JSONB NOT NULL DEFAULT '{}',
  "autonomy_level" "AutonomyLevel" NOT NULL DEFAULT 'SUPERVISED',
  "compute_mode" "ComputeMode" NOT NULL DEFAULT 'FREE',
  "mode_profile_hash" TEXT,
  "plan_hash" TEXT,
  "repair_attempts" INTEGER NOT NULL DEFAULT 0,
  "max_repair_attempts" INTEGER NOT NULL DEFAULT 3,
  "tokens_used" INTEGER NOT NULL DEFAULT 0,
  "hard_stop_tokens" INTEGER,
  "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMPTZ(3),
  "failure_reason" TEXT,
  "block_reason" TEXT,
  CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_runs_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agent_runs_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "agent_runs_project_id_status_idx" ON "agent_runs"("project_id", "status");
CREATE INDEX "agent_runs_organization_id_idx" ON "agent_runs"("organization_id");

CREATE TABLE "agent_tasks" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "external_task_id" TEXT NOT NULL,
  "parent_task_id" TEXT,
  "type" "TaskType" NOT NULL,
  "title" TEXT NOT NULL,
  "objective" TEXT NOT NULL,
  "acceptance_criteria" JSONB NOT NULL,
  "allowed_paths" JSONB NOT NULL,
  "locked_paths" JSONB,
  "forbidden_actions" JSONB NOT NULL,
  "definition_of_done" JSONB,
  "dependencies" JSONB NOT NULL DEFAULT '[]',
  "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "assigned_agent" TEXT,
  "risk_level" "RiskLevel" NOT NULL DEFAULT 'LOW',
  "approval_required" BOOLEAN NOT NULL DEFAULT false,
  "estimated_tokens" INTEGER,
  "result" JSONB,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "started_at" TIMESTAMPTZ(3),
  "finished_at" TIMESTAMPTZ(3),
  CONSTRAINT "agent_tasks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_tasks_run_id_fkey"
    FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agent_tasks_parent_task_id_fkey"
    FOREIGN KEY ("parent_task_id") REFERENCES "agent_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "agent_tasks_run_id_external_task_id_key" ON "agent_tasks"("run_id", "external_task_id");
CREATE INDEX "agent_tasks_run_id_status_idx" ON "agent_tasks"("run_id", "status");
CREATE INDEX "agent_tasks_organization_id_idx" ON "agent_tasks"("organization_id");

CREATE TABLE "connectors" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "connector_version" TEXT NOT NULL,
  "auth_type" TEXT NOT NULL,
  "scopes" JSONB NOT NULL,
  "status" "ConnectorStatus" NOT NULL DEFAULT 'DISCONNECTED',
  "installation_id" TEXT,
  "last_used_at" TIMESTAMPTZ(3),
  "expires_at" TIMESTAMPTZ(3),
  "risk_level" "RiskLevel" NOT NULL DEFAULT 'MEDIUM',
  "commercial_license" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "connectors_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "connectors_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "connectors_organization_id_provider_key" ON "connectors"("organization_id", "provider");

CREATE TABLE "secret_references" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "connector_id" TEXT,
  "name" TEXT NOT NULL,
  "vault_path" TEXT NOT NULL,
  "key_version" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(3),
  "rotated_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "secret_references_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "secret_references_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "secret_references_connector_id_fkey"
    FOREIGN KEY ("connector_id") REFERENCES "connectors"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "secret_references_organization_id_name_key" ON "secret_references"("organization_id", "name");

CREATE TABLE "approvals" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "risk_level" "RiskLevel" NOT NULL DEFAULT 'MEDIUM',
  "requested_scope" JSONB NOT NULL,
  "payload_hash" TEXT NOT NULL,
  "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "decided_by" TEXT,
  "decided_at" TIMESTAMPTZ(3),
  "expires_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "approvals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "approvals_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "approvals_run_id_fkey"
    FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "approvals_decided_by_fkey"
    FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "approvals_run_id_status_idx" ON "approvals"("run_id", "status");

CREATE TABLE "tool_calls" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "connector_id" TEXT,
  "agent_id" TEXT NOT NULL,
  "prompt_version" TEXT NOT NULL,
  "tool_name" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "side_effect" "SideEffectClass" NOT NULL,
  "risk_level" "RiskLevel" NOT NULL,
  "reversible" BOOLEAN NOT NULL DEFAULT true,
  "input_hash" TEXT NOT NULL,
  "output_hash" TEXT,
  "status" TEXT NOT NULL,
  "approval_id" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "denial_reason" TEXT,
  "duration_ms" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tool_calls_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tool_calls_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tool_calls_run_id_fkey"
    FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tool_calls_connector_id_fkey"
    FOREIGN KEY ("connector_id") REFERENCES "connectors"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "tool_calls_idempotency_key_key" ON "tool_calls"("idempotency_key");
CREATE INDEX "tool_calls_run_id_created_at_idx" ON "tool_calls"("run_id", "created_at");

CREATE TABLE "audit_logs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "actor_type" "ActorType" NOT NULL,
  "actor_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "resource_type" TEXT,
  "resource_id" TEXT,
  "metadata" JSONB,
  "ip_hash" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_logs_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

CREATE TABLE "test_runs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "task_id" TEXT,
  "command" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "exit_code" INTEGER NOT NULL,
  "duration_ms" INTEGER,
  "logs_ref" TEXT,
  "summary" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "test_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "test_runs_run_id_fkey"
    FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "test_runs_run_id_idx" ON "test_runs"("run_id");
CREATE INDEX "test_runs_organization_id_idx" ON "test_runs"("organization_id");

CREATE TABLE "system_events" (
  "id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "schema_version" INTEGER NOT NULL DEFAULT 1,
  "run_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "actor_type" "ActorType" NOT NULL DEFAULT 'SYSTEM',
  "actor_id" TEXT,
  "parent_event_id" TEXT,
  "payload" JSONB NOT NULL,
  "redacted" BOOLEAN NOT NULL DEFAULT false,
  "timestamp" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "system_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "system_events_event_id_key" UNIQUE ("event_id"),
  CONSTRAINT "system_events_run_id_fkey"
    FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "system_events_run_id_timestamp_idx" ON "system_events"("run_id", "timestamp");

-- These indexes support the RLS predicates from migration 002 and make the
-- tenant boundary cheap before the application reaches a large dataset.
CREATE INDEX "agent_runs_organization_id_project_id_idx" ON "agent_runs"("organization_id", "project_id");
CREATE INDEX "agent_tasks_organization_id_run_id_idx" ON "agent_tasks"("organization_id", "run_id");
CREATE INDEX "approvals_organization_id_run_id_idx" ON "approvals"("organization_id", "run_id");
CREATE INDEX "tool_calls_organization_id_run_id_idx" ON "tool_calls"("organization_id", "run_id");
CREATE INDEX "test_runs_organization_id_run_id_idx" ON "test_runs"("organization_id", "run_id");

-- Prisma's @updatedAt is maintained by the client. This trigger is a safety
-- net for SQL writers and is deliberately limited to tables with updated_at.
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER users_touch_updated_at
  BEFORE UPDATE ON "users" FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER organizations_touch_updated_at
  BEFORE UPDATE ON "organizations" FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER projects_touch_updated_at
  BEFORE UPDATE ON "projects" FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
