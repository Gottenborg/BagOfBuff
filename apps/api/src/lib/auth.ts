import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "./env";

export interface AuthUser {
  id: string;
  email: string | null;
}

/**
 * Supabase signs auth JWTs with the project's asymmetric signing keys, served
 * at `/auth/v1/.well-known/jwks.json`. We verify against that JWKS (with key
 * rotation handled by `jose`), so the API never needs a shared secret.
 *
 * Built lazily so an unset SUPABASE_URL doesn't throw at import time.
 */
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!env.SUPABASE_URL) return null;
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
    );
  }
  return jwks;
}

/**
 * Verifies a `Bearer <jwt>` Authorization header and returns the user, or
 * `null` if the header is missing/invalid or auth is not configured.
 */
export async function verifyBearer(
  authHeader?: string,
): Promise<AuthUser | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;

  const keySet = getJwks();
  if (!keySet) return null;

  try {
    const { payload } = await jwtVerify(authHeader.slice(7), keySet, {
      issuer: `${env.SUPABASE_URL}/auth/v1`,
    });
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      email: typeof payload.email === "string" ? payload.email : null,
    };
  } catch {
    return null;
  }
}
