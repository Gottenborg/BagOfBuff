import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Badge, Button, Card, Loading, Text } from "@repo/ui";
import { AdminShell } from "../components/admin-shell";
import { formatDate, formatPrice } from "../lib/format";
import { api } from "../lib/api";

export const Route = createFileRoute("/orders")({ component: OrdersRoute });

function OrdersRoute() {
  return (
    <AdminShell subtitle="Orders & fulfillment.">
      <OrdersList />
    </AdminShell>
  );
}

const paymentVariant: Record<string, "success" | "brand" | "neutral" | "danger"> =
  {
    paid: "success",
    fulfilled: "brand",
    pending: "neutral",
    canceled: "danger",
  };

const fulfillmentVariant: Record<string, "neutral" | "brand" | "success"> = {
  new: "neutral",
  packed: "brand",
  shipped: "success",
};

function OrdersList() {
  const [showAll, setShowAll] = useState(false);

  const {
    data: orders,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["orders", showAll ? "all" : "paid"],
    queryFn: async () => {
      const { data, error } = await api.GET("/admin/orders/", {
        params: { query: showAll ? { status: "all" } : {} },
      });
      if (error) throw new Error("Failed to load orders");
      return data;
    },
  });

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <Text muted className="text-sm">
          {showAll
            ? "All orders, including abandoned and canceled."
            : "Paid orders ready to fulfill."}
        </Text>
        <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show paid only" : "Show all"}
        </Button>
      </div>

      {isLoading && <Loading />}
      {isError && (
        <Text className="text-danger">
          Could not load orders. The API is unreachable or its database is down
          — check <code>/health</code> on the API for details.
        </Text>
      )}

      {orders && (
        <Card className="overflow-hidden">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border bg-subtle/60 text-left text-muted">
                <th className="px-4 py-2.5 font-semibold">Date</th>
                <th className="px-4 py-2.5 font-semibold">Customer</th>
                <th className="px-4 py-2.5 font-semibold">Ship to</th>
                <th className="px-4 py-2.5 font-semibold">Items</th>
                <th className="px-4 py-2.5 font-semibold">Total</th>
                <th className="px-4 py-2.5 font-semibold">Payment</th>
                <th className="px-4 py-2.5 font-semibold">Fulfillment</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted">
                    No orders yet.
                  </td>
                </tr>
              )}
              {orders.map((o) => (
                <tr
                  key={o.id}
                  className="border-b border-subtle last:border-0 hover:bg-subtle/40"
                >
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted">
                    <Link
                      to="/orders/$id"
                      params={{ id: o.id }}
                      className="hover:text-foreground"
                    >
                      {formatDate(o.createdAt)}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <Link
                      to="/orders/$id"
                      params={{ id: o.id }}
                      className="font-medium hover:text-brand-strong"
                    >
                      {o.email ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-muted">
                    {o.shipCountry ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{o.itemCount}</td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {o.totalCents !== null
                      ? formatPrice(o.totalCents, o.currency)
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={paymentVariant[o.status] ?? "neutral"}>
                      {o.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant={fulfillmentVariant[o.fulfillmentStatus] ?? "neutral"}
                    >
                      {o.fulfillmentStatus}
                    </Badge>
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
