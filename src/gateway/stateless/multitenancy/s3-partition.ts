import { normalizeTenantId } from "./tenant-context.js";

export type TenantS3Layout = {
  bucket: string;
  memoriesPrefix: string;
  exportsPrefix: string;
  attachmentsPrefix: string;
};

function trimPath(value: string): string {
  return value.replace(/^\/+/, "").replace(/\/+$/, "");
}

export function buildTenantS3Layout(params: {
  bucket: string;
  tenantId: string;
  rootPrefix?: string;
}): TenantS3Layout {
  const bucket = params.bucket.trim();
  if (!bucket) {
    throw new Error("bucket is required");
  }
  const tenantId = normalizeTenantId(params.tenantId);
  const rootPrefix = trimPath(params.rootPrefix?.trim() || "memories");
  const tenantRoot = `${rootPrefix}/${tenantId}`;
  return {
    bucket,
    memoriesPrefix: `${tenantRoot}/`,
    exportsPrefix: `${tenantRoot}/exports/`,
    attachmentsPrefix: `${tenantRoot}/attachments/`,
  };
}

export function buildTenantS3Uri(params: {
  bucket: string;
  tenantId: string;
  key: string;
  rootPrefix?: string;
}): string {
  const layout = buildTenantS3Layout(params);
  const key = trimPath(params.key);
  return `s3://${layout.bucket}/${layout.memoriesPrefix}${key}`;
}

