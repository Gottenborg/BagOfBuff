import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Badge, Card, CardContent, Heading, Loading, Text } from "@repo/ui";
import { AdminShell } from "../components/admin-shell";
import { DataRights } from "../components/data-rights";
import { formatDate, formatPrice } from "../lib/format";
import { api } from "../lib/api";

export const Route = createFileRoute("/customers/$email")({
  component: CustomerRoute,
});

function CustomerRoute() {
  return (
    <AdminShell subtitle="Customer detail.">
      <CustomerDetail />
    </AdminShell>
  );
}

function CustomerDetail() {
  const { email } = Route.useParams();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["customer", email],
    queryFn: async () => {
      const { data, error } = await api.GET("/admin/customers/{email}", {
        params: { path: { email } },
      });
      if (error) throw new Error("Failed to load customer");
      return data;
    },
  });

  if (isLoading) return <Loading />;
  if (isError || !data)
    return (
      <Text className="text-danger">
        Could not load this customer.{" "}
        <Link to="/customers" className="underline">
          Back to customers
        </Link>
      </Text>
    );

  return (
    <>
      <div className="mb-5">
        <Link
          to="/customers"
          className="text-sm font-semibold text-muted hover:text-foreground"
        >
          ← Back to customers
        </Link>
      </div>

      <Heading level={2} size={3}>
        {data.email}
      </Heading>

      {/* Key figures */}
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Stat label="Lifetime value">
          {formatPrice(data.lifetimeValueCents, data.currency)}
        </Stat>
        <Stat label="Paid orders">{data.orderCount}</Stat>
        <Stat label="Customer since">
          {data.firstOrderAt ? formatDate(data.firstOrderAt) : "—"}
        </Stat>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Orders */}
        <Card className="lg:col-span-2 overflow-hidden">
          <div className="border-b border-border bg-subtle/60 px-4 py-2.5 text-[13px] font-semibold text-muted">
            Orders
          </div>
          <table className="w-full border-collapse text-[13px]">
            <tbody>
              {data.orders.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-muted">
                    No orders yet.
                  </td>
                </tr>
              )}
              {data.orders.map((o) => (
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
                  <td className="px-4 py-2.5">{o.itemSummary}</td>
                  <td className="px-4 py-2.5">
                    {o.origin === "subscription" && (
                      <Badge variant="brand">subscription</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant={
                        o.status === "paid" || o.status === "fulfilled"
                          ? "success"
                          : o.status === "canceled"
                            ? "danger"
                            : "neutral"
                      }
                    >
                      {o.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {o.totalCents !== null
                      ? formatPrice(o.totalCents, o.currency)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* Address + subscriptions */}
        <div className="space-y-4">
          <Card>
            <CardContent className="text-[13px]">
              <p className="font-semibold text-muted">Shipping address</p>
              {data.shipping?.line1 ? (
                <address className="mt-1 not-italic leading-relaxed">
                  {data.shipping.name}
                  <br />
                  {data.shipping.line1}
                  {data.shipping.line2 && (
                    <>
                      <br />
                      {data.shipping.line2}
                    </>
                  )}
                  <br />
                  {data.shipping.postalCode} {data.shipping.city}
                  <br />
                  {data.shipping.country}
                </address>
              ) : (
                <p className="mt-1 text-muted">No address on file.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="text-[13px]">
              <p className="font-semibold text-muted">Subscriptions</p>
              {data.subscriptions.length === 0 ? (
                <p className="mt-1 text-muted">None.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {data.subscriptions.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <Badge
                        variant={
                          s.status === "active"
                            ? "success"
                            : s.status === "past_due"
                              ? "danger"
                              : "neutral"
                        }
                      >
                        {s.status}
                      </Badge>
                      <span className="tabular-nums">
                        {s.amountCents !== null
                          ? formatPrice(s.amountCents, s.currency)
                          : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <DataRights
        email={email}
        onErased={() =>
          queryClient.invalidateQueries({ queryKey: ["customer", email] })
        }
      />

    </>
  );
}

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent>
        <p className="text-xs font-semibold text-muted">{label}</p>
        <p className="mt-1 text-xl font-semibold tabular-nums">{children}</p>
      </CardContent>
    </Card>
  );
}
