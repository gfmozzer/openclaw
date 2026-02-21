-- Tenant RLS baseline for enterprise isolation.
-- The application must set `SET app.tenant_id = ''<tenant-uuid>''` per request/transaction.

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')
$$;

ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_tenants ON "tenants";
CREATE POLICY tenant_isolation_tenants ON "tenants"
  USING (id = public.current_tenant_id())
  WITH CHECK (id = public.current_tenant_id());

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_users ON "users";
CREATE POLICY tenant_isolation_users ON "users"
  USING ("tenantId" = public.current_tenant_id())
  WITH CHECK ("tenantId" = public.current_tenant_id());

ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roles" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_roles ON "roles";
CREATE POLICY tenant_isolation_roles ON "roles"
  USING ("tenantId" = public.current_tenant_id())
  WITH CHECK ("tenantId" = public.current_tenant_id());

ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_roles" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_user_roles ON "user_roles";
CREATE POLICY tenant_isolation_user_roles ON "user_roles"
  USING ("tenantId" = public.current_tenant_id())
  WITH CHECK ("tenantId" = public.current_tenant_id());

ALTER TABLE "agents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agents" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_agents ON "agents";
CREATE POLICY tenant_isolation_agents ON "agents"
  USING ("tenantId" = public.current_tenant_id())
  WITH CHECK ("tenantId" = public.current_tenant_id());

ALTER TABLE "swarm_teams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "swarm_teams" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_swarm_teams ON "swarm_teams";
CREATE POLICY tenant_isolation_swarm_teams ON "swarm_teams"
  USING ("tenantId" = public.current_tenant_id())
  WITH CHECK ("tenantId" = public.current_tenant_id());

ALTER TABLE "swarm_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "swarm_memberships" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_swarm_memberships ON "swarm_memberships";
CREATE POLICY tenant_isolation_swarm_memberships ON "swarm_memberships"
  USING ("tenantId" = public.current_tenant_id())
  WITH CHECK ("tenantId" = public.current_tenant_id());

ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_sessions ON "sessions";
CREATE POLICY tenant_isolation_sessions ON "sessions"
  USING ("tenantId" = public.current_tenant_id())
  WITH CHECK ("tenantId" = public.current_tenant_id());

ALTER TABLE "memory_interactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memory_interactions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_memory_interactions ON "memory_interactions";
CREATE POLICY tenant_isolation_memory_interactions ON "memory_interactions"
  USING ("tenantId" = public.current_tenant_id())
  WITH CHECK ("tenantId" = public.current_tenant_id());

ALTER TABLE "temporal_job_trackers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "temporal_job_trackers" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_temporal_job_trackers ON "temporal_job_trackers";
CREATE POLICY tenant_isolation_temporal_job_trackers ON "temporal_job_trackers"
  USING ("tenantId" = public.current_tenant_id())
  WITH CHECK ("tenantId" = public.current_tenant_id());

ALTER TABLE "provider_overrides" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "provider_overrides" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_provider_overrides ON "provider_overrides";
CREATE POLICY tenant_isolation_provider_overrides ON "provider_overrides"
  USING ("tenantId" = public.current_tenant_id())
  WITH CHECK ("tenantId" = public.current_tenant_id());

ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_audit_events ON "audit_events";
CREATE POLICY tenant_isolation_audit_events ON "audit_events"
  USING ("tenantId" = public.current_tenant_id())
  WITH CHECK ("tenantId" = public.current_tenant_id());

ALTER TABLE "idempotency_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "idempotency_records" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_idempotency_records ON "idempotency_records";
CREATE POLICY tenant_isolation_idempotency_records ON "idempotency_records"
  USING ("tenantId" = public.current_tenant_id())
  WITH CHECK ("tenantId" = public.current_tenant_id());
