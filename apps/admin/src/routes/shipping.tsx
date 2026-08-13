import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { paths } from "@repo/api-client";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Field,
  Heading,
  Input,
  Loading,
  Text,
} from "@repo/ui";
import { AdminShell } from "../components/admin-shell";
import { apiErrorMessage } from "../lib/errors";
import { formatPrice } from "../lib/format";
import { api } from "../lib/api";

export const Route = createFileRoute("/shipping")({ component: ShippingRoute });

type Zone =
  paths["/shipping/zones"]["get"]["responses"][200]["content"]["application/json"][number];
type Rate = Zone["rates"][number];

function toCents(euros: string): number {
  return Math.round(Number(euros) * 100);
}

function ShippingRoute() {
  return (
    <AdminShell subtitle="Shipping zones & rates.">
      <Shipping />
    </AdminShell>
  );
}

function Shipping() {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["shipping-zones"] });

  const { data: zones, isLoading, isError } = useQuery({
    queryKey: ["shipping-zones"],
    queryFn: async () => {
      const { data, error } = await api.GET("/shipping/zones");
      if (error) throw new Error("Failed to load shipping zones");
      return data;
    },
  });

  return (
    <>
      <div className="mb-5">
        <Text muted className="text-sm">
          A destination country resolves to the matching zone with the lowest
          priority number, and that zone's rates are offered at checkout.
        </Text>
      </div>

      <NewZoneForm onCreated={invalidate} />

      {isLoading && <Loading className="mt-6" />}
      {isError && (
        <Text className="mt-6 text-danger">
          Could not load shipping zones. The API is unreachable or its database
          is down — check <code>/health</code> on the API for details.
        </Text>
      )}

      <div className="mt-6 space-y-4">
        {zones?.length === 0 && (
          <Card>
            <CardContent>
              <Text muted>
                No shipping zones yet. Add one above — without a zone, checkout
                cannot offer delivery to any country.
              </Text>
            </CardContent>
          </Card>
        )}
        {zones?.map((zone) => (
          <ZoneCard key={zone.id} zone={zone} onChanged={invalidate} />
        ))}
      </div>
    </>
  );
}

