import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT, type JWTPayload } from "jose";
import { env } from "../env";
import { HttpError } from "../errors";

export type SocialProvider = "apple" | "google";

export interface SocialIdentity {
  provider: SocialProvider;
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

const APPLE_ISSUER = "https://appleid.apple.com";
const appleKeys = createRemoteJWKSet(new URL(`${APPLE_ISSUER}/auth/keys`));
const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

/** Apple sends booleans as "true"/"false" strings in some tokens. */
function flag(value: unknown) {
  return value === true || value === "true";
}

async function verify(provider: SocialProvider, idToken: string): Promise<JWTPayload> {
  try {
    if (provider === "apple") {
      const { payload } = await jwtVerify(idToken, appleKeys, { issuer: APPLE_ISSUER, audience: env.apple.bundleId });
      return payload;
    }
    const { payload } = await jwtVerify(idToken, googleKeys, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: env.google.oauthClientIds,
    });
    return payload;
  } catch {
    throw new HttpError(401, "Accesso non riuscito: riprova");
  }
}

export async function verifyIdentity(provider: SocialProvider, idToken: string): Promise<SocialIdentity> {
  if (provider === "google" && !env.google.oauthClientIds.length) throw new HttpError(503, "Accesso con Google non ancora configurato");
  const payload = await verify(provider, idToken);
  if (!payload.sub) throw new HttpError(401, "Accesso non riuscito: riprova");
  return {
    provider,
    sub: payload.sub,
    email: typeof payload.email === "string" ? payload.email.toLowerCase() : null,
    emailVerified: flag(payload.email_verified),
    name: typeof payload.name === "string" ? payload.name : null,
  };
}

function appleRevocationConfigured() {
  return Boolean(env.apple.teamId && env.apple.signInKeyId && env.apple.signInPrivateKey);
}

async function appleClientSecret() {
  const key = await importPKCS8(env.apple.signInPrivateKey!, "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: env.apple.signInKeyId! })
    .setIssuer(env.apple.teamId!)
    .setSubject(env.apple.bundleId)
    .setAudience(APPLE_ISSUER)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);
}

async function appleRequest(path: string, fields: Record<string, string>) {
  const body = new URLSearchParams({ client_id: env.apple.bundleId, client_secret: await appleClientSecret(), ...fields });
  return fetch(`${APPLE_ISSUER}${path}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
}

/** Trades the one-time authorization code for the refresh token Apple wants revoked on account deletion. */
export async function appleRefreshToken(authorizationCode: string): Promise<string | null> {
  if (!appleRevocationConfigured()) return null;
  try {
    const response = await appleRequest("/auth/token", { code: authorizationCode, grant_type: "authorization_code" });
    if (!response.ok) return null;
    const data = (await response.json()) as { refresh_token?: string };
    return data.refresh_token ?? null;
  } catch {
    return null;
  }
}

export async function revokeApple(refreshToken: string) {
  if (!appleRevocationConfigured()) return;
  await appleRequest("/auth/revoke", { token: refreshToken, token_type_hint: "refresh_token" }).catch(() => undefined);
}
