import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Badge, Button, Card, Input, Loading, Text } from "@repo/ui";
import { AdminShell } from "../components/admin-shell";
import { OssNotice } from "../components/oss-notice";
import { apiErrorMessage } from "../lib/errors";
import { formatDate, formatPrice } from "../lib/format";
import { api } from "../lib/api";

export const Route = createFileRoute("/orders")({ component: OrdersRoute });

function OrdersRoute() {
  return (
    <AdminShell subtitle="Orders & fulfillment.">
      <OssNotice />
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
    refunded: "danger",
  };

const fulfillmentVariant: Record<string, "neutral" | "brand" | "success"> = {
  new: "neutral",
  packed: "brand",
  shipped: "success",
};

const PAGE_SIZE = 50;

/** Orders are keyed by nanoid; the last chunk is enough to recognise one. */
function shortRef(id: string): string {
  return id.slice(-8).toUpperCase();
}

function OrdersList() {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  // Debounce so typing an email doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["orders", showAll ? "all" : "paid", query, page],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/admin/orders/", {
        params: {
          query: {
            ...(showAll ? { status: "all" as const } : {}),
            ...(query ? { q: query } : {}),
            limit: PAGE_SIZE,
            offset: page * PAGE_SIZE,
          },
        },
      });
      if (error)
        throw new Error(
          apiErrorMessage(error, response, "Could not load orders."),
        );
      return data;
    },
    // Keep the table on screen while paging, instead of flashing a spinner.
    placeholderData: keepPreviousData,
  });

  const orders = data?.orders ?? [];
  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, total);
  const hasPrev = page > 0;
  const hasNext = to < total;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search email, order ref or tracking number…"
          aria-label="Search orders"
          className="w-80"
        />
        <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show paid only" : "Show all"}
        </Button>
        <Text muted className="ml-auto text-sm">
          {isLoading
            ? "Loading…"
            : total === 0
              ? "No orders"
              : `${from}–${to} of ${total}`}
        </Text>
      </div>

      <Text muted className="mb-4 block text-sm">
        {showAll
          ? "All orders, including abandoned and canceled."
          : "Paid orders ready to fulfill."}{" "}
        Select an order to update fulfillment, add tracking, or refund it.
      </Text>

      {isLoading && !data && <Loading />}
      {isError && (
        <Text className="text-danger">
          {error instanceof Error ? error.message : "Could not load orders."}
        </Text>
      )}

      {data && (
        <Card className="overflow-hidden">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border bg-subtle/60 text-left text-muted">
                <th className="px-4 py-2.5 font-semibold">Order</th>
                <th className="px-4 py-2.5 font-semibold">Date</th>
                <th className="px-4 py-2.5 font-semibold">Customer</th>
                <th className="px-4 py-2.5 font-semibold">Ship to</th>
                <th className="px-4 py-2.5 font-semibold">Items</th>
                <th className="px-4 py-2.5 font-semibold">Total</th>
                <th className="px-4 py-2.5 font-semibold">Payment</th>
                <th className="px-4 py-2.5 font-semibold">Fulfillment</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted">
                    {query
                      ? `No orders match “${query}”.`
                      : "No orders yet."}
                  </td>
                </tr>
              )}
              {orders.map((o) => (
                // The whole row navigates — the previous version linked only
                // the date and email cells with no visible affordance, which
                // read as a table you couldn't open. The View link below keeps
                // it keyboard-reachable and middle-clickable.
                <tr
                  key={o.id}
                  onClick={() =>
                    navigate({ to: "/orders/$id", params: { id: o.id } })
                  }
                  className="cursor-pointer border-b border-subtle last:border-0 hover:bg-subtle/60"
                >
                  <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">
                    {shortRef(o.id)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted">
                    {formatDate(o.createdAt)}
                  </td>
                  <td className="px-4 py-2.5 font-medium">{o.email ?? "—"}</td>
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
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <Link
                      to="/orders/$id"
                      params={{ id: o.id }}
                      onClick={(e) => e.stopPropagation()}
                      className="font-semibold text-brand-strong hover:underline"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {(hasPrev || hasNext) && (
        <div className="mt-4 flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            disabled={!hasPrev}
            onClick={() => setPage((p) => Math.max(p - 1, 0))}
          >
            ← Previous
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!hasNext}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </Button>
          <Text muted className="text-sm">
            Page {page + 1} of {Math.max(Math.ceil(total / PAGE_SIZE), 1)}
          </Text>
        </div>
      )}
    </>
  );
}
