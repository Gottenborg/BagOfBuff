import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Badge, Card, Input, Loading, Text } from "@repo/ui";
import { AdminShell } from "../components/admin-shell";
import { formatDate, formatPrice } from "../lib/format";
import { api } from "../lib/api";

export const Route = createFileRoute("/customers/")({ component: CustomersRoute });

function CustomersRoute() {
  return (
    <AdminShell subtitle="Customers.">
      <CustomersList />
    </AdminShell>
  );
}

function CustomersList() {
  const [search, setSearch] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["customers", search],
    queryFn: async () => {
      const { data, error } = await api.GET("/admin/customers/", {
        params: { query: search.trim() ? { q: search.trim() } : {} },
      });
      if (error) throw new Error("Failed to load customers");
      return data;
    },
  });

  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-4">
        <Text muted className="text-sm">
          Aggregated from paid orders and subscriptions. Checkout is guest-based,
          so customers are identified by email.
        </Text>
        <Input
          type="search"
          value={search}
          placeholder="Search email…"
          className="w-64"
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && <Loading />}
      {isError && (
        <Text className="text-danger">
          Could not load customers. The API is unreachable or its database is
          down — check <code>/health</code> on the API for details.
        </Text>
      )}

      {data && (
        <Card className="overflow-hidden">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border bg-subtle/60 text-left text-muted">
                <th className="px-4 py-2.5 font-semibold">Email</th>
                <th className="px-4 py-2.5 font-semibold">Orders</th>
                <th className="px-4 py-2.5 font-semibold">Lifetime value</th>
                <th className="px-4 py-2.5 font-semibold">Subscription</th>
                <th className="px-4 py-2.5 font-semibold">First order</th>
                <th className="px-4 py-2.5 font-semibold">Last order</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    {search
                      ? "No customers match that search."
                      : "No customers yet — they appear here after the first paid order."}
                  </td>
                </tr>
              )}
              {data.map((c) => (
                <tr
                  key={c.email}
                  className="border-b border-subtle last:border-0 hover:bg-subtle/40"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      to="/customers/$email"
                      params={{ email: encodeURIComponent(c.email) }}
                      className="font-medium hover:text-brand-strong"
                    >
                      {c.email}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{c.orderCount}</td>
                  <td className="px-4 py-2.5 font-medium tabular-nums">
                    {formatPrice(c.lifetimeValueCents, c.currency)}
                  </td>
                  <td className="px-4 py-2.5">
                    {c.activeSubscriptions > 0 ? (
                      <Badge variant="success">
                        {c.activeSubscriptions} active
                      </Badge>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted">
                    {c.firstOrderAt ? formatDate(c.firstOrderAt) : "—"}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted">
                    {c.lastOrderAt ? formatDate(c.lastOrderAt) : "—"}
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
