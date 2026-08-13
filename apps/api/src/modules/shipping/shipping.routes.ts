import { asc, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db";
import {
  shippingRates,
  shippingZones,
  type ShippingRate,
  type ShippingZone,
} from "../../db/schema";
import { currencyForCountry } from "../../lib/currency";
import { authPlugin, isAdmin } from "../auth/auth.plugin";
import {
  computeOptions,
  normalizeCountry,
  ratesForZone,
  resolveZoneForCountry,
} from "./shipping.service";

const Unauthorized = t.Object({ message: t.String() });
const Forbidden = t.Object({ message: t.String() });
const NotFound = t.Object({ message: t.String() });

/** Plain number for response bodies (see products.routes for the rationale). */
const Int = t.Number();

const ZoneModel = t.Object({
  id: t.String(),
  name: t.String(),
  countries: t.Array(t.String()),
  priority: Int,
  active: t.Boolean(),
  createdAt: t.String({ format: "date-time" }),
  updatedAt: t.String({ format: "date-time" }),
});

const RateModel = t.Object({
  id: t.String(),
  zoneId: t.String(),
  name: t.String(),
  priceCents: Int,
  currency: t.String(),
  freeAboveCents: t.Nullable(Int),
  minDeliveryDays: t.Nullable(Int),
  maxDeliveryDays: t.Nullable(Int),
  active: t.Boolean(),
  createdAt: t.String({ format: "date-time" }),
  updatedAt: t.String({ format: "date-time" }),
});

const ZoneWithRatesModel = t.Composite([
  ZoneModel,
  t.Object({ rates: t.Array(RateModel) }),
]);

const OptionModel = t.Object({
  id: t.String(),
  name: t.String(),
  priceCents: Int,
  baseCents: Int,
  currency: t.String(),
  free: t.Boolean(),
  minDeliveryDays: t.Nullable(Int),
  maxDeliveryDays: t.Nullable(Int),
});

const QuoteResponse = t.Object({
  zone: t.Object({ id: t.String(), name: t.String() }),
  /** Currency the destination is billed in; options are denominated in it. */
  currency: t.String(),
  options: t.Array(OptionModel),
});

/** Reusable shipping address model — also consumed by checkout (BAG-18). */
const ShippingAddress = t.Object({
  name: t.String({ minLength: 1 }),
  line1: t.String({ minLength: 1 }),
  line2: t.Optional(t.Nullable(t.String())),
  city: t.String({ minLength: 1 }),
  postalCode: t.String({ minLength: 1, maxLength: 12 }),
  country: t.String({ minLength: 2, maxLength: 2 }),
  phone: t.Optional(t.Nullable(t.String())),
});

const ValidateAddressResponse = t.Object({
  normalized: ShippingAddress,
  shippable: t.Boolean(),
  zone: t.Nullable(t.Object({ id: t.String(), name: t.String() })),
});

const CreateZoneBody = t.Object({
  name: t.String({ minLength: 1 }),
  countries: t.Array(t.String({ minLength: 2, maxLength: 2 })),
  priority: t.Optional(t.Integer()),
  active: t.Optional(t.Boolean()),
});

const UpdateZoneBody = t.Partial(
  t.Object({
    name: t.String({ minLength: 1 }),
    countries: t.Array(t.String({ minLength: 2, maxLength: 2 })),
    priority: t.Integer(),
    active: t.Boolean(),
  }),
);

const CreateRateBody = t.Object({
  name: t.String({ minLength: 1 }),
  priceCents: t.Integer({ minimum: 0 }),
  currency: t.Optional(t.String({ minLength: 3, maxLength: 3 })),
  freeAboveCents: t.Optional(t.Nullable(t.Integer({ minimum: 0 }))),
  minDeliveryDays: t.Optional(t.Nullable(t.Integer({ minimum: 0 }))),
  maxDeliveryDays: t.Optional(t.Nullable(t.Integer({ minimum: 0 }))),
  active: t.Optional(t.Boolean()),
});

const UpdateRateBody = t.Partial(
  t.Object({
    name: t.String({ minLength: 1 }),
    priceCents: t.Integer({ minimum: 0 }),
    currency: t.String({ minLength: 3, maxLength: 3 }),
    freeAboveCents: t.Nullable(t.Integer({ minimum: 0 })),
    minDeliveryDays: t.Nullable(t.Integer({ minimum: 0 })),
    maxDeliveryDays: t.Nullable(t.Integer({ minimum: 0 })),
    active: t.Boolean(),
  }),
);

function serializeZone(z: ShippingZone) {
  return {
    ...z,
    createdAt: z.createdAt.toISOString(),
    updatedAt: z.updatedAt.toISOString(),
  };
}

function serializeRate(r: ShippingRate) {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Uppercase the country codes on any zone-write body. */
function normalizeCountries<T extends { countries?: string[] }>(body: T): T {
  if (!body.countries) return body;
  return { ...body, countries: body.countries.map(normalizeCountry) };
}

/** Postgres unique-violation error code. */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505"
  );
}