function ZoneCard({ zone, onChanged }: { zone: Zone; onChanged: () => void }) {
  const [addingRate, setAddingRate] = useState(false);

  const archiveZone = useMutation({
    mutationFn: async () => {
      const { error, response } = await api.DELETE("/shipping/zones/{id}", {
        params: { path: { id: zone.id } },
      });
      if (error)
        throw new Error(
          apiErrorMessage(error, response, "Could not archive the zone."),
        );
    },
    onSuccess: onChanged,
  });

  const activeRates = zone.rates.filter((r) => r.active);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-subtle/60 px-4 py-3">
        <div className="flex items-center gap-3">
          <Heading level={3} size={4}>
            {zone.name}
          </Heading>
          <Badge variant={zone.active ? "success" : "neutral"}>
            {zone.active ? "Active" : "Archived"}
          </Badge>
          <span className="text-xs text-muted">priority {zone.priority}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAddingRate((v) => !v)}
          >
            {addingRate ? "Cancel" : "Add rate"}
          </Button>
          {zone.active && (
            <Button
              variant="ghost"
              size="sm"
              disabled={archiveZone.isPending}
              onClick={() => archiveZone.mutate()}
            >
              Archive zone
            </Button>
          )}
        </div>
      </div>

      <div className="px-4 py-3">
        <p className="text-xs font-semibold text-muted">Countries</p>
        <p className="mt-1 text-[13px]">
          {zone.countries.length ? zone.countries.join(", ") : "—"}
        </p>
      </div>

      {archiveZone.isError && (
        <p className="px-4 pb-2 text-sm text-danger">
          {archiveZone.error.message}
        </p>
      )}

      {addingRate && (
        <div className="border-t border-border bg-subtle/40 px-4 py-4">
          <NewRateForm
            zoneId={zone.id}
            onCreated={() => {
              setAddingRate(false);
              onChanged();
            }}
          />
        </div>
      )}

      <table className="w-full border-collapse border-t border-border text-[13px]">
        <thead>
          <tr className="bg-subtle/40 text-left text-muted">
            <th className="px-4 py-2 font-semibold">Rate</th>
            <th className="px-4 py-2 font-semibold">Price</th>
            <th className="px-4 py-2 font-semibold">Free above</th>
            <th className="px-4 py-2 font-semibold">Delivery</th>
            <th className="px-4 py-2 text-right font-semibold"></th>
          </tr>
        </thead>
        <tbody>
          {activeRates.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-muted">
                No active rates — checkout cannot ship to this zone.
              </td>
            </tr>
          )}
          {activeRates.map((rate) => (
            <RateRow key={rate.id} rate={rate} onChanged={onChanged} />
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function RateRow({ rate, onChanged }: { rate: Rate; onChanged: () => void }) {
  const archive = useMutation({
    mutationFn: async () => {
      const { error, response } = await api.DELETE("/shipping/rates/{id}", {
        params: { path: { id: rate.id } },
      });
      if (error)
        throw new Error(
          apiErrorMessage(error, response, "Could not archive the rate."),
        );
    },
    onSuccess: onChanged,
  });

  return (
    <tr className="border-t border-subtle hover:bg-subtle/40">
      <td className="px-4 py-2 font-medium">{rate.name}</td>
      <td className="px-4 py-2 tabular-nums">
        {formatPrice(rate.priceCents, rate.currency)}
      </td>
      <td className="px-4 py-2 tabular-nums">
        {rate.freeAboveCents !== null
          ? formatPrice(rate.freeAboveCents, rate.currency)
          : "—"}
      </td>
      <td className="px-4 py-2 text-muted">
        {rate.minDeliveryDays !== null && rate.maxDeliveryDays !== null
          ? `${rate.minDeliveryDays}–${rate.maxDeliveryDays} business days`
          : "—"}
      </td>
      <td className="px-4 py-2 text-right">
        <Button
          variant="ghost"
          size="sm"
          disabled={archive.isPending}
          onClick={() => archive.mutate()}
        >
          Remove
        </Button>
        {archive.isError && (
          <span className="ml-2 text-xs text-danger">
            {archive.error.message}
          </span>
        )}
      </td>
    </tr>
  );
}

function NewZoneForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [countries, setCountries] = useState("");
  const [priority, setPriority] = useState("100");

  const create = useMutation({
    mutationFn: async () => {
      const codes = countries
        .split(",")
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean);
      const { error, response } = await api.POST("/shipping/zones", {
        body: { name, countries: codes, priority: Number(priority) || 100 },
      });
      if (error)
        throw new Error(
          apiErrorMessage(error, response, "Could not create the zone."),
        );
    },
    onSuccess: () => {
      setName("");
      setCountries("");
      setPriority("100");
      onCreated();
    },
  });

  return (
    <Card>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <Field label="Zone name" htmlFor="nz-name" className="w-44">
            <Input
              id="nz-name"
              required
              value={name}
              placeholder="Denmark"
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field
            label="Countries"
            htmlFor="nz-countries"
            className="w-80"
            hint="Comma-separated ISO codes, e.g. DK, SE, NO"
          >
            <Input
              id="nz-countries"
              required
              value={countries}
              placeholder="DK, SE"
              onChange={(e) => setCountries(e.target.value)}
            />
          </Field>
          <Field
            label="Priority"
            htmlFor="nz-priority"
            className="w-28"
            hint="Lower wins"
          >
            <Input
              id="nz-priority"
              type="number"
              min="0"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Adding…" : "Add zone"}
          </Button>
          {create.isError && (
            <p className="w-full text-sm text-danger">{create.error.message}</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function NewRateForm({
  zoneId,
  onCreated,
}: {
  zoneId: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState("Standard");
  const [price, setPrice] = useState("");
  const [freeAbove, setFreeAbove] = useState("");
  const [minDays, setMinDays] = useState("");
  const [maxDays, setMaxDays] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { error, response } = await api.POST(
        "/shipping/zones/{zoneId}/rates",
        {
          params: { path: { zoneId } },
          body: {
            name,
            priceCents: toCents(price),
            freeAboveCents: freeAbove.trim() ? toCents(freeAbove) : null,
            minDeliveryDays: minDays.trim() ? Number(minDays) : null,
            maxDeliveryDays: maxDays.trim() ? Number(maxDays) : null,
          },
        },
      );
      if (error)
        throw new Error(
          apiErrorMessage(error, response, "Could not create the rate."),
        );
    },
    onSuccess: onCreated,
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
      className="flex flex-wrap items-end gap-3"
    >
      <Field label="Rate name" htmlFor={`nr-name-${zoneId}`} className="w-40">
        <Input
          id={`nr-name-${zoneId}`}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Price (€)" htmlFor={`nr-price-${zoneId}`} className="w-28">
        <Input
          id={`nr-price-${zoneId}`}
          required
          type="number"
          step="0.01"
          min="0"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </Field>
      <Field
        label="Free above (€)"
        htmlFor={`nr-free-${zoneId}`}
        className="w-32"
        hint="Blank = never free"
      >
        <Input
          id={`nr-free-${zoneId}`}
          type="number"
          step="0.01"
          min="0"
          value={freeAbove}
          onChange={(e) => setFreeAbove(e.target.value)}
        />
      </Field>
      <Field label="Min days" htmlFor={`nr-min-${zoneId}`} className="w-24">
        <Input
          id={`nr-min-${zoneId}`}
          type="number"
          min="0"
          value={minDays}
          onChange={(e) => setMinDays(e.target.value)}
        />
      </Field>
      <Field label="Max days" htmlFor={`nr-max-${zoneId}`} className="w-24">
        <Input
          id={`nr-max-${zoneId}`}
          type="number"
          min="0"
          value={maxDays}
          onChange={(e) => setMaxDays(e.target.value)}
        />
      </Field>
      <Button type="submit" size="sm" disabled={create.isPending}>
        {create.isPending ? "Adding…" : "Add rate"}
      </Button>
      {create.isError && (
        <p className="w-full text-sm text-danger">{create.error.message}</p>
      )}
    </form>
  );
}
