import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomBytes } from "node:crypto";
import { env } from "../env";

const uploadDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../uploads");

export async function saveUpload(fileName: string, mimeType: string, data: Buffer): Promise<string> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `${Date.now()}-${randomBytes(4).toString("hex")}-${safeName}`;
  if (env.s3) {
    const client = new S3Client({
      region: env.s3.region,
      endpoint: env.s3.endpoint,
      credentials: { accessKeyId: env.s3.accessKey, secretAccessKey: env.s3.secretKey },
      forcePathStyle: true,
    });
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

export function uploadDirectory(): string {
  return uploadDir;
}