export const shippingRoutes = new Elysia({
  prefix: "/shipping",
  tags: ["Shipping"],
})
  .use(authPlugin)
  // --- Public: storefront checkout ---------------------------------------
  .post(
    "/quote",
    async ({ body, status }) => {
      const zone = await resolveZoneForCountry(body.country);
      if (!zone)
        return status(404, {
          message: `We don't ship to ${normalizeCountry(body.country)} yet`,
        });
      // Shipping must be billed in the same currency as the goods, which the
      // destination decides.
      const currency = currencyForCountry(body.country);
      const rates = await ratesForZone(zone.id, currency);
      return {
        zone: { id: zone.id, name: zone.name },
        currency,
        options: computeOptions(rates, body.subtotalCents),
      };
    },
    {
      body: t.Object({
        country: t.String({ minLength: 2, maxLength: 2 }),
        subtotalCents: t.Integer({ minimum: 0 }),
      }),
      response: { 200: QuoteResponse, 404: NotFound },
      detail: { summary: "Get shipping options for a destination + subtotal" },
    },
  )
  .post(
    "/validate-address",
    async ({ body }) => {
      const normalized = {
        ...body,
        country: normalizeCountry(body.country),
        postalCode: body.postalCode.trim(),
      };
      const zone = await resolveZoneForCountry(normalized.country);
      return {
        normalized,
        shippable: zone !== null,
        zone: zone ? { id: zone.id, name: zone.name } : null,
      };
    },
    {
      body: ShippingAddress,
      response: { 200: ValidateAddressResponse },
      detail: {
        summary: "Validate a shipping address and check we ship there",
      },
    },
  )
  // --- Admin: zones ------------------------------------------------------
  .get(
    "/zones",
    async () => {
      const zones = await db
        .select()
        .from(shippingZones)
        .orderBy(asc(shippingZones.priority), asc(shippingZones.name));
      const rates = await db
        .select()
        .from(shippingRates)
        .orderBy(asc(shippingRates.priceCents));
      const byZone = new Map<string, ShippingRate[]>();
      for (const r of rates) {
        const list = byZone.get(r.zoneId) ?? [];
        list.push(r);
        byZone.set(r.zoneId, list);
      }
      return zones.map((z) => ({
        ...serializeZone(z),
        rates: (byZone.get(z.id) ?? []).map(serializeRate),
      }));
    },
    {
      beforeHandle: async ({ user, status }) => {
        if (!user) return status(401, { message: "Unauthorized" });
        if (!(await isAdmin(user.id)))
          return status(403, { message: "Forbidden" });
      },
      response: {
        200: t.Array(ZoneWithRatesModel),
        401: Unauthorized,
        403: Forbidden,
      },
      detail: { summary: "List shipping zones with their rates (admin)" },
    },
  )
  .post(
    "/zones",
    async ({ body, status }) => {
      try {
        const [created] = await db
          .insert(shippingZones)
          .values(normalizeCountries(body))
          .returning();
        return status(201, serializeZone(created!));
      } catch (err) {
        if (isUniqueViolation(err))
          return status(409, {
            message: "A zone with that name already exists",
          });
        throw err;
      }
    },
    {
      beforeHandle: async ({ user, status }) => {
        if (!user) return status(401, { message: "Unauthorized" });
        if (!(await isAdmin(user.id)))
          return status(403, { message: "Forbidden" });
      },
      body: CreateZoneBody,
      response: {
        201: ZoneModel,
        401: Unauthorized,
        403: Forbidden,
        409: t.Object({ message: t.String() }),
      },
      detail: { summary: "Create a shipping zone (admin)" },
    },
  )
  .patch(
    "/zones/:id",
    async ({ params, body, status }) => {
      try {
        const [updated] = await db
          .update(shippingZones)
          .set({ ...normalizeCountries(body), updatedAt: new Date() })
          .where(eq(shippingZones.id, params.id))
          .returning();
        if (!updated) return status(404, { message: "Zone not found" });
        return serializeZone(updated);
      } catch (err) {
        if (isUniqueViolation(err))
          return status(409, {
            message: "A zone with that name already exists",
          });
        throw err;
      }
    },
    {
      beforeHandle: async ({ user, status }) => {
        if (!user) return status(401, { message: "Unauthorized" });
        if (!(await isAdmin(user.id)))
          return status(403, { message: "Forbidden" });
      },
      params: t.Object({ id: t.String() }),
      body: UpdateZoneBody,
      response: {
        200: ZoneModel,
        401: Unauthorized,
        403: Forbidden,
        404: NotFound,
        409: t.Object({ message: t.String() }),
      },
      detail: { summary: "Update a shipping zone (admin)" },
    },
  )
  .delete(
    "/zones/:id",
    async ({ params, status }) => {
      const [archived] = await db
        .update(shippingZones)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(shippingZones.id, params.id))
        .returning();
      if (!archived) return status(404, { message: "Zone not found" });
      return serializeZone(archived);
    },
    {
      beforeHandle: async ({ user, status }) => {
        if (!user) return status(401, { message: "Unauthorized" });
        if (!(await isAdmin(user.id)))
          return status(403, { message: "Forbidden" });
      },
      params: t.Object({ id: t.String() }),
      response: {
        200: ZoneModel,
        401: Unauthorized,
        403: Forbidden,
        404: NotFound,
      },
      detail: { summary: "Archive a shipping zone (admin)" },
    },
  )
  // --- Admin: rates ------------------------------------------------------
  .post(
    "/zones/:zoneId/rates",
    async ({ params, body, status }) => {
      const [zone] = await db
        .select({ id: shippingZones.id })
        .from(shippingZones)
        .where(eq(shippingZones.id, params.zoneId))
        .limit(1);
      if (!zone) return status(404, { message: "Zone not found" });
      const [created] = await db
        .insert(shippingRates)
        .values({ ...body, zoneId: params.zoneId })
        .returning();
      return status(201, serializeRate(created!));
    },
    {
      beforeHandle: async ({ user, status }) => {
        if (!user) return status(401, { message: "Unauthorized" });
        if (!(await isAdmin(user.id)))
          return status(403, { message: "Forbidden" });
      },
      params: t.Object({ zoneId: t.String() }),
      body: CreateRateBody,
      response: {
        201: RateModel,
        401: Unauthorized,
        403: Forbidden,
        404: NotFound,
      },
      detail: { summary: "Add a rate to a zone (admin)" },
    },
  )
  .patch(
    "/rates/:id",
    async ({ params, body, status }) => {
      const [updated] = await db
        .update(shippingRates)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(shippingRates.id, params.id))
        .returning();
      if (!updated) return status(404, { message: "Rate not found" });
      return serializeRate(updated);
    },
    {
      beforeHandle: async ({ user, status }) => {
        if (!user) return status(401, { message: "Unauthorized" });
        if (!(await isAdmin(user.id)))
          return status(403, { message: "Forbidden" });
      },
      params: t.Object({ id: t.String() }),
      body: UpdateRateBody,
      response: {
        200: RateModel,
        401: Unauthorized,
        403: Forbidden,
        404: NotFound,
      },
      detail: { summary: "Update a shipping rate (admin)" },
    },
  )
  .delete(
    "/rates/:id",
    async ({ params, status }) => {
      const [archived] = await db
        .update(shippingRates)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(shippingRates.id, params.id))
        .returning();
      if (!archived) return status(404, { message: "Rate not found" });
      return serializeRate(archived);
    },
    {
      beforeHandle: async ({ user, status }) => {
        if (!user) return status(401, { message: "Unauthorized" });
        if (!(await isAdmin(user.id)))
          return status(403, { message: "Forbidden" });
      },
      params: t.Object({ id: t.String() }),
      response: {
        200: RateModel,
        401: Unauthorized,
        403: Forbidden,
        404: NotFound,
      },
      detail: { summary: "Archive a shipping rate (admin)" },
    },
  );
