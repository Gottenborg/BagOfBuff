import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
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
import { RefundPanel } from "../components/refund-panel";
import { apiErrorMessage } from "../lib/errors";
import { formatDate, formatPrice } from "../lib/format";
import { api } from "../lib/api";

export const Route = createFileRoute("/orders/$id")({ component: OrderRoute });

function OrderRoute() {
  return (
    <AdminShell subtitle="Order detail.">
      <OrderDetail />
    </AdminShell>
  );
}

const FULFILLMENT_STEPS = ["new", "packed", "shipped"] as const;
type Fulfillment = (typeof FULFILLMENT_STEPS)[number];

function OrderDetail() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ["order", id],
    queryFn: async () => {
      const { data, error } = await api.GET("/admin/orders/{id}", {
        params: { path: { id } },
      });
      if (error) throw new Error("Failed to load order");
      return data;
    },
  });

  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");

  // Seed the tracking inputs from the loaded order (once it arrives / changes).
  useEffect(() => {
    if (order) {
      setCarrier(order.trackingCarrier ?? "");
      setTracking(order.trackingNumber ?? "");
    }
  }, [order]);

  const update = useMutation({
    mutationFn: async (body: {
      fulfillmentStatus?: Fulfillment;
      trackingCarrier?: string | null;
      trackingNumber?: string | null;
    }) => {
      const { error, response } = await api.PATCH(
        "/admin/orders/{id}/fulfillment",
        { params: { path: { id } }, body },
      );
      if (error)
        throw new Error(
          apiErrorMessage(error, response, "Could not update fulfillment."),
        );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });

  if (isLoading) return <Loading />;
  if (isError || !order)
    return (
      <Text className="text-danger">
        Could not load this order.{" "}
        <Link to="/orders" className="underline">
          Back to orders
        </Link>
      </Text>
    );

  return (
    <>
      <div className="mb-6">
        <Link
          to="/orders"
          className="text-sm font-semibold text-muted hover:text-foreground"
        >
          ← Back to orders
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Heading level={2} size={3}>
          Order {order.id.slice(-8).toUpperCase()}
        </Heading>
        <span className="font-mono text-sm text-muted">{order.id}</span>
        <Badge variant={order.status === "paid" ? "success" : "neutral"}>
          {order.status}
        </Badge>
      </div>
      <Text muted className="mt-1 text-sm">
        Placed {formatDate(order.createdAt)}
        {order.paidAt && ` · paid ${formatDate(order.paidAt)}`}
      </Text>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* Items + totals */}
        <Card className="lg:col-span-2 overflow-hidden">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="px-5 py-3 font-semibold">Item</th>
                <th className="px-5 py-3 font-semibold">Qty</th>
                <th className="px-5 py-3 text-right font-semibold">Price</th>
                <th className="px-5 py-3 text-right font-semibold">Line</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((i) => (
                <tr key={i.id} className="border-b border-subtle last:border-0">
                  <td className="px-5 py-3 font-medium">{i.name}</td>
                  <td className="px-5 py-3 tabular-nums">{i.quantity}</td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {formatPrice(i.unitPriceCents, i.currency)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {formatPrice(i.unitPriceCents * i.quantity, i.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-border px-5 py-4">
            <dl className="ml-auto max-w-xs space-y-1 text-sm">
              <Row
                label="Subtotal"
                value={formatPrice(order.subtotalCents, order.currency)}
              />
              <Row
                label={`Shipping${order.shippingRateName ? ` (${order.shippingRateName})` : ""}`}
                value={formatPrice(order.shippingCents, order.currency)}
              />
              {order.taxCents !== null && (
                <Row
                  label="VAT"
                  value={formatPrice(order.taxCents, order.currency)}
                />
              )}
              <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">
                  {formatPrice(
                    order.totalCents ?? order.subtotalCents,
                    order.currency,
                  )}
                </dd>
              </div>
              {order.refundedCents > 0 && (
                <>
                  <div className="flex justify-between text-danger">
                    <dt>Refunded</dt>
                    <dd className="tabular-nums">
                      −{formatPrice(order.refundedCents, order.currency)}
                    </dd>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <dt>Net</dt>
                    <dd className="tabular-nums">
                      {formatPrice(
                        (order.totalCents ?? order.subtotalCents) -
                          order.refundedCents,
                        order.currency,
                      )}
                    </dd>
                  </div>
                </>
              )}
            </dl>
          </div>
        </Card>

        {/* Customer + shipping address */}
        <Card>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="font-semibold text-muted">Customer</p>
              <p>{order.email ?? "—"}</p>
            </div>
            <div>
              <p className="font-semibold text-muted">Ship to</p>
              {order.ship.name ? (
                <address className="not-italic leading-relaxed">
                  {order.ship.name}
                  <br />
                  {order.ship.line1}
                  {order.ship.line2 && (
                    <>
                      <br />
                      {order.ship.line2}
                    </>
                  )}
                  <br />
                  {order.ship.postalCode} {order.ship.city}
                  <br />
                  {order.ship.country}
                </address>
              ) : (
                <p className="text-muted">
                  No address yet (awaiting payment).
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fulfillment workflow */}
      <Card className="mt-6">
        <CardContent className="space-y-5">
          <div className="flex items-center gap-3">
            <Heading level={3} size={4}>
              Fulfillment
            </Heading>
            <Badge
              variant={
                order.fulfillmentStatus === "shipped" ? "success" : "neutral"
              }
            >
              {order.fulfillmentStatus}
            </Badge>
            {order.shippedAt && (
              <Text muted className="text-sm">
                shipped {formatDate(order.shippedAt)}
              </Text>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {FULFILLMENT_STEPS.map((step) => (
              <Button
                key={step}
                size="sm"
                variant={
                  order.fulfillmentStatus === step ? "primary" : "secondary"
                }
                disabled={update.isPending || order.fulfillmentStatus === step}
                onClick={() => update.mutate({ fulfillmentStatus: step })}
              >
                Mark {step}
              </Button>
            ))}
          </div>

          <form
            className="flex flex-wrap items-end gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              update.mutate({
                trackingCarrier: carrier.trim() || null,
                trackingNumber: tracking.trim() || null,
              });
            }}
          >
            <Field label="Carrier" htmlFor="carrier" className="w-40">
              <Input
                id="carrier"
                value={carrier}
                placeholder="PostNord, DHL…"
                onChange={(e) => setCarrier(e.target.value)}
              />
            </Field>
            <Field label="Tracking number" htmlFor="tracking" className="w-56">
              <Input
                id="tracking"
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
              />
            </Field>
            <Button type="submit" variant="secondary" disabled={update.isPending}>
              Save tracking
            </Button>
          </form>

          {update.isError && (
            <Text className="text-danger">{update.error.message}</Text>
          )}
        </CardContent>
      </Card>

      <RefundPanel
        order={order}
        onRefunded={() => {
          queryClient.invalidateQueries({ queryKey: ["order", id] });
          queryClient.invalidateQueries({ queryKey: ["orders"] });
        }}
      />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
