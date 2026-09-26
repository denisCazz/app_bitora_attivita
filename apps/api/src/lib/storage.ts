import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomBytes } from "node:crypto";
import { env } from "../env";

const uploadDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../uploads");

function s3Client(s3: NonNullable<typeof env.s3>) {
  return new S3Client({
    region: s3.region,
    endpoint: s3.endpoint,
    credentials: { accessKeyId: s3.accessKey, secretAccessKey: s3.secretKey },
    forcePathStyle: true,
  });
}

export async function saveUpload(fileName: string, mimeType: string, data: Buffer): Promise<string> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `${Date.now()}-${randomBytes(4).toString("hex")}-${safeName}`;
  if (env.s3) {
    const client = s3Client(env.s3);
    await client.send(
      new PutObjectCommand({
        Bucket: env.s3.bucket,
        Key: key,
        Body: data,
        ContentType: mimeType,
      }),
    );
    const base = env.s3.endpoint?.replace(/\/$/, "") ?? env.publicBaseUrl;
    return `${base}/${env.s3.bucket}/${key}`;
  }
  await mkdir(uploadDir, { recursive: true });
  await writeFile(resolve(uploadDir, key), data);
  return `${env.publicBaseUrl}/uploads/${key}`;
}

/** Only touches files this server wrote; foreign URLs are ignored. */
export async function removeUpload(url: string): Promise<void> {
  const localPrefix = `${env.publicBaseUrl}/uploads/`;
  if (url.startsWith(localPrefix)) {
    await rm(resolve(uploadDir, basename(url.slice(localPrefix.length))), { force: true });
    return;
  }
  if (!env.s3) return;
  const base = env.s3.endpoint?.replace(/\/$/, "") ?? env.publicBaseUrl;
  const bucketPrefix = `${base}/${env.s3.bucket}/`;
  if (!url.startsWith(bucketPrefix)) return;
  await s3Client(env.s3).send(new DeleteObjectCommand({ Bucket: env.s3.bucket, Key: url.slice(bucketPrefix.length) }));
}

export function uploadDirectory(): string {
  return uploadDir;
}
