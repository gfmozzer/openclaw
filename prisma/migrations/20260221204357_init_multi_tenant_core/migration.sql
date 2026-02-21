-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scopes" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","roleId","tenantId")
);

-- CreateTable
CREATE TABLE "role_scopes" (
    "roleId" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,

    CONSTRAINT "role_scopes_pkey" PRIMARY KEY ("roleId","scopeId")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultModel" TEXT,
    "systemPrompt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_skills" (
    "agentId" TEXT NOT NULL,
    "skillName" TEXT NOT NULL,

    CONSTRAINT "agent_skills_pkey" PRIMARY KEY ("agentId","skillName")
);

-- CreateTable
CREATE TABLE "swarm_teams" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,

    CONSTRAINT "swarm_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "swarm_memberships" (
    "teamId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,

    CONSTRAINT "swarm_memberships_pkey" PRIMARY KEY ("teamId","workerId","tenantId")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_interactions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memory_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "embeddings" (
    "id" TEXT NOT NULL,
    "interactionId" TEXT NOT NULL,
    "vector" vector(1536) NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "temporal_job_trackers" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "targetAgentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "temporal_job_trackers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_overrides" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "apiKeyE" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requesterId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentId" TEXT,
    "operation" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "response" JSONB,
    "error" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_email_key" ON "users"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "users_id_tenantId_key" ON "users"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenantId_name_key" ON "roles"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "roles_id_tenantId_key" ON "roles"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "scopes_action_key" ON "scopes"("action");

-- CreateIndex
CREATE UNIQUE INDEX "agents_tenantId_name_key" ON "agents"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "agents_id_tenantId_key" ON "agents"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "swarm_teams_tenantId_name_key" ON "swarm_teams"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "swarm_teams_id_tenantId_key" ON "swarm_teams"("id", "tenantId");

-- CreateIndex
CREATE INDEX "sessions_tenantId_requesterId_updatedAt_idx" ON "sessions"("tenantId", "requesterId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_id_tenantId_key" ON "sessions"("id", "tenantId");

-- CreateIndex
CREATE INDEX "memory_interactions_tenantId_sessionId_createdAt_idx" ON "memory_interactions"("tenantId", "sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "temporal_job_trackers_tenantId_status_updatedAt_idx" ON "temporal_job_trackers"("tenantId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "temporal_job_trackers_tenantId_jobId_key" ON "temporal_job_trackers"("tenantId", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "temporal_job_trackers_tenantId_workflowId_key" ON "temporal_job_trackers"("tenantId", "workflowId");

-- CreateIndex
CREATE UNIQUE INDEX "temporal_job_trackers_tenantId_correlationId_key" ON "temporal_job_trackers"("tenantId", "correlationId");

-- CreateIndex
CREATE INDEX "provider_overrides_tenantId_requesterId_provider_idx" ON "provider_overrides"("tenantId", "requesterId", "provider");

-- CreateIndex
CREATE INDEX "idempotency_records_tenantId_status_expiresAt_idx" ON "idempotency_records"("tenantId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_tenantId_operation_requestKey_key" ON "idempotency_records"("tenantId", "operation", "requestKey");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_tenantId_fkey" FOREIGN KEY ("userId", "tenantId") REFERENCES "users"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_tenantId_fkey" FOREIGN KEY ("roleId", "tenantId") REFERENCES "roles"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_scopes" ADD CONSTRAINT "role_scopes_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_scopes" ADD CONSTRAINT "role_scopes_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "scopes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swarm_teams" ADD CONSTRAINT "swarm_teams_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swarm_teams" ADD CONSTRAINT "swarm_teams_managerId_tenantId_fkey" FOREIGN KEY ("managerId", "tenantId") REFERENCES "agents"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swarm_memberships" ADD CONSTRAINT "swarm_memberships_teamId_tenantId_fkey" FOREIGN KEY ("teamId", "tenantId") REFERENCES "swarm_teams"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swarm_memberships" ADD CONSTRAINT "swarm_memberships_workerId_tenantId_fkey" FOREIGN KEY ("workerId", "tenantId") REFERENCES "agents"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swarm_memberships" ADD CONSTRAINT "swarm_memberships_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_requesterId_tenantId_fkey" FOREIGN KEY ("requesterId", "tenantId") REFERENCES "users"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_interactions" ADD CONSTRAINT "memory_interactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_interactions" ADD CONSTRAINT "memory_interactions_sessionId_tenantId_fkey" FOREIGN KEY ("sessionId", "tenantId") REFERENCES "sessions"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "memory_interactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temporal_job_trackers" ADD CONSTRAINT "temporal_job_trackers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temporal_job_trackers" ADD CONSTRAINT "temporal_job_trackers_requesterId_tenantId_fkey" FOREIGN KEY ("requesterId", "tenantId") REFERENCES "users"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temporal_job_trackers" ADD CONSTRAINT "temporal_job_trackers_targetAgentId_tenantId_fkey" FOREIGN KEY ("targetAgentId", "tenantId") REFERENCES "agents"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_overrides" ADD CONSTRAINT "provider_overrides_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_overrides" ADD CONSTRAINT "provider_overrides_requesterId_tenantId_fkey" FOREIGN KEY ("requesterId", "tenantId") REFERENCES "users"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
