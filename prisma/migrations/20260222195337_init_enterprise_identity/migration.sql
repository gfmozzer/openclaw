-- CreateTable
CREATE TABLE "enterprise_principals" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "principalId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_principals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_identity_bindings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "principalId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_identity_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_grants" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "principalId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enterprise_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "enterprise_principals_tenantId_role_idx" ON "enterprise_principals"("tenantId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_principals_tenantId_principalId_key" ON "enterprise_principals"("tenantId", "principalId");

-- CreateIndex
CREATE INDEX "channel_identity_bindings_tenantId_principalId_idx" ON "channel_identity_bindings"("tenantId", "principalId");

-- CreateIndex
CREATE UNIQUE INDEX "channel_identity_bindings_tenantId_channelId_accountId_subj_key" ON "channel_identity_bindings"("tenantId", "channelId", "accountId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_grants_tenantId_principalId_resource_action_key" ON "enterprise_grants"("tenantId", "principalId", "resource", "action");

-- AddForeignKey
ALTER TABLE "enterprise_principals" ADD CONSTRAINT "enterprise_principals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_identity_bindings" ADD CONSTRAINT "channel_identity_bindings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_identity_bindings" ADD CONSTRAINT "channel_identity_bindings_principalId_fkey" FOREIGN KEY ("principalId") REFERENCES "enterprise_principals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_grants" ADD CONSTRAINT "enterprise_grants_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_grants" ADD CONSTRAINT "enterprise_grants_principalId_fkey" FOREIGN KEY ("principalId") REFERENCES "enterprise_principals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
