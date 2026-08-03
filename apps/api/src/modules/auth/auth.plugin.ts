import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../../db";
import { admins } from "../../db/schema";
import { verifyBearer } from "../../lib/auth";

/** True if the given Supabase user id is a back-office administrator. */
export async function isAdmin(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: admins.userId })
    .from(admins)
    .where(eq(admins.userId, userId))
    .limit(1);
  return Boolean(row);
}

/**
 * Resolves the current user (if any) from the Authorization header and exposes
 * it as `user` on the context. Scoped so instances that `.use()` this plugin
 * inherit `user`. Anonymous requests get `user: null` with no JWKS call.
 */
export const authPlugin = new Elysia({ name: "auth" }).derive(
  { as: "scoped" },
  async ({ headers }) => ({
    user: await verifyBearer(headers.authorization),
  }),
);
