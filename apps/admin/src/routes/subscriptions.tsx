import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Badge, Card, Loading, Text } from "@repo/ui";
import { AdminShell } from "../components/admin-shell";
import { formatDate, formatPrice } from "../lib/format";
import { api } from "../lib/api";

export const Route = createFileRoute("/subscriptions")({
  component: SubscriptionsRoute,
});

function SubscriptionsRoute() {
  return (
    <AdminShell subtitle="Active subscriptions.">
      <SubscriptionsList />
    </AdminShell>
  );
}

/** Stripe subscription statuses, coloured by how much attention they need. */
const statusVariant: Record<string, "success" | "danger" | "neutral"> = {
  active: "success",
  past_due: "danger",
  unpaid: "danger",
  canceled: "neutral",
  incomplete: "neutral",
};

function SubscriptionsList() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["subscriptions"],
    queryFn: async () => {
      const { data, error } = await api.GET("/admin/subscriptions");
      if (error) throw new Error("Failed to load subscriptions");
      return data;
    },
  });

  const needsAttention =
    data?.filter((s) => s.status === "past_due" || s.status === "unpaid") ?? [];

  return (
    <>
      <div className="mb-5">
        <Text muted className="text-sm">
          Mirrored from Stripe Billing. Each paid cycle creates a fulfillment
          order, which appears under Orders.
        </Text>
      </div>

      {needsAttention.length > 0 && (
        <Card className="mb-5 border-danger/40">
          <div className="px-4 py-3 text-[13px]">
            <span className="font-semibold text-danger">
              {needsAttention.length} subscription
              {needsAttention.length === 1 ? "" : "s"} need attention
            </span>
            <span className="ml-2 text-muted">
              payment failed — Stripe is retrying (dunning).
            </span>
          </div>
        </Card>
      )}

      {isLoading && <Loading />}
      {isError && (
        <Text className="text-danger">
          Could not load subscriptions. The API is unreachable or its database is
          down — check <code>/health</code> on the API for details.
        </Text>
      )}

      {data && (
        <Card className="overflow-hidden">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border bg-subtle/60 text-left text-muted">
                <th className="px-4 py-2.5 font-semibold">Customer</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Amount</th>
                <th className="px-4 py-2.5 font-semibold">Renews</th>
                <th className="px-4 py-2.5 font-semibold">Started</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">
                    No subscriptions yet.
                  </td>
                </tr>
              )}
              {data.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-subtle last:border-0 hover:bg-subtle/40"
                >
                  <td className="px-4 py-2.5">
                    {s.email ? (
                      <Link
                        to="/customers/$email"
                        params={{ email: encodeURIComponent(s.email) }}
                        className="font-medium hover:text-brand-strong"
                      >
                        {s.email}
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={statusVariant[s.status] ?? "neutral"}>
                      {s.status}
                    </Badge>
                    {s.cancelAtPeriodEnd && (
                      <span className="ml-2 text-xs text-muted">
                        cancels at period end
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {s.amountCents !== null
                      ? formatPrice(s.amountCents, s.currency)
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted">
                    {s.currentPeriodEnd ? formatDate(s.currentPeriodEnd) : "—"}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted">
                    {formatDate(s.createdAt)}
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
