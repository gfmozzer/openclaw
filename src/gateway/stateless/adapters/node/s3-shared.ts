import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export type S3StatelessConfig = {
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  rootPrefix: string;
};

function trimSlashes(value: string): string {
  return value.replace(/^\/+/, "").replace(/\/+$/, "");
}

function readTrimmed(envValue: string | undefined): string | undefined {
  const trimmed = envValue?.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveS3StatelessConfig(
  env: NodeJS.ProcessEnv = process.env,
): S3StatelessConfig | null {
  const bucket = readTrimmed(env.OPENCLAW_S3_BUCKET);
  if (!bucket) {
    return null;
  }

  const endpoint = readTrimmed(env.OPENCLAW_S3_ENDPOINT) ?? readTrimmed(env.OPENCLAW_MINIO_ENDPOINT);
  const accessKeyId =
    readTrimmed(env.OPENCLAW_S3_ACCESS_KEY_ID) ?? readTrimmed(env.OPENCLAW_MINIO_ACCESS_KEY);
  const secretAccessKey =
    readTrimmed(env.OPENCLAW_S3_SECRET_ACCESS_KEY) ?? readTrimmed(env.OPENCLAW_MINIO_SECRET_KEY);
  const sessionToken = readTrimmed(env.OPENCLAW_S3_SESSION_TOKEN);
  const region = readTrimmed(env.OPENCLAW_S3_REGION) ?? "us-east-1";
  const rootPrefix = trimSlashes(readTrimmed(env.OPENCLAW_S3_ROOT_PREFIX) ?? "openclaw/stateless");
  const forcePathStyle =
    (readTrimmed(env.OPENCLAW_S3_FORCE_PATH_STYLE) ?? "").toLowerCase() === "1" ||
    (readTrimmed(env.OPENCLAW_S3_FORCE_PATH_STYLE) ?? "").toLowerCase() === "true" ||
    Boolean(endpoint);

  return {
    bucket,
    region,
    endpoint,
    forcePathStyle,
    accessKeyId,
    secretAccessKey,
    sessionToken,
    rootPrefix,
  };
}

export function createS3Client(config: S3StatelessConfig): S3Client {
  const hasStaticCredentials = Boolean(config.accessKeyId && config.secretAccessKey);
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    ...(hasStaticCredentials
      ? {
          credentials: {
            accessKeyId: config.accessKeyId as string,
            secretAccessKey: config.secretAccessKey as string,
            ...(config.sessionToken ? { sessionToken: config.sessionToken } : {}),
          },
        }
      : {}),
  });
}

export function encodePathPart(value: string): string {
  return encodeURIComponent(value);
}

export async function readObjectText(params: {
  client: S3Client;
  bucket: string;
  key: string;
}): Promise<string | null> {
  try {
    const response = await params.client.send(
      new GetObjectCommand({
        Bucket: params.bucket,
        Key: params.key,
      }),
    );
    if (!response.Body) {
      return null;
    }
    return await response.Body.transformToString();
  } catch (error) {
    const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw error;
  }
}

export async function writeObjectJson(params: {
  client: S3Client;
  bucket: string;
  key: string;
  value: unknown;
}): Promise<void> {
  await params.client.send(
    new PutObjectCommand({
      Bucket: params.bucket,
      Key: params.key,
      Body: JSON.stringify(params.value),
      ContentType: "application/json",
    }),
  );
}

export async function deleteObject(params: {
  client: S3Client;
  bucket: string;
  key: string;
}): Promise<void> {
  await params.client.send(
    new DeleteObjectCommand({
      Bucket: params.bucket,
      Key: params.key,
    }),
  );
}

export async function listKeys(params: {
  client: S3Client;
  bucket: string;
  prefix: string;
  continuationToken?: string;
  maxKeys?: number;
}): Promise<{ keys: string[]; continuationToken?: string }> {
  const response = await params.client.send(
    new ListObjectsV2Command({
      Bucket: params.bucket,
      Prefix: params.prefix,
      ContinuationToken: params.continuationToken,
      MaxKeys: params.maxKeys,
    }),
  );
  const keys = (response.Contents ?? []).map((item) => item.Key).filter(Boolean) as string[];
  return {
    keys,
    continuationToken: response.NextContinuationToken || undefined,
  };
}

