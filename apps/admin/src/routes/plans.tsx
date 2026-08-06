import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Field,
  Input,
  Loading,
  Text,
} from "@repo/ui";
import { AdminShell } from "../components/admin-shell";
import { formatPrice } from "../lib/format";
import { api } from "../lib/api";

export const Route = createFileRoute("/plans")({ component: PlansRoute });

function PlansRoute() {
  return (
    <AdminShell subtitle="Subscription plans.">
      <Plans />
    </AdminShell>
  );
}

function intervalLabel(interval: string, count: number) {
  return count === 1 ? `every ${interval}` : `every ${count} ${interval}s`;
}

function Plans() {
  const queryClient = useQueryClient();

  const plans = useQuery({
    queryKey: ["plans", "all"],
    queryFn: async () => {
      const { data, error } = await api.GET("/admin/subscription-plans");
      if (error) throw new Error("Failed to load plans");
      return data;
    },
  });

  const products = useQuery({
    queryKey: ["products", "all"],
    queryFn: async () => {
      const { data, error } = await api.GET("/products/", {
        params: { query: { includeInactive: true } },
      });
      if (error) throw new Error("Failed to load products");
      return data;
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await api.PATCH("/admin/subscription-plans/{id}", {
        params: { path: { id } },
        body: { active },
      });
      if (error) throw new Error("Failed to update plan");
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["plans", "all"] }),
  });

  return (
    <>
      <NewPlanForm
        products={products.data ?? []}
        onCreated={() =>
          queryClient.invalidateQueries({ queryKey: ["plans", "all"] })
        }
      />

      {plans.isLoading && <Loading className="mt-8" />}
      {plans.isError && (
        <Text className="mt-8 text-danger">Could not load plans.</Text>
      )}

      {plans.data && (
        <Card className="mt-8 overflow-hidden">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="px-5 py-3 font-semibold">Plan</th>
                <th className="px-5 py-3 font-semibold">Cadence</th>
                <th className="px-5 py-3 font-semibold">Price</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {plans.data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-muted">
                    No plans yet.
                  </td>
                </tr>
              )}
              {plans.data.map((plan) => (
                <tr
                  key={plan.id}
                  className="border-b border-subtle last:border-0"
                >
                  <td className="px-5 py-3 font-medium">{plan.name}</td>
                  <td className="px-5 py-3 text-muted">
                    {intervalLabel(plan.interval, plan.intervalCount)}
                  </td>
                  <td className="px-5 py-3 tabular-nums">
                    {formatPrice(plan.priceCents, plan.currency)}
                  </td>
                  <td className="px-5 py-3">
                    {plan.active ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="neutral">Inactive</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={toggle.isPending}
                      onClick={() =>
                        toggle.mutate({ id: plan.id, active: !plan.active })
                      }
                    >
                      {plan.active ? "Deactivate" : "Activate"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

function NewPlanForm({
  products,
  onCreated,
}: {
  products: { id: string; name: string }[];
  onCreated: () => void;
}) {
  const [productId, setProductId] = useState("");
  const [name, setName] = useState("Monthly");
  const [interval, setInterval] = useState<"week" | "month">("month");
  const [intervalCount, setIntervalCount] = useState("1");
  const [price, setPrice] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST("/admin/subscription-plans", {
        body: {
          productId,
          name,
          interval,
          intervalCount: Number(intervalCount) || 1,
          priceCents: Math.round(Number(price) * 100),
        },
      });
      if (error) throw new Error("Failed to create plan");
    },
    onSuccess: () => {
      setName("Monthly");
      setPrice("");
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
          className="flex flex-wrap items-end gap-4"
        >
          <Field label="Product" htmlFor="pl-product" className="w-52">
            <select
              id="pl-product"
              required
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="h-10 rounded-md border border-border bg-paper px-3 text-sm"
            >
              <option value="" disabled>
                Select…
              </option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Plan name" htmlFor="pl-name" className="w-40">
            <Input
              id="pl-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Every" htmlFor="pl-count" className="w-20">
            <Input
              id="pl-count"
              type="number"
              min="1"
              value={intervalCount}
              onChange={(e) => setIntervalCount(e.target.value)}
            />
          </Field>
          <Field label="Interval" htmlFor="pl-interval" className="w-28">
            <select
              id="pl-interval"
              value={interval}
              onChange={(e) =>
                setInterval(e.target.value as "week" | "month")
              }
              className="h-10 rounded-md border border-border bg-paper px-3 text-sm"
            >
              <option value="week">week</option>
              <option value="month">month</option>
            </select>
          </Field>
          <Field label="Price (€)" htmlFor="pl-price" className="w-28">
            <Input
              id="pl-price"
              required
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={create.isPending || !productId}>
            {create.isPending ? "Creating…" : "Create plan"}
          </Button>
          {create.isError && (
            <p className="w-full text-sm text-danger">
              Could not create plan. Is Stripe configured and are you an admin?
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
