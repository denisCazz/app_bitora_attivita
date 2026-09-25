import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { env } from "../env";
import { prisma } from "./prisma";

const accessKey = new TextEncoder().encode(env.jwtAccessSecret);

export interface AccessPayload {
  sub: string;
  tenantId?: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function signAccess(payload: AccessPayload): Promise<string> {
  const token = new SignJWT({ tenantId: payload.tenantId ?? null })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("15m");
  return token.sign(accessKey);
}

export async function verifyAccess(token: string): Promise<AccessPayload> {
  const { payload } = await jwtVerify(token, accessKey);
  return {
    sub: String(payload.sub),
    tenantId: typeof payload.tenantId === "string" ? payload.tenantId : undefined,
  };
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function issueSession(userId: string, tenantId?: string | null) {
  const accessToken = await signAccess({ sub: userId, tenantId: tenantId ?? undefined });
  const refreshToken = randomBytes(32).toString("hex");
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  return { accessToken, refreshToken };
}

export function randomToken(): string {
  return randomBytes(24).toString("hex");
}
