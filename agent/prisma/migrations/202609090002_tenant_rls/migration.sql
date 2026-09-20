-- ForgePilot reference migration 002: database-enforced tenant boundary.
--
-- The API must set this transaction-local setting immediately after acquiring a
-- connection:
--   SELECT set_config('app.organization_id', $1, true);
--
-- `true` is essential: the setting disappears at transaction end and cannot
-- leak from one pooled request into the next request.

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_organization_id()
RETURNS TEXT
LANGUAGE sql
STABLE
STRICT
AS $$
  SELECT NULLIF(current_setting('app.organization_id', true), '');
$$;

COMMENT ON FUNCTION app.current_organization_id() IS
  'Returns the transaction-local tenant selected by the trusted API boundary.';

-- A parent-child check is needed in addition to RLS. RLS can prove that both
-- rows are visible to the current tenant, but a forged organization_id on a
-- child row could otherwise point at a parent from another tenant by ID.
CREATE OR REPLACE FUNCTION app.assert_same_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
AS $$
DECLARE
  parent_organization_id TEXT;
BEGIN
  IF TG_TABLE_NAME = 'agent_runs' THEN
    SELECT p.organization_id INTO parent_organization_id FROM public.projects p WHERE p.id = NEW.project_id;
  ELSIF TG_TABLE_NAME = 'agent_tasks' THEN
    SELECT r.organization_id INTO parent_organization_id FROM public.agent_runs r WHERE r.id = NEW.run_id;
  ELSIF TG_TABLE_NAME = 'secret_references' AND NEW.connector_id IS NOT NULL THEN
    SELECT c.organization_id INTO parent_organization_id FROM public.connectors c WHERE c.id = NEW.connector_id;
  ELSIF TG_TABLE_NAME = 'approvals' THEN
    SELECT r.organization_id INTO parent_organization_id FROM public.agent_runs r WHERE r.id = NEW.run_id;
  ELSIF TG_TABLE_NAME = 'tool_calls' THEN
    SELECT r.organization_id INTO parent_organization_id FROM public.agent_runs r WHERE r.id = NEW.run_id;
    IF parent_organization_id IS NULL AND NEW.connector_id IS NOT NULL THEN
      SELECT c.organization_id INTO parent_organization_id FROM public.connectors c WHERE c.id = NEW.connector_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'test_runs' THEN
    SELECT r.organization_id INTO parent_organization_id FROM public.agent_runs r WHERE r.id = NEW.run_id;
  ELSIF TG_TABLE_NAME = 'system_events' THEN
    SELECT r.organization_id INTO parent_organization_id FROM public.agent_runs r WHERE r.id = NEW.run_id;
    IF parent_organization_id IS NOT NULL AND parent_organization_id <> NEW.tenant_id THEN
      RAISE EXCEPTION 'system event tenant_id does not match run organization'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF parent_organization_id IS NOT NULL AND parent_organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'cross-tenant parent reference is not allowed'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER agent_runs_same_organization
  BEFORE INSERT OR UPDATE OF project_id, organization_id ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION app.assert_same_organization();
CREATE TRIGGER agent_tasks_same_organization
  BEFORE INSERT OR UPDATE OF run_id, organization_id ON public.agent_tasks
  FOR EACH ROW EXECUTE FUNCTION app.assert_same_organization();
CREATE TRIGGER secret_references_same_organization
  BEFORE INSERT OR UPDATE OF connector_id, organization_id ON public.secret_references
  FOR EACH ROW EXECUTE FUNCTION app.assert_same_organization();
CREATE TRIGGER approvals_same_organization
  BEFORE INSERT OR UPDATE OF run_id, organization_id ON public.approvals
  FOR EACH ROW EXECUTE FUNCTION app.assert_same_organization();
CREATE TRIGGER tool_calls_same_organization
  BEFORE INSERT OR UPDATE OF run_id, connector_id, organization_id ON public.tool_calls
  FOR EACH ROW EXECUTE FUNCTION app.assert_same_organization();
CREATE TRIGGER test_runs_same_organization
  BEFORE INSERT OR UPDATE OF run_id, organization_id ON public.test_runs
  FOR EACH ROW EXECUTE FUNCTION app.assert_same_organization();
CREATE TRIGGER system_events_same_organization
  BEFORE INSERT OR UPDATE OF run_id, tenant_id ON public.system_events
  FOR EACH ROW EXECUTE FUNCTION app.assert_same_organization();

-- Enable and force RLS so even a table owner cannot accidentally bypass the
-- policy during an application request. Migrations and break-glass tooling
-- must use an explicitly separate database role.
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY organizations_tenant_isolation ON public.organizations
  USING (id = app.current_organization_id())
  WITH CHECK (id = app.current_organization_id());

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'organization_members', 'projects', 'agent_runs', 'agent_tasks',
    'connectors', 'secret_references', 'approvals', 'tool_calls',
    'audit_logs', 'test_runs'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I USING (organization_id = app.current_organization_id()) WITH CHECK (organization_id = app.current_organization_id())',
      table_name || '_tenant_isolation', table_name
    );
  END LOOP;
END;
$$;

ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_events FORCE ROW LEVEL SECURITY;
CREATE POLICY system_events_tenant_read ON public.system_events
  FOR SELECT USING (tenant_id = app.current_organization_id());
CREATE POLICY system_events_tenant_append ON public.system_events
  FOR INSERT WITH CHECK (tenant_id = app.current_organization_id());

-- Audit and event streams are append-only through the application role. No
-- UPDATE or DELETE policy is intentionally created for either table.
COMMENT ON TABLE public.audit_logs IS 'Append-only tenant audit stream; RLS has no UPDATE/DELETE policy.';
COMMENT ON TABLE public.system_events IS 'Append-only tenant event stream; RLS has no UPDATE/DELETE policy.';

-- Do not give ordinary pooled application roles a bypass path. The deployment
-- role that runs Prisma migrations is separate from the runtime role.
REVOKE ALL ON FUNCTION app.current_organization_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_organization_id() TO PUBLIC;
