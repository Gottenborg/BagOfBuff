import { Elysia, t } from "elysia";
import { DOMESTIC_VAT_RATE } from "../../lib/vat";
import { authPlugin, isAdmin } from "../auth/auth.plugin";
import { ossStatus } from "./oss.service";

const Unauthorized = t.Object({ message: t.String() });
const Forbidden = t.Object({ message: t.String() });

/**
 * Mounted separately from the order routes so `/admin/orders/:id` can't shadow
 * it — a static path under a prefix that also has a wildcard is a trap.
 */
export const taxRoutes = new Elysia({
  prefix: "/admin/tax",
  tags: ["Tax (admin)"],
})
  .use(authPlugin)
  .get(
    "/oss",
    async () => {
      const status = await ossStatus();
      return {
        ...status,
        vatRate: DOMESTIC_VAT_RATE,
      };
    },
    {
      beforeHandle: async ({ user, status }) => {
        if (!user) return status(401, { message: "Unauthorized" });
        if (!(await isAdmin(user.id)))
          return status(403, { message: "Forbidden" });
      },
      response: {
        200: t.Object({
          year: t.Number(),
          crossBorderEurCents: t.Number(),
          thresholdEurCents: t.Number(),
          ratio: t.Number(),
          exceeded: t.Boolean(),
          approaching: t.Boolean(),
          vatRate: t.Number(),
        }),
        401: Unauthorized,
        403: Forbidden,
      },
      detail: {
        summary: "EU OSS threshold position for the current year (admin)",
        description:
          "Cross-border EU B2C sales so far this year against the €10,000 threshold. Below it we charge Danish VAT on all EU sales; above it each sale must carry the destination country's rate.",
      },
    },
  );
