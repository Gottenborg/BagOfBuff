import { count, desc, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db";
import { admins } from "../../db/schema";
import { authPlugin, isAdmin } from "./auth.plugin";

const Message = t.Object({ message: t.String() });

const AdminModel = t.Object({
  userId: t.String(),
  email: t.Nullable(t.String()),
  createdAt: t.String({ format: "date-time" }),
  /** True for the admin making the request, so the UI can protect them. */
  isSelf: t.Boolean(),
});

/**
 * Back-office administrators.
 *
 * Membership of this table is the whole authorization model: every admin route
 * checks it. Adding a colleague previously meant an INSERT by hand, which is
 * fine for one person and a wall the day it isn't.
 *
 * A Supabase user id is required rather than just an email, because the id is
 * what the JWT carries and therefore what authorization actually turns on.
 * Granting by email would let a typo silently grant nothing — or, worse, grant
 * access to whoever later registers that address.
 */
export const adminsRoutes = new Elysia({
  prefix: "/admin/admins",
  tags: ["Admins (admin)"],
})
  .use(authPlugin)
  .get(
    "/",
    async ({ user }) => {
      const rows = await db
        .select()
        .from(admins)
        .orderBy(desc(admins.createdAt));
      return rows.map((a) => ({
        userId: a.userId,
        email: a.email,
        createdAt: a.createdAt.toISOString(),
        isSelf: a.userId === user?.id,
      }));
    },
    {
      beforeHandle: async ({ user, status }) => {
        if (!user) return status(401, { message: "Unauthorized" });
        if (!(await isAdmin(user.id)))
          return status(403, { message: "Forbidden" });
      },
      response: { 200: t.Array(AdminModel), 401: Message, 403: Message },
      detail: { summary: "List back-office administrators (admin)" },
    },
  )
  .post(
    "/",
    async ({ body, status }) => {
      const userId = body.userId.trim();
      const email = body.email?.trim() || null;
      if (!userId) {
        return status(400, { message: "A Supabase user id is required" });
      }

      const [existing] = await db
        .select({ userId: admins.userId })
        .from(admins)
        .where(eq(admins.userId, userId))
        .limit(1);
      if (existing) {
        return status(409, { message: "That user is already an administrator" });
      }

      const [created] = await db
        .insert(admins)
        .values({ userId, email })
        .returning();
      return {
        userId: created!.userId,
        email: created!.email,
        createdAt: created!.createdAt.toISOString(),
        isSelf: false,
      };
    },
    {
      beforeHandle: async ({ user, status }) => {
        if (!user) return status(401, { message: "Unauthorized" });
        if (!(await isAdmin(user.id)))
          return status(403, { message: "Forbidden" });
      },
      body: t.Object({
        /** From Supabase → Authentication → Users. */
        userId: t.String({ minLength: 1 }),
        /** Recorded so audit trails and this list stay readable. */
        email: t.Optional(t.Nullable(t.String())),
      }),
      response: {
        200: AdminModel,
        400: Message,
        401: Message,
        403: Message,
        409: Message,
      },
      detail: {
        summary: "Grant back-office access to a Supabase user (admin)",
        description:
          "Takes the Supabase user id, not an email: the id is what the JWT carries and therefore what authorization turns on. The user must already have signed up.",
      },
    },
  )
  .delete(
    "/:userId",
    async ({ params, user, status }) => {
      // Removing yourself is how someone locks themselves out mid-task.
      if (params.userId === user?.id) {
        return status(409, {
          message:
            "You cannot remove your own access. Ask another administrator to do it.",
        });
      }

      const [total] = await db.select({ n: count() }).from(admins);
      if (Number(total?.n ?? 0) <= 1) {
        // Belt and braces: with no administrators left, the only way back in is
        // raw SQL against the database.
        return status(409, {
          message: "There must be at least one administrator",
        });
      }

      const removed = await db
        .delete(admins)
        .where(eq(admins.userId, params.userId))
        .returning({ userId: admins.userId });
      if (removed.length === 0) {
        return status(404, { message: "That user is not an administrator" });
      }
      return { message: "Access removed" };
    },
    {
      beforeHandle: async ({ user, status }) => {
        if (!user) return status(401, { message: "Unauthorized" });
        if (!(await isAdmin(user.id)))
          return status(403, { message: "Forbidden" });
      },
      params: t.Object({ userId: t.String() }),
      response: {
        200: Message,
        401: Message,
        403: Message,
        404: Message,
        409: Message,
      },
      detail: { summary: "Revoke back-office access (admin)" },
    },
  );
