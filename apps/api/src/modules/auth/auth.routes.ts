import { Elysia, t } from "elysia";
import { authPlugin, isAdmin } from "./auth.plugin";

export const authRoutes = new Elysia({ prefix: "/auth", tags: ["Auth"] })
  .use(authPlugin)
  .get(
    "/me",
    async ({ user, status }) => {
      if (!user) return status(401, { message: "Unauthorized" });
      return {
        id: user.id,
        email: user.email,
        isAdmin: await isAdmin(user.id),
      };
    },
    {
      response: {
        200: t.Object({
          id: t.String(),
          email: t.Nullable(t.String()),
          isAdmin: t.Boolean(),
        }),
        401: t.Object({ message: t.String() }),
      },
      detail: { summary: "Get the current authenticated user" },
    },
  );
